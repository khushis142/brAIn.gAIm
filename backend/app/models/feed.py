import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Impression(Base):
    """One feed item served to a user; drives the video/game decision and dedup."""

    __tablename__ = "impressions"
    __table_args__ = (Index("ix_impressions_user_served_at", "user_id", "served_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    content_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("content.id", ondelete="CASCADE"))
    served_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
