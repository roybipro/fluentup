"""add profiles.password_hash

Revision ID: 0001_password_hash
Revises: 0000_baseline
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

revision = "0001_password_hash"
down_revision = "0000_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Databases built by the old create_all may already have the column.
    inspector = sa.inspect(op.get_bind())
    if "password_hash" not in {c["name"] for c in inspector.get_columns("profiles")}:
        op.add_column("profiles", sa.Column("password_hash", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("profiles", "password_hash")
