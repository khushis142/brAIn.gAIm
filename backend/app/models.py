import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, MetaData, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Content (fields, videos, games) lives in the CMS; these columns hold its ids.
CMS_ID = String(64)


class Base(DeclarativeBase):
    # Deterministic constraint names so migrations can reference them.
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(32), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # CMS study field slug; scopes the user's feed.
    field: Mapped[str] = mapped_column(CMS_ID)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Impression(Base):
    """One feed item served to a user; drives the video/game decision and dedup."""

    __tablename__ = "impressions"
    __table_args__ = (
        CheckConstraint("kind IN ('video', 'game')", name="kind"),
        Index("ix_impressions_user_served_at", "user_id", "served_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(8))
    content_id: Mapped[str] = mapped_column(CMS_ID)
    served_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Score(Base):
    __tablename__ = "scores"
    __table_args__ = (
        CheckConstraint("score >= 0", name="score_non_negative"),
        Index("ix_scores_game_score", "game_id", "score"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    game_id: Mapped[str] = mapped_column(CMS_ID)
    score: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
