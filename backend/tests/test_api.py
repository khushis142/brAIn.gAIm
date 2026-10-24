"""End-to-end API tests against a real Postgres (set TEST_DATABASE_URL to run)."""

import os
import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update

from app.db import SessionLocal, engine
from app.feed import VIDEOS_PER_GAME
from app.main import app
from app.models import Base, StudyField, User

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)

CS = "computer-science"
ENG = "engineering"


@pytest.fixture(scope="session", autouse=True)
async def schema() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:  # migrations seed these in real databases
        session.add_all(
            [StudyField(slug=CS, name="Computer Science"), StudyField(slug=ENG, name="Engineering")]
        )
        await session.commit()
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="session")
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def _auth(client: AsyncClient, username: str, field: str = CS) -> dict[str, str]:
    body = {"username": username, "password": "password123", "field": field}
    assert (await client.post("/auth/register", json=body)).status_code == 201
    res = await client.post("/auth/token", data={"username": username, "password": "password123"})
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


async def _make_developer(username: str) -> None:
    async with SessionLocal() as session:
        await session.execute(
            update(User).where(User.username == username).values(is_developer=True)
        )
        await session.commit()


async def _new_field(slug: str) -> str:
    """A field of its own, so other tests' content cannot leak into assertions."""
    async with SessionLocal() as session:
        session.add(StudyField(slug=slug, name=slug))
        await session.commit()
    return slug


async def _register(
    client: AsyncClient, headers: dict[str, str], kind: str, field: str, **extra: object
) -> dict:
    body = {
        "id": str(uuid.uuid4()),
        "filename": "clip.mp4" if kind == "video" else "game.js",
        "kind": kind,
        "title": f"{kind} {field}",
        "field": field,
        **extra,
    }
    res = await client.post("/content", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


async def test_fields(client: AsyncClient) -> None:
    fields = (await client.get("/fields")).json()
    assert {"slug": CS, "name": "Computer Science"} in fields


async def test_register_login_and_me(client: AsyncClient) -> None:
    headers = await _auth(client, "alice")
    me = (await client.get("/users/me", headers=headers)).json()
    assert me["username"] == "alice"
    assert me["field"] == CS
    assert me["is_developer"] is False

    patched = await client.patch("/users/me", json={"field": ENG}, headers=headers)
    assert patched.json()["field"] == ENG
    unknown = await client.patch("/users/me", json={"field": "astrology"}, headers=headers)
    assert unknown.status_code == 422

    dup = {"username": "alice", "password": "password123", "field": CS}
    assert (await client.post("/auth/register", json=dup)).status_code == 409
    bad = {"username": "bob", "password": "password123", "field": "astrology"}
    assert (await client.post("/auth/register", json=bad)).status_code == 422
    wrong = {"username": "alice", "password": "nope-nope"}
    assert (await client.post("/auth/token", data=wrong)).status_code == 401


async def test_content_registration_and_ownership(client: AsyncClient) -> None:
    owner = await _auth(client, "uploader")
    other = await _auth(client, "stranger")
    await _make_developer("uploader")

    item = await _register(client, owner, "video", ENG, tags=[" Physics ", "physics", "Beams"])
    assert item["owner"] == "uploader"
    assert item["tags"] == ["physics", "beams"]
    assert item["url"] == f"https://cdn.test/files/{item['id']}/clip.mp4"

    assert (await client.get(f"/content/{item['id']}")).json() == item
    listed = (await client.get("/content", params={"tag": "PHYSICS", "owner": "uploader"})).json()
    assert [c["id"] for c in listed] == [item["id"]]

    # Duplicate id, wrong file type, unknown field, path tricks, no auth.
    dup = {**item, "filename": "clip.mp4"}
    assert (await client.post("/content", json=dup, headers=owner)).status_code == 409
    for body in [
        {"kind": "video", "filename": "game.js", "field": ENG},
        {"kind": "game", "filename": "clip.mp4", "field": ENG},
        {"kind": "video", "filename": "clip.mp4", "field": "astrology"},
        {"kind": "video", "filename": "../x.mp4", "field": ENG},
    ]:
        body |= {"id": str(uuid.uuid4()), "title": "t"}
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


async def test_only_developers_publish_games(client: AsyncClient) -> None:
    headers = await _auth(client, "regular")
    game = {"id": str(uuid.uuid4()), "filename": "g.js", "kind": "game", "title": "t", "field": CS}
    res = await client.post("/content", json=game, headers=headers)
    assert res.status_code == 403
    await _register(client, headers, "video", CS)  # videos stay open to everyone

    await _make_developer("regular")
    assert (await client.get("/users/me", headers=headers)).json()["is_developer"] is True
    assert (await client.post("/content", json=game, headers=headers)).status_code == 201


async def test_feed_requires_auth(client: AsyncClient) -> None:
    assert (await client.post("/feed/next")).status_code == 401
    bogus = {"Authorization": "Bearer garbage"}
    assert (await client.post("/feed/next", headers=bogus)).status_code == 401


async def test_feed_interleaves_games(client: AsyncClient) -> None:
    field = await _new_field("feed-test")
    creator = await _auth(client, "creator")
    await _make_developer("creator")
    videos = {(await _register(client, creator, "video", field))["id"] for _ in range(2)}
    await _register(client, creator, "game", field)
    await _register(client, creator, "video", ENG)  # other field, never served

    headers = await _auth(client, "carol", field=field)
    items = [
        (await client.post("/feed/next", headers=headers)).json()
        for _ in range(VIDEOS_PER_GAME * 2 + 2)
    ]
    assert [item["type"] for item in items] == (["video"] * VIDEOS_PER_GAME + ["game"]) * 2
    # Unseen videos are preferred before repeating.
    assert {items[0]["id"], items[1]["id"]} == videos
    assert all(item["url"].startswith("https://cdn.test/files/") for item in items)


async def test_feed_empty_field(client: AsyncClient) -> None:
    headers = await _auth(client, "dave", field=await _new_field("empty"))
    assert (await client.post("/feed/next", headers=headers)).status_code == 404


async def test_leaderboard_keeps_best_score_per_user(client: AsyncClient) -> None:
    erin = await _auth(client, "erin")
    frank = await _auth(client, "frank")
    await _make_developer("erin")
    game = (await _register(client, erin, "game", CS))["id"]
    video = (await _register(client, erin, "video", CS))["id"]
    for headers, score in [(erin, 10), (erin, 30), (frank, 20)]:
        res = await client.post(f"/games/{game}/scores", json={"score": score}, headers=headers)
        assert res.status_code == 204

    board = (await client.get(f"/games/{game}/leaderboard")).json()
    assert board == [{"username": "erin", "score": 30}, {"username": "frank", "score": 20}]

    neg = await client.post(f"/games/{game}/scores", json={"score": -1}, headers=erin)
    assert neg.status_code == 422
    assert (await client.get(f"/games/{video}/leaderboard")).status_code == 404
    assert (await client.get(f"/games/{uuid.uuid4()}/leaderboard")).status_code == 404
