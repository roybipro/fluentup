"""baseline schema (v0.1.0, as previously built by create_all)

Revision ID: 0000_baseline
Revises:
Create Date: 2026-11-20

Databases that were built by the old create_all already have these tables; each is created only
if missing, so running `alembic upgrade head` on them is safe.
"""
import sqlalchemy as sa
from alembic import op

revision = "0000_baseline"
down_revision = None
branch_labels = None
depends_on = None

_TABLES = [
    "account_deletion_requests",
    "ielts_attempts",
    "grammar_checks",
    "speaking_sessions",
    "user_vocabulary",
    "quiz_attempts",
    "lesson_progress",
    "profiles",
]


def _user_fk() -> sa.Column:
    return sa.Column("user_id", sa.String(64), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if "profiles" not in existing:
        op.create_table(
            "profiles",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("display_name", sa.String(120), nullable=False),
            sa.Column("explanation_language", sa.String(10), nullable=False),
            sa.Column("proficiency_level", sa.String(32), nullable=False),
            sa.Column("learning_goal", sa.String(64), nullable=False),
            sa.Column("daily_target_minutes", sa.Integer(), nullable=False),
            sa.Column("interests", sa.JSON(), nullable=False),
            sa.Column("total_xp", sa.Integer(), nullable=False),
            sa.Column("current_streak", sa.Integer(), nullable=False),
            sa.Column("longest_streak", sa.Integer(), nullable=False),
            sa.Column("last_active_date", sa.Date(), nullable=True),
            sa.Column("subscription_tier", sa.String(24), nullable=False),
            sa.Column("ai_requests_today", sa.Integer(), nullable=False),
            sa.Column("ai_quota_date", sa.Date(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint("explanation_language IN ('bn', 'en')", name="ck_profile_lang"),
            sa.CheckConstraint("total_xp >= 0", name="ck_profile_xp_nonneg"),
            sa.CheckConstraint("daily_target_minutes BETWEEN 5 AND 180", name="ck_profile_daily_target"),
        )
        op.create_index("ix_profiles_email", "profiles", ["email"], unique=True)

    if "lesson_progress" not in existing:
        op.create_table(
            "lesson_progress",
            sa.Column("id", sa.String(64), primary_key=True),
            _user_fk(),
            sa.Column("lesson_id", sa.String(64), nullable=False),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("best_score", sa.Integer(), nullable=False),
            sa.Column("attempts_count", sa.Integer(), nullable=False),
            sa.Column("last_exercise_index", sa.Integer(), nullable=False),
            sa.Column("xp_awarded", sa.Boolean(), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("user_id", "lesson_id", name="uq_user_lesson_progress"),
            sa.CheckConstraint("best_score BETWEEN 0 AND 100", name="ck_progress_best_score"),
            sa.CheckConstraint("attempts_count >= 0", name="ck_progress_attempts_nonneg"),
        )
        op.create_index("ix_lesson_progress_user_id", "lesson_progress", ["user_id"])
        op.create_index("ix_lesson_progress_lesson_id", "lesson_progress", ["lesson_id"])

    if "quiz_attempts" not in existing:
        op.create_table(
            "quiz_attempts",
            sa.Column("id", sa.String(64), primary_key=True),
            _user_fk(),
            sa.Column("lesson_id", sa.String(64), nullable=False),
            sa.Column("client_submission_id", sa.String(128), nullable=False),
            sa.Column("score_percent", sa.Integer(), nullable=False),
            sa.Column("correct_count", sa.Integer(), nullable=False),
            sa.Column("total_questions", sa.Integer(), nullable=False),
            sa.Column("xp_earned", sa.Integer(), nullable=False),
            sa.Column("mistakes", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint("score_percent BETWEEN 0 AND 100", name="ck_quiz_score_range"),
            sa.CheckConstraint(
                "correct_count >= 0 AND total_questions > 0 AND correct_count <= total_questions",
                name="ck_quiz_counts",
            ),
            sa.CheckConstraint("xp_earned >= 0", name="ck_quiz_xp_nonneg"),
        )
        op.create_index("ix_quiz_attempts_user_id", "quiz_attempts", ["user_id"])
        op.create_index("ix_quiz_attempts_lesson_id", "quiz_attempts", ["lesson_id"])
        op.create_index("ix_quiz_attempts_client_submission_id", "quiz_attempts", ["client_submission_id"], unique=True)

    if "user_vocabulary" not in existing:
        op.create_table(
            "user_vocabulary",
            sa.Column("id", sa.String(64), primary_key=True),
            _user_fk(),
            sa.Column("word_or_phrase", sa.String(160), nullable=False),
            sa.Column("meaning_bn", sa.String(255), nullable=False),
            sa.Column("definition_en", sa.Text(), nullable=False),
            sa.Column("example_sentence", sa.Text(), nullable=False),
            sa.Column("phonetic", sa.String(100), nullable=False),
            sa.Column("is_favorite", sa.Boolean(), nullable=False),
            sa.Column("repetition_number", sa.Integer(), nullable=False),
            sa.Column("easiness_factor", sa.Float(), nullable=False),
            sa.Column("interval_days", sa.Integer(), nullable=False),
            sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("review_history", sa.JSON(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("user_id", "word_or_phrase", name="uq_user_vocab_word"),
            sa.CheckConstraint("easiness_factor >= 1.3", name="ck_vocab_ef_min"),
            sa.CheckConstraint("interval_days >= 0", name="ck_vocab_interval_nonneg"),
        )
        op.create_index("ix_user_vocabulary_user_id", "user_vocabulary", ["user_id"])

    if "speaking_sessions" not in existing:
        op.create_table(
            "speaking_sessions",
            sa.Column("id", sa.String(64), primary_key=True),
            _user_fk(),
            sa.Column("scenario_id", sa.String(64), nullable=False),
            sa.Column("mode", sa.String(32), nullable=False),
            sa.Column("user_transcript", sa.Text(), nullable=False),
            sa.Column("structured_feedback", sa.JSON(), nullable=False),
            sa.Column("duration_seconds", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_speaking_sessions_user_id", "speaking_sessions", ["user_id"])

    if "grammar_checks" not in existing:
        op.create_table(
            "grammar_checks",
            sa.Column("id", sa.String(64), primary_key=True),
            _user_fk(),
            sa.Column("original_text", sa.Text(), nullable=False),
            sa.Column("corrected_text", sa.Text(), nullable=False),
            sa.Column("natural_rewrite", sa.Text(), nullable=False),
            sa.Column("explanations", sa.JSON(), nullable=False),
            sa.Column("practice_exercise", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_grammar_checks_user_id", "grammar_checks", ["user_id"])

    if "ielts_attempts" not in existing:
        op.create_table(
            "ielts_attempts",
            sa.Column("id", sa.String(64), primary_key=True),
            _user_fk(),
            sa.Column("module_type", sa.String(24), nullable=False),
            sa.Column("task_id", sa.String(64), nullable=False),
            sa.Column("user_response", sa.Text(), nullable=False),
            sa.Column("evaluation", sa.JSON(), nullable=False),
            sa.Column("estimated_band", sa.Float(), nullable=False),
            sa.Column("is_unofficial_estimate", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_ielts_attempts_user_id", "ielts_attempts", ["user_id"])

    if "account_deletion_requests" not in existing:
        op.create_table(
            "account_deletion_requests",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("user_id", sa.String(64), nullable=False),
            sa.Column("email_hash", sa.String(128), nullable=False),
            sa.Column("status", sa.String(32), nullable=False),
            sa.Column("reason", sa.String(255), nullable=True),
            sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_account_deletion_requests_user_id", "account_deletion_requests", ["user_id"])


def downgrade() -> None:
    for table in _TABLES:
        op.drop_table(table)
