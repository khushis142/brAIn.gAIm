from fastapi import APIRouter, HTTPException, status

from app import feed
from app.db import SessionDep
from app.schemas import FeedItem, GameItem, VideoItem
from app.security import CurrentUser

router = APIRouter(prefix="/feed", tags=["feed"])


# POST because serving an item advances the user's feed state.
@router.post("/next", response_model=FeedItem)
async def next_item(user: CurrentUser, session: SessionDep) -> VideoItem | GameItem:
    served = await feed.next_item(session, user)
    if served is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No content for this field yet")
    kind, content = served
    model = VideoItem if kind == "video" else GameItem
    return model(id=content.id, title=content.title, url=content.url)
