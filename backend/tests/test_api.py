"""End-to-end API tests against a real Postgres (set TEST_DATABASE_URL to run)."""

import os
import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text

from app.db import SessionLocal, engine
from app.feed import VIDEOS_PER_GAME
from app.main import app
from app.models import Base, Content, User

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


async def _create_game(owner: str) -> str:
    """Games are created by server code only (generator, seeding), never via the API."""
    async with SessionLocal() as session:
        owner_id = await session.scalar(select(User.id).where(User.username == owner))
        game = Content(
            id=uuid.uuid4(), kind="game", filename="game.js", title="a game", owner_id=owner_id
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
        assert res.status_code == 204

    board = (await client.get(f"/games/{game}/leaderboard")).json()
    assert board == [{"username": "erin", "score": 30}, {"username": "frank", "score": 20}]

    neg = await client.post(f"/games/{game}/scores", json={"score": -1}, headers=erin)
    assert neg.status_code == 422
    assert (await client.get(f"/games/{video}/leaderboard")).status_code == 404
    assert (await client.get(f"/games/{uuid.uuid4()}/leaderboard")).status_code == 404


async def test_projects_are_private_crud(client: AsyncClient) -> None:
    owner = await _auth(client, "maker")
    other = await _auth(client, "snoop")

    res = await client.post(
        "/projects", json={"name": "Thesis", "body": "# Notes\n\n*FSRS* basics"}, headers=owner
    )
    assert res.status_code == 201
    project = res.json()
    assert project["body"] == "# Notes\n\n*FSRS* basics"
    assert project["attachments"] == []
    path = f"/projects/{project['id']}"

    patched = (await client.patch(path, json={"name": "Thesis v2"}, headers=owner)).json()
    assert patched["name"] == "Thesis v2"
    assert patched["body"] == project["body"]
    assert patched["updated_at"] >= project["updated_at"]

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
