from datetime import datetime, timezone
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings, validate_auth_config
from app.database import Base, engine, get_db
from app.models import (
    AccountDeletionRequest,
    GrammarCheck,
    IELTSAttempt,
    Profile,
    SpeakingSession,
    UserVocabulary,
)
from app.schemas import (
    AccountDeletionRequestModel,
    AITutorRequest,
    AITutorResponse,
    AuthLoginRequest,
    AuthRecoverConfirmRequest,
    AuthRecoverRequest,
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
    VocabularyItemResponse,
    VocabularyUpsertRequest,
)
from app.security import (
    check_rate_limit,
    get_current_user,
    get_optional_user,
    hash_email,
    revoke_token,
    security_scheme,
)
from app.services.auth_provider import (
    AuthProviderError,
    AuthSessionData,
    SupabaseAuthProvider,
    get_auth_provider,
)
from app.services.ai_service import (
    generate_grammar_check,
    generate_ielts_evaluation,
    generate_tutor_feedback,
)
from app.services.progress_service import (
    apply_sync_mutation,
    record_quiz_attempt,
    upsert_vocabulary_item,
    vocabulary_item_response,
)

validate_auth_config(settings)

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
# AUTHENTICATION (Supabase Auth owns passwords, confirmation emails and resets;
# this API never stores a password or issues its own tokens)
# ==============================================================================
AUTH_ERROR_RESPONSES = {
    "invalid_credentials": (status.HTTP_401_UNAUTHORIZED, "Incorrect email or password."),
    "email_not_confirmed": (
        status.HTTP_403_FORBIDDEN,
        "Please confirm your email address, then sign in.",
    ),
    "already_registered": (
        status.HTTP_409_CONFLICT,
        "An account with this email address already exists.",
    ),
    "weak_password": (
        422,
        "Please choose a stronger password.",
    ),
    "invalid_recovery_code": (
        status.HTTP_400_BAD_REQUEST,
        "That reset code is incorrect or has expired. Please request a new one.",
    ),
    "rate_limited": (
        status.HTTP_429_TOO_MANY_REQUESTS,
        "Too many attempts. Please wait a few minutes and try again.",
    ),
}
AUTH_UNAVAILABLE_RESPONSE = (
    status.HTTP_503_SERVICE_UNAVAILABLE,
    "Sign-in is not available right now. Please try again later.",
)
EMAIL_CONFIRMATION_MESSAGE = (
    "Check your email to confirm your address, then sign in. "
    "If you already have an account, sign in or reset your password."
)
PASSWORD_RESET_SENT_MESSAGE = "If an account exists for this email, a reset code has been sent."


def _auth_http_error(error: AuthProviderError) -> HTTPException:
    status_code, detail = AUTH_ERROR_RESPONSES.get(error.kind, AUTH_UNAVAILABLE_RESPONSE)
    return HTTPException(status_code=status_code, detail=detail)


def _ensure_profile(db: Session, session: AuthSessionData) -> Profile:
    """
    Creates the profile at the first verified sign-in rather than at sign-up: while email
    confirmation is on, Supabase can return a placeholder user that must not get a profile.
    """
    profile = db.query(Profile).filter(Profile.id == session.user_id).first()
    if profile:
        return profile

    email = session.email.strip().lower()
    if db.query(Profile).filter(Profile.email == email).first():
        # Never hand an existing profile's data to a different login identity.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is linked to another account. Please contact support.",
        )

    profile = Profile(id=session.user_id, email=email, display_name=session.display_name[:120])
    db.add(profile)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent first sign-in for this user created the profile first.
        db.rollback()
        profile = db.query(Profile).filter(Profile.id == session.user_id).first()
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email is linked to another account. Please contact support.",
            )
        return profile
    db.refresh(profile)
    return profile


def _auth_response(profile: Profile, session: AuthSessionData) -> AuthResponse:
    return AuthResponse(
        user_id=profile.id,
        email=profile.email,
        display_name=profile.display_name,
        access_token=session.access_token,
        expires_in=session.expires_in,
    )


@app.post(f"{settings.api_v1_str}/auth/register", response_model=AuthResponse, status_code=201)
def register_user(
    payload: AuthRegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
    auth_provider: SupabaseAuthProvider = Depends(get_auth_provider),
):
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"auth:{client_ip}", max_per_minute=20)

    try:
        session = auth_provider.sign_up(payload.email, payload.password, payload.display_name.strip())
    except AuthProviderError as error:
        raise _auth_http_error(error)

    if session is None:
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={
                "status": "confirmation_required",
                "email": payload.email,
                "message": EMAIL_CONFIRMATION_MESSAGE,
            },
        )
    return _auth_response(_ensure_profile(db, session), session)


