import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, MetaData, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


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


class StudyField(Base):
    """An education field (e.g. computer science) that scopes a user's feed."""

    __tablename__ = "study_fields"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(128))


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(32), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    field_id: Mapped[int] = mapped_column(ForeignKey("study_fields.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    field: Mapped[StudyField] = relationship(lazy="joined")


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    s3_key: Mapped[str] = mapped_column(String(512), unique=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("study_fields.id"), index=True)


class Game(Base):
    """A self-contained JS game/quiz served to the frontend from S3."""

    __tablename__ = "games"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    s3_key: Mapped[str] = mapped_column(String(512), unique=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("study_fields.id"), index=True)


class Impression(Base):
    """One feed item served to a user; drives the video/game decision and dedup."""

    __tablename__ = "impressions"
    __table_args__ = (
        CheckConstraint("(video_id IS NULL) <> (game_id IS NULL)", name="exactly_one_item"),
        Index("ix_impressions_user_served_at", "user_id", "served_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    video_id: Mapped[int | None] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"))
    game_id: Mapped[int | None] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"))
    served_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Score(Base):
    __tablename__ = "scores"
    __table_args__ = (
        CheckConstraint("score >= 0", name="score_non_negative"),
        Index("ix_scores_game_score", "game_id", "score"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"))
    score: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
