import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Content(Base):
    """A video or game stored on the CDN; this row holds all of its metadata."""

    __tablename__ = "content"
    __table_args__ = (
        CheckConstraint("kind IN ('video', 'game')", name="kind"),
        CheckConstraint("(kind = 'game') = (config IS NOT NULL)", name="config_iff_game"),
        Index("ix_content_tags", "tags", postgresql_using="gin"),
    )

    # The CDN's file id, so one id identifies the item everywhere.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(8))
    filename: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(200))
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    # Games only: {"input_schema": <JSON Schema>, "context": str}; see app/generator/inputs.py.
    config: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
