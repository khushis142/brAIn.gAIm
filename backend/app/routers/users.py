from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from app import feed
from app.db import SessionDep
from app.models import Project, User
from app.schemas import UserRead, UserUpdate
from app.security import CurrentUser

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserRead)
async def update_me(
    body: UserUpdate, user: CurrentUser, session: SessionDep, background: BackgroundTasks
) -> User:
    if "interests" in body.model_fields_set:
        user.interests = body.interests
    if (
        "active_project_id" in body.model_fields_set
        and body.active_project_id != user.active_project_id
    ):
        if body.active_project_id is not None:
            project = await session.get(Project, body.active_project_id)
            if project is None or project.owner_id != user.id:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
        user.active_project_id = body.active_project_id
        # Prepared rounds are about the previous project; prepare new ones right away.
        await feed.discard_ready_rounds(session, user.id)
        background.add_task(feed.top_up, user.id)
    await session.commit()
    return user
