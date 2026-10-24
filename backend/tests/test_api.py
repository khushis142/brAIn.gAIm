"""End-to-end API tests against a real Postgres (set TEST_DATABASE_URL to run)."""

import os
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from jsonschema import validate
from sqlalchemy import func, select, text

from app import cdn, feed
from app.db import SessionLocal, engine
from app.feed import VIDEOS_PER_GAME
from app.generator.games import generate_game, publish_generated_game
from app.generator.inputs import GameConfig, InputGenerationError
from app.generator.llm import FakeLLM, LLMError
from app.main import app
from app.models import (
    Base,
    Content,
    GameRound,
    Impression,
    Score,
    User,
    UserAccessory,
    UserAvatar,
)
from app.seed_game import seed_game, update_game
from tests.test_attachments import text_pdf

EXAMPLE_DIR = Path(__file__).parents[1] / "games/example-quiz"
EXAMPLE_GAME = GameConfig.model_validate_json((EXAMPLE_DIR / "config.json").read_text())

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


@pytest.fixture(scope="session", autouse=True)
async def schema() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(autouse=True)
async def empty_tables(schema: None) -> None:
    """Content is global, so every test starts from an empty catalog."""
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} CASCADE"))


@pytest.fixture(scope="session")
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def _auth(client: AsyncClient, username: str) -> dict[str, str]:
    body = {"username": username, "password": "password123"}
    assert (await client.post("/auth/register", json=body)).status_code == 201
    res = await client.post("/auth/token", data=body)
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


async def _create_game(owner: str, config: GameConfig = EXAMPLE_GAME) -> str:
    """Games are created by server code only (generator, seeding), never via the API."""
    async with SessionLocal() as session:
        owner_id = await session.scalar(select(User.id).where(User.username == owner))
        game = Content(
            id=uuid.uuid4(),
            kind="game",
            filename="game.js",
            title="a game",
            config=config.model_dump(),
            owner_id=owner_id,
        )
        session.add(game)
        await session.commit()
        return str(game.id)


