import uuid

from sqlalchemy import case, delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ContentLike
from app.schemas import LikeRead


async def state(session: AsyncSession, user_id: uuid.UUID, content_id: uuid.UUID) -> LikeRead:
    total, user_likes = (
        await session.execute(
            select(
                func.count(ContentLike.content_id),
                func.count(case((ContentLike.user_id == user_id, 1))),
            ).where(ContentLike.content_id == content_id)
        )
    ).one()
    return LikeRead(liked=user_likes > 0, like_count=total)


async def set_like(
    session: AsyncSession, user_id: uuid.UUID, content_id: uuid.UUID, liked: bool
) -> LikeRead:
    if liked:
        await session.execute(
            insert(ContentLike)
            .values(user_id=user_id, content_id=content_id)
            .on_conflict_do_nothing()
        )
    else:
        await session.execute(
            delete(ContentLike).where(
                ContentLike.user_id == user_id,
                ContentLike.content_id == content_id,
            )
        )
    await session.commit()
    return await state(session, user_id, content_id)
