import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app import zombie
from app.cdn import file_url
from app.db import SessionDep
from app.models import Content, GameRound, Score, User
from app.schemas import ContentRead, LeaderboardEntry, ScoreCreate, ScoreResult
from app.security import CurrentUser

router = APIRouter(prefix="/games", tags=["games"])


async def _require_game(session: SessionDep, game_id: uuid.UUID) -> None:
    game = await session.get(Content, game_id)
    if game is None or game.kind != "game":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Game not found")


@router.get("", response_model=list[ContentRead])
async def list_games(
    session: SessionDep,
    tag: str | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[ContentRead]:
    query = (
        select(Content, User.username)
        .join(User, User.id == Content.owner_id)
        .where(Content.kind == "game")
    )
    if tag is not None:
        query = query.where(Content.tags.contains([tag.strip().lower()]))
    rows = await session.execute(
        query.order_by(Content.created_at.desc(), Content.id).limit(limit).offset(offset)
    )
    return [
        ContentRead(
            id=content.id,
            kind=content.kind,  # type: ignore[arg-type]
            title=content.title,
            tags=content.tags,
            owner=username,
            url=file_url(content.id, content.filename),
            created_at=content.created_at,
        )
        for content, username in rows
    ]


@router.get("/{game_id}", response_model=ContentRead)
async def get_game(game_id: uuid.UUID, session: SessionDep) -> ContentRead:
    row = (
        await session.execute(
            select(Content, User.username)
            .join(User, User.id == Content.owner_id)
            .where(Content.id == game_id, Content.kind == "game")
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Game not found")
    content, username = row
    return ContentRead(
        id=content.id,
        kind=content.kind,  # type: ignore[arg-type]
        title=content.title,
        tags=content.tags,
        owner=username,
        url=file_url(content.id, content.filename),
        created_at=content.created_at,
    )


@router.post("/{game_id}/scores", response_model=ScoreResult)
async def submit_score(
    game_id: uuid.UUID, body: ScoreCreate, user: CurrentUser, session: SessionDep
) -> ScoreResult:
    await _require_game(session, game_id)
    if body.round_id is not None:
        game_round = await session.get(GameRound, body.round_id)
        if game_round is None or (game_round.user_id, game_round.game_id) != (user.id, game_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Round not found")
    score_id = await session.scalar(
        insert(Score)
        .values(user_id=user.id, game_id=game_id, score=body.score, round_id=body.round_id)
        .on_conflict_do_nothing(index_elements=[Score.round_id])
        .returning(Score.id)
    )
    if score_id is None:  # the round was scored already: keep the first score
        return ScoreResult(
            newly_unlocked=[],
            newly_unlocked_avatars=[],
            games_completed=await zombie.games_completed(session, user.id),
        )
    unlocks = await zombie.grant_unlocks(session, user.id)
    await session.commit()
    return ScoreResult(
        newly_unlocked=unlocks.accessories,
        newly_unlocked_avatars=unlocks.avatars,
        games_completed=unlocks.stats.games_completed,
    )


@router.get("/{game_id}/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(
    game_id: uuid.UUID, session: SessionDep, limit: int = Query(10, ge=1, le=100)
) -> list[LeaderboardEntry]:
    await _require_game(session, game_id)
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
