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
    served = await feed.next_item(session, user)
    if served is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No content yet")
    item, url = served.item, file_url(served.item.id, served.item.filename)
    if served.round is None:
        return VideoItem(id=item.id, title=item.title, url=url)
    return GameItem(
        id=item.id, title=item.title, url=url, round_id=served.round.id, input=served.round.input
    )
