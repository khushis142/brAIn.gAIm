import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Score(Base):
    __tablename__ = "scores"
    __table_args__ = (
        CheckConstraint("score >= 0", name="score_non_negative"),
        Index("ix_scores_game_score", "game_id", "score"),
        Index("ix_scores_user_game", "user_id", "game_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    game_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("content.id", ondelete="CASCADE"))
    score: Mapped[int]
    # The feed round this score is for; each round is scored once, resubmissions are ignored.
    round_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("game_rounds.id", ondelete="SET NULL"), unique=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GameRound(Base):
    """One play of a game by a user, with the input generated for it.

    Rounds are prepared ahead of time (LLM + preconditions) and wait with `served_at` unset
    until the feed hands them out, so serving a game never waits on the LLM.
    """

    __tablename__ = "game_rounds"
    __table_args__ = (Index("ix_game_rounds_user_created_at", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    game_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("content.id", ondelete="CASCADE"))
    input: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # JSON Pointers into `input` whose values are CDN URLs the host must fetch (e.g. TTS audio).
    assets: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    served_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
