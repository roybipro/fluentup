import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import AccountDeletionRequest, LessonProgress, Profile, QuizAttempt, UserVocabulary
from app.security import REVOKED_TOKENS, clear_rate_limits

# Use in-memory SQLite with StaticPool and foreign_keys=ON for fast, isolated integration tests
TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(TEST_ENGINE, "connect")
def _enable_sqlite_fk(dbapi_connection, connection_record):  # type: ignore
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_db_and_limits():
    Base.metadata.drop_all(bind=TEST_ENGINE)
    Base.metadata.create_all(bind=TEST_ENGINE)
    clear_rate_limits()
    REVOKED_TOKENS.clear()
    yield


def test_1_health_check_endpoint():
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["service"] == "FluentUp API"


def test_2_registration_login_and_duplicate_email_rejection():
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": "rafiq@example.com",
            "password": "StrongPassword123!",
            "display_name": "Rafiq Ahmed",
        },
    )
    assert reg.status_code == 201
    token = reg.json()["access_token"]
    assert token

    # Duplicate email returns 409 Conflict
    dup = client.post(
        "/api/v1/auth/register",
        json={
            "email": "RAFIQ@example.com",
            "password": "StrongPassword123!",
            "display_name": "Duplicate",
        },
    )
    assert dup.status_code == 409

    # Login succeeds
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "rafiq@example.com", "password": "StrongPassword123!"},
    )
    assert login.status_code == 200
    assert login.json()["email"] == "rafiq@example.com"


def test_3_user_data_isolation_prevents_cross_user_access():
    u1 = client.post(
        "/api/v1/auth/register",
        json={"email": "user1@example.com", "password": "Password123!", "display_name": "User One"},
    ).json()
    u2 = client.post(
        "/api/v1/auth/register",
        json={"email": "user2@example.com", "password": "Password123!", "display_name": "User Two"},
    ).json()

    headers_u1 = {"Authorization": f"Bearer {u1['access_token']}"}
    headers_u2 = {"Authorization": f"Bearer {u2['access_token']}"}

    # User 1 adds private vocabulary
    v_res = client.post(
        "/api/v1/vocabulary",
        headers=headers_u1,
        json={
            "word_or_phrase": "resilient",
            "meaning_bn": "প্রতিকূলতা জয়ী",
            "definition_en": "Able to recover quickly from difficulties.",
            "example_sentence": "She is resilient.",
        },
    )
    assert v_res.status_code == 200

    # User 2 cannot see User 1's vocabulary
    u2_vocab = client.get("/api/v1/vocabulary", headers=headers_u2).json()
    assert len(u2_vocab) == 0

    # User 2 attempting to read User 1's profile by ID is strictly forbidden (403)
    forbidden = client.get(f"/api/v1/profile/{u1['user_id']}", headers=headers_u2)
    assert forbidden.status_code == 403


def test_4_progress_and_xp_consistency_prevents_duplicate_xp():
    u = client.post(
        "/api/v1/auth/register",
        json={"email": "xp@example.com", "password": "Password123!", "display_name": "XP Tester"},
    ).json()
    headers = {"Authorization": f"Bearer {u['access_token']}"}

    # First passing submission awards 25 XP
    q1 = client.post(
        "/api/v1/progress/quiz",
        headers=headers,
        json={
            "lesson_id": "lesson-beg-1",
            "client_submission_id": "sub-idempotent-100",
            "score_percent": 100,
            "correct_count": 6,
            "total_questions": 6,
            "xp_reward": 25,
            "passing_score": 70,
        },
    )
    assert q1.status_code == 200
    assert q1.json()["xp_earned"] == 25
    assert q1.json()["total_xp"] == 25
    assert q1.json()["duplicate_submission"] is False

    # Re-sending the exact same client_submission_id (network retry) awards 0 XP
    q1_retry = client.post(
        "/api/v1/progress/quiz",
        headers=headers,
        json={
            "lesson_id": "lesson-beg-1",
            "client_submission_id": "sub-idempotent-100",
            "score_percent": 100,
            "correct_count": 6,
            "total_questions": 6,
            "xp_reward": 25,
            "passing_score": 70,
        },
    )
    assert q1_retry.status_code == 200
    assert q1_retry.json()["xp_earned"] == 0
    assert q1_retry.json()["total_xp"] == 25
    assert q1_retry.json()["duplicate_submission"] is True

    # Re-taking the already completed lesson with a new submission ID also awards 0 duplicate XP
    q2 = client.post(
        "/api/v1/progress/quiz",
        headers=headers,
        json={
            "lesson_id": "lesson-beg-1",
            "client_submission_id": "sub-idempotent-101",
            "score_percent": 83,
            "correct_count": 5,
            "total_questions": 6,
            "xp_reward": 25,
            "passing_score": 70,
        },
    )
    assert q2.status_code == 200
    assert q2.json()["xp_earned"] == 0
    assert q2.json()["total_xp"] == 25


