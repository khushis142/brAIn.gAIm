"""Decides what a user sees next and records it."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Game, Impression, User, Video

VIDEOS_PER_GAME = 3


def videos_since_last_game(recent: list[Impression]) -> int:
    """Count leading video impressions in a newest-first list."""
    count = 0
    for impression in recent:
        if impression.game_id is not None:
            break
        count += 1
    return count


def should_serve_game(videos_since_game: int) -> bool:
    return videos_since_game >= VIDEOS_PER_GAME


async def _pick_video(session: AsyncSession, user: User) -> Video | None:
    seen = select(Impression.video_id).where(
        Impression.user_id == user.id, Impression.video_id.is_not(None)
    )
    in_field = select(Video).where(Video.field_id == user.field_id).order_by(func.random()).limit(1)
    # Prefer unseen videos; once the field is exhausted, start repeating.
    return await session.scalar(in_field.where(Video.id.not_in(seen))) or await session.scalar(
        in_field
    )


async def _pick_game(session: AsyncSession, user: User) -> Game | None:
    return await session.scalar(
        select(Game).where(Game.field_id == user.field_id).order_by(func.random()).limit(1)
    )


async def next_item(session: AsyncSession, user: User) -> Video | Game | None:
    """Pick the next feed item for `user`, record the impression, and commit.

    Falls back to the other item kind when the preferred one has no content,
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
    pickers = [_pick_video, _pick_game]
    if should_serve_game(videos_since_last_game(list(recent))):
        pickers.reverse()

    for pick in pickers:
        item = await pick(session, user)
        if item is not None:
            break
    else:
        return None

    if isinstance(item, Video):
        session.add(Impression(user_id=user.id, video_id=item.id))
    else:
        session.add(Impression(user_id=user.id, game_id=item.id))
    await session.commit()
    return item
