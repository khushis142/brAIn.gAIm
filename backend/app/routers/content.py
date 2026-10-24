import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.cdn import file_url
from app.db import SessionDep
from app.models import Content, User
from app.schemas import ContentCreate, ContentRead, ContentUpdate, Kind
from app.security import CurrentUser

router = APIRouter(prefix="/content", tags=["content"])


def _read(content: Content, owner: str) -> ContentRead:
    return ContentRead(
        id=content.id,
        kind=content.kind,  # type: ignore[arg-type]  # guarded by a check constraint
        title=content.title,
        tags=content.tags,
        owner=owner,
        url=file_url(content.id, content.filename),
        created_at=content.created_at,
    )


async def _get_owned(session: SessionDep, content_id: uuid.UUID, user: User) -> Content:
    content = await session.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Content not found")
    if content.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can change this content")
    return content


@router.post("", response_model=ContentRead, status_code=status.HTTP_201_CREATED)
async def register_content(
    body: ContentCreate, user: CurrentUser, session: SessionDep
) -> ContentRead:
    if body.kind == "game" and not user.is_developer:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only developers can publish games")
    content = Content(**body.model_dump(), owner_id=user.id)
    session.add(content)
    try:
        await session.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Content already registered") from None
    await session.refresh(content)
    return _read(content, user.username)


@router.get("", response_model=list[ContentRead])
async def list_content(
    session: SessionDep,
    kind: Kind | None = None,
    tag: str | None = None,
    owner: str | None = Query(None, description="Username"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[ContentRead]:
    query = select(Content, User.username).join(User, User.id == Content.owner_id)
    if kind is not None:
        query = query.where(Content.kind == kind)
    if tag is not None:
        query = query.where(Content.tags.contains([tag.strip().lower()]))
    if owner is not None:
        query = query.where(User.username == owner)
    rows = await session.execute(
        query.order_by(Content.created_at.desc(), Content.id).limit(limit).offset(offset)
    )
    return [_read(content, username) for content, username in rows]


@router.get("/{content_id}", response_model=ContentRead)
async def get_content(content_id: uuid.UUID, session: SessionDep) -> ContentRead:
    row = (
        await session.execute(
            select(Content, User.username)
            .join(User, User.id == Content.owner_id)
            .where(Content.id == content_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Content not found")
    return _read(*row)


@router.patch("/{content_id}", response_model=ContentRead)
async def update_content(
    content_id: uuid.UUID, body: ContentUpdate, user: CurrentUser, session: SessionDep
) -> ContentRead:
    content = await _get_owned(session, content_id, user)
    changes = body.model_dump(exclude_none=True)
    for name, value in changes.items():
        setattr(content, name, value)
    await session.commit()
    return _read(content, user.username)


@router.delete("/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content(content_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> None:
    """Removes the metadata (and its impressions/scores); the CDN file stays."""
    content = await _get_owned(session, content_id, user)
    await session.delete(content)
    await session.commit()