def test_5_api_validation_rejects_inconsistent_quiz_scores_and_empty_grammar():
    u = client.post(
        "/api/v1/auth/register",
        json={"email": "val@example.com", "password": "Password123!", "display_name": "Validator"},
    ).json()
    headers = {"Authorization": f"Bearer {u['access_token']}"}

    # Inconsistent score_percent (claims 100% when only 1/5 correct) -> 422
    bad_quiz = client.post(
        "/api/v1/progress/quiz",
        headers=headers,
        json={
            "lesson_id": "lesson-beg-1",
            "client_submission_id": "sub-bad-score",
            "score_percent": 100,
            "correct_count": 1,
            "total_questions": 5,
        },
    )
    assert bad_quiz.status_code == 422

    # Empty whitespace grammar text -> 422
    bad_grammar = client.post(
        "/api/v1/ai/grammar-check",
        headers=headers,
        json={"text": "   ", "explanationLanguage": "bn"},
    )
    assert bad_grammar.status_code == 422


def test_6_ai_provider_failure_handling_and_unofficial_ielts_disclaimers():
    # Without a live GEMINI_API_KEY, the endpoints must gracefully return validated fallback schemas
    tutor_res = client.post(
        "/api/v1/ai/tutor",
        json={
            "scenarioId": "scen-interview",
            "scenarioTitle": "Job Interview",
            "userMessage": "I am working here since 3 years and I did not went yesterday.",
            "explanationLanguage": "bn",
        },
    )
    assert tutor_res.status_code == 200
    tutor_data = tutor_res.json()
    assert "I have been working here for 3 years" in tutor_data["correctedSentence"]
    assert "did not go" in tutor_data["correctedSentence"]

    ielts_res = client.post(
        "/api/v1/ai/ielts-evaluate",
        json={
            "moduleType": "writing",
            "taskId": "ielts-wrt-t2",
            "promptText": "Public transport vs highways",
            "userResponse": "Although highways are useful, public transport reduces congestion. Furthermore, metro systems lower carbon emissions.",
        },
    )
    assert ielts_res.status_code == 200
    ielts_data = ielts_res.json()
    assert ielts_data["isUnofficialEstimate"] is True
    assert "UNOFFICIAL PRACTICE ESTIMATE" in ielts_data["disclaimer"]


def test_7_rate_limiting_blocks_excessive_requests():
    for _ in range(20):
        client.post(
            "/api/v1/auth/login",
            json={"email": "nonexistent@example.com", "password": "Password123!"},
        )
    # 21st auth request within 1 minute triggers 429 Too Many Requests
    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent@example.com", "password": "Password123!"},
    )
    assert blocked.status_code == 429


