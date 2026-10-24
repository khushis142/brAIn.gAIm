"""Decides what a user sees next and records it."""

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.generator.inputs import GameConfig, InputGenerationError, generate_input
from app.generator.llm import get_llm
from app.generator.preconditions import PreconditionError, run_preconditions
from app.models import Content, GameRound, Impression, Project, User

logger = logging.getLogger(__name__)

VIDEOS_PER_GAME = 3
# Prepared game rounds kept waiting per user; one suffices, as a game comes every 4th item.
READY_ROUNDS = 1


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


async def _take_ready_round(session: AsyncSession, user: User) -> GameRound | None:
    """Claim the user's oldest prepared round; concurrent requests never get the same one."""
    game_round = await session.scalar(
        select(GameRound)
        .where(GameRound.user_id == user.id, GameRound.served_at.is_(None))
        .order_by(GameRound.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if game_round is not None:
        game_round.served_at = func.now()
    return game_round


async def next_item(session: AsyncSession, user: User) -> Served | None:
    """Pick the next feed item for `user`, record the impression, and commit.

    Game slots only take a prepared round (see `top_up`), so the feed never waits on the
    LLM; without one, a video is served instead. With no videos at all, a ready game is
    served whenever there is one.
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
    game_due = should_serve_game(videos_since_last_game(list(recent_kinds)))

    game_round = await _take_ready_round(session, user) if game_due else None
    item = await session.get(Content, game_round.game_id) if game_round else None
    if item is None:
        item = await _pick(session, user, "video")
    if item is None:
        game_round = await _take_ready_round(session, user)
        item = await session.get(Content, game_round.game_id) if game_round else None
    if item is None:
        return None
    session.add(Impression(user_id=user.id, content_id=item.id))
    await session.commit()
    if game_round is not None:
        await session.refresh(game_round, ["served_at"])
    return Served(item, game_round)


async def _project_materials(session: AsyncSession, user_id: uuid.UUID) -> list[str]:
    projects = await session.scalars(
        select(Project).where(Project.owner_id == user_id).order_by(Project.updated_at.desc())
    )
    return [f"# {p.name}\n\n{p.body}" for p in projects]


async def _prepare_round(session: AsyncSession, user_id: uuid.UUID) -> GameRound | None:
    game = await session.scalar(
        select(Content).where(Content.kind == "game").order_by(func.random()).limit(1)
    )
    if game is None:
        return None
    assert game.config is not None  # guaranteed for games by a check constraint
    config = GameConfig(**game.config)
    try:
        data = await generate_input(get_llm(), config, await _project_materials(session, user_id))
        assets = await run_preconditions(config.preconditions, data)
    except (InputGenerationError, PreconditionError):
        logger.exception("preparing a round of game %s failed", game.id)
        return None
    return GameRound(user_id=user_id, game_id=game.id, input=data, assets=assets)


async def top_up(user_id: uuid.UUID) -> None:
    """Prepare game rounds until the user has READY_ROUNDS waiting. Runs in the background."""
    async with SessionLocal() as session:
        # One preparer per user at a time; others just leave (lock ends with the transaction).
        lock_key = int.from_bytes(user_id.bytes[:8], signed=True)
        if not await session.scalar(select(func.pg_try_advisory_xact_lock(lock_key))):
            return
        ready = await session.scalar(
            select(func.count())
            .select_from(GameRound)
            .where(GameRound.user_id == user_id, GameRound.served_at.is_(None))
        )
        for _ in range(READY_ROUNDS - (ready or 0)):
            game_round = await _prepare_round(session, user_id)
            if game_round is None:
                break
            session.add(game_round)
        await session.commit()
