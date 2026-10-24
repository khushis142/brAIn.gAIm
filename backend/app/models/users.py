import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, false, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(32), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # Free text the user writes about themselves; input for feed personalization.
    interests: Mapped[str | None] = mapped_column(Text)
    # Developers may publish games (JS that runs in the app); granted manually, see README.
    is_developer: Mapped[bool] = mapped_column(default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
