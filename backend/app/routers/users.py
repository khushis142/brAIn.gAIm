from fastapi import APIRouter, HTTPException, status

from app.db import SessionDep
from app.models import StudyField, User
from app.schemas import UserRead, UserUpdate
from app.security import CurrentUser

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserRead)
async def update_me(body: UserUpdate, user: CurrentUser, session: SessionDep) -> User:
    if await session.get(StudyField, body.field_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown field_id")
    user.field_id = body.field_id
    await session.commit()
    await session.refresh(user, ["field"])
    return user
