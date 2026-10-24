from fastapi import APIRouter

from app.db import SessionDep
from app.models import User
from app.schemas import UserRead, UserUpdate
from app.security import CurrentUser

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserRead)
async def update_me(body: UserUpdate, user: CurrentUser, session: SessionDep) -> User:
    if "interests" in body.model_fields_set:
        user.interests = body.interests
    await session.commit()
    return user
