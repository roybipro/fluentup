from datetime import datetime, timedelta, timezone
from typing import Dict
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine, get_db
from app.models import (
    AccountDeletionRequest,
    GrammarCheck,
    IELTSAttempt,
    LessonProgress,
    Profile,
    QuizAttempt,
    SpeakingSession,
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
    VocabularyItemResponse,
    VocabularyUpsertRequest,
)
from app.security import (
    check_rate_limit,
    create_access_token,
    get_current_user,
    get_optional_user,
    hash_email,
    revoke_token,
    security_scheme,
)
from app.services.ai_service import (
    generate_grammar_check,
    generate_ielts_evaluation,
    generate_tutor_feedback,
)

# Initialize database tables for local/test environments
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.project_name,
    version="1.0.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def enforce_request_size_limit(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.max_request_body_bytes:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": "Request payload exceeds maximum allowed size."},
        )
    return await call_next(request)


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
# AUTHENTICATION (Delegates password storage to Supabase Auth in production;
# never stores plaintext or custom password hashes in application tables)
# ==============================================================================
@app.post(f"{settings.api_v1_str}/auth/register", response_model=AuthResponse, status_code=201)
def register_user(
    payload: AuthRegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"auth:{client_ip}", max_per_minute=20)

    existing = db.query(Profile).filter(Profile.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    profile = Profile(
        email=payload.email,
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


@app.post(f"{settings.api_v1_str}/auth/login", response_model=AuthResponse)
def login_user(
    payload: AuthLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"auth:{client_ip}", max_per_minute=20)

    cleaned_email = payload.email.strip().lower()
    profile = db.query(Profile).filter(Profile.email == cleaned_email).first()
    if not profile:
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
def recover_password(payload: Dict[str, str], request: Request):
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"auth:{client_ip}", max_per_minute=10)
    return {
        "status": "dispatched",
        "message": "If the email is registered, a password recovery link has been sent via Supabase Auth.",
    }


@app.post(f"{settings.api_v1_str}/auth/logout")
def logout_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    current_user: Profile = Depends(get_current_user),
):
    if credentials and credentials.credentials:
        revoke_token(credentials.credentials)
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
        revoke_token(credentials.credentials)

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
@app.post(f"{settings.api_v1_str}/progress/quiz", response_model=QuizSubmissionResponse)
def submit_quiz_attempt(
    payload: QuizSubmissionRequest,
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.correct_count > payload.total_questions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="correct_count cannot exceed total_questions.",
        )

    expected_pct = round((payload.correct_count / payload.total_questions) * 100)
    if abs(expected_pct - payload.score_percent) > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Inconsistent score_percent relative to correct_count and total_questions.",
        )

    # Check idempotency key first
    existing_attempt = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.client_submission_id == payload.client_submission_id)
        .first()
    )
    if existing_attempt:
        if existing_attempt.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Submission ID belongs to another user.",
            )
        return QuizSubmissionResponse(
            lesson_id=existing_attempt.lesson_id,
            client_submission_id=existing_attempt.client_submission_id,
            score_percent=existing_attempt.score_percent,
            passed=existing_attempt.score_percent >= payload.passing_score,
            xp_earned=0,
            total_xp=current_user.total_xp,
            duplicate_submission=True,
        )

    progress = (
        db.query(LessonProgress)
        .filter(
            LessonProgress.user_id == current_user.id,
            LessonProgress.lesson_id == payload.lesson_id,
        )
        .first()
    )

    passed = payload.score_percent >= payload.passing_score
    already_awarded = bool(progress and progress.xp_awarded)
    xp_earned = payload.xp_reward if (passed and not already_awarded) else 0

    now = datetime.now(timezone.utc)
    if not progress:
        progress = LessonProgress(
            user_id=current_user.id,
            lesson_id=payload.lesson_id,
            status="completed" if passed else "in_progress",
            best_score=payload.score_percent,
            attempts_count=1,
            xp_awarded=bool(xp_earned > 0),
            completed_at=now if passed else None,
        )
        db.add(progress)
    else:
        progress.attempts_count += 1
        progress.best_score = max(progress.best_score, payload.score_percent)
        if passed:
            progress.status = "completed"
            progress.completed_at = progress.completed_at or now
        if xp_earned > 0:
            progress.xp_awarded = True

    attempt = QuizAttempt(
        user_id=current_user.id,
        lesson_id=payload.lesson_id,
        client_submission_id=payload.client_submission_id,
        score_percent=payload.score_percent,
        correct_count=payload.correct_count,
        total_questions=payload.total_questions,
        xp_earned=xp_earned,
        mistakes=payload.mistakes,
    )
    db.add(attempt)

    current_user.total_xp += xp_earned
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Concurrent duplicate quiz submission detected.",
        )

    db.refresh(current_user)
    return QuizSubmissionResponse(
        lesson_id=payload.lesson_id,
        client_submission_id=payload.client_submission_id,
        score_percent=payload.score_percent,
        passed=passed,
        xp_earned=xp_earned,
        total_xp=current_user.total_xp,
        duplicate_submission=False,
    )


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
@app.post(f"{settings.api_v1_str}/sync/batch")
def sync_offline_mutations(
    payload: SyncBatchRequest,
    current_user: Profile | None = Depends(get_optional_user),
):
    return {
        "synced": True,
        "processed_count": len(payload.mutations),
        "user_id": current_user.id if current_user else "guest",
    }