def test_8_account_deletion_cascades_all_personal_records_and_revokes_token():
    u = client.post(
        "/api/v1/auth/register",
        json={"email": "delete_me@example.com", "password": "Password123!", "display_name": "To Delete"},
    ).json()
    headers = {"Authorization": f"Bearer {u['access_token']}"}
    user_id = u["user_id"]

    # Create personal records across tables
    client.post(
        "/api/v1/vocabulary",
        headers=headers,
        json={"word_or_phrase": "ephemeral", "definition_en": "Lasting for a very short time."},
    )
    client.post(
        "/api/v1/progress/quiz",
        headers=headers,
        json={
            "lesson_id": "lesson-beg-1",
            "client_submission_id": "sub-del-test",
            "score_percent": 100,
            "correct_count": 4,
            "total_questions": 4,
        },
    )

    # Delete account
    del_res = client.request(
        "DELETE",
        "/api/v1/auth/account",
        headers=headers,
        json={"reason": "Privacy test deletion"},
    )
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True

    # Verify token is immediately revoked (401)
    after_me = client.get("/api/v1/profile/me", headers=headers)
    assert after_me.status_code == 401

    # Verify DB cascade removed Profile, LessonProgress, QuizAttempt, and UserVocabulary
    db = TestingSessionLocal()
    try:
        assert db.query(Profile).filter(Profile.id == user_id).count() == 0
        assert db.query(LessonProgress).filter(LessonProgress.user_id == user_id).count() == 0
        assert db.query(QuizAttempt).filter(QuizAttempt.user_id == user_id).count() == 0
        assert db.query(UserVocabulary).filter(UserVocabulary.user_id == user_id).count() == 0
        # Anonymized audit entry exists without plaintext email
        audit = db.query(AccountDeletionRequest).filter(AccountDeletionRequest.user_id == user_id).first()
        assert audit is not None
        assert "delete_me@example.com" not in audit.email_hash
    finally:
        db.close()


def test_login_rejects_wrong_password_and_unknown_email_identically():
    client.post(
        "/api/v1/auth/register",
        json={"email": "pw@example.com", "password": "CorrectHorse123!", "display_name": "PW"},
    )
    wrong = client.post("/api/v1/auth/login", json={"email": "pw@example.com", "password": "WrongPassword99"})
    unknown = client.post("/api/v1/auth/login", json={"email": "ghost@example.com", "password": "WrongPassword99"})
    assert wrong.status_code == 401
    assert unknown.status_code == 401
    assert wrong.json() == unknown.json()

    ok = client.post("/api/v1/auth/login", json={"email": "pw@example.com", "password": "CorrectHorse123!"})
    assert ok.status_code == 200
    assert ok.json()["access_token"]


def test_password_is_stored_hashed():
    client.post(
        "/api/v1/auth/register",
        json={"email": "hash@example.com", "password": "CorrectHorse123!", "display_name": "H"},
    )
    db = TestingSessionLocal()
    try:
        profile = db.query(Profile).filter(Profile.email == "hash@example.com").one()
        assert profile.password_hash and "CorrectHorse123!" not in profile.password_hash
    finally:
        db.close()


@pytest.mark.parametrize("secret", ["", "too-short"])
def test_production_settings_require_strong_jwt_secret(secret):
    from app.config import Settings

    with pytest.raises(ValueError, match="SUPABASE_JWT_SECRET"):
        Settings(environment="production", supabase_jwt_secret=secret)


def test_dev_settings_have_no_hardcoded_jwt_secret():
    from app.config import Settings

    a = Settings(environment="development", supabase_jwt_secret="")
    b = Settings(environment="development", supabase_jwt_secret="")
    assert len(a.supabase_jwt_secret) >= 32
    assert a.supabase_jwt_secret != b.supabase_jwt_secret


def _register(email: str) -> dict:
    res = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "display_name": "T"},
    )
    assert res.status_code == 201
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_client_cannot_set_xp_reward_or_passing_score():
    headers = _register("xpcheat@example.com")
    # lesson-beg-1 is worth 25 XP with a 70% pass mark on the server.
    cheat = client.post(
        "/api/v1/progress/quiz",
        headers=headers,
        json={
            "lesson_id": "lesson-beg-1",
            "client_submission_id": "sub-cheat-1",
            "score_percent": 60,
            "correct_count": 3,
            "total_questions": 5,
            "xp_reward": 200,
            "passing_score": 50,
        },
    )
    assert cheat.status_code == 200
    assert cheat.json()["passed"] is False
    assert cheat.json()["xp_earned"] == 0

    honest = client.post(
        "/api/v1/progress/quiz",
        headers=headers,
        json={
            "lesson_id": "lesson-beg-1",
            "client_submission_id": "sub-cheat-2",
            "score_percent": 100,
            "correct_count": 5,
            "total_questions": 5,
            "xp_reward": 200,
        },
    )
    assert honest.json()["xp_earned"] == 25


def test_unknown_lesson_returns_404():
    headers = _register("nolesson@example.com")
    res = client.post(
        "/api/v1/progress/quiz",
        headers=headers,
        json={
            "lesson_id": "lesson-does-not-exist",
            "client_submission_id": "sub-404",
            "score_percent": 100,
            "correct_count": 5,
            "total_questions": 5,
        },
    )
    assert res.status_code == 404


