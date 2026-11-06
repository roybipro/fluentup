from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.main import app
from app.models import LessonProgress, QuizAttempt, UserVocabulary
from app.services import progress_service

from conftest import TEST_DATABASE_URL, TestingSessionLocal, client

SYNC_URL = "/api/v1/sync/batch"
postgres_only = pytest.mark.skipif(not TEST_DATABASE_URL, reason="Needs a real Postgres schema")


def _register(email="sync@example.com"):
    user = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "display_name": "Sync Tester"},
    ).json()
    return user["user_id"], {"Authorization": f"Bearer {user['access_token']}"}


def _quiz(submission_id, lesson_id="lesson-beg-1", **overrides):
    return {
        "id": f"sync-{submission_id}",
        "type": "lesson_quiz_completed",
        "payload": {
            "lessonId": lesson_id,
            "clientSubmissionId": submission_id,
            "scorePercent": 100,
            "correctCount": 4,
            "totalQuestions": 4,
            "passingScore": 70,
            "xpEarned": 25,
            "completedAt": "2026-11-01T10:00:00.000Z",
            **overrides,
        },
        "createdAt": "2026-11-01T10:00:00.000Z",
        "retryCount": 0,
    }


def _card_mutation(mutation_id, word="resilient", **card_overrides):
    return {
        "id": mutation_id,
        "type": "vocabulary_upserted",
        "payload": {
            "card": {
                "id": "vocab-1",
                "wordOrPhrase": word,
                "meaningBn": "প্রতিকূলতা জয়ী",
                "definitionEn": "Able to recover quickly.",
                "exampleSentence": "She is resilient.",
                "phonetic": "/rɪˈzɪl.jənt/",
                "isFavorite": True,
                "repetitionNumber": 0,
                "easinessFactor": 2.5,
                "intervalDays": 0,
                "nextReviewAt": "2026-11-01T10:00:00.000Z",
                "lastReviewedAt": None,
                "reviewHistory": [],
                **card_overrides,
            }
        },
        "createdAt": "2026-11-01T10:00:00.000Z",
        "retryCount": 0,
    }


def _reviewed(mutation_id, reviewed_at, repetition, interval, **overrides):
    return _card_mutation(
        mutation_id,
        repetitionNumber=repetition,
        easinessFactor=2.6,
        intervalDays=interval,
        nextReviewAt="2026-12-01T10:00:00.000Z",
        lastReviewedAt=reviewed_at,
        reviewHistory=[{"reviewedAt": reviewed_at, "rating": 4, "intervalDays": interval}],
        **overrides,
    )


def _sync(headers, *mutations):
    response = client.post(SYNC_URL, headers=headers, json={"mutations": list(mutations)})
    assert response.status_code == 200, response.text
    return response.json()


def _statuses(body):
    return {result["id"]: result["status"] for result in body["results"]}


def _total_xp(headers):
    return client.get("/api/v1/profile/me", headers=headers).json()["total_xp"]


def _stored_word(user_id, word="resilient"):
    db = TestingSessionLocal()
    try:
        return (
            db.query(UserVocabulary)
            .filter(UserVocabulary.user_id == user_id, UserVocabulary.word_or_phrase == word)
            .first()
        )
    finally:
        db.close()


def test_sync_requires_a_signed_in_user():
    assert client.post(SYNC_URL, json={"mutations": [_quiz("sub-guest")]}).status_code == 401
    bad_token = {"Authorization": "Bearer not-a-real-token"}
    assert (
        client.post(SYNC_URL, headers=bad_token, json={"mutations": [_quiz("sub-guest")]}).status_code
        == 401
    )

    db = TestingSessionLocal()
    try:
        assert db.query(QuizAttempt).count() == 0
    finally:
        db.close()


