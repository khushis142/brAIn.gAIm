"""Publish a game: upload its JS to the CDN and register it with its config.

Usage: python -m app.seed_game <dir> --title "Quiz" --owner <username>

<dir> holds `game.js` and `config.json` ({"input_schema": <JSON Schema>, "context": "..."});
see games/README.md.
This is the only way games enter the system besides the generator: the API never accepts them.
"""

import argparse
import asyncio
import json
import uuid
from pathlib import Path

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import SessionLocal, engine
from app.generator.inputs import GameConfig
from app.models import Content, User

MAX_GAME_BYTES = 200_000


def _check_game_code(path: Path) -> None:
    """The frontend runtime's hard requirements (Frontend `docs/game-authoring.md`)."""
    if path.stat().st_size > MAX_GAME_BYTES:
        raise SystemExit(f"{path} is larger than {MAX_GAME_BYTES} bytes")
    code = path.read_text()
    if "registerGame(" not in code:
        raise SystemExit(f"{path} never calls registerGame(...)")
    if "</script" in code.lower():
        raise SystemExit(f"{path} contains '</script', which breaks the inline embedding")


async def upload_to_cdn(path: Path) -> tuple[uuid.UUID, str]:
    url = f"{get_settings().cdn_base_url.rstrip('/')}/api/v1/files"
    async with httpx.AsyncClient(timeout=60) as client:
        with path.open("rb") as file:
            res = await client.post(url, files={"file": (path.name, file, "text/javascript")})
    res.raise_for_status()
    body = res.json()
    return uuid.UUID(body["id"]), body["filename"]


async def seed_game(session: AsyncSession, directory: Path, title: str, owner: str) -> Content:
    config = GameConfig.model_validate_json((directory / "config.json").read_text())
    game_js = directory / "game.js"
    _check_game_code(game_js)
    owner_id = await session.scalar(select(User.id).where(User.username == owner))
    if owner_id is None:
        raise SystemExit(f"unknown user: {owner}")
    existing = select(Content.id).where(Content.kind == "game", Content.title == title)
    if await session.scalar(existing) is not None:
        raise SystemExit(f"a game titled {title!r} already exists")

    file_id, filename = await upload_to_cdn(game_js)
    game = Content(
        id=file_id,
        kind="game",
        filename=filename,
        title=title,
        config=config.model_dump(),
        owner_id=owner_id,
    )
    session.add(game)
    await session.commit()
    return game


async def _main(directory: Path, title: str, owner: str) -> None:
    async with SessionLocal() as session:
        game = await seed_game(session, directory, title, owner)
    await engine.dispose()
    print(json.dumps({"id": str(game.id), "title": game.title, "filename": game.filename}))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("dir", type=Path)
    parser.add_argument("--title", required=True)
    parser.add_argument("--owner", required=True, help="Username of the publishing user")
    args = parser.parse_args()
    asyncio.run(_main(args.dir, args.title, args.owner))


if __name__ == "__main__":
    main()
