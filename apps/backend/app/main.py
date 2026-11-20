from datetime import datetime, timedelta, timezone
from typing import Dict

import bcrypt
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from sqlalchemy import case, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.lessons import get_lesson_rules
from app.middleware import RequestSizeLimitMiddleware
from app.database import get_db
from app.models import (
    AccountDeletionRequest,
    GrammarCheck,
    IELTSAttempt,
    LessonProgress,
    Profile,
    QuizAttempt,
    SpeakingSession,
    SyncReceipt,
    UserVocabulary,
)
from app.schemas import (
    AccountDeletionRequestModel,
    AITutorRequest,
    AITutorResponse,
    AuthLoginRequest,
    AuthRegisterRequest,
    AuthResponse,
    GrammarCheckRequest,
    GrammarCheckResponse,
    IELTSEvaluateRequest,
    IELTSEvaluateResponse,
    ProfileResponse,
    ProfileUpdateRequest,
    QuizSubmissionRequest,
    QuizSubmissionResponse,
    SyncBatchRequest,
    SyncBatchResponse,
    SyncItemResult,
    SyncMutationItem,
    SyncQuizPayload,
    SyncVocabularyCard,
    SyncVocabularyPayload,
    VocabularyItemResponse,
    VocabularyUpsertRequest,
)
from app.security import (
    check_rate_limit,
    client_ip,
    create_access_token,
    get_current_user,
    hash_email,
    revoke_token,
    security_scheme,
)
from app.services.ai_service import (
    generate_grammar_check,
    generate_ielts_evaluation,
    generate_tutor_feedback,
)

# Schema is owned by Alembic (`alembic upgrade head`); the app never creates tables itself.

