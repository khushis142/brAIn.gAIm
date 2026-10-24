"""End-to-end API tests against a real Postgres (set TEST_DATABASE_URL to run)."""

import os
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.db import SessionLocal, engine
from app.feed import VIDEOS_PER_GAME
from app.main import app
from app.models import Base, Game, StudyField, Video

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


@pytest.fixture(scope="session")
async def content() -> AsyncIterator[dict[str, int]]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        cs = StudyField(slug="cs", name="Computer Science")
        empty = StudyField(slug="empty", name="Empty")
        session.add_all([cs, empty])
        await session.flush()
        session.add_all(
            [
                Video(title="v1", s3_key="videos/cs/v1.mp4", field_id=cs.id),
                Video(title="v2", s3_key="videos/cs/v2.mp4", field_id=cs.id),
                Game(title="g1", s3_key="games/cs/g1.js", field_id=cs.id),
            ]
        )
        await session.commit()
        yield {"cs": cs.id, "empty": empty.id}
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="session")
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def _auth(client: AsyncClient, username: str, field_id: int) -> dict[str, str]:
    body = {"username": username, "password": "password123", "field_id": field_id}
    assert (await client.post("/auth/register", json=body)).status_code == 201
    res = await client.post("/auth/token", data={"username": username, "password": "password123"})
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


async def test_register_login_and_me(client: AsyncClient, content: dict[str, int]) -> None:
    headers = await _auth(client, "alice", content["cs"])
    me = (await client.get("/users/me", headers=headers)).json()
    assert me["username"] == "alice"
    assert me["field"]["slug"] == "cs"

    dup = {"username": "alice", "password": "password123", "field_id": content["cs"]}
    assert (await client.post("/auth/register", json=dup)).status_code == 409
    bad = {"username": "bob", "password": "password123", "field_id": 9999}
    assert (await client.post("/auth/register", json=bad)).status_code == 422
    wrong = {"username": "alice", "password": "nope-nope"}
    assert (await client.post("/auth/token", data=wrong)).status_code == 401


async def test_feed_requires_auth(client: AsyncClient, content: dict[str, int]) -> None:
    assert (await client.post("/feed/next")).status_code == 401
    bogus = {"Authorization": "Bearer garbage"}
    assert (await client.post("/feed/next", headers=bogus)).status_code == 401


async def test_feed_interleaves_games(client: AsyncClient, content: dict[str, int]) -> None:
    headers = await _auth(client, "carol", content["cs"])
    items = [
        (await client.post("/feed/next", headers=headers)).json()
        for _ in range(VIDEOS_PER_GAME * 2 + 2)
    ]
    types = [item["type"] for item in items]
    expected = (["video"] * VIDEOS_PER_GAME + ["game"]) * 2
    assert types == expected
    # Unseen videos are preferred before repeating.
    assert {items[0]["title"], items[1]["title"]} == {"v1", "v2"}
    assert items[0]["url"].startswith("http://localhost:9000/test/videos/cs/")


async def test_feed_empty_field(client: AsyncClient, content: dict[str, int]) -> None:
    headers = await _auth(client, "dave", content["empty"])
    assert (await client.post("/feed/next", headers=headers)).status_code == 404


async def test_leaderboard_keeps_best_score_per_user(
    client: AsyncClient, content: dict[str, int]
) -> None:
    async with SessionLocal() as session:
        game_id = await session.scalar(select(Game.id))
    erin = await _auth(client, "erin", content["cs"])
    frank = await _auth(client, "frank", content["cs"])
    for headers, score in [(erin, 10), (erin, 30), (frank, 20)]:
        res = await client.post(f"/games/{game_id}/scores", json={"score": score}, headers=headers)
        assert res.status_code == 204

    board = (await client.get(f"/games/{game_id}/leaderboard")).json()
    assert board == [{"username": "erin", "score": 30}, {"username": "frank", "score": 20}]

    neg = await client.post(f"/games/{game_id}/scores", json={"score": -1}, headers=erin)
    assert neg.status_code == 422
    assert (await client.get("/games/9999/leaderboard")).status_code == 404
