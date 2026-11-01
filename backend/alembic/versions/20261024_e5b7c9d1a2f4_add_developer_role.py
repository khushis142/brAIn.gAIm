"""add developer role

Revision ID: e5b7c9d1a2f4
Revises: d81f4b2a9c3e
Create Date: 2026-10-24 17:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e5b7c9d1a2f4"
down_revision: str | None = "d81f4b2a9c3e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_developer", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "is_developer")
