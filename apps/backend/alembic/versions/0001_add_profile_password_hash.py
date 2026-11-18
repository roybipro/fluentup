"""add profiles.password_hash

Revision ID: 0001_password_hash
Revises:
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

revision = "0001_password_hash"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Base revision: existing databases were built by create_all, so only add the column if missing.
    # shortcut: no baseline migration yet; create_all builds fresh DBs (with this column). Add a baseline before dropping create_all.
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("profiles"):
        return
    if "password_hash" not in {c["name"] for c in inspector.get_columns("profiles")}:
        op.add_column("profiles", sa.Column("password_hash", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("profiles", "password_hash")
