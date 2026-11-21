"""drop profiles.password_hash: Supabase Auth owns passwords

Revision ID: 0004_drop_password_hash
Revises: 0003_shared_security_state
Create Date: 2026-11-20
"""
import sqlalchemy as sa
from alembic import op

revision = "0004_drop_password_hash"
down_revision = "0003_shared_security_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "password_hash" in {c["name"] for c in inspector.get_columns("profiles")}:
        with op.batch_alter_table("profiles") as batch:
            batch.drop_column("password_hash")


def downgrade() -> None:
    with op.batch_alter_table("profiles") as batch:
        batch.add_column(sa.Column("password_hash", sa.String(length=255), nullable=True))