app = FastAPI(
    title=settings.project_name,
    version="1.0.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,  # bearer tokens in headers, no cookies
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


app.add_middleware(RequestSizeLimitMiddleware, max_bytes=settings.max_request_body_bytes)


# ==============================================================================
# HEALTH CHECK & OPERATIONS
# ==============================================================================
@app.get("/health")
@app.get(f"{settings.api_v1_str}/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.project_name,
        "environment": settings.environment,
        "version": "1.0.0",
    }


# ==============================================================================
# AUTHENTICATION (bcrypt password hashes; never store plaintext)
# ==============================================================================
@app.post(f"{settings.api_v1_str}/auth/register", response_model=AuthResponse, status_code=201)
def register_user(
    payload: AuthRegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    check_rate_limit(db, f"auth:{client_ip(request)}", max_per_minute=20)

    existing = db.query(Profile).filter(Profile.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    profile = Profile(
        email=payload.email,
        password_hash=bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode(),
        display_name=payload.display_name.strip(),
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    token = create_access_token(user_id=profile.id, email=profile.email)
    return AuthResponse(
        user_id=profile.id,
        email=profile.email,
        display_name=profile.display_name,
        access_token=token,
        expires_in=3600,
    )


_DUMMY_PASSWORD_HASH = bcrypt.hashpw(b"dummy-password-for-timing", bcrypt.gensalt()).decode()


@app.post(f"{settings.api_v1_str}/auth/login", response_model=AuthResponse)
def login_user(
    payload: AuthLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    check_rate_limit(db, f"auth:{client_ip(request)}", max_per_minute=20)

    cleaned_email = payload.email.strip().lower()
    profile = db.query(Profile).filter(Profile.email == cleaned_email).first()
    # Check against a dummy hash for unknown emails so timing doesn't reveal which accounts exist.
    stored_hash = profile.password_hash if profile and profile.password_hash else _DUMMY_PASSWORD_HASH
    password_ok = bcrypt.checkpw(payload.password.encode(), stored_hash.encode())
    if not profile or not profile.password_hash or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or credentials.",
        )

    token = create_access_token(user_id=profile.id, email=profile.email)
    return AuthResponse(
        user_id=profile.id,
        email=profile.email,
        display_name=profile.display_name,
        access_token=token,
        expires_in=3600,
    )


@app.post(f"{settings.api_v1_str}/auth/recover")
def recover_password(payload: Dict[str, str], request: Request, db: Session = Depends(get_db)):
    check_rate_limit(db, f"auth:{client_ip(request)}", max_per_minute=10)
    # No email provider is wired up yet. Say so instead of pretending a reset link was sent.
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Password reset is not available yet. Please contact support.",
    )


@app.post(f"{settings.api_v1_str}/auth/logout")
def logout_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if credentials and credentials.credentials:
        revoke_token(db, credentials.credentials)
    return {"status": "logged_out", "user_id": current_user.id}


@app.delete(f"{settings.api_v1_str}/auth/account")
def delete_user_account(
    payload: AccountDeletionRequestModel = AccountDeletionRequestModel(),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently deletes the authenticated user's profile and all associated personal data
    (progress, quiz attempts, vocabulary, speaking sessions, grammar checks, IELTS attempts)
    via ON DELETE CASCADE, revokes the active session token, and records an anonymized audit log.
    """
    user_id = current_user.id
    email_digest = hash_email(current_user.email)

    audit_entry = AccountDeletionRequest(
        user_id=user_id,
        email_hash=email_digest,
        status="completed",
        reason=payload.reason,
        processed_at=datetime.now(timezone.utc),
    )
    db.add(audit_entry)
    db.delete(current_user)
    db.commit()

    if credentials and credentials.credentials:
        revoke_token(db, credentials.credentials)

    return {
        "deleted": True,
        "user_id": user_id,
        "message": "Account and all associated personal records have been permanently deleted.",
    }


# ==============================================================================
# PROFILE & USER DATA ISOLATION (Strictly bound to current_user from JWT)
# ==============================================================================
@app.get(f"{settings.api_v1_str}/profile/me", response_model=ProfileResponse)
def get_my_profile(current_user: Profile = Depends(get_current_user)):
    return ProfileResponse(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        explanation_language=current_user.explanation_language,
        proficiency_level=current_user.proficiency_level,
        learning_goal=current_user.learning_goal,
        daily_target_minutes=current_user.daily_target_minutes,
        total_xp=current_user.total_xp,
        current_streak=current_user.current_streak,
        longest_streak=current_user.longest_streak,
        subscription_tier=current_user.subscription_tier,
    )


@app.get(f"{settings.api_v1_str}/profile/{{target_user_id}}", response_model=ProfileResponse)
def get_profile_by_id(
    target_user_id: str,
    current_user: Profile = Depends(get_current_user),
):
    if target_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You are not authorized to access another user's profile or data.",
        )
    return get_my_profile(current_user)


@app.patch(f"{settings.api_v1_str}/profile/me", response_model=ProfileResponse)
def update_my_profile(
    payload: ProfileUpdateRequest,
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.display_name is not None:
        current_user.display_name = payload.display_name.strip()
    if payload.explanation_language is not None:
        current_user.explanation_language = payload.explanation_language
    if payload.proficiency_level is not None:
        current_user.proficiency_level = payload.proficiency_level
    if payload.learning_goal is not None:
        current_user.learning_goal = payload.learning_goal
    if payload.daily_target_minutes is not None:
        current_user.daily_target_minutes = payload.daily_target_minutes
    if payload.interests is not None:
        current_user.interests = payload.interests

    db.commit()
    db.refresh(current_user)
    return get_my_profile(current_user)


# ==============================================================================
# PROGRESS & QUIZ SCORING (Transactional & Idempotent — prevents duplicate XP)
# ==============================================================================
def record_quiz_attempt(
    db: Session,
    user: Profile,
    *,
    lesson_id: str,
    client_submission_id: str,
    score_percent: int,
    correct_count: int,
    total_questions: int,
    mistakes: list,
) -> QuizSubmissionResponse:
    """Validate and stage a quiz attempt. XP and pass mark come from the server catalog.

    Does not commit; the caller owns the transaction.
    """
    rules = get_lesson_rules(lesson_id)
    if rules is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown lesson_id.")

    if total_questions <= 0 or correct_count < 0 or correct_count > total_questions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="correct_count must be between 0 and total_questions.",
        )

    expected_pct = round((correct_count / total_questions) * 100)
    if abs(expected_pct - score_percent) > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Inconsistent score_percent relative to correct_count and total_questions.",
        )

    # Check idempotency key first
    existing_attempt = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.client_submission_id == client_submission_id)
        .first()
    )
    if existing_attempt:
        if existing_attempt.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Submission ID belongs to another user.",
            )
        return QuizSubmissionResponse(
            lesson_id=existing_attempt.lesson_id,
            client_submission_id=existing_attempt.client_submission_id,
            score_percent=existing_attempt.score_percent,
            passed=existing_attempt.score_percent >= rules.passing_score,
            xp_earned=0,
            total_xp=user.total_xp,
            duplicate_submission=True,
        )

    progress = (
        db.query(LessonProgress)
        .filter(
            LessonProgress.user_id == user.id,
            LessonProgress.lesson_id == lesson_id,
        )
        .first()
    )

    passed = score_percent >= rules.passing_score
    already_awarded = bool(progress and progress.xp_awarded)
    xp_earned = rules.xp_reward if (passed and not already_awarded) else 0

    now = datetime.now(timezone.utc)
    if not progress:
        progress = LessonProgress(
            user_id=user.id,
            lesson_id=lesson_id,
            status="completed" if passed else "in_progress",
            best_score=score_percent,
            attempts_count=1,
            xp_awarded=bool(xp_earned > 0),
            completed_at=now if passed else None,
        )
        db.add(progress)
    else:
        progress.attempts_count += 1
        progress.best_score = max(progress.best_score, score_percent)
        if passed:
            progress.status = "completed"
            progress.completed_at = progress.completed_at or now
        if xp_earned > 0:
            progress.xp_awarded = True

    db.add(
        QuizAttempt(
            user_id=user.id,
            lesson_id=lesson_id,
            client_submission_id=client_submission_id,
            score_percent=score_percent,
            correct_count=correct_count,
            total_questions=total_questions,
            xp_earned=xp_earned,
            mistakes=mistakes,
        )
    )
    user.total_xp += xp_earned
    db.flush()

    return QuizSubmissionResponse(
        lesson_id=lesson_id,
        client_submission_id=client_submission_id,
        score_percent=score_percent,
        passed=passed,
        xp_earned=xp_earned,
        total_xp=user.total_xp,
        duplicate_submission=False,
    )


@app.post(f"{settings.api_v1_str}/progress/quiz", response_model=QuizSubmissionResponse)
def submit_quiz_attempt(
    payload: QuizSubmissionRequest,
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = record_quiz_attempt(
        db,
        current_user,
        lesson_id=payload.lesson_id,
        client_submission_id=payload.client_submission_id,
        score_percent=payload.score_percent,
        correct_count=payload.correct_count,
        total_questions=payload.total_questions,
        mistakes=payload.mistakes,
    )
    if result.duplicate_submission:
        return result
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Concurrent duplicate quiz submission detected.",
        )
    return result


# ==============================================================================
# VOCABULARY & SPACED REPETITION (SM-2)
# ==============================================================================
@app.get(f"{settings.api_v1_str}/vocabulary", response_model=list[VocabularyItemResponse])
def list_my_vocabulary(
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = (
        db.query(UserVocabulary)
        .filter(UserVocabulary.user_id == current_user.id)
        .order_by(UserVocabulary.next_review_at.asc())
        .all()
    )
    return [
        VocabularyItemResponse(
            id=i.id,
            word_or_phrase=i.word_or_phrase,
            meaning_bn=i.meaning_bn,
            definition_en=i.definition_en,
            example_sentence=i.example_sentence,
            phonetic=i.phonetic,
            is_favorite=i.is_favorite,
            repetition_number=i.repetition_number,
            easiness_factor=i.easiness_factor,
            interval_days=i.interval_days,
            next_review_at=i.next_review_at.isoformat(),
        )
        for i in items
    ]


@app.post(f"{settings.api_v1_str}/vocabulary", response_model=VocabularyItemResponse)
def upsert_vocabulary(
    payload: VocabularyUpsertRequest,
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    word_clean = payload.word_or_phrase.strip()
    existing = (
        db.query(UserVocabulary)
        .filter(
            UserVocabulary.user_id == current_user.id,
            UserVocabulary.word_or_phrase == word_clean,
        )
        .first()
    )
    now = datetime.now(timezone.utc)

    if not existing:
        existing = UserVocabulary(
            user_id=current_user.id,
            word_or_phrase=word_clean,
            meaning_bn=payload.meaning_bn,
            definition_en=payload.definition_en,
            example_sentence=payload.example_sentence,
            phonetic=payload.phonetic,
            is_favorite=payload.is_favorite,
            repetition_number=0,
            easiness_factor=2.5,
            interval_days=0,
            next_review_at=now,
            review_history=[],
        )
        db.add(existing)
    else:
        existing.meaning_bn = payload.meaning_bn or existing.meaning_bn
        existing.definition_en = payload.definition_en or existing.definition_en
        existing.is_favorite = payload.is_favorite

    if payload.rating is not None:
        r = payload.rating
        if r >= 3:
            if existing.repetition_number == 0:
                existing.interval_days = 1
            elif existing.repetition_number == 1:
                existing.interval_days = 3
            else:
                existing.interval_days = max(1, round(existing.interval_days * existing.easiness_factor))
            existing.repetition_number += 1
        else:
            existing.repetition_number = 0
            existing.interval_days = 1

        q_delta = 5 - r
        ef = existing.easiness_factor + (0.1 - q_delta * (0.08 + q_delta * 0.02))
        existing.easiness_factor = round(max(1.3, ef), 2)
        existing.last_reviewed_at = now
        existing.next_review_at = now + timedelta(days=existing.interval_days)

    db.commit()
    db.refresh(existing)
    return VocabularyItemResponse(
        id=existing.id,
        word_or_phrase=existing.word_or_phrase,
        meaning_bn=existing.meaning_bn,
        definition_en=existing.definition_en,
        example_sentence=existing.example_sentence,
        phonetic=existing.phonetic,
        is_favorite=existing.is_favorite,
        repetition_number=existing.repetition_number,
        easiness_factor=existing.easiness_factor,
        interval_days=existing.interval_days,
        next_review_at=existing.next_review_at.isoformat(),
    )


# ==============================================================================
# OFFLINE SYNC BATCH ENDPOINT
# ==============================================================================
def _apply_vocabulary_card(db: Session, user: Profile, card: SyncVocabularyCard) -> None:
    word = card.wordOrPhrase.strip()
    row = (
        db.query(UserVocabulary)
        .filter(UserVocabulary.user_id == user.id, UserVocabulary.word_or_phrase == word)
        .first()
    )
    if row is None:
        row = UserVocabulary(user_id=user.id, word_or_phrase=word, review_history=[])
        db.add(row)
    row.meaning_bn = card.meaningBn
    row.definition_en = card.definitionEn
    row.example_sentence = card.exampleSentence
    row.phonetic = card.phonetic
    row.is_favorite = card.isFavorite
    row.repetition_number = card.repetitionNumber
    row.easiness_factor = card.easinessFactor
    row.interval_days = card.intervalDays
    row.next_review_at = card.nextReviewAt
    row.last_reviewed_at = card.lastReviewedAt
    db.flush()


def _apply_sync_mutation(db: Session, user: Profile, mutation: SyncMutationItem) -> SyncItemResult:
    already = (
        db.query(SyncReceipt)
        .filter(SyncReceipt.user_id == user.id, SyncReceipt.mutation_id == mutation.id)
        .first()
    )
    if already:
        return SyncItemResult(id=mutation.id, status="duplicate")

    savepoint = db.begin_nested()
    try:
        item_status = "ok"
        if mutation.type == "lesson_quiz_completed":
            quiz = SyncQuizPayload.model_validate(mutation.payload)
            result = record_quiz_attempt(
                db,
                user,
                lesson_id=quiz.lessonId,
                client_submission_id=quiz.clientSubmissionId,
                score_percent=quiz.scorePercent,
                correct_count=quiz.correctCount,
                total_questions=quiz.totalQuestions,
                mistakes=quiz.mistakes,
            )
            if result.duplicate_submission:
                item_status = "duplicate"
        elif mutation.type == "vocabulary_upserted":
            _apply_vocabulary_card(db, user, SyncVocabularyPayload.model_validate(mutation.payload).card)
        else:
            raise ValueError(f"Unsupported mutation type: {mutation.type}")

        db.add(SyncReceipt(user_id=user.id, mutation_id=mutation.id, mutation_type=mutation.type))
        db.flush()
        savepoint.commit()
        return SyncItemResult(id=mutation.id, status=item_status)
    except HTTPException as exc:
        savepoint.rollback()
        return SyncItemResult(id=mutation.id, status="error", detail=str(exc.detail))
    except (ValidationError, ValueError, IntegrityError) as exc:
        savepoint.rollback()
        detail = exc.errors()[0]["msg"] if isinstance(exc, ValidationError) else str(exc).splitlines()[0]
        return SyncItemResult(id=mutation.id, status="error", detail=detail[:200])


@app.post(f"{settings.api_v1_str}/sync/batch", response_model=SyncBatchResponse)
def sync_offline_mutations(
    payload: SyncBatchRequest,
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply queued offline mutations in one transaction (one savepoint per item).

    The client must drop only items acknowledged "ok" or "duplicate" and keep the rest queued.
    """
    results = [_apply_sync_mutation(db, current_user, m) for m in payload.mutations]
    db.commit()
    return SyncBatchResponse(results=results)


# ==============================================================================
# AI ENGLISH TUTOR, GRAMMAR CHECKER & IELTS EVALUATOR
# ==============================================================================
def reserve_ai_quota(db: Session, user: Profile, limit: int) -> bool:
    """Atomically take one AI request from today's quota. Returns False when the quota is used up.

    A single conditional UPDATE, so concurrent requests can't both pass a stale read and overshoot.
    """
    today = datetime.now(timezone.utc).date()
    stmt = (
        update(Profile)
        .where(Profile.id == user.id)
        .where(
            or_(
                Profile.ai_quota_date.is_(None),
                Profile.ai_quota_date != today,
                Profile.ai_requests_today < limit,
            )
        )
        .values(
            ai_requests_today=case((Profile.ai_quota_date == today, Profile.ai_requests_today + 1), else_=1),
            ai_quota_date=today,
        )
        .execution_options(synchronize_session=False)
    )
    granted = db.execute(stmt).rowcount == 1
    db.commit()
    return granted


def _release_ai_quota(db: Session, user: Profile) -> None:
    """Give back a reserved request when the deterministic fallback answered instead of the live model."""
    today = datetime.now(timezone.utc).date()
    db.execute(
        update(Profile)
        .where(Profile.id == user.id, Profile.ai_quota_date == today, Profile.ai_requests_today > 0)
        .values(ai_requests_today=Profile.ai_requests_today - 1)
        .execution_options(synchronize_session=False)
    )


def _require_ai_quota(db: Session, user: Profile) -> None:
    limit = (
        settings.ai_max_daily_requests_premium
        if user.subscription_tier == "premium"
        else settings.ai_max_daily_requests_free
    )
    if not reserve_ai_quota(db, user, limit):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily AI practice limit ({limit} requests) reached for your tier.",
        )


@app.post(f"{settings.api_v1_str}/ai/tutor", response_model=AITutorResponse)
async def ai_tutor_endpoint(
    payload: AITutorRequest,
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_ai_quota(db, current_user)
    feedback = await generate_tutor_feedback(payload)
    if feedback.providerStatus != "live_ai":
        _release_ai_quota(db, current_user)

    db.add(
        SpeakingSession(
            user_id=current_user.id,
            scenario_id=payload.scenarioId,
            mode="ai_tutor",
            user_transcript=payload.userMessage,
            structured_feedback=feedback.model_dump(),
        )
    )
    db.commit()
    return feedback


@app.post(f"{settings.api_v1_str}/ai/grammar-check", response_model=GrammarCheckResponse)
async def ai_grammar_endpoint(
    payload: GrammarCheckRequest,
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_ai_quota(db, current_user)
    result = await generate_grammar_check(payload)
    if result.providerStatus != "live_ai":
        _release_ai_quota(db, current_user)

    db.add(
        GrammarCheck(
            user_id=current_user.id,
            original_text=result.originalText,
            corrected_text=result.correctedText,
            natural_rewrite=result.naturalRewrite,
            explanations=[e.model_dump() for e in result.explanations],
            practice_exercise=result.practiceExercise.model_dump(),
        )
    )
    db.commit()
    return result


@app.post(f"{settings.api_v1_str}/ai/ielts-evaluate", response_model=IELTSEvaluateResponse)
async def ai_ielts_endpoint(
    payload: IELTSEvaluateRequest,
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_ai_quota(db, current_user)
    evaluation = await generate_ielts_evaluation(payload)
    if evaluation.providerStatus != "live_ai":
        _release_ai_quota(db, current_user)

    db.add(
        IELTSAttempt(
            user_id=current_user.id,
            module_type=payload.moduleType,
            task_id=payload.taskId,
            user_response=payload.userResponse,
            evaluation=evaluation.model_dump(),
            estimated_band=evaluation.estimatedBand,
            is_unofficial_estimate=True,
        )
    )
    db.commit()
    return evaluation
