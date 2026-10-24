"""Upload content from a local directory to S3 and register it in the database.

Usage: python -m app.seed <dir>   (expects <dir>/manifest.json, see seed/manifest.example.json)

Idempotent: fields are upserted by slug, videos/games are skipped if their S3 key exists.
"""

import argparse
import asyncio
import mimetypes
from pathlib import Path

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal, engine
from app.models import Game, StudyField, Video
from app.storage import upload_file


class FieldEntry(BaseModel):
    slug: str
    name: str


class ContentEntry(BaseModel):
    field: str
    title: str
    file: Path


class Manifest(BaseModel):
    fields: list[FieldEntry] = []
    videos: list[ContentEntry] = []
    games: list[ContentEntry] = []


async def _upsert_fields(session: AsyncSession, entries: list[FieldEntry]) -> dict[str, int]:
    existing = {f.slug: f for f in await session.scalars(select(StudyField))}
    for entry in entries:
        field = existing.get(entry.slug)
        if field is None:
            field = existing[entry.slug] = StudyField(slug=entry.slug)
            session.add(field)
        field.name = entry.name
    await session.flush()
    return {slug: f.id for slug, f in existing.items()}


async def _seed_content(
    session: AsyncSession,
    model: type[Video] | type[Game],
    prefix: str,
    entries: list[ContentEntry],
    root: Path,
    field_ids: dict[str, int],
) -> None:
    for entry in entries:
        if entry.field not in field_ids:
            raise SystemExit(f"{entry.file}: unknown field '{entry.field}'")
        path = root / entry.file
        if not path.is_file():
            raise SystemExit(f"{path}: file not found")
        key = f"{prefix}/{entry.field}/{path.name}"
        if await session.scalar(select(model.id).where(model.s3_key == key)) is not None:
            print(f"skip   {key}")
            continue
        content_type = (
            "text/javascript"
            if path.suffix == ".js"
            else mimetypes.guess_type(path)[0] or "application/octet-stream"
        )
        await asyncio.to_thread(upload_file, path, key, content_type)
        session.add(model(title=entry.title, s3_key=key, field_id=field_ids[entry.field]))
        print(f"upload {key}")


async def seed(root: Path) -> None:
    manifest = Manifest.model_validate_json((root / "manifest.json").read_text())
    async with SessionLocal() as session:
        field_ids = await _upsert_fields(session, manifest.fields)
        await _seed_content(session, Video, "videos", manifest.videos, root, field_ids)
        await _seed_content(session, Game, "games", manifest.games, root, field_ids)
        await session.commit()
    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("dir", type=Path)
    asyncio.run(seed(parser.parse_args().dir))


if __name__ == "__main__":
    main()