def test_applied_quiz_is_saved_with_xp_decided_by_the_server():
    user_id, headers = _register()

    body = _sync(headers, _quiz("sub-applied", xpEarned=9999))

    assert body["synced"] is True
    assert body["processed_count"] == 1
    assert body["failed_count"] == 0
    assert body["user_id"] == user_id
    assert _statuses(body) == {"sync-sub-applied": "applied"}
    assert _total_xp(headers) == 25

    db = TestingSessionLocal()
    try:
        attempt = db.query(QuizAttempt).filter(QuizAttempt.client_submission_id == "sub-applied").one()
        assert attempt.user_id == user_id
        assert attempt.xp_earned == 25
        progress = db.query(LessonProgress).filter(LessonProgress.user_id == user_id).one()
        assert progress.status == "completed"
        assert progress.xp_awarded is True
    finally:
        db.close()


def test_quiz_uses_the_lessons_passing_score():
    _, headers = _register()

    # 72% passes the server's default of 70 but not this lesson's 75.
    body = _sync(
        headers,
        _quiz(
            "sub-strict",
            lesson_id="lesson-upint-1",
            scorePercent=72,
            correctCount=18,
            totalQuestions=25,
            passingScore=75,
        ),
    )

    assert _statuses(body) == {"sync-sub-strict": "applied"}
    assert _total_xp(headers) == 0


def test_retried_quiz_is_confirmed_without_counting_twice():
    user_id, headers = _register()
    mutation = _quiz("sub-retry")

    _sync(headers, mutation)
    retry = _sync(headers, mutation)

    # The app removes a duplicate, so a lost response can't leave it queued forever.
    assert _statuses(retry) == {"sync-sub-retry": "duplicate"}
    assert retry["synced"] is True
    assert _total_xp(headers) == 25

    db = TestingSessionLocal()
    try:
        assert db.query(QuizAttempt).filter(QuizAttempt.user_id == user_id).count() == 1
        progress = db.query(LessonProgress).filter(LessonProgress.user_id == user_id).one()
        assert progress.attempts_count == 1
    finally:
        db.close()


def test_same_submission_repeated_inside_one_batch_counts_once():
    _, headers = _register()
    mutation = _quiz("sub-twice")

    body = _sync(headers, mutation, mutation)

    assert [result["status"] for result in body["results"]] == ["applied", "duplicate"]
    assert _total_xp(headers) == 25


def test_unknown_lesson_is_rejected_without_affecting_the_rest_of_the_batch():
    user_id, headers = _register()

    body = _sync(
        headers,
        _quiz("sub-before"),
        _quiz("sub-unknown", lesson_id="made-up-lesson"),
        _card_mutation("vocab-after"),
    )

    assert body["synced"] is False
    assert body["processed_count"] == 2
    assert body["failed_count"] == 1
    assert _statuses(body) == {
        "sync-sub-before": "applied",
        "sync-sub-unknown": "rejected",
        "vocab-after": "applied",
    }
    rejected = next(r for r in body["results"] if r["id"] == "sync-sub-unknown")
    assert rejected["detail"] == "Unknown lesson."
    assert _total_xp(headers) == 25
    assert _stored_word(user_id) is not None

    db = TestingSessionLocal()
    try:
        assert db.query(QuizAttempt).filter(QuizAttempt.lesson_id == "made-up-lesson").count() == 0
    finally:
        db.close()