@app.post(f"{settings.api_v1_str}/auth/login", response_model=AuthResponse)
def login_user(
    payload: AuthLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    auth_provider: SupabaseAuthProvider = Depends(get_auth_provider),
):
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"auth:{client_ip}", max_per_minute=20)

    cleaned_email = payload.email.strip().lower()
    check_rate_limit(f"login:{cleaned_email}", max_per_minute=10)

    try:
        session = auth_provider.sign_in(cleaned_email, payload.password)
    except AuthProviderError as error:
        raise _auth_http_error(error)
    return _auth_response(_ensure_profile(db, session), session)


@app.post(f"{settings.api_v1_str}/auth/recover")
def recover_password(
    payload: AuthRecoverRequest,
    request: Request,
    auth_provider: SupabaseAuthProvider = Depends(get_auth_provider),
):
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"reset:{client_ip}", max_per_minute=10)

    try:
        auth_provider.request_password_reset(payload.email.strip().lower())
    except AuthProviderError as error:
        raise _auth_http_error(error)
    return {"status": "dispatched", "message": PASSWORD_RESET_SENT_MESSAGE}


@app.post(f"{settings.api_v1_str}/auth/recover/confirm")
def confirm_password_recovery(
    payload: AuthRecoverConfirmRequest,
    request: Request,
    auth_provider: SupabaseAuthProvider = Depends(get_auth_provider),
):
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"reset:{client_ip}", max_per_minute=10)

    cleaned_email = payload.email.strip().lower()
    check_rate_limit(f"recover:{cleaned_email}", max_per_minute=5)

    try:
        auth_provider.confirm_password_reset(cleaned_email, payload.code.strip(), payload.new_password)
    except AuthProviderError as error:
        raise _auth_http_error(error)
    return {"status": "password_updated", "message": "Your password has been changed. Please sign in."}


@app.post(f"{settings.api_v1_str}/auth/logout")
def logout_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    current_user: Profile = Depends(get_current_user),
    auth_provider: SupabaseAuthProvider = Depends(get_auth_provider),
):
    if credentials and credentials.credentials:
        revoke_token(credentials.credentials)
        try:
            auth_provider.sign_out(credentials.credentials)
        except AuthProviderError:
            # This token is already revoked here and expires soon, so don't fail the sign-out.
            pass
    return {"status": "logged_out", "user_id": current_user.id}


@app.delete(f"{settings.api_v1_str}/auth/account")
def delete_user_account(
    payload: AccountDeletionRequestModel = AccountDeletionRequestModel(),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
    auth_provider: SupabaseAuthProvider = Depends(get_auth_provider),
):
    """
    Permanently deletes the authenticated user's profile and all associated personal data
    (progress, quiz attempts, vocabulary, speaking sessions, grammar checks, IELTS attempts)
    via ON DELETE CASCADE, revokes the active session token, and records an anonymized audit log.
    """
    user_id = current_user.id
    email_digest = hash_email(current_user.email)

    # Delete the login first: if this fails nothing is lost and the user can retry, whereas the
    # reverse order could leave a working login behind after telling the user it was deleted.
    try:
        auth_provider.delete_user(user_id)
    except AuthProviderError as error:
        raise _auth_http_error(error)

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
    return record_quiz_attempt(db, current_user, payload)


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
    return [vocabulary_item_response(item) for item in items]


@app.post(f"{settings.api_v1_str}/vocabulary", response_model=VocabularyItemResponse)
def upsert_vocabulary(
    payload: VocabularyUpsertRequest,
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return vocabulary_item_response(upsert_vocabulary_item(db, current_user, payload))


# ==============================================================================
# OFFLINE SYNC BATCH ENDPOINT
# ==============================================================================
@app.post(f"{settings.api_v1_str}/sync/batch", response_model=SyncBatchResponse)
def sync_offline_mutations(
    payload: SyncBatchRequest,
    current_user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Applies each mutation on its own and reports the outcome per mutation id. The response is
    200 even when some fail, so "synced" and "results" must be read rather than the status code.
    """
    user_id = current_user.id
    results = [apply_sync_mutation(db, current_user, mutation) for mutation in payload.mutations]
    confirmed = sum(1 for result in results if result.status in ("applied", "duplicate"))
    return SyncBatchResponse(
        synced=confirmed == len(results),
        processed_count=confirmed,
        failed_count=len(results) - confirmed,
        user_id=user_id,
        results=results,
    )


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
