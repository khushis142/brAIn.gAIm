"""track content metadata

Files live on the CDN; the backend now owns their metadata (content table) and the
study fields. Existing impressions and scores reference mock CMS ids that have no
content row, so they are deleted (in both directions).

Revision ID: d81f4b2a9c3e
Revises: c3a1e5d0f7b2
Create Date: 2026-10-24 16:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d81f4b2a9c3e"
down_revision: str | None = "c3a1e5d0f7b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
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
    # Keep every existing user valid, whatever field they picked.
    op.execute(
        "INSERT INTO study_fields (slug, name) SELECT DISTINCT field, field FROM users"
        " WHERE field NOT IN (SELECT slug FROM study_fields)"
    )
    op.create_foreign_key(
        op.f("fk_users_field_study_fields"), "users", "study_fields", ["field"], ["slug"]
    )

    op.create_table(
        "content",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=8), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("field", sa.String(length=64), nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.Text()), server_default="{}", nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("kind IN ('video', 'game')", name=op.f("ck_content_kind")),
        sa.ForeignKeyConstraint(
            ["field"], ["study_fields.slug"], name=op.f("fk_content_field_study_fields")
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_content_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_content")),
    )
    op.create_index("ix_content_field_kind", "content", ["field", "kind"])
    op.create_index(op.f("ix_content_owner_id"), "content", ["owner_id"])
    op.create_index("ix_content_tags", "content", ["tags"], postgresql_using="gin")

    op.execute("DELETE FROM impressions")
    op.execute("DELETE FROM scores")

    op.drop_constraint(op.f("ck_impressions_kind"), "impressions", type_="check")
    op.drop_column("impressions", "kind")
    op.alter_column(
        "impressions", "content_id", type_=sa.Uuid(), postgresql_using="content_id::uuid"
    )
    op.create_foreign_key(
        op.f("fk_impressions_content_id_content"),
        "impressions",
        "content",
        ["content_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.alter_column("scores", "game_id", type_=sa.Uuid(), postgresql_using="game_id::uuid")
    op.create_foreign_key(
        op.f("fk_scores_game_id_content"),
        "scores",
        "content",
        ["game_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_scores_game_id_content"), "scores", type_="foreignkey")
    op.drop_constraint(op.f("fk_impressions_content_id_content"), "impressions", type_="foreignkey")
    op.execute("DELETE FROM impressions")
    op.execute("DELETE FROM scores")
    op.alter_column("scores", "game_id", type_=sa.String(length=64))
    op.alter_column("impressions", "content_id", type_=sa.String(length=64))
    op.add_column("impressions", sa.Column("kind", sa.String(length=8), nullable=False))
    op.create_check_constraint(
        op.f("ck_impressions_kind"), "impressions", "kind IN ('video', 'game')"
    )

    op.drop_index("ix_content_tags", table_name="content")
    op.drop_index(op.f("ix_content_owner_id"), table_name="content")
    op.drop_index("ix_content_field_kind", table_name="content")
    op.drop_table("content")

    op.drop_constraint(op.f("fk_users_field_study_fields"), "users", type_="foreignkey")
    op.drop_table("study_fields")