async def _register(client: AsyncClient, headers: dict[str, str], **extra: object) -> dict:
    body = {"id": str(uuid.uuid4()), "filename": "clip.mp4", "title": "a video", **extra}
    res = await client.post("/content", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


async def test_register_login_and_interests(client: AsyncClient) -> None:
    headers = await _auth(client, "alice")
    me = (await client.get("/users/me", headers=headers)).json()
    assert me["username"] == "alice"
    assert me["interests"] is None

    set_ = await client.patch(
        "/users/me", json={"interests": "  Rust and robotics "}, headers=headers
    )
    assert set_.json()["interests"] == "Rust and robotics"
    unchanged = await client.patch("/users/me", json={}, headers=headers)
    assert unchanged.json()["interests"] == "Rust and robotics"
    cleared = await client.patch("/users/me", json={"interests": "   "}, headers=headers)
    assert cleared.json()["interests"] is None
    too_long = await client.patch("/users/me", json={"interests": "x" * 2001}, headers=headers)
    assert too_long.status_code == 422

    dup = {"username": "alice", "password": "password123"}
    assert (await client.post("/auth/register", json=dup)).status_code == 409
    wrong = {"username": "alice", "password": "nope-nope"}
    assert (await client.post("/auth/token", data=wrong)).status_code == 401


async def test_content_registration_and_ownership(client: AsyncClient) -> None:
    owner = await _auth(client, "uploader")
    other = await _auth(client, "stranger")

    item = await _register(client, owner, tags=[" Physics ", "physics", "Beams"])
    assert item["owner"] == "uploader"
    assert item["tags"] == ["physics", "beams"]
    assert item["url"] == f"https://cdn.test/files/{item['id']}/clip.mp4"

    assert (await client.get(f"/content/{item['id']}")).json() == item
    listed = (await client.get("/content", params={"tag": "PHYSICS", "owner": "uploader"})).json()
    assert [c["id"] for c in listed] == [item["id"]]

    # Duplicate id, wrong file type, path tricks, no auth.
    dup = {"id": item["id"], "filename": "clip.mp4", "title": "t"}
    assert (await client.post("/content", json=dup, headers=owner)).status_code == 409
    for filename in ["game.js", "notes.pdf", "../x.mp4"]:
        body = {"id": str(uuid.uuid4()), "filename": filename, "title": "t"}
        assert (await client.post("/content", json=body, headers=owner)).status_code == 422
    assert (await client.post("/content", json=dup)).status_code == 401

    path = f"/content/{item['id']}"
    assert (await client.patch(path, json={"title": "x"}, headers=other)).status_code == 403
    assert (await client.delete(path, headers=other)).status_code == 403
    patched = await client.patch(path, json={"title": "New", "tags": ["A"]}, headers=owner)
    assert patched.json()["title"] == "New"
    assert patched.json()["tags"] == ["a"]
    assert (await client.delete(path, headers=owner)).status_code == 204
    assert (await client.get(path)).status_code == 404


async def test_games_cannot_be_registered_via_api(client: AsyncClient) -> None:
    headers = await _auth(client, "regular")
    game = {"id": str(uuid.uuid4()), "filename": "g.js", "kind": "game", "title": "t"}
    assert (await client.post("/content", json=game, headers=headers)).status_code == 422
    # A game-looking request with a video file is still just a video.
    video = await _register(client, headers, kind="game")
    assert video["kind"] == "video"


async def test_feed_requires_auth(client: AsyncClient) -> None:
    assert (await client.post("/feed/next")).status_code == 401
    bogus = {"Authorization": "Bearer garbage"}
    assert (await client.post("/feed/next", headers=bogus)).status_code == 401


async def test_feed_interleaves_games(client: AsyncClient) -> None:
    creator = await _auth(client, "creator")
    videos = {(await _register(client, creator))["id"] for _ in range(2)}
    await _create_game("creator")

    headers = await _auth(client, "carol")
    items = [
        (await client.post("/feed/next", headers=headers)).json()
        for _ in range(VIDEOS_PER_GAME * 2 + 2)
    ]
    assert [item["type"] for item in items] == (["video"] * VIDEOS_PER_GAME + ["game"]) * 2
    # Unseen videos are preferred before repeating.
    assert {items[0]["id"], items[1]["id"]} == videos
    assert all(item["url"].startswith("https://cdn.test/files/") for item in items)

    # Every game is a round prepared in the background, with schema-valid data.
    games = [item for item in items if item["type"] == "game"]
    for game in games:
        validate(game["data"], EXAMPLE_GAME.input_schema)
        assert game["assets"] == []
    async with SessionLocal() as session:
        rounds = (await session.scalars(select(GameRound))).all()
    served = {str(r.id): r.input for r in rounds if r.served_at is not None}
    assert served == {g["round_id"]: g["data"] for g in games}
    # ...and the next one is already waiting.
    assert len([r for r in rounds if r.served_at is None]) == feed.READY_ROUNDS


async def test_game_only_catalog_serves_prepared_rounds(client: AsyncClient) -> None:
    await _auth(client, "maker2")
    await _create_game("maker2")
    headers = await _auth(client, "solo")
    # Nothing is prepared yet on the first call; the background task prepares a round.
    assert (await client.post("/feed/next", headers=headers)).status_code == 404
    first = (await client.post("/feed/next", headers=headers)).json()
    second = (await client.post("/feed/next", headers=headers)).json()
    assert first["type"] == second["type"] == "game"
    assert first["round_id"] != second["round_id"]


async def test_feed_serves_tts_assets(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.generator import preconditions

    async def synthesize(text: str) -> bytes:
        return b"RIFF" + text.encode()

    async def upload(content: bytes, filename: str, content_type: str) -> tuple[uuid.UUID, str]:
        return uuid.uuid4(), filename

    monkeypatch.setattr(preconditions.tts, "synthesize", synthesize)
    monkeypatch.setattr(preconditions.cdn, "upload", upload)
    config = EXAMPLE_GAME.model_copy(
        update={
            "preconditions": [
                preconditions.TtsStep(type="tts", path="/questions/*/question", into="audio")
            ]
        }
    )
    await _auth(client, "voice")
    await _create_game("voice", config=config)
    headers = await _auth(client, "listener")
    await client.post("/feed/next", headers=headers)  # prepares the round
    game = (await client.post("/feed/next", headers=headers)).json()

    count = len(game["data"]["questions"])
    assert game["assets"] == [f"/questions/{i}/audio" for i in range(count)]
    assert all(q["audio"].endswith("/speech.wav") for q in game["data"]["questions"])


@pytest.mark.parametrize("error", [InputGenerationError("invalid"), LLMError("provider down")])
async def test_feed_skips_games_whose_input_fails(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    async def broken(*args: object) -> dict:
        raise error

    monkeypatch.setattr(feed, "generate_input", broken)
    await _auth(client, "gamer")
    await _create_game("gamer")
    headers = await _auth(client, "player")
    assert (await client.post("/feed/next", headers=headers)).status_code == 404  # no video either
    video = await _register(client, headers)
    for _ in range(VIDEOS_PER_GAME + 1):
        assert (await client.post("/feed/next", headers=headers)).json()["id"] == video["id"]


async def test_publish_generated_game(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    file_id = uuid.uuid4()

    async def fake_upload(
        content: bytes, filename: str, content_type: str
    ) -> tuple[uuid.UUID, str]:
        assert b"registerGame(" in content and content_type == "text/javascript"
        return file_id, filename

    monkeypatch.setattr(cdn, "upload", fake_upload)
    await _auth(client, "learner")
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.username == "learner"))
        game = await generate_game(FakeLLM(), ["# Biology\n\nCells divide."])
        content = await publish_generated_game(session, game, user)
        await session.commit()
        assert (content.id, content.kind, content.owner_id) == (file_id, "game", user.id)
        assert GameConfig(**content.config) == game.config


async def test_seed_game(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    file_id = uuid.uuid4()

    async def fake_upload(
        content: bytes, filename: str, content_type: str
    ) -> tuple[uuid.UUID, str]:
        assert (content, content_type) == (
            (EXAMPLE_DIR / "game.js").read_bytes(),
            "text/javascript",
        )
        return file_id, filename

    monkeypatch.setattr(cdn, "upload", fake_upload)
    await _auth(client, "publisher")
    async with SessionLocal() as session:
        game = await seed_game(session, EXAMPLE_DIR, "Example quiz", "publisher")
        assert (game.id, game.kind, game.config) == (file_id, "game", EXAMPLE_GAME.model_dump())
        with pytest.raises(SystemExit, match="already exists"):
            await seed_game(session, EXAMPLE_DIR, "Example quiz", "publisher")
        with pytest.raises(SystemExit, match="unknown user"):
            await seed_game(session, EXAMPLE_DIR, "Other", "nobody")


async def test_update_game_keeps_history(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    file_ids = iter([uuid.uuid4(), uuid.uuid4()])

    async def fake_upload(
        content: bytes, filename: str, content_type: str
    ) -> tuple[uuid.UUID, str]:
        return next(file_ids), filename

    monkeypatch.setattr(cdn, "upload", fake_upload)
    await _auth(client, "publisher")
    async with SessionLocal() as session:
        old = await seed_game(session, EXAMPLE_DIR, "Example quiz", "publisher")
        old_id, owner_id, created_at = old.id, old.owner_id, old.created_at
        session.add_all(
            [
                Score(user_id=owner_id, game_id=old_id, score=7),
                GameRound(
                    user_id=owner_id, game_id=old_id, input={"context": "x"}, served_at=func.now()
                ),
                GameRound(user_id=owner_id, game_id=old_id, input={"context": "prepared"}),
                Impression(user_id=owner_id, content_id=old_id),
            ]
        )
        await session.commit()

        new = await update_game(session, EXAMPLE_DIR, "Example quiz")
        assert new.id != old_id
        assert (new.owner_id, new.created_at, new.title) == (owner_id, created_at, "Example quiz")
        assert await session.get(Content, old_id) is None
        for column in (Score.game_id, GameRound.game_id, Impression.content_id):
            assert set(await session.scalars(select(column))) == {new.id}
        # The played round moved over; the prepared one (old config) was discarded.
        rounds = (await session.scalars(select(GameRound))).all()
        assert [r.input for r in rounds] == [{"context": "x"}]
        with pytest.raises(SystemExit, match="no game titled"):
            await update_game(session, EXAMPLE_DIR, "Missing")


@pytest.mark.parametrize(
    ("code", "error"),
    [
        ("console.log('no registration');", "never calls registerGame"),
        ("registerGame({}); const s = '</SCRIPT>';", "</script"),
    ],
)
async def test_seed_game_rejects_code_the_runtime_cannot_run(
    tmp_path: Path, code: str, error: str
) -> None:
    (tmp_path / "config.json").write_text((EXAMPLE_DIR / "config.json").read_text())
    (tmp_path / "game.js").write_text(code)
    async with SessionLocal() as session:
        with pytest.raises(SystemExit, match=error):
            await seed_game(session, tmp_path, "Broken", "nobody")


async def test_feed_without_content(client: AsyncClient) -> None:
    headers = await _auth(client, "dave")
    assert (await client.post("/feed/next", headers=headers)).status_code == 404


async def test_leaderboard_keeps_best_score_per_user(client: AsyncClient) -> None:
    erin = await _auth(client, "erin")
    frank = await _auth(client, "frank")
    game = await _create_game("erin")
    video = (await _register(client, erin))["id"]
    for headers, score in [(erin, 10), (erin, 30), (frank, 20)]:
        res = await client.post(f"/games/{game}/scores", json={"score": score}, headers=headers)
        assert res.status_code == 200

    board = (await client.get(f"/games/{game}/leaderboard")).json()
    assert board == [{"username": "erin", "score": 30}, {"username": "frank", "score": 20}]

    neg = await client.post(f"/games/{game}/scores", json={"score": -1}, headers=erin)
    assert neg.status_code == 422
    assert (await client.get(f"/games/{video}/leaderboard")).status_code == 404
    assert (await client.get(f"/games/{uuid.uuid4()}/leaderboard")).status_code == 404

    # Listing games
    games_res = await client.get("/games")
    assert games_res.status_code == 200
    listed_games = games_res.json()
    assert any(g["id"] == game and g["kind"] == "game" for g in listed_games)

    single_game_res = await client.get(f"/games/{game}")
    assert single_game_res.status_code == 200
    assert single_game_res.json()["id"] == game
    assert (await client.get(f"/games/{video}")).status_code == 404


async def test_projects_are_private_crud(client: AsyncClient) -> None:
    owner = await _auth(client, "maker")
    other = await _auth(client, "snoop")

    res = await client.post(
        "/projects", json={"name": "Thesis", "body": "# Notes\n\n*FSRS* basics"}, headers=owner
    )
    assert res.status_code == 201
    project = res.json()
    assert project["color"] == "#ffc800"
    assert project["body"] == "# Notes\n\n*FSRS* basics"
    assert project["attachments"] == []
    path = f"/projects/{project['id']}"

    patched_response = await client.patch(
        path, json={"name": "Thesis v2", "color": "#42a5f5"}, headers=owner
    )
    assert patched_response.status_code == 200
    patched = patched_response.json()
    assert patched["name"] == "Thesis v2"
    assert patched["color"] == "#42a5f5"
    assert patched["body"] == project["body"]
    assert patched["updated_at"] >= project["updated_at"]
    assert (await client.get(path, headers=owner)).json()["color"] == "#42a5f5"
    assert (await client.patch(path, json={"color": "blue"}, headers=owner)).status_code == 422

    assert [p["id"] for p in (await client.get("/projects", headers=owner)).json()] == [
        project["id"]
    ]
    # Other users neither see nor touch it, and cannot tell it exists.
    assert (await client.get("/projects", headers=other)).json() == []
    assert (await client.get(path, headers=other)).status_code == 404
    assert (await client.patch(path, json={"name": "x"}, headers=other)).status_code == 404
    assert (await client.delete(path, headers=other)).status_code == 404
    assert (await client.get(path)).status_code == 401

    assert (await client.post("/projects", json={"name": ""}, headers=owner)).status_code == 422
    assert (await client.delete(path, headers=owner)).status_code == 204
    assert (await client.get(path, headers=owner)).status_code == 404


async def test_project_attachments(client: AsyncClient) -> None:
    owner = await _auth(client, "researcher")
    other = await _auth(client, "intruder")
    project = (await client.post("/projects", json={"name": "P"}, headers=owner)).json()
    base = f"/projects/{project['id']}/attachments"

    file_id = str(uuid.uuid4())
    res = await client.post(base, json={"id": file_id, "filename": "paper.pdf"}, headers=owner)
    assert res.status_code == 201
    assert res.json()["url"] == f"https://cdn.test/files/{file_id}/paper.pdf"
    listed = (await client.get(f"/projects/{project['id']}", headers=owner)).json()
    assert [a["id"] for a in listed["attachments"]] == [file_id]

    dup = await client.post(base, json={"id": file_id, "filename": "paper.pdf"}, headers=owner)
    assert dup.status_code == 409
    for filename in ["logo.svg", "run.exe", "../paper.pdf", "noext"]:
        body = {"id": str(uuid.uuid4()), "filename": filename}
        assert (await client.post(base, json=body, headers=owner)).status_code == 422
    foreign = {"id": str(uuid.uuid4()), "filename": "x.png"}
    assert (await client.post(base, json=foreign, headers=other)).status_code == 404

    assert (await client.delete(f"{base}/{file_id}", headers=other)).status_code == 404
    assert (await client.delete(f"{base}/{file_id}", headers=owner)).status_code == 204
    assert (await client.delete(f"{base}/{file_id}", headers=owner)).status_code == 404

    # Deleting a project removes its attachment records.
    kept = str(uuid.uuid4())
    await client.post(base, json={"id": kept, "filename": "img.png"}, headers=owner)
    assert (await client.delete(f"/projects/{project['id']}", headers=owner)).status_code == 204
    again = await client.post("/projects", json={"name": "Q"}, headers=owner)
    reuse = {"id": kept, "filename": "img.png"}
    reused = await client.post(
        f"/projects/{again.json()['id']}/attachments", json=reuse, headers=owner
    )
    assert reused.status_code == 201


async def test_active_project_feeds_the_games(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _auth(client, "gamemaker")
    await _create_game("gamemaker")
    owner = await _auth(client, "learner")
    other = await _auth(client, "nosy")
    materials: list[list[str]] = []
    real_generate_input = feed.generate_input

    async def recording_generate_input(llm, config, given):  # type: ignore[no-untyped-def]
        materials.append(list(given))
        return await real_generate_input(llm, config, given)

    monkeypatch.setattr(feed, "generate_input", recording_generate_input)

    async def ready_rounds() -> int:
        async with SessionLocal() as session:
            return await session.scalar(
                select(func.count()).select_from(GameRound).where(GameRound.served_at.is_(None))
            )

    first = (await client.post("/projects", json={"name": "A", "body": "aa"}, headers=owner)).json()
    second = (
        await client.post("/projects", json={"name": "B", "body": "bb"}, headers=owner)
    ).json()
    foreign = (await client.post("/projects", json={"name": "X"}, headers=other)).json()
    assert (await client.get("/users/me", headers=owner)).json()["active_project_id"] is None

    # Without an active project, rounds use no material, even though projects exist.
    await client.post("/feed/next", headers=owner)
    assert materials == [[]]
    assert await ready_rounds() == 1

    # Activating a project replaces the prepared round with one about that project.
    res = await client.patch("/users/me", json={"active_project_id": second["id"]}, headers=owner)
    assert res.json()["active_project_id"] == second["id"]
    # No flashcards yet: the round uses the project text.
    assert materials[-1] == ["# B\n\nbb"]
    assert await ready_rounds() == 1

    # Editing the active project replaces the prepared round with one about the new text.
    await client.patch(f"/projects/{second['id']}", json={"body": "bb edited"}, headers=owner)
    assert materials[-1] == ["# B\n\nbb edited"]
    assert await ready_rounds() == 1

    # Setting the same project again or other fields keeps the prepared round.
    await client.patch("/users/me", json={"active_project_id": second["id"]}, headers=owner)
    await client.patch("/users/me", json={"interests": "x"}, headers=owner)
    await client.patch(f"/projects/{second['id']}", json={"color": "#42a5f5"}, headers=owner)
    assert len(materials) == 3
    assert await ready_rounds() == 1

    # Others' projects can't be activated, and look the same as missing ones.
    for project_id in [foreign["id"], str(uuid.uuid4())]:
        res = await client.patch("/users/me", json={"active_project_id": project_id}, headers=owner)
        assert res.status_code == 404
    assert (await client.get("/users/me", headers=owner)).json()["active_project_id"] == second[
        "id"
    ]

    # Deleting an inactive project keeps everything; deleting the active one clears it.
    await client.delete(f"/projects/{first['id']}", headers=owner)
    assert await ready_rounds() == 1
    await client.delete(f"/projects/{second['id']}", headers=owner)
    assert (await client.get("/users/me", headers=owner)).json()["active_project_id"] is None
    assert await ready_rounds() == 0

    # null deactivates as well.
    third = (await client.post("/projects", json={"name": "C"}, headers=owner)).json()
    await client.patch("/users/me", json={"active_project_id": third["id"]}, headers=owner)
    res = await client.patch("/users/me", json={"active_project_id": None}, headers=owner)
    assert res.json()["active_project_id"] is None
    assert materials[-1] == []


async def test_flashcards_are_generated_on_request(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = await _auth(client, "carder")
    other = await _auth(client, "peeker")
    project = (
        await client.post("/projects", json={"name": "P", "body": "v1"}, headers=owner)
    ).json()
    path = f"/projects/{project['id']}"
    cards_path = f"{path}/flashcards"

    async def card_ids() -> list[str]:
        res = await client.get(cards_path, headers=owner)
        assert res.status_code == 200
        return [card["id"] for card in res.json()]

    async def generate() -> list[str]:
        res = await client.post(cards_path, headers=owner)
        assert res.status_code == 200, res.text
        return [card["id"] for card in res.json()]

    # Nothing happens on its own.
    edited = (await client.patch(path, json={"body": "v1 edited"}, headers=owner)).json()
    assert await card_ids() == []
    for method in (client.get, client.post):
        assert (await method(cards_path, headers=other)).status_code == 404

    first = await generate()
    assert len(first) == 10  # the fake LLM's minimum
    assert await card_ids() == first
    # Our bookkeeping doesn't count as the user's edit.
    assert (await client.get(path, headers=owner)).json()["updated_at"] == edited["updated_at"]

    # Unchanged text needs no LLM call; a failing LLM keeps the old cards.
    async def failing_generate(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise LLMError("down")

    with monkeypatch.context() as m:
        m.setattr(FakeLLM, "generate", failing_generate)
        assert await generate() == first
        await client.patch(path, json={"body": "v2"}, headers=owner)
        assert (await client.post(cards_path, headers=owner)).status_code == 502
    assert await card_ids() == first

    second = await generate()
    assert len(second) == 10 and not set(second) & set(first)
    # Nothing to make cards from: an error, and the old cards stay.
    await client.patch(path, json={"body": ""}, headers=owner)
    assert (await client.post(cards_path, headers=owner)).status_code == 422
    assert await card_ids() == second

    # Rounds use a few random cards of the active project.
    await client.patch(path, json={"body": "v3"}, headers=owner)
    await generate()
    await client.patch("/users/me", json={"active_project_id": project["id"]}, headers=owner)
    async with SessionLocal() as session:
        user_id = await session.scalar(select(User.id).where(User.username == "carder"))
        assert user_id is not None
        materials = await feed._project_materials(session, user_id)
    assert len(materials) == feed.CARDS_PER_ROUND
    assert all(m.startswith("# P: ") for m in materials)


async def _score(
    client: AsyncClient, headers: dict[str, str], game: str, score: int, **extra: object
) -> dict:
    res = await client.post(
        f"/games/{game}/scores", json={"score": score, **extra}, headers=headers
    )
    assert res.status_code == 200, res.text
    return res.json()


async def _user_id(username: str) -> uuid.UUID:
    async with SessionLocal() as session:
        user_id = await session.scalar(select(User.id).where(User.username == username))
        assert user_id is not None
        return user_id


async def _unlock_rows(username: str) -> list[str]:
    user_id = await _user_id(username)
    async with SessionLocal() as session:
        return sorted(
            await session.scalars(
                select(UserAccessory.accessory_id).where(UserAccessory.user_id == user_id)
            )
        )


async def test_zombie_endpoints_require_auth(client: AsyncClient) -> None:
    await _auth(client, "owner")
    game = await _create_game("owner")
    bogus = {"Authorization": "Bearer garbage"}
    for headers in [{}, bogus]:
        assert (await client.get("/zombie/accessories", headers=headers)).status_code == 401
        assert (await client.get("/users/me/zombie", headers=headers)).status_code == 401
        res = await client.put("/users/me/zombie/equipped", json={}, headers=headers)
        assert res.status_code == 401
        assert (await client.get("/zombie/avatars", headers=headers)).status_code == 401
        res = await client.put(
            "/users/me/zombie/avatar", json={"avatar": "zombie"}, headers=headers
        )
        assert res.status_code == 401
        res = await client.post(f"/games/{game}/scores", json={"score": 1}, headers=headers)
        assert res.status_code == 401


async def test_accessory_catalog(client: AsyncClient) -> None:
    headers = await _auth(client, "shopper")
    catalog = (await client.get("/zombie/accessories", headers=headers)).json()
    assert [(a["id"], a["slot"]) for a in catalog] == [
        ("hat", "head"),
        ("sunglasses", "eyes"),
        ("red-sneakers", "feet"),
        ("gold-chain", "neck"),
    ]
    assert all(set(a) == {"id", "name", "slot", "unlock_description"} for a in catalog)


async def test_score_is_persisted_and_unlocks_the_hat(client: AsyncClient) -> None:
    headers = await _auth(client, "newbie")
    game = await _create_game("newbie")
    assert await _score(client, headers, game, 3) == {
        "newly_unlocked": ["hat"],
        "newly_unlocked_avatars": [],
        "games_completed": 1,
    }
    async with SessionLocal() as session:
        score = await session.scalar(select(Score))
    assert score is not None
    assert (score.user_id, str(score.game_id), score.score, score.round_id) == (
        await _user_id("newbie"),
        game,
        3,
        None,
    )
    assert score.created_at is not None
    # Unlocks are reported once.
    assert await _score(client, headers, game, 0) == {
        "newly_unlocked": [],
        "newly_unlocked_avatars": [],
        "games_completed": 2,
    }


async def test_round_scores_are_idempotent(client: AsyncClient) -> None:
    headers = await _auth(client, "replayer")
    other = await _auth(client, "copycat")
    game = await _create_game("replayer")
    other_game = await _create_game("replayer")
    async with SessionLocal() as session:
        game_round = GameRound(
            user_id=await _user_id("replayer"), game_id=uuid.UUID(game), input={}
        )
        session.add(game_round)
        await session.commit()
    round_id = str(game_round.id)

    first = await _score(client, headers, game, 5, round_id=round_id)
    assert first == {"newly_unlocked": ["hat"], "newly_unlocked_avatars": [], "games_completed": 1}
    # A resubmission (even with a better score) is ignored and runs no unlocks.
    again = await _score(client, headers, game, 50, round_id=round_id)
    assert again == {"newly_unlocked": [], "newly_unlocked_avatars": [], "games_completed": 1}
    async with SessionLocal() as session:
        assert list(await session.scalars(select(Score.score))) == [5]
    assert await _unlock_rows("replayer") == ["hat"]

    # Only the user's own rounds of that game can be scored.
    body = {"score": 1, "round_id": round_id}
    for path, headers_ in [(game, other), (other_game, headers)]:
        res = await client.post(f"/games/{path}/scores", json=body, headers=headers_)
        assert res.status_code == 404
    unknown = {"score": 1, "round_id": str(uuid.uuid4())}
    res = await client.post(f"/games/{game}/scores", json=unknown, headers=headers)
    assert res.status_code == 404


async def test_games_completed_unlocks(client: AsyncClient) -> None:
    headers = await _auth(client, "grinder")
    game = await _create_game("grinder")
    unlocked_after: dict[str, int] = {}
    for n in range(1, 26):
        # Equal scores never beat the personal best.
        result = await _score(client, headers, game, 7)
        assert result["games_completed"] == n
        for accessory in result["newly_unlocked"]:
            assert accessory not in unlocked_after
            unlocked_after[accessory] = n
    assert unlocked_after == {"hat": 1, "sunglasses": 5, "gold-chain": 25}
    assert await _unlock_rows("grinder") == ["gold-chain", "hat", "sunglasses"]


async def test_personal_best_unlock_needs_an_earlier_score_of_that_game(
    client: AsyncClient,
) -> None:
    headers = await _auth(client, "climber")
    first_game = await _create_game("climber")
    second_game = await _create_game("climber")
    assert (await _score(client, headers, first_game, 10))["newly_unlocked"] == ["hat"]
    # A first score in another game is no personal best, however high (scales differ).
    assert (await _score(client, headers, second_game, 500))["newly_unlocked"] == []
    assert (await _score(client, headers, first_game, 10))["newly_unlocked"] == []  # a tie
    assert (await _score(client, headers, first_game, 11))["newly_unlocked"] == ["red-sneakers"]
    assert await _unlock_rows("climber") == ["hat", "red-sneakers"]


async def test_zombie_backfills_existing_score_history(client: AsyncClient) -> None:
    headers = await _auth(client, "veteran")
    game = await _create_game("veteran")
    user_id = await _user_id("veteran")
    async with SessionLocal() as session:
        session.add_all(
            Score(user_id=user_id, game_id=uuid.UUID(game), score=score) for score in [1, 4, 2]
        )
        await session.commit()

    zombie = (await client.get("/users/me/zombie", headers=headers)).json()
    assert zombie == {
        "unlocked": ["hat", "red-sneakers"],
        "equipped": {"head": None, "eyes": None, "neck": None, "feet": None},
        "games_completed": 3,
        "progress": [
            {"id": "sunglasses", "current": 3, "target": 5},
            {"id": "gold-chain", "current": 3, "target": 25},
        ],
        "avatar": "zombie",
        "unlocked_avatars": ["zombie"],
        "avatar_progress": [
            {"id": "half-human", "current": 3, "target": 10},
            {"id": "human", "current": 3, "target": 100},
        ],
    }
    assert (await client.get("/users/me/zombie", headers=headers)).json() == zombie
    assert await _unlock_rows("veteran") == ["hat", "red-sneakers"]
    # Backfilled accessories are not reported again by the next score.
    assert await _score(client, headers, game, 0) == {
        "newly_unlocked": [],
        "newly_unlocked_avatars": [],
        "games_completed": 4,
    }


async def test_equip_accessories(client: AsyncClient) -> None:
    headers = await _auth(client, "dresser")
    game = await _create_game("dresser")
    path = "/users/me/zombie/equipped"
    fresh = (await client.get("/users/me/zombie", headers=headers)).json()
    assert (fresh["unlocked"], fresh["games_completed"]) == ([], 0)
    assert [p["id"] for p in fresh["progress"]] == ["hat", "sunglasses", "gold-chain"]

    await _score(client, headers, game, 1)
    await _score(client, headers, game, 2)  # hat and red sneakers
    res = await client.put(path, json={"head": "hat", "feet": "red-sneakers"}, headers=headers)
    assert res.status_code == 200
    expected = {"head": "hat", "eyes": None, "neck": None, "feet": "red-sneakers"}
    assert res.json()["equipped"] == expected
    assert res.json() == (await client.get("/users/me/zombie", headers=headers)).json()

    # Omitted slots stay, null unequips.
    res = await client.put(path, json={"feet": None}, headers=headers)
    expected = {"head": "hat", "eyes": None, "neck": None, "feet": None}
    assert res.json()["equipped"] == expected
    assert (await client.put(path, json={}, headers=headers)).json() == res.json()

    for body in [
        {"eyes": "hat"},  # wrong slot
        {"head": "crown"},  # unknown accessory
        {"tail": "hat"},  # unknown slot
    ]:
        assert (await client.put(path, json=body, headers=headers)).status_code == 422, body
    locked = await client.put(path, json={"eyes": "sunglasses"}, headers=headers)
    assert locked.status_code == 403
    # Failed updates change nothing.
    zombie = (await client.get("/users/me/zombie", headers=headers)).json()
    assert zombie["equipped"] == expected


async def test_flashcards_read_text_and_pdf_attachments(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.generator import flashcards

    owner = await _auth(client, "reader")
    project = (await client.post("/projects", json={"name": "Bio"}, headers=owner)).json()
    path = f"/projects/{project['id']}"
    files = {
        "notes.txt": b"Mitochondria make ATP.",
        "paper.pdf": text_pdf("Ribosomes build proteins"),
        "diagram.png": b"\x89PNG never read",
        "gone.md": None,  # missing on the CDN
    }
    downloads: list[str] = []
    materials: list[str] = []

    async def fake_download(file_id: uuid.UUID, filename: str, max_bytes: int) -> bytes:
        downloads.append(filename)
        if files[filename] is None:
            request = httpx.Request("GET", cdn.file_url(file_id, filename))
            raise httpx.HTTPStatusError("404", request=request, response=httpx.Response(404))
        return files[filename]

    real_generate = flashcards.generate_flashcards

    async def recording_generate(llm, material):  # type: ignore[no-untyped-def]
        materials.append(material)
        return await real_generate(llm, material)

    monkeypatch.setattr(cdn, "download", fake_download)
    monkeypatch.setattr(flashcards, "generate_flashcards", recording_generate)

    async def attach(filename: str) -> None:
        body = {"id": str(uuid.uuid4()), "filename": filename}
        assert (
            await client.post(f"{path}/attachments", json=body, headers=owner)
        ).status_code == 201

    # An image alone is no material, and isn't even downloaded.
    await attach("diagram.png")
    assert (await client.post(f"{path}/flashcards", headers=owner)).status_code == 422
    assert downloads == []

    for filename in ["notes.txt", "paper.pdf", "gone.md"]:
        await attach(filename)
    res = await client.post(f"{path}/flashcards", headers=owner)
    assert res.status_code == 200 and len(res.json()) == 10
    assert sorted(downloads) == ["gone.md", "notes.txt", "paper.pdf"]
    assert materials == [
        "# Bio\n\n## notes.txt\n\nMitochondria make ATP."
        "\n\n## paper.pdf\n\nRibosomes build proteins"
    ]

    # Unchanged project: no downloads, no LLM call. A new attachment counts as a change.
    downloads.clear()
    assert (await client.post(f"{path}/flashcards", headers=owner)).status_code == 200
    assert downloads == [] and len(materials) == 1
    files["more.txt"] = b"Cells divide."
    await attach("more.txt")
    assert (await client.post(f"{path}/flashcards", headers=owner)).status_code == 200
    assert len(materials) == 2 and "Cells divide." in materials[1]

    # An unreachable CDN fails the request instead of making cards from part of the project.
    files["late.txt"] = b"x"
    await attach("late.txt")

    async def unreachable(*args: object) -> bytes:
        raise httpx.ConnectError("down")

    monkeypatch.setattr(cdn, "download", unreachable)
    assert (await client.post(f"{path}/flashcards", headers=owner)).status_code == 502


async def _add_scores(username: str, game: str, count: int) -> None:
    """Score history written directly, e.g. from before unlocks existed."""
    user_id = await _user_id(username)
    async with SessionLocal() as session:
        session.add_all(
            Score(user_id=user_id, game_id=uuid.UUID(game), score=0) for _ in range(count)
        )
        await session.commit()


async def _avatar_rows(username: str) -> list[str]:
    user_id = await _user_id(username)
    async with SessionLocal() as session:
        return sorted(
            await session.scalars(select(UserAvatar.avatar_id).where(UserAvatar.user_id == user_id))
        )


async def test_avatar_catalog(client: AsyncClient) -> None:
    headers = await _auth(client, "browser")
    catalog = (await client.get("/zombie/avatars", headers=headers)).json()
    assert [a["id"] for a in catalog] == ["zombie", "half-human", "human"]
    assert all(set(a) == {"id", "name", "unlock_description"} for a in catalog)


async def test_zombie_is_the_default_avatar(client: AsyncClient) -> None:
    headers = await _auth(client, "rookie")
    zombie = (await client.get("/users/me/zombie", headers=headers)).json()
    assert (zombie["avatar"], zombie["unlocked_avatars"]) == ("zombie", ["zombie"])
    assert zombie["avatar_progress"] == [
        {"id": "half-human", "current": 0, "target": 10},
        {"id": "human", "current": 0, "target": 100},
    ]
    res = await client.put("/users/me/zombie/avatar", json={"avatar": "zombie"}, headers=headers)
    assert res.status_code == 200
    assert res.json() == zombie
    assert await _avatar_rows("rookie") == []  # the starting avatar is implicit


async def test_avatars_unlock_at_games_completed(client: AsyncClient) -> None:
    headers = await _auth(client, "marathoner")
    game = await _create_game("marathoner")
    for _ in range(9):
        assert (await _score(client, headers, game, 0))["newly_unlocked_avatars"] == []
    async with SessionLocal() as session:
        game_round = GameRound(
            user_id=await _user_id("marathoner"), game_id=uuid.UUID(game), input={}
        )
        session.add(game_round)
        await session.commit()
    tenth = await _score(client, headers, game, 0, round_id=str(game_round.id))
    assert (tenth["newly_unlocked_avatars"], tenth["games_completed"]) == (["half-human"], 10)
    # Resubmitting the round unlocks nothing again.
    again = await _score(client, headers, game, 0, round_id=str(game_round.id))
    assert (again["newly_unlocked_avatars"], again["games_completed"]) == ([], 10)
    # Unlocking doesn't switch: the player chooses.
    zombie = (await client.get("/users/me/zombie", headers=headers)).json()
    assert (zombie["avatar"], zombie["unlocked_avatars"]) == ("zombie", ["zombie", "half-human"])
    assert zombie["avatar_progress"] == [{"id": "human", "current": 10, "target": 100}]

    await _add_scores("marathoner", game, 88)
    assert (await _score(client, headers, game, 0))["newly_unlocked_avatars"] == []  # 99
    hundredth = await _score(client, headers, game, 0)
    assert (hundredth["newly_unlocked_avatars"], hundredth["games_completed"]) == (["human"], 100)
    assert (await _score(client, headers, game, 0))["newly_unlocked_avatars"] == []
    assert await _avatar_rows("marathoner") == ["half-human", "human"]


@pytest.mark.parametrize(
    ("count", "unlocked", "progress"),
    [
        (12, ["zombie", "half-human"], [{"id": "human", "current": 12, "target": 100}]),
        (100, ["zombie", "half-human", "human"], []),
    ],
)
async def test_avatars_are_backfilled(
    client: AsyncClient, count: int, unlocked: list[str], progress: list[dict]
) -> None:
    headers = await _auth(client, "oldtimer")
    game = await _create_game("oldtimer")
    await _add_scores("oldtimer", game, count)

    zombie = (await client.get("/users/me/zombie", headers=headers)).json()
    assert (zombie["avatar"], zombie["unlocked_avatars"]) == ("zombie", unlocked)
    assert zombie["avatar_progress"] == progress
    assert (await client.get("/users/me/zombie", headers=headers)).json() == zombie
    assert await _avatar_rows("oldtimer") == sorted(unlocked[1:])
    assert (await _score(client, headers, game, 0))["newly_unlocked_avatars"] == []


async def test_switching_avatar_keeps_accessories(client: AsyncClient) -> None:
    headers = await _auth(client, "shapeshifter")
    game = await _create_game("shapeshifter")
    await _add_scores("shapeshifter", game, 10)
    equip = {"head": "hat", "eyes": "sunglasses"}
    before = (await client.put("/users/me/zombie/equipped", json=equip, headers=headers)).json()
    assert before["equipped"]["head"] == "hat" and before["avatar"] == "zombie"
    path = "/users/me/zombie/avatar"

    def accessories(zombie: dict) -> tuple:
        return zombie["unlocked"], zombie["equipped"], zombie["progress"]

    res = await client.put(path, json={"avatar": "half-human"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["avatar"] == "half-human"
    assert accessories(res.json()) == accessories(before)
    assert (await client.get("/users/me/zombie", headers=headers)).json() == res.json()

    assert (await client.put(path, json={"avatar": "human"}, headers=headers)).status_code == 403
    for body in [{"avatar": "robot"}, {}, {"avatar": "zombie", "extra": 1}]:
        assert (await client.put(path, json=body, headers=headers)).status_code == 422, body
    zombie = (await client.get("/users/me/zombie", headers=headers)).json()
    assert zombie["avatar"] == "half-human"  # failed switches change nothing

    back = (await client.put(path, json={"avatar": "zombie"}, headers=headers)).json()
    assert back["avatar"] == "zombie"
    assert accessories(back) == accessories(before)
    assert back["unlocked_avatars"] == ["zombie", "half-human"]
