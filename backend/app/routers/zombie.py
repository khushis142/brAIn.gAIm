from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import zombie
from app.db import SessionDep
from app.models import User
from app.schemas import AccessoryProgress, AccessoryRead, Equipped, ZombieRead
from app.security import CurrentUser

router = APIRouter(tags=["zombie"])


@router.get("/zombie/accessories", response_model=list[AccessoryRead])
async def list_accessories(_: CurrentUser) -> list[zombie.Accessory]:
    return list(zombie.CATALOG)


async def _read_zombie(session: AsyncSession, user: User) -> ZombieRead:
    # Grants what the score history already qualifies for (backfill for existing players).
    stats, _ = await zombie.grant_unlocks(session, user.id)
    unlocked = await zombie.unlocked(session, user.id)
    worn = await zombie.equipped(session, user.id)
    await session.commit()
    progress = []
    for accessory in zombie.CATALOG:
        goal = accessory.rule.progress(stats)
        if accessory.id not in unlocked and goal is not None:
            progress.append(AccessoryProgress(id=accessory.id, current=goal[0], target=goal[1]))
    return ZombieRead(
        unlocked=[a.id for a in zombie.CATALOG if a.id in unlocked],
        equipped=Equipped(**worn),
        games_completed=stats.games_completed,
        progress=progress,
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
