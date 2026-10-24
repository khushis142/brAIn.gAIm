import uuid
from collections.abc import Sequence

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.cdn import file_url
from app.db import SessionDep
from app.models import Project, ProjectAttachment, User
from app.schemas import AttachmentCreate, AttachmentRead, ProjectCreate, ProjectRead, ProjectUpdate
from app.security import CurrentUser

router = APIRouter(prefix="/projects", tags=["projects"])


def _attachment(attachment: ProjectAttachment) -> AttachmentRead:
    return AttachmentRead(
        id=attachment.id,
        filename=attachment.filename,
        url=file_url(attachment.id, attachment.filename),
        created_at=attachment.created_at,
    )


def _read(project: Project) -> ProjectRead:
    return ProjectRead(
        id=project.id,
        name=project.name,
        body=project.body,
        attachments=[_attachment(a) for a in project.attachments],
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


async def _get_own(session: SessionDep, project_id: uuid.UUID, user: User) -> Project:
    project = await session.get(Project, project_id)
    # Same answer for "missing" and "not yours": private projects don't leak their existence.
    if project is None or project.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


@router.get("", response_model=list[ProjectRead])
async def list_projects(user: CurrentUser, session: SessionDep) -> list[ProjectRead]:
    projects: Sequence[Project] = (
        await session.scalars(
            select(Project).where(Project.owner_id == user.id).order_by(Project.updated_at.desc())
        )
    ).all()
    return [_read(p) for p in projects]


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate, user: CurrentUser, session: SessionDep
) -> ProjectRead:
    project = Project(**body.model_dump(), owner_id=user.id, attachments=[])
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return _read(project)


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(project_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> ProjectRead:
    return _read(await _get_own(session, project_id, user))


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: uuid.UUID, body: ProjectUpdate, user: CurrentUser, session: SessionDep
) -> ProjectRead:
    project = await _get_own(session, project_id, user)
    for name, value in body.model_dump(exclude_none=True).items():
        setattr(project, name, value)
    await session.commit()
    await session.refresh(project)  # updated_at is set by the database
    return _read(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> None:
    """Removes the project and its attachment records; the CDN files stay."""
    await session.delete(await _get_own(session, project_id, user))
    await session.commit()


@router.post(
    "/{project_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_attachment(
    project_id: uuid.UUID, body: AttachmentCreate, user: CurrentUser, session: SessionDep
) -> AttachmentRead:
    await _get_own(session, project_id, user)
    attachment = ProjectAttachment(**body.model_dump(), project_id=project_id)
    session.add(attachment)
    try:
        await session.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "File already attached") from None
    await session.refresh(attachment)
    return _attachment(attachment)


@router.delete("/{project_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_attachment(
    project_id: uuid.UUID, attachment_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> None:
    """Removes the attachment record; the CDN file stays."""
    await _get_own(session, project_id, user)
    attachment = await session.get(ProjectAttachment, attachment_id)
    if attachment is None or attachment.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    await session.delete(attachment)
    await session.commit()
