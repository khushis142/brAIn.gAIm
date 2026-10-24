"""move content to cms

Videos, games and study fields now live in the CMS; the database keeps only their ids.
Upgrade converts existing rows in place. Downgrade cannot map CMS ids back to rows
and therefore deletes impressions and scores.

Revision ID: c3a1e5d0f7b2
Revises: 9b47881c78bb
Create Date: 2026-10-24 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3a1e5d0f7b2"
down_revision: str | None = "9b47881c78bb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("field", sa.String(length=64), nullable=True))
    op.execute("UPDATE users SET field = f.slug FROM study_fields f WHERE f.id = users.field_id")
    op.alter_column("users", "field", nullable=False)
    op.drop_constraint(op.f("fk_users_field_id_study_fields"), "users", type_="foreignkey")
    op.drop_column("users", "field_id")

    op.add_column("impressions", sa.Column("kind", sa.String(length=8), nullable=True))
    op.add_column("impressions", sa.Column("content_id", sa.String(length=64), nullable=True))
    op.execute(
        "UPDATE impressions SET"
        " kind = CASE WHEN video_id IS NOT NULL THEN 'video' ELSE 'game' END,"
        " content_id = COALESCE(video_id, game_id)::text"
    )
    op.alter_column("impressions", "kind", nullable=False)
    op.alter_column("impressions", "content_id", nullable=False)
    op.drop_constraint(op.f("ck_impressions_exactly_one_item"), "impressions", type_="check")
    op.drop_constraint(op.f("fk_impressions_video_id_videos"), "impressions", type_="foreignkey")
    op.drop_constraint(op.f("fk_impressions_game_id_games"), "impressions", type_="foreignkey")
    op.drop_column("impressions", "video_id")
    op.drop_column("impressions", "game_id")
    op.create_check_constraint(
        op.f("ck_impressions_kind"), "impressions", "kind IN ('video', 'game')"
    )

    op.drop_constraint(op.f("fk_scores_game_id_games"), "scores", type_="foreignkey")
    op.alter_column(
        "scores", "game_id", type_=sa.String(length=64), postgresql_using="game_id::text"
    )

    op.drop_index(op.f("ix_videos_field_id"), table_name="videos")
    op.drop_table("videos")
    op.drop_index(op.f("ix_games_field_id"), table_name="games")
    op.drop_table("games")
    op.drop_table("study_fields")


def downgrade() -> None:
    op.create_table(
        "study_fields",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_study_fields")),
        sa.UniqueConstraint("slug", name=op.f("uq_study_fields_slug")),
    )
    for table in ("videos", "games"):
        op.create_table(
            table,
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("s3_key", sa.String(length=512), nullable=False),
            sa.Column("field_id", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["field_id"], ["study_fields.id"], name=op.f(f"fk_{table}_field_id_study_fields")
            ),
            sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}")),
            sa.UniqueConstraint("s3_key", name=op.f(f"uq_{table}_s3_key")),
        )
        op.create_index(op.f(f"ix_{table}_field_id"), table, ["field_id"], unique=False)

    op.execute("INSERT INTO study_fields (slug, name) SELECT DISTINCT field, field FROM users")
    op.add_column("users", sa.Column("field_id", sa.Integer(), nullable=True))
    op.execute("UPDATE users SET field_id = f.id FROM study_fields f WHERE f.slug = users.field")
    op.alter_column("users", "field_id", nullable=False)
    op.create_foreign_key(
        op.f("fk_users_field_id_study_fields"), "users", "study_fields", ["field_id"], ["id"]
    )
    op.drop_column("users", "field")

    # CMS ids have no counterpart in the recreated (empty) content tables.
    op.execute("DELETE FROM impressions")
    op.execute("DELETE FROM scores")

    op.alter_column("scores", "game_id", type_=sa.Integer(), postgresql_using="game_id::integer")
    op.create_foreign_key(
        op.f("fk_scores_game_id_games"), "scores", "games", ["game_id"], ["id"], ondelete="CASCADE"
    )

    op.drop_constraint(op.f("ck_impressions_kind"), "impressions", type_="check")
    op.drop_column("impressions", "kind")
    op.drop_column("impressions", "content_id")
    op.add_column("impressions", sa.Column("video_id", sa.Integer(), nullable=True))
    op.add_column("impressions", sa.Column("game_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_impressions_video_id_videos"),
        "impressions",
        "videos",
        ["video_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        op.f("fk_impressions_game_id_games"),
        "impressions",
        "games",
        ["game_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint(
        op.f("ck_impressions_exactly_one_item"),
        "impressions",
        "(video_id IS NULL) <> (game_id IS NULL)",
    )
