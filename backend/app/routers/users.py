from fastapi import APIRouter

from app.db import SessionDep
from app.models import User
from app.routers.fields import require_known_field
from app.schemas import UserRead, UserUpdate
from app.security import CurrentUser

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserRead)
async def update_me(body: UserUpdate, user: CurrentUser, session: SessionDep) -> User:
    await require_known_field(session, body.field)
    user.field = body.field
    await session.commit()
    return user