def _quiz_mutation(mid: str, sub_id: str, lesson_id: str = "lesson-beg-1") -> dict:
    return {
        "id": mid,
        "type": "lesson_quiz_completed",
        "payload": {
            "lessonId": lesson_id,
            "clientSubmissionId": sub_id,
            "scorePercent": 100,
            "correctCount": 5,
            "totalQuestions": 5,
            "xpEarned": 999,
        },
        "createdAt": "2026-11-20T10:00:00Z",
        "retryCount": 0,
    }


def _vocab_mutation(mid: str, word: str) -> dict:
    return {
        "id": mid,
        "type": "vocabulary_upserted",
        "payload": {
            "card": {
                "id": f"vocab-{word}",
                "wordOrPhrase": word,
                "meaningBn": "",
                "definitionEn": f"Definition of {word}",
                "exampleSentence": "",
                "phonetic": "/x/",
                "isFavorite": True,
                "repetitionNumber": 2,
                "easinessFactor": 2.6,
                "intervalDays": 3,
                "nextReviewAt": "2026-11-23T10:00:00Z",
                "lastReviewedAt": "2026-11-20T10:00:00Z",
                "reviewHistory": [],
            }
        },
        "createdAt": "2026-11-20T10:00:00Z",
        "retryCount": 0,
    }


def test_sync_batch_persists_items_and_is_idempotent():
    headers = _register("sync@example.com")
    batch = {"mutations": [_quiz_mutation("m-1", "sub-sync-1"), _vocab_mutation("m-2", "diligent")]}

    first = client.post("/api/v1/sync/batch", headers=headers, json=batch)
    assert first.status_code == 200
    assert [r["status"] for r in first.json()["results"]] == ["ok", "ok"]

    second = client.post("/api/v1/sync/batch", headers=headers, json=batch)
    assert second.status_code == 200
    assert [r["status"] for r in second.json()["results"]] == ["duplicate", "duplicate"]

    db = TestingSessionLocal()
    try:
        assert db.query(QuizAttempt).filter(QuizAttempt.client_submission_id == "sub-sync-1").count() == 1
        vocab = db.query(UserVocabulary).filter(UserVocabulary.word_or_phrase == "diligent").all()
        assert len(vocab) == 1
        assert vocab[0].interval_days == 3 and vocab[0].is_favorite is True
        # Client-claimed xpEarned (999) is ignored; lesson-beg-1 is worth 25.
        assert db.query(Profile).filter(Profile.email == "sync@example.com").one().total_xp == 25
    finally:
        db.close()


def test_sync_batch_partial_failure_reports_per_item_status():
    headers = _register("syncpartial@example.com")
    batch = {
        "mutations": [
            _quiz_mutation("p-1", "sub-partial-1"),
            _quiz_mutation("p-2", "sub-partial-2", lesson_id="lesson-missing"),
            _vocab_mutation("p-3", "tenacious"),
            {"id": "p-4", "type": "not_a_real_type", "payload": {}, "createdAt": "x", "retryCount": 0},
        ]
    }
    res = client.post("/api/v1/sync/batch", headers=headers, json=batch)
    assert res.status_code == 200
    assert [r["status"] for r in res.json()["results"]] == ["ok", "error", "ok", "error"]

    db = TestingSessionLocal()
    try:
        assert db.query(QuizAttempt).filter(QuizAttempt.client_submission_id == "sub-partial-1").count() == 1
        assert db.query(QuizAttempt).filter(QuizAttempt.client_submission_id == "sub-partial-2").count() == 0
        assert db.query(UserVocabulary).filter(UserVocabulary.word_or_phrase == "tenacious").count() == 1
    finally:
        db.close()

    # A failed item is retried later and succeeds once fixed (no receipt was stored for it).
    retry = client.post("/api/v1/sync/batch", headers=headers, json={"mutations": [_quiz_mutation("p-2", "sub-partial-2")]})
    assert retry.json()["results"][0]["status"] == "ok"


def test_sync_batch_requires_auth():
    res = client.post("/api/v1/sync/batch", json={"mutations": []})
    assert res.status_code == 401
