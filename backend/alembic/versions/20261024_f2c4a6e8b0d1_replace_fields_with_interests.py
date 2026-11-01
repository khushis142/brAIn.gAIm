"""replace study fields with free-text interests

Upgrade seeds each user's interests with their former field's name. Downgrade
cannot recover fields and assigns everyone and everything to computer-science.

Revision ID: f2c4a6e8b0d1
Revises: e5b7c9d1a2f4
Create Date: 2026-10-24 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f2c4a6e8b0d1"
down_revision: str | None = "e5b7c9d1a2f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("interests", sa.Text(), nullable=True))
    op.execute("UPDATE users SET interests = f.name FROM study_fields f WHERE f.slug = users.field")

    op.drop_constraint(op.f("fk_users_field_study_fields"), "users", type_="foreignkey")
    op.drop_column("users", "field")
    op.drop_index("ix_content_field_kind", table_name="content")
    op.drop_constraint(op.f("fk_content_field_study_fields"), "content", type_="foreignkey")
    op.drop_column("content", "field")
    op.drop_table("study_fields")


def downgrade() -> None:
    study_fields = op.create_table(
        "study_fields",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_study_fields")),
        sa.UniqueConstraint("slug", name=op.f("uq_study_fields_slug")),
    )
    op.bulk_insert(
        study_fields,
        [
            {"slug": "computer-science", "name": "Computer Science"},
            {"slug": "engineering", "name": "Engineering"},
        ],
    )
    for table in ("users", "content"):
        op.add_column(
            table,
            sa.Column(
                "field", sa.String(length=64), server_default="computer-science", nullable=False
            ),
        )
        op.alter_column(table, "field", server_default=None)
        op.create_foreign_key(
            op.f(f"fk_{table}_field_study_fields"), table, "study_fields", ["field"], ["slug"]
        )
    op.create_index("ix_content_field_kind", "content", ["field", "kind"])
    op.drop_column("users", "interests")
