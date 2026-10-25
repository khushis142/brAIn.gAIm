"""add content likes

Revision ID: d1a6c9f3e7b2
Revises: 3cec9086f053
Create Date: 2026-10-25 05:45:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d1a6c9f3e7b2"
down_revision: str | None = "3cec9086f053"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "content_likes",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_content_likes_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["content_id"],
            ["content.id"],
            name=op.f("fk_content_likes_content_id_content"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "content_id", name=op.f("pk_content_likes")),
    )
    op.create_index("ix_content_likes_content_id", "content_likes", ["content_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_content_likes_content_id", table_name="content_likes")
    op.drop_table("content_likes")
