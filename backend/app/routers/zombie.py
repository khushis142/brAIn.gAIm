from collections.abc import Iterable

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import zombie
from app.db import SessionDep
from app.models import User
from app.schemas import (
    AccessoryProgress,
    AccessoryRead,
    AvatarRead,
    AvatarSelect,
    Equipped,
    ZombieRead,
)
from app.security import CurrentUser

router = APIRouter(tags=["zombie"])


@router.get("/zombie/accessories", response_model=list[AccessoryRead])
async def list_accessories(_: CurrentUser) -> list[zombie.Accessory]:
    return list(zombie.CATALOG)


@router.get("/zombie/avatars", response_model=list[AvatarRead])
async def list_avatars(_: CurrentUser) -> list[zombie.Avatar]:
    return list(zombie.AVATAR_CATALOG)


def _progress(
    items: Iterable[zombie.Accessory | zombie.Avatar], unlocked: set[str], stats: zombie.Stats
) -> list[AccessoryProgress]:
    """Count goals of the locked items."""
    progress = []
    for item in items:
        goal = item.rule.progress(stats) if item.rule is not None else None
        if item.id not in unlocked and goal is not None:
            progress.append(AccessoryProgress(id=item.id, current=goal[0], target=goal[1]))
    return progress


async def _read_zombie(session: AsyncSession, user: User) -> ZombieRead:
    # Grants what the score history already qualifies for (backfill for existing players).
    stats = (await zombie.grant_unlocks(session, user.id)).stats
    unlocked = await zombie.unlocked(session, user.id)
    unlocked_avatars = await zombie.unlocked_avatars(session, user.id)
    worn = await zombie.equipped(session, user.id)
    avatar = await zombie.selected_avatar(session, user.id)
    await session.commit()
    return ZombieRead(
        unlocked=[a.id for a in zombie.CATALOG if a.id in unlocked],
        equipped=Equipped(**worn),
        games_completed=stats.games_completed,
        progress=_progress(zombie.CATALOG, unlocked, stats),
        avatar=avatar,
        unlocked_avatars=[a.id for a in zombie.AVATAR_CATALOG if a.id in unlocked_avatars],
        avatar_progress=_progress(zombie.AVATAR_CATALOG, unlocked_avatars, stats),
    )


@router.get("/users/me/zombie", response_model=ZombieRead)
async def read_zombie(user: CurrentUser, session: SessionDep) -> ZombieRead:
    return await _read_zombie(session, user)


@router.put(
    "/users/me/zombie/equipped",
    response_model=ZombieRead,
    responses={status.HTTP_403_FORBIDDEN: {"description": "Accessory not unlocked yet"}},
)
async def update_equipped(body: Equipped, user: CurrentUser, session: SessionDep) -> ZombieRead:
    changes = body.model_dump(include=body.model_fields_set)
    await zombie.grant_unlocks(session, user.id)  # so a backfilled unlock can be worn right away
    unlocked = await zombie.unlocked(session, user.id)
    for accessory_id in changes.values():
        if accessory_id is not None and accessory_id not in unlocked:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"{accessory_id!r} is not unlocked yet")
    await zombie.equip(session, user.id, changes)
    return await _read_zombie(session, user)


@router.put(
    "/users/me/zombie/avatar",
    response_model=ZombieRead,
    responses={status.HTTP_403_FORBIDDEN: {"description": "Avatar not unlocked yet"}},
)
async def update_avatar(body: AvatarSelect, user: CurrentUser, session: SessionDep) -> ZombieRead:
    await zombie.grant_unlocks(session, user.id)  # so a backfilled unlock can be used right away
    if body.avatar not in await zombie.unlocked_avatars(session, user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"{body.avatar!r} is not unlocked yet")
    await zombie.select_avatar(session, user.id, body.avatar)
    return await _read_zombie(session, user)
