"""End-to-end API tests against a real Postgres (set TEST_DATABASE_URL to run).

Content comes from the in-process CMS mock (app/cms.py).
"""

import os
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from app import cms
from app.db import engine
from app.feed import VIDEOS_PER_GAME
from app.main import app
from app.models import Base

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)

FIELD = "computer-science"
GAME = "cs-sorting-quiz"


@pytest.fixture(scope="session", autouse=True)
async def schema() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="session")
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def _auth(client: AsyncClient, username: str, field: str = FIELD) -> dict[str, str]:
    body = {"username": username, "password": "password123", "field": field}
    assert (await client.post("/auth/register", json=body)).status_code == 201
    res = await client.post("/auth/token", data={"username": username, "password": "password123"})
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


async def test_fields_come_from_cms(client: AsyncClient) -> None:
    fields = (await client.get("/fields")).json()
    assert {"slug": FIELD, "name": "Computer Science"} in fields


async def test_register_login_and_me(client: AsyncClient) -> None:
    headers = await _auth(client, "alice")
    me = (await client.get("/users/me", headers=headers)).json()
    assert me["username"] == "alice"
    assert me["field"] == FIELD

    patched = await client.patch("/users/me", json={"field": "engineering"}, headers=headers)
    assert patched.json()["field"] == "engineering"
    unknown = await client.patch("/users/me", json={"field": "astrology"}, headers=headers)
    assert unknown.status_code == 422

    dup = {"username": "alice", "password": "password123", "field": FIELD}
    assert (await client.post("/auth/register", json=dup)).status_code == 409
    bad = {"username": "bob", "password": "password123", "field": "astrology"}
    assert (await client.post("/auth/register", json=bad)).status_code == 422
    wrong = {"username": "alice", "password": "nope-nope"}
    assert (await client.post("/auth/token", data=wrong)).status_code == 401


async def test_feed_requires_auth(client: AsyncClient) -> None:
    assert (await client.post("/feed/next")).status_code == 401
    bogus = {"Authorization": "Bearer garbage"}
    assert (await client.post("/feed/next", headers=bogus)).status_code == 401


async def test_feed_interleaves_games(client: AsyncClient) -> None:
    headers = await _auth(client, "carol")
    items = [
        (await client.post("/feed/next", headers=headers)).json()
        for _ in range(VIDEOS_PER_GAME * 2 + 2)
    ]
    assert [item["type"] for item in items] == (["video"] * VIDEOS_PER_GAME + ["game"]) * 2

    # Unseen videos are preferred before repeating.
    field_videos = {c.id for c in await cms.list_content("video", FIELD)}
    first_round = {item["id"] for item in items[:VIDEOS_PER_GAME]}
    assert first_round == field_videos
    assert all(item["url"].startswith("https://") for item in items)


async def test_feed_empty_field(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = await _auth(client, "dave")

    async def no_content(kind: cms.Kind, field: str) -> list[cms.ContentSummary]:
        return []

    monkeypatch.setattr(cms, "list_content", no_content)
    assert (await client.post("/feed/next", headers=headers)).status_code == 404


async def test_leaderboard_keeps_best_score_per_user(client: AsyncClient) -> None:
    erin = await _auth(client, "erin")
    frank = await _auth(client, "frank")
    for headers, score in [(erin, 10), (erin, 30), (frank, 20)]:
        res = await client.post(f"/games/{GAME}/scores", json={"score": score}, headers=headers)
        assert res.status_code == 204

    board = (await client.get(f"/games/{GAME}/leaderboard")).json()
    assert board == [{"username": "erin", "score": 30}, {"username": "frank", "score": 20}]

    neg = await client.post(f"/games/{GAME}/scores", json={"score": -1}, headers=erin)
    assert neg.status_code == 422
    assert (await client.get("/games/nope/leaderboard")).status_code == 404
    assert (
        await client.post("/games/nope/scores", json={"score": 1}, headers=erin)
    ).status_code == 404
