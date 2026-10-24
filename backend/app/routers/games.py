from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app import cms
from app.db import SessionDep
from app.models import Score, User
from app.schemas import LeaderboardEntry, ScoreCreate
from app.security import CurrentUser

router = APIRouter(prefix="/games", tags=["games"])


async def _require_game(game_id: str) -> None:
    if await cms.get_content("game", game_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Game not found")


@router.post("/{game_id}/scores", status_code=status.HTTP_204_NO_CONTENT)
async def submit_score(
    game_id: str, body: ScoreCreate, user: CurrentUser, session: SessionDep
) -> None:
    await _require_game(game_id)
    session.add(Score(user_id=user.id, game_id=game_id, score=body.score))
    await session.commit()


@router.get("/{game_id}/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(
    game_id: str, session: SessionDep, limit: int = Query(10, ge=1, le=100)
) -> list[LeaderboardEntry]:
    await _require_game(game_id)
    best = func.max(Score.score).label("best")
    rows = await session.execute(
        select(User.username, best)
        .join(Score, Score.user_id == User.id)
        .where(Score.game_id == game_id)
        .group_by(User.id)
        .order_by(best.desc(), User.username)
        .limit(limit)
    )
    return [LeaderboardEntry(username=username, score=score) for username, score in rows]
