from fastapi import APIRouter, HTTPException, status

from app import feed
from app.cdn import file_url
from app.db import SessionDep
from app.schemas import FeedItem, GameItem, VideoItem
from app.security import CurrentUser

router = APIRouter(prefix="/feed", tags=["feed"])


# POST because serving an item advances the user's feed state.
@router.post("/next", response_model=FeedItem)
async def next_item(user: CurrentUser, session: SessionDep) -> VideoItem | GameItem:
    item = await feed.next_item(session, user)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No content for this field yet")
    model = VideoItem if item.kind == "video" else GameItem
    return model(id=item.id, title=item.title, url=file_url(item.id, item.filename))