@pytest.mark.parametrize(
    "mutation",
    [
        _quiz("sub-inconsistent", scorePercent=100, correctCount=1, totalQuestions=4),
        _quiz("sub-too-many", scorePercent=100, correctCount=5, totalQuestions=4),
        _quiz("sub-overflow", correctCount=2**40, totalQuestions=2**40),
        _quiz("sub\x00nul"),
        {
            "id": "missing-fields",
            "type": "lesson_quiz_completed",
            "payload": {"lessonId": "lesson-beg-1"},
            "createdAt": "2026-11-01T10:00:00.000Z",
        },
        {
            "id": "no-card",
            "type": "vocabulary_upserted",
            "payload": {},
            "createdAt": "2026-11-01T10:00:00.000Z",
        },
        _card_mutation("nul-word", word="bad\x00word"),
        _card_mutation("empty-definition", definitionEn=""),
        _card_mutation("low-easiness", easinessFactor=1.0),
        _card_mutation("bad-date", nextReviewAt="not a date"),
        _card_mutation("huge-interval", intervalDays=2**40),
        {
            "id": "unsupported",
            "type": "profile_updated",
            "payload": {},
            "createdAt": "2026-11-01T10:00:00.000Z",
        },
    ],
    ids=lambda mutation: mutation["id"],
)
def test_invalid_mutation_is_rejected_and_the_next_one_still_applies(mutation):
    _, headers = _register()

    body = _sync(headers, mutation, _quiz("sub-valid"))

    assert [result["status"] for result in body["results"]] == ["rejected", "applied"]
    assert body["results"][0]["detail"]
    assert _total_xp(headers) == 25


def test_rejection_does_not_echo_the_submitted_text():
    _, headers = _register()

    body = _sync(headers, _card_mutation("private", word="x" * 200))

    assert _statuses(body) == {"private": "rejected"}
    assert "x" * 200 not in body["results"][0]["detail"]


def test_submission_id_owned_by_another_user_is_rejected():
    _, first = _register("first@example.com")
    _, second = _register("second@example.com")
    _sync(first, _quiz("sub-shared"))

    body = _sync(second, _quiz("sub-shared"))

    assert _statuses(body) == {"sync-sub-shared": "rejected"}
    assert _total_xp(second) == 0


def test_database_failure_is_reported_as_failed_and_can_be_retried(monkeypatch):
    _, headers = _register()
    real_record = progress_service.record_quiz_attempt

    def fail_for_one_submission(db, user, payload):
        if payload.client_submission_id == "sub-flaky":
            raise OperationalError("INSERT", {}, Exception("connection lost"))
        return real_record(db, user, payload)

    monkeypatch.setattr(progress_service, "record_quiz_attempt", fail_for_one_submission)
    body = _sync(headers, _quiz("sub-flaky"), _quiz("sub-fine", lesson_id="lesson-beg-2"))

    assert _statuses(body) == {"sync-sub-flaky": "failed", "sync-sub-fine": "applied"}
    assert "connection lost" not in body["results"][0]["detail"]
    assert _total_xp(headers) == 30

    monkeypatch.setattr(progress_service, "record_quiz_attempt", real_record)
    assert _statuses(_sync(headers, _quiz("sub-flaky"))) == {"sync-sub-flaky": "applied"}
    assert _total_xp(headers) == 55


def test_vocabulary_snapshot_keeps_the_schedule_the_app_calculated():
    user_id, headers = _register()

    body = _sync(headers, _reviewed("review-1", "2026-11-01T10:00:00.000Z", 3, 8))

    assert _statuses(body) == {"review-1": "applied"}
    stored = _stored_word(user_id)
    assert stored.is_favorite is True
    assert stored.repetition_number == 3
    assert stored.easiness_factor == 2.6
    assert stored.interval_days == 8
    assert stored.last_reviewed_at is not None
    assert len(stored.review_history) == 1

    # The list endpoint reads back what the batch stored.
    listed = client.get("/api/v1/vocabulary", headers=headers).json()
    assert [(item["word_or_phrase"], item["interval_days"]) for item in listed] == [("resilient", 8)]


def test_retried_vocabulary_review_does_not_change_anything():
    user_id, headers = _register()
    mutation = _reviewed("review-1", "2026-11-01T10:00:00.000Z", 3, 8)
    _sync(headers, mutation)

    retry = _sync(headers, mutation)

    assert _statuses(retry) == {"review-1": "duplicate"}
    assert _stored_word(user_id).repetition_number == 3


