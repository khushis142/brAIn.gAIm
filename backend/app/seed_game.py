"""Publish a game: upload its JS to the CDN and register it with its config.

Usage: python -m app.seed_game <dir> --title "Quiz" --owner <username>
       python -m app.seed_game <dir> --title "Quiz" --update

<dir> holds `game.js` and `config.json` ({"input_schema": <JSON Schema>, "context": "..."});
see games/README.md. `--update` replaces the code and config of an existing game.
This is the only way games enter the system besides the generator: the API never accepts them.
"""

import argparse
import asyncio
import json
import uuid
from pathlib import Path

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import SessionLocal, engine
from app.generator.inputs import GameConfig
from app.models import Content, GameRound, Impression, Score, User

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


def _load_game(directory: Path) -> tuple[GameConfig, Path]:
    config = GameConfig.model_validate_json((directory / "config.json").read_text())
    game_js = directory / "game.js"
    _check_game_code(game_js)
    return config, game_js


async def seed_game(session: AsyncSession, directory: Path, title: str, owner: str) -> Content:
    config, game_js = _load_game(directory)
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


async def update_game(session: AsyncSession, directory: Path, title: str) -> Content:
    """Publish new code and config for the game titled `title`, keeping its history.

    The id is the CDN file id, so new code means a new id: the game's row is re-created under
    it (same title, owner, tags and creation time) and its scores, rounds and impressions are
    moved over in the same transaction. The old file stays on the CDN.
    """
    config, game_js = _load_game(directory)
    old = await session.scalar(
        select(Content).where(Content.kind == "game", Content.title == title)
    )
    if old is None:
        raise SystemExit(f"no game titled {title!r} to update")

    file_id, filename = await upload_to_cdn(game_js)
    game = Content(
        id=file_id,
        kind="game",
        filename=filename,
        title=title,
        tags=old.tags,
        config=config.model_dump(),
        owner_id=old.owner_id,
        created_at=old.created_at,
    )
    session.add(game)
    await session.flush()
    for column in (Score.game_id, GameRound.game_id, Impression.content_id):
        await session.execute(
            update(column.class_).where(column == old.id).values({column.key: file_id})
        )
    await session.delete(old)
    await session.commit()
    return game


async def _main(directory: Path, title: str, owner: str | None) -> None:
    async with SessionLocal() as session:
        if owner is None:
            game = await update_game(session, directory, title)
        else:
            game = await seed_game(session, directory, title, owner)
    await engine.dispose()
    print(json.dumps({"id": str(game.id), "title": game.title, "filename": game.filename}))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("dir", type=Path)
    parser.add_argument("--title", required=True)
    who = parser.add_mutually_exclusive_group(required=True)
    who.add_argument("--owner", help="Username of the publishing user (new games)")
    who.add_argument(
        "--update", action="store_true", help="Replace the code and config of an existing game"
    )
    args = parser.parse_args()
    asyncio.run(_main(args.dir, args.title, None if args.update else args.owner))


if __name__ == "__main__":
    main()
