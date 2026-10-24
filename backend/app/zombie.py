"""The zombie mascot's wardrobe: the accessory catalog and the rules that unlock it.

Scores are on different scales per game, so rules never compare raw scores across games.
Rules are evaluated against the user's whole score history, so a new accessory is granted to
existing players on their next score or zombie request: add it to CATALOG with its rule.
"""

import uuid
from dataclasses import dataclass
from typing import Literal, Protocol

from sqlalchemy import delete, exists, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EquippedAccessory, Score, UserAccessory

Slot = Literal["head", "eyes", "neck", "feet"]
SLOTS: tuple[Slot, ...] = ("head", "eyes", "neck", "feet")


@dataclass(frozen=True)
class Stats:
    """What the unlock rules look at, derived from the user's scores."""

    # Score submissions; a round counts once (round_id is unique).
    games_completed: int
    # Some score beat an earlier score of the same user in the same game.
    beat_personal_best: bool


class Rule(Protocol):
    def met(self, stats: Stats) -> bool: ...

    def progress(self, stats: Stats) -> tuple[int, int] | None:
        """(current, target) for rules with a count to show, else None."""
        ...


@dataclass(frozen=True)
class GamesCompleted:
    target: int

    def met(self, stats: Stats) -> bool:
        return stats.games_completed >= self.target

    def progress(self, stats: Stats) -> tuple[int, int] | None:
        return min(stats.games_completed, self.target), self.target


@dataclass(frozen=True)
class BeatPersonalBest:
    def met(self, stats: Stats) -> bool:
        return stats.beat_personal_best

    def progress(self, stats: Stats) -> tuple[int, int] | None:
        return None


@dataclass(frozen=True)
class Accessory:
    id: str
    name: str
    slot: Slot
    unlock_description: str
    rule: Rule


CATALOG: tuple[Accessory, ...] = (
    Accessory("hat", "Hat", "head", "Finish your first game", GamesCompleted(1)),
    Accessory("sunglasses", "Sunglasses", "eyes", "Finish 5 games", GamesCompleted(5)),
    Accessory(
        "red-sneakers",
        "Red sneakers",
        "feet",
        "Beat your own best score in any game",
        BeatPersonalBest(),
    ),
    Accessory("gold-chain", "Gold chain", "neck", "Finish 25 games", GamesCompleted(25)),
)
ACCESSORIES = {accessory.id: accessory for accessory in CATALOG}


async def games_completed(session: AsyncSession, user_id: uuid.UUID) -> int:
    count = await session.scalar(
        select(func.count()).select_from(Score).where(Score.user_id == user_id)
    )
    return count or 0


async def _stats(session: AsyncSession, user_id: uuid.UUID) -> Stats:
    # NULL for a game's first score, so it never counts as beating a best.
    previous_best = func.max(Score.score).over(
        partition_by=Score.game_id, order_by=(Score.created_at, Score.id), rows=(None, -1)
    )
    history = (
        select(Score.score, previous_best.label("previous_best"))
        .where(Score.user_id == user_id)
        .subquery()
    )
    beat = await session.scalar(select(exists().where(history.c.score > history.c.previous_best)))
    return Stats(games_completed=await games_completed(session, user_id), beat_personal_best=beat)


async def grant_unlocks(session: AsyncSession, user_id: uuid.UUID) -> tuple[Stats, list[str]]:
    """Grant every accessory the user's history qualifies for; returns the newly granted ones.

    Idempotent and safe under concurrent calls: existing unlocks are kept, never granted twice.
    """
    stats = await _stats(session, user_id)
    earned = [accessory.id for accessory in CATALOG if accessory.rule.met(stats)]
    if not earned:
        return stats, []
    granted = set(
        await session.scalars(
            insert(UserAccessory)
            .values([{"user_id": user_id, "accessory_id": id_} for id_ in earned])
            .on_conflict_do_nothing()
            .returning(UserAccessory.accessory_id)
        )
    )
    return stats, [id_ for id_ in earned if id_ in granted]


async def unlocked(session: AsyncSession, user_id: uuid.UUID) -> set[str]:
    return set(
        await session.scalars(
            select(UserAccessory.accessory_id).where(UserAccessory.user_id == user_id)
        )
    )


async def equipped(session: AsyncSession, user_id: uuid.UUID) -> dict[Slot, str | None]:
    rows = await session.execute(
        select(EquippedAccessory.slot, EquippedAccessory.accessory_id).where(
            EquippedAccessory.user_id == user_id
        )
    )
    worn = dict(rows.all())
    # An accessory dropped from the catalog is still unlocked, but nothing can show it.
    return {slot: worn.get(slot) if worn.get(slot) in ACCESSORIES else None for slot in SLOTS}


async def equip(session: AsyncSession, user_id: uuid.UUID, changes: dict[Slot, str | None]) -> None:
    """Put accessories into slots (None empties one); callers check they are unlocked."""
    if not changes:
        return
    await session.execute(
        delete(EquippedAccessory).where(
            EquippedAccessory.user_id == user_id, EquippedAccessory.slot.in_(changes)
        )
    )
    session.add_all(
        EquippedAccessory(user_id=user_id, slot=slot, accessory_id=accessory_id)
        for slot, accessory_id in changes.items()
        if accessory_id is not None
    )
    await session.flush()
