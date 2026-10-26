import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    display_name = Column(String(120), nullable=False, default="Learner")
    explanation_language = Column(String(10), nullable=False, default="bn")
    proficiency_level = Column(String(32), nullable=False, default="beginner")
    learning_goal = Column(String(64), nullable=False, default="daily_conversation")
    daily_target_minutes = Column(Integer, nullable=False, default=15)
    interests = Column(JSON, nullable=False, default=list)
    total_xp = Column(Integer, nullable=False, default=0)
    current_streak = Column(Integer, nullable=False, default=1)
    longest_streak = Column(Integer, nullable=False, default=1)
    last_active_date = Column(Date, nullable=True)
    subscription_tier = Column(String(24), nullable=False, default="free")
    ai_requests_today = Column(Integer, nullable=False, default=0)
    ai_quota_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        CheckConstraint("explanation_language IN ('bn', 'en')", name="ck_profile_lang"),
        CheckConstraint("total_xp >= 0", name="ck_profile_xp_nonneg"),
        CheckConstraint("daily_target_minutes BETWEEN 5 AND 180", name="ck_profile_daily_target"),
    )

    lesson_progress = relationship("LessonProgress", back_populates="user", cascade="all, delete-orphan")
    quiz_attempts = relationship("QuizAttempt", back_populates="user", cascade="all, delete-orphan")
    vocabulary = relationship("UserVocabulary", back_populates="user", cascade="all, delete-orphan")
    speaking_sessions = relationship("SpeakingSession", back_populates="user", cascade="all, delete-orphan")
    grammar_checks = relationship("GrammarCheck", back_populates="user", cascade="all, delete-orphan")
    ielts_attempts = relationship("IELTSAttempt", back_populates="user", cascade="all, delete-orphan")


class LessonProgress(Base):
    __tablename__ = "lesson_progress"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    lesson_id = Column(String(64), nullable=False, index=True)
    status = Column(String(24), nullable=False, default="not_started")
    best_score = Column(Integer, nullable=False, default=0)
    attempts_count = Column(Integer, nullable=False, default=0)
    last_exercise_index = Column(Integer, nullable=False, default=0)
    xp_awarded = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "lesson_id", name="uq_user_lesson_progress"),
        CheckConstraint("best_score BETWEEN 0 AND 100", name="ck_progress_best_score"),
        CheckConstraint("attempts_count >= 0", name="ck_progress_attempts_nonneg"),
    )

    user = relationship("Profile", back_populates="lesson_progress")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    lesson_id = Column(String(64), nullable=False, index=True)
    client_submission_id = Column(String(128), unique=True, nullable=False, index=True)
    score_percent = Column(Integer, nullable=False)
    correct_count = Column(Integer, nullable=False)
    total_questions = Column(Integer, nullable=False)
    xp_earned = Column(Integer, nullable=False, default=0)
    mistakes = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (
        CheckConstraint("score_percent BETWEEN 0 AND 100", name="ck_quiz_score_range"),
        CheckConstraint("correct_count >= 0 AND total_questions > 0 AND correct_count <= total_questions", name="ck_quiz_counts"),
        CheckConstraint("xp_earned >= 0", name="ck_quiz_xp_nonneg"),
    )

    user = relationship("Profile", back_populates="quiz_attempts")


class UserVocabulary(Base):
    __tablename__ = "user_vocabulary"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    word_or_phrase = Column(String(160), nullable=False)
    meaning_bn = Column(String(255), nullable=False, default="")
    definition_en = Column(Text, nullable=False)
    example_sentence = Column(Text, nullable=False, default="")
    phonetic = Column(String(100), nullable=False, default="")
    is_favorite = Column(Boolean, nullable=False, default=False)
    repetition_number = Column(Integer, nullable=False, default=0)
    easiness_factor = Column(Float, nullable=False, default=2.5)
    interval_days = Column(Integer, nullable=False, default=0)
    next_review_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_history = Column(JSON, nullable=False, default=list)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "word_or_phrase", name="uq_user_vocab_word"),
        CheckConstraint("easiness_factor >= 1.3", name="ck_vocab_ef_min"),
        CheckConstraint("interval_days >= 0", name="ck_vocab_interval_nonneg"),
    )

    user = relationship("Profile", back_populates="vocabulary")


class SpeakingSession(Base):
    __tablename__ = "speaking_sessions"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    scenario_id = Column(String(64), nullable=False)
    mode = Column(String(32), nullable=False, default="ai_tutor")
    user_transcript = Column(Text, nullable=False)
    structured_feedback = Column(JSON, nullable=False)
    duration_seconds = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    user = relationship("Profile", back_populates="speaking_sessions")


class GrammarCheck(Base):
    __tablename__ = "grammar_checks"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    original_text = Column(Text, nullable=False)
    corrected_text = Column(Text, nullable=False)
    natural_rewrite = Column(Text, nullable=False)
    explanations = Column(JSON, nullable=False, default=list)
    practice_exercise = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    user = relationship("Profile", back_populates="grammar_checks")


class IELTSAttempt(Base):
    __tablename__ = "ielts_attempts"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    module_type = Column(String(24), nullable=False)
    task_id = Column(String(64), nullable=False)
    user_response = Column(Text, nullable=False)
    evaluation = Column(JSON, nullable=False)
    estimated_band = Column(Float, nullable=False)
    is_unofficial_estimate = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    user = relationship("Profile", back_populates="ielts_attempts")


class AccountDeletionRequest(Base):
    __tablename__ = "account_deletion_requests"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), nullable=False, index=True)
    email_hash = Column(String(128), nullable=False)
    status = Column(String(32), nullable=False, default="completed")
    reason = Column(String(255), nullable=True)
    requested_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    processed_at = Column(DateTime(timezone=True), nullable=True, default=utcnow)
