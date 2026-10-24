"""Decides what a user sees next and records it."""

import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import cms
from app.models import Impression, User

VIDEOS_PER_GAME = 3


def videos_since_last_game(recent: list[Impression]) -> int:
    """Count leading video impressions in a newest-first list."""
    count = 0
    for impression in recent:
        if impression.kind == "game":
            break
        count += 1
    return count


def should_serve_game(videos_since_game: int) -> bool:
    return videos_since_game >= VIDEOS_PER_GAME


async def _pick(session: AsyncSession, user: User, kind: cms.Kind) -> cms.ContentSummary | None:
    candidates = await cms.list_content(kind, user.field)
    if not candidates:
        return None
    seen = set(
        await session.scalars(
            select(Impression.content_id).where(
                Impression.user_id == user.id, Impression.kind == kind
            )
        )
    )
    # Prefer unseen items; once the field is exhausted, start repeating.
    unseen = [c for c in candidates if c.id not in seen]
    return random.choice(unseen or candidates)


async def next_item(session: AsyncSession, user: User) -> tuple[cms.Kind, cms.Content] | None:
    """Pick the next feed item for `user`, record the impression, and commit.

    Falls back to the other kind when the preferred one has no content,
    so a field with only videos (or only games) still yields a feed.
    """
    recent = (
        await session.scalars(
            select(Impression)
            .where(Impression.user_id == user.id)
            .order_by(Impression.served_at.desc(), Impression.id.desc())
            .limit(VIDEOS_PER_GAME)
        )
    ).all()
    kinds: list[cms.Kind] = ["video", "game"]
    if should_serve_game(videos_since_last_game(list(recent))):
        kinds.reverse()

    for kind in kinds:
        summary = await _pick(session, user, kind)
        if summary is None:
            continue
        content = await cms.get_content(kind, summary.id)
        if content is None:  # removed from the CMS between list and get
            continue
        session.add(Impression(user_id=user.id, kind=kind, content_id=content.id))
        await session.commit()
        return kind, content
    return None
