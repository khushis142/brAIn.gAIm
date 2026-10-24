from fastapi import APIRouter, HTTPException, status

from app import cms
from app.schemas import StudyFieldRead

router = APIRouter(prefix="/fields", tags=["fields"])


async def require_known_field(slug: str) -> None:
    if slug not in {field.slug for field in await cms.list_fields()}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown field")


@router.get("", response_model=list[StudyFieldRead])
async def list_fields() -> list[cms.StudyField]:
    return await cms.list_fields()
