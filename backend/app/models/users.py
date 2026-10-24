import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, false, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class StudyField(Base):
    """An education field (e.g. computer science) that scopes feeds; seeded by migrations."""

    __tablename__ = "study_fields"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(128))


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(32), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    field: Mapped[str] = mapped_column(ForeignKey("study_fields.slug"))
    # Developers may publish games (JS that runs in the app); granted manually, see README.
    is_developer: Mapped[bool] = mapped_column(default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