def test_older_review_retried_after_a_newer_one_does_not_overwrite_it():
    user_id, headers = _register()
    _sync(headers, _reviewed("review-new", "2026-11-05T10:00:00+00:00", 4, 20))

    body = _sync(
        headers,
        _reviewed("review-old", "2026-11-01T10:00:00.000Z", 3, 8, isFavorite=False),
        _card_mutation("added-before-any-review", isFavorite=False),
    )

    assert _statuses(body) == {"review-old": "duplicate", "added-before-any-review": "duplicate"}
    stored = _stored_word(user_id)
    assert stored.repetition_number == 4
    assert stored.interval_days == 20
    assert stored.is_favorite is True


def test_newer_review_replaces_the_stored_schedule():
    user_id, headers = _register()
    _sync(headers, _card_mutation("added"))
    _sync(headers, _reviewed("review-1", "2026-11-01T10:00:00.000Z", 1, 1))

    body = _sync(headers, _reviewed("review-2", "2026-11-02T10:00:00.000Z", 2, 3))

    assert _statuses(body) == {"review-2": "applied"}
    stored = _stored_word(user_id)
    assert stored.repetition_number == 2
    assert stored.interval_days == 3


def test_vocabulary_endpoint_still_runs_sm2_when_given_a_rating():
    _, headers = _register()

    response = client.post(
        "/api/v1/vocabulary",
        headers=headers,
        json={"word_or_phrase": "resilient", "definition_en": "Able to recover.", "rating": 4},
    )

    assert response.status_code == 200
    assert response.json()["repetition_number"] == 1
    assert response.json()["interval_days"] == 1


def test_batch_over_the_size_limit_is_refused():
    _, headers = _register()
    mutations = [_quiz(f"sub-{index}") for index in range(101)]
    response = client.post(SYNC_URL, headers=headers, json={"mutations": mutations})
    assert response.status_code == 422


@postgres_only
def test_value_only_postgres_refuses_is_rejected_and_the_next_one_still_applies():
    user_id, headers = _register()
    mutation = _reviewed("nul-history", "2026-11-01T10:00:00.000Z", 1, 1)
    mutation["payload"]["card"]["reviewHistory"] = [{"note": "bad\x00value"}]

    body = _sync(headers, mutation, _quiz("sub-valid"))

    assert [result["status"] for result in body["results"]] == ["rejected", "applied"]
    assert _stored_word(user_id) is None
    assert _total_xp(headers) == 25


def _sync_in_thread(headers, *mutations):
    # Each thread gets its own client and, through get_db, its own database connection.
    with TestClient(app) as thread_client:
        response = thread_client.post(SYNC_URL, headers=headers, json={"mutations": list(mutations)})
    assert response.status_code == 200, response.text
    return response.json()


@postgres_only
def test_retry_sent_while_the_original_is_running_awards_xp_once():
    _, headers = _register()
    mutation = _quiz("sub-parallel")

    with ThreadPoolExecutor(max_workers=6) as pool:
        bodies = list(pool.map(lambda _: _sync_in_thread(headers, mutation), range(6)))

    statuses = sorted(body["results"][0]["status"] for body in bodies)
    assert statuses == ["applied"] + ["duplicate"] * 5
    assert _total_xp(headers) == 25


@postgres_only
def test_two_devices_syncing_different_lessons_keep_all_the_xp():
    _, headers = _register()
    lessons = ["lesson-beg-1", "lesson-beg-2", "lesson-elem-1", "lesson-int-1", "lesson-upint-1"]

    with ThreadPoolExecutor(max_workers=len(lessons)) as pool:
        bodies = list(
            pool.map(lambda lesson: _sync_in_thread(headers, _quiz(f"sub-{lesson}", lesson)), lessons)
        )

    assert all(body["results"][0]["status"] == "applied" for body in bodies)
    assert _total_xp(headers) == 25 + 30 + 30 + 35 + 40
