from collections.abc import Sequence

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.db import SessionDep
from app.models import StudyField
from app.schemas import StudyFieldRead

router = APIRouter(prefix="/fields", tags=["fields"])


async def require_known_field(session: SessionDep, slug: str) -> None:
    if await session.scalar(select(StudyField.id).where(StudyField.slug == slug)) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown field")


@router.get("", response_model=list[StudyFieldRead])
async def list_fields(session: SessionDep) -> Sequence[StudyField]:
    return (await session.scalars(select(StudyField).order_by(StudyField.name))).all()
