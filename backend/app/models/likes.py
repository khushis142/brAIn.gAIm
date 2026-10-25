import uuid

from sqlalchemy import ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ContentLike(Base):
    __tablename__ = "content_likes"
    __table_args__ = (Index("ix_content_likes_content_id", "content_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    content_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("content.id", ondelete="CASCADE"), primary_key=True
    )