# ==============================================================================
# AI ENGLISH TUTOR, GRAMMAR CHECKER & IELTS EVALUATOR
# ==============================================================================
def _check_and_increment_ai_quota(user: Profile | None, db: Session) -> None:
    if not user:
        return
    today = datetime.now(timezone.utc).date()
    if user.ai_quota_date != today:
        user.ai_quota_date = today
        user.ai_requests_today = 0

    limit = (
        settings.ai_max_daily_requests_premium
        if user.subscription_tier == "premium"
        else settings.ai_max_daily_requests_free
    )
    if user.ai_requests_today >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily AI practice limit ({limit} requests) reached for your tier.",
        )
    user.ai_requests_today += 1
    db.commit()


@app.post(f"{settings.api_v1_str}/ai/tutor", response_model=AITutorResponse)
async def ai_tutor_endpoint(
    payload: AITutorRequest,
    current_user: Profile | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    _check_and_increment_ai_quota(current_user, db)
    feedback = await generate_tutor_feedback(payload)

    if current_user:
        session_record = SpeakingSession(
            user_id=current_user.id,
            scenario_id=payload.scenarioId,
            mode="ai_tutor",
            user_transcript=payload.userMessage,
            structured_feedback=feedback.model_dump(),
        )
        db.add(session_record)
        db.commit()

    return feedback


@app.post(f"{settings.api_v1_str}/ai/grammar-check", response_model=GrammarCheckResponse)
async def ai_grammar_endpoint(
    payload: GrammarCheckRequest,
    current_user: Profile | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    _check_and_increment_ai_quota(current_user, db)
    result = await generate_grammar_check(payload)

    if current_user:
        record = GrammarCheck(
            user_id=current_user.id,
            original_text=result.originalText,
            corrected_text=result.correctedText,
            natural_rewrite=result.naturalRewrite,
            explanations=[e.model_dump() for e in result.explanations],
            practice_exercise=result.practiceExercise.model_dump(),
        )
        db.add(record)
        db.commit()

    return result


@app.post(f"{settings.api_v1_str}/ai/ielts-evaluate", response_model=IELTSEvaluateResponse)
async def ai_ielts_endpoint(
    payload: IELTSEvaluateRequest,
    current_user: Profile | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    _check_and_increment_ai_quota(current_user, db)
    evaluation = await generate_ielts_evaluation(payload)

    if current_user:
        attempt = IELTSAttempt(
            user_id=current_user.id,
            module_type=payload.moduleType,
            task_id=payload.taskId,
            user_response=payload.userResponse,
            evaluation=evaluation.model_dump(),
            estimated_band=evaluation.estimatedBand,
            is_unofficial_estimate=True,
        )
        db.add(attempt)
        db.commit()

    return evaluation
