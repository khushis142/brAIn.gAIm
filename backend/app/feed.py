"""Decides what a user sees next and records it."""

import logging
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.generator.inputs import GameConfig, InputGenerationError, generate_input
from app.generator.llm import get_llm
from app.models import Content, GameRound, Impression, Project, User

logger = logging.getLogger(__name__)

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


@dataclass(frozen=True)
class Served:
    item: Content
    round: GameRound | None  # set for games


async def _project_materials(session: AsyncSession, user: User) -> list[str]:
    projects = await session.scalars(
        select(Project).where(Project.owner_id == user.id).order_by(Project.updated_at.desc())
    )
    return [f"# {p.name}\n\n{p.body}" for p in projects]


async def _new_round(session: AsyncSession, user: User, game: Content) -> GameRound | None:
    # Runs in the request for now; generating ahead of time is the planned next step.
    assert game.config is not None  # guaranteed for games by a check constraint
    try:
        game_input = await generate_input(
            get_llm(), GameConfig(**game.config), await _project_materials(session, user)
        )
    except InputGenerationError:
        logger.exception("input generation failed for game %s", game.id)
        return None
    return GameRound(user_id=user.id, game_id=game.id, input=game_input)


async def next_item(session: AsyncSession, user: User) -> Served | None:
    """Pick the next feed item for `user`, record the impression, and commit.

    Falls back to the other kind when the preferred one has no content (or a game's input
    could not be generated), so the feed keeps going.
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
        if item is None:
            continue
        game_round = await _new_round(session, user, item) if kind == "game" else None
        if kind == "game" and game_round is None:
            continue
        session.add(Impression(user_id=user.id, content_id=item.id))
        if game_round is not None:
            session.add(game_round)
        await session.commit()
        return Served(item, game_round)
    return None
