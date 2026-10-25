"""persist project folder colors

Revision ID: a83f6d2c9e14
Revises: 564270950128
Create Date: 2026-10-25 00:24:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a83f6d2c9e14"
down_revision: str | None = "564270950128"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("color", sa.String(length=7), server_default="#ffc800", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("projects", "color")
