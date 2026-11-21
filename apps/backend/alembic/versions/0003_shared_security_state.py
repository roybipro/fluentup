"""revoked_tokens and rate_limit_hits, shared across API instances

Revision ID: 0003_shared_security_state
Revises: 0002_sync_receipts
Create Date: 2026-11-20
"""
import sqlalchemy as sa
from alembic import op

revision = "0003_shared_security_state"
down_revision = "0002_sync_receipts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "revoked_tokens",
        sa.Column("token_hash", sa.String(length=64), primary_key=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_revoked_tokens_expires_at", "revoked_tokens", ["expires_at"])
    op.create_table(
        "rate_limit_hits",
        sa.Column("bucket_key", sa.String(length=160), primary_key=True),
        sa.Column("window_minute", sa.Integer(), primary_key=True),
        sa.Column("hits", sa.Integer(), nullable=False),
    )
    op.create_index("ix_rate_limit_hits_window_minute", "rate_limit_hits", ["window_minute"])


def downgrade() -> None:
    op.drop_index("ix_rate_limit_hits_window_minute", table_name="rate_limit_hits")
    op.drop_table("rate_limit_hits")
    op.drop_index("ix_revoked_tokens_expires_at", table_name="revoked_tokens")
    op.drop_table("revoked_tokens")
