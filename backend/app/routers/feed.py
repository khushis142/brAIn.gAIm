from fastapi import APIRouter, BackgroundTasks, status
from fastapi.responses import JSONResponse

from app import feed
from app.cdn import file_url
from app.db import SessionDep
from app.schemas import FeedItem, GameItem, VideoItem
from app.security import CurrentUser

router = APIRouter(prefix="/feed", tags=["feed"])


# POST because serving an item advances the user's feed state.
@router.post(
    "/next",
    response_model=FeedItem,
    responses={status.HTTP_404_NOT_FOUND: {"description": "No content yet"}},
)
async def next_item(
    user: CurrentUser, session: SessionDep, background: BackgroundTasks
) -> VideoItem | GameItem | JSONResponse:
    served = await feed.next_item(session, user)
    background.add_task(feed.top_up, user.id)  # after the response: prepare the next game
    if served is None:
        # Returned, not raised: a raised HTTPException would drop the background task, and
        # a catalog of only games would then never get its first round prepared.
        return JSONResponse({"detail": "No content yet"}, status.HTTP_404_NOT_FOUND)
    item, url = served.item, file_url(served.item.id, served.item.filename)
    if served.round is None:
        return VideoItem(id=item.id, title=item.title, url=url)
    return GameItem(
        id=item.id,
        title=item.title,
        url=url,
        round_id=served.round.id,
        data=served.round.input,
        assets=served.round.assets,
    )
