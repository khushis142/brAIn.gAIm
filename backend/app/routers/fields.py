from collections.abc import Sequence

from fastapi import APIRouter
from sqlalchemy import select

from app.db import SessionDep
from app.models import StudyField
from app.schemas import StudyFieldRead

router = APIRouter(prefix="/fields", tags=["fields"])


@router.get("", response_model=list[StudyFieldRead])
async def list_fields(session: SessionDep) -> Sequence[StudyField]:
    return (await session.scalars(select(StudyField).order_by(StudyField.name))).all()
