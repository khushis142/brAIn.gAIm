"""The zombie mascot's wardrobe; the catalogs themselves live in code (app/zombie.py)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, ForeignKeyConstraint, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserAccessory(Base):
    """An accessory a user unlocked. Permanent: never revoked, even if the rules change."""

    __tablename__ = "user_accessories"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    accessory_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    unlocked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class EquippedAccessory(Base):
    """The accessory a user's zombie wears in one slot; no row = the slot is empty."""

    __tablename__ = "equipped_accessories"
    # Only unlocked accessories can be worn.
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "accessory_id"],
            ["user_accessories.user_id", "user_accessories.accessory_id"],
            ondelete="CASCADE",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    slot: Mapped[str] = mapped_column(String(16), primary_key=True)
    accessory_id: Mapped[str] = mapped_column(String(32))


class UserAvatar(Base):
    """An avatar a user unlocked. Permanent; starting avatars are implicit, never stored."""

    __tablename__ = "user_avatars"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    avatar_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    unlocked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SelectedAvatar(Base):
    """The avatar a user chose; no row = the default avatar.

    No foreign key to user_avatars: starting avatars have no row there.
    """

    __tablename__ = "selected_avatars"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    avatar_id: Mapped[str] = mapped_column(String(32))
