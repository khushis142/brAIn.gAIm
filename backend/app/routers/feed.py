from fastapi import APIRouter, HTTPException, status

from app import feed
from app.db import SessionDep
from app.models import Video
from app.schemas import FeedItem, GameItem, VideoItem
from app.security import CurrentUser
from app.storage import presigned_get_url

router = APIRouter(prefix="/feed", tags=["feed"])


# POST because serving an item advances the user's feed state.
@router.post("/next", response_model=FeedItem)
async def next_item(user: CurrentUser, session: SessionDep) -> VideoItem | GameItem:
    item = await feed.next_item(session, user)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No content for this field yet")
    model = VideoItem if isinstance(item, Video) else GameItem
    return model(id=item.id, title=item.title, url=presigned_get_url(item.s3_key))
