"""Publish a game: upload its JS to the CDN and register it with its config.

Usage: python -m app.seed_game <dir> --title "Quiz" --owner <username> [--tags word,puzzle]
       python -m app.seed_game <dir> --title "Quiz" --update

<dir> holds `game.js` and `config.json` ({"input_schema": <JSON Schema>, "context": "..."});
see games/README.md. `--update` replaces the code and config of an existing game.
This is the only way games enter the system besides the generator: the API never accepts them.
"""

import argparse
import asyncio
import json
from pathlib import Path

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app import cdn
from app.db import SessionLocal, engine
from app.generator.games import check_game_code
from app.generator.inputs import GameConfig
from app.models import Content, GameRound, Impression, Score, User


def _load_game(directory: Path) -> tuple[GameConfig, str]:
    config = GameConfig.model_validate_json((directory / "config.json").read_text())
    game_js = directory / "game.js"
    code = game_js.read_text()
    if errors := check_game_code(code):
        raise SystemExit(f"{game_js}: {'; '.join(errors)}")
    return config, code


async def seed_game(
    session: AsyncSession, directory: Path, title: str, owner: str, tags: list[str] | None = None
) -> Content:
    config, code = _load_game(directory)
    owner_id = await session.scalar(select(User.id).where(User.username == owner))
    if owner_id is None:
        raise SystemExit(f"unknown user: {owner}")
    existing = select(Content.id).where(Content.kind == "game", Content.title == title)
    if await session.scalar(existing) is not None:
        raise SystemExit(f"a game titled {title!r} already exists")

    file_id, filename = await cdn.upload(code.encode(), "game.js", "text/javascript")
    game = Content(
        id=file_id,
        kind="game",
        filename=filename,
        title=title,
        tags=tags or [],
        config=config.model_dump(mode="json"),
        owner_id=owner_id,
    )
    session.add(game)
    await session.commit()
    return game


async def update_game(session: AsyncSession, directory: Path, title: str) -> Content:
    """Publish new code and config for the game titled `title`, keeping its history.

    The id is the CDN file id, so new code means a new id: the game's row is re-created under
    it (same title, owner, tags and creation time) and its scores, rounds and impressions are
    moved over in the same transaction; rounds prepared but not yet served are discarded. The
    old file stays on the CDN.
    """
    config, code = _load_game(directory)
    old = await session.scalar(
        select(Content).where(Content.kind == "game", Content.title == title)
    )
    if old is None:
        raise SystemExit(f"no game titled {title!r} to update")

    file_id, filename = await cdn.upload(code.encode(), "game.js", "text/javascript")
    game = Content(
        id=file_id,
        kind="game",
        filename=filename,
        title=title,
        tags=old.tags,
        config=config.model_dump(mode="json"),
        owner_id=old.owner_id,
        created_at=old.created_at,
    )
    session.add(game)
    await session.flush()
    # Prepared rounds were generated for the old config; the feed prepares fresh ones.
    await session.execute(
        delete(GameRound).where(GameRound.game_id == old.id, GameRound.served_at.is_(None))
    )
    for column in (Score.game_id, GameRound.game_id, Impression.content_id):
        await session.execute(
            update(column.class_).where(column == old.id).values({column.key: file_id})
        )
    await session.delete(old)
    await session.commit()
    return game


async def _main(directory: Path, title: str, owner: str | None, tags: list[str]) -> None:
    async with SessionLocal() as session:
        if owner is None:
            game = await update_game(session, directory, title)
        else:
            game = await seed_game(session, directory, title, owner, tags)
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
    parser.add_argument("--tags", default="", help="Comma-separated tags (new games only)")
    args = parser.parse_args()
    tags = [tag.strip() for tag in args.tags.split(",") if tag.strip()]
    asyncio.run(_main(args.dir, args.title, None if args.update else args.owner, tags))


if __name__ == "__main__":
    main()
