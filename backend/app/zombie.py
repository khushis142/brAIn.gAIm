"""The zombie mascot's wardrobe: the accessory and avatar catalogs and the rules unlocking them.

Scores are on different scales per game, so rules never compare raw scores across games.
Rules are evaluated against the user's whole score history, so a new accessory or avatar is
granted to existing players on their next score or zombie request: add it to CATALOG or
AVATAR_CATALOG with its rule.
"""

import uuid
from dataclasses import dataclass
from typing import Literal, Protocol

from sqlalchemy import delete, exists, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.models import EquippedAccessory, Score, SelectedAvatar, UserAccessory, UserAvatar

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


@dataclass(frozen=True)
class Avatar:
    """The character under the accessories; every accessory fits every avatar."""

    id: str
    name: str
    unlock_description: str
    rule: Rule | None  # None: a starting avatar everyone has (never stored)


AVATAR_CATALOG: tuple[Avatar, ...] = (
    Avatar("zombie", "Zombie", "Your starting avatar", None),
    Avatar("half-human", "Half-human", "Finish 10 games", GamesCompleted(10)),
    Avatar("human", "Human", "Finish 100 games", GamesCompleted(100)),
)
AVATARS = {avatar.id: avatar for avatar in AVATAR_CATALOG}
DEFAULT_AVATAR = "zombie"


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


@dataclass(frozen=True)
class Unlocks:
    stats: Stats
    accessories: list[str]  # newly granted, in catalog order
    avatars: list[str]


async def _grant(
    session: AsyncSession, id_column: InstrumentedAttribute[str], user_id: uuid.UUID, ids: list[str]
) -> list[str]:
    """Store unlocks of one kind; returns those that were not stored yet."""
    if not ids:
        return []
    granted = set(
        await session.scalars(
            insert(id_column.class_)
            .values([{"user_id": user_id, id_column.key: id_} for id_ in ids])
            .on_conflict_do_nothing()
            .returning(id_column)
        )
    )
    return [id_ for id_ in ids if id_ in granted]


async def grant_unlocks(session: AsyncSession, user_id: uuid.UUID) -> Unlocks:
    """Grant every accessory and avatar the user's history qualifies for.

    Idempotent and safe under concurrent calls: existing unlocks are kept, never granted twice.
    """
    stats = await _stats(session, user_id)
    accessories = [a.id for a in CATALOG if a.rule.met(stats)]
    avatars = [a.id for a in AVATAR_CATALOG if a.rule is not None and a.rule.met(stats)]
    return Unlocks(
        stats=stats,
        accessories=await _grant(session, UserAccessory.accessory_id, user_id, accessories),
        avatars=await _grant(session, UserAvatar.avatar_id, user_id, avatars),
    )


async def unlocked(session: AsyncSession, user_id: uuid.UUID) -> set[str]:
    return set(
        await session.scalars(
            select(UserAccessory.accessory_id).where(UserAccessory.user_id == user_id)
        )
    )


async def unlocked_avatars(session: AsyncSession, user_id: uuid.UUID) -> set[str]:
    stored = await session.scalars(
        select(UserAvatar.avatar_id).where(UserAvatar.user_id == user_id)
    )
    return {a.id for a in AVATAR_CATALOG if a.rule is None} | set(stored)


async def selected_avatar(session: AsyncSession, user_id: uuid.UUID) -> str:
    avatar_id = await session.scalar(
        select(SelectedAvatar.avatar_id).where(SelectedAvatar.user_id == user_id)
    )
    # An avatar dropped from the catalog falls back to the default, like accessories.
    return avatar_id if avatar_id in AVATARS else DEFAULT_AVATAR


async def select_avatar(session: AsyncSession, user_id: uuid.UUID, avatar_id: str) -> None:
    """Switch the avatar (callers check it is unlocked); accessories are left as they are."""
    await session.execute(
        insert(SelectedAvatar)
        .values(user_id=user_id, avatar_id=avatar_id)
        .on_conflict_do_update(
            index_elements=[SelectedAvatar.user_id], set_={"avatar_id": avatar_id}
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
