"""Decides what a user sees next and records it."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Content, Impression, User

VIDEOS_PER_GAME = 3


def videos_since_last_game(recent_kinds: list[str]) -> int:
    """Count leading videos in a newest-first list of served kinds."""
    count = 0
    for kind in recent_kinds:
        if kind == "game":
            break
        count += 1
    return count


def should_serve_game(videos_since_game: int) -> bool:
    return videos_since_game >= VIDEOS_PER_GAME


async def _pick(session: AsyncSession, user: User, kind: str) -> Content | None:
    seen = select(Impression.content_id).where(Impression.user_id == user.id)
    candidates = select(Content).where(Content.kind == kind).order_by(func.random()).limit(1)
    # Prefer unseen items; once everything was seen, start repeating.
    # Personalization (based on user.interests) is not implemented yet.
    return await session.scalar(candidates.where(Content.id.not_in(seen))) or await session.scalar(
        candidates
    )


async def next_item(session: AsyncSession, user: User) -> Content | None:
    """Pick the next feed item for `user`, record the impression, and commit.

    Falls back to the other kind when the preferred one has no content,
    so a catalog with only videos (or only games) still yields a feed.
    """
    recent_kinds = (
        await session.scalars(
            select(Content.kind)
            .join(Impression, Impression.content_id == Content.id)
            .where(Impression.user_id == user.id)
            .order_by(Impression.served_at.desc(), Impression.id.desc())
            .limit(VIDEOS_PER_GAME)
        )
    ).all()
    kinds = ["video", "game"]
    if should_serve_game(videos_since_last_game(list(recent_kinds))):
        kinds.reverse()

    for kind in kinds:
        item = await _pick(session, user, kind)
        if item is not None:
            session.add(Impression(user_id=user.id, content_id=item.id))
            await session.commit()
            return item
    return None
