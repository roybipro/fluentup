"""
Applies learning progress for a user. The direct endpoints and the offline sync batch both go
through here, so a result is scored and stored the same way however it reaches the server.

Every function that changes data commits its own transaction. Rejections are raised as
HTTPException: the endpoints pass them straight on and the sync batch records them per mutation.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy.exc import DataError, IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import LessonProgress, Profile, QuizAttempt, UserVocabulary
from app.schemas import (
    QuizSubmissionRequest,
    QuizSubmissionResponse,
    SyncMutationItem,
    SyncMutationResult,
    VocabularyItemResponse,
    VocabularySnapshot,
    VocabularyUpsertRequest,
)

logger = logging.getLogger(__name__)

# Lesson content ships in the mobile app, so this is the server's record of which lessons exist
# and what they award. A mobile test keeps it in step with the app's curriculum.
LESSON_XP_REWARDS: Dict[str, int] = json.loads(
    (Path(__file__).parent.parent / "lesson_catalog.json").read_text(encoding="utf-8")
)


def _commit(db: Session, conflict_detail: str) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=conflict_detail)
    except DataError:
        # Postgres refuses some values SQLite stores, such as NUL characters in JSON.
        db.rollback()
        raise HTTPException(status_code=422, detail="The submitted data could not be stored.")


def record_quiz_attempt(
    db: Session, user: Profile, payload: QuizSubmissionRequest
) -> QuizSubmissionResponse:
    xp_reward = LESSON_XP_REWARDS.get(payload.lesson_id)
    if xp_reward is None:
        raise HTTPException(status_code=422, detail="Unknown lesson.")

    if payload.correct_count > payload.total_questions:
        raise HTTPException(
            status_code=422,
            detail="correct_count cannot exceed total_questions.",
        )

    expected_pct = round((payload.correct_count / payload.total_questions) * 100)
    if abs(expected_pct - payload.score_percent) > 1:
        raise HTTPException(
            status_code=422,
            detail="Inconsistent score_percent relative to correct_count and total_questions.",
        )

    # Handle one submission per user at a time. A retry sent while the original is still running
    # then sees it as a duplicate, and two devices syncing at once can't overwrite each other's XP.
    db.refresh(user, with_for_update=True)

    # Check idempotency key first
    existing_attempt = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.client_submission_id == payload.client_submission_id)
        .first()
    )
    if existing_attempt:
        if existing_attempt.user_id != user.id:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Submission ID belongs to another user.",
            )
        response = QuizSubmissionResponse(
            lesson_id=existing_attempt.lesson_id,
            client_submission_id=existing_attempt.client_submission_id,
            score_percent=existing_attempt.score_percent,
            passed=existing_attempt.score_percent >= payload.passing_score,
            xp_earned=0,
            total_xp=user.total_xp,
            duplicate_submission=True,
        )
        db.rollback()  # Releases the lock; nothing was changed.
        return response

    progress = (
        db.query(LessonProgress)
        .filter(
            LessonProgress.user_id == user.id,
            LessonProgress.lesson_id == payload.lesson_id,
        )
        .first()
    )

    passed = payload.score_percent >= payload.passing_score
    already_awarded = bool(progress and progress.xp_awarded)
    xp_earned = xp_reward if (passed and not already_awarded) else 0

    now = datetime.now(timezone.utc)
    if not progress:
        progress = LessonProgress(
            user_id=user.id,
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
        user_id=user.id,
        lesson_id=payload.lesson_id,
        client_submission_id=payload.client_submission_id,
        score_percent=payload.score_percent,
        correct_count=payload.correct_count,
        total_questions=payload.total_questions,
        xp_earned=xp_earned,
        mistakes=payload.mistakes,
    )
    db.add(attempt)

    user.total_xp += xp_earned
    _commit(db, "Concurrent duplicate quiz submission detected.")

    db.refresh(user)
    return QuizSubmissionResponse(
        lesson_id=payload.lesson_id,
        client_submission_id=payload.client_submission_id,
        score_percent=payload.score_percent,
        passed=passed,
        xp_earned=xp_earned,
        total_xp=user.total_xp,
        duplicate_submission=False,
    )


def vocabulary_item_response(item: UserVocabulary) -> VocabularyItemResponse:
    return VocabularyItemResponse(
        id=item.id,
        word_or_phrase=item.word_or_phrase,
        meaning_bn=item.meaning_bn,
        definition_en=item.definition_en,
        example_sentence=item.example_sentence,
        phonetic=item.phonetic,
        is_favorite=item.is_favorite,
        repetition_number=item.repetition_number,
        easiness_factor=item.easiness_factor,
        interval_days=item.interval_days,
        next_review_at=item.next_review_at.isoformat(),
    )


def _find_vocabulary_item(db: Session, user: Profile, word: str) -> Optional[UserVocabulary]:
    return (
        db.query(UserVocabulary)
        .filter(UserVocabulary.user_id == user.id, UserVocabulary.word_or_phrase == word)
        .first()
    )


def upsert_vocabulary_item(
    db: Session,
    user: Profile,
    payload: VocabularyUpsertRequest,
    snapshot: Optional[VocabularySnapshot] = None,
) -> UserVocabulary:
    """
    Saves a word. Its review schedule comes either from the server's SM-2 step, when the payload
    has a rating, or from a schedule the app already calculated offline, passed as snapshot.
    """
    word_clean = payload.word_or_phrase.strip()
    existing = _find_vocabulary_item(db, user, word_clean)
    now = datetime.now(timezone.utc)

    if not existing:
        existing = UserVocabulary(
            user_id=user.id,
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

    if snapshot is not None:
        existing.repetition_number = snapshot.repetitionNumber
        existing.easiness_factor = snapshot.easinessFactor
        existing.interval_days = snapshot.intervalDays
        existing.next_review_at = _as_utc(snapshot.nextReviewAt)
        existing.last_reviewed_at = _as_utc(snapshot.lastReviewedAt) if snapshot.lastReviewedAt else None
        existing.review_history = snapshot.reviewHistory

    _commit(db, "Concurrent vocabulary update detected.")
    db.refresh(existing)
    return existing


def _as_utc(value: datetime) -> datetime:
    """SQLite returns datetimes without a timezone and Postgres with one; both hold UTC."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


# ==============================================================================
# OFFLINE SYNC: maps the app's queued mutations onto the functions above
# ==============================================================================
def _apply_quiz_mutation(db: Session, user: Profile, payload: Dict[str, Any]) -> bool:
    # xpEarned is deliberately not read: the server works out the reward itself.
    fields = {
        "lesson_id": "lessonId",
        "client_submission_id": "clientSubmissionId",
        "score_percent": "scorePercent",
        "correct_count": "correctCount",
        "total_questions": "totalQuestions",
        "passing_score": "passingScore",
    }
    request = QuizSubmissionRequest.model_validate(
        {field: payload[key] for field, key in fields.items() if key in payload}
    )
    return record_quiz_attempt(db, user, request).duplicate_submission


def _apply_vocabulary_mutation(db: Session, user: Profile, payload: Dict[str, Any]) -> bool:
    """
    The mutation carries the card's whole state, not a change to it, so replaying it is harmless.
    Reviews can reach the server out of order when an earlier one failed and is retried, so a
    snapshot no newer than the stored review is confirmed without being applied.
    """
    snapshot = VocabularySnapshot.model_validate(payload.get("card"))
    request = VocabularyUpsertRequest(
        word_or_phrase=snapshot.wordOrPhrase,
        meaning_bn=snapshot.meaningBn,
        definition_en=snapshot.definitionEn,
        example_sentence=snapshot.exampleSentence,
        phonetic=snapshot.phonetic,
        is_favorite=snapshot.isFavorite,
    )

    existing = _find_vocabulary_item(db, user, request.word_or_phrase.strip())
    if existing is not None and existing.last_reviewed_at is not None:
        stored = _as_utc(existing.last_reviewed_at)
        incoming = _as_utc(snapshot.lastReviewedAt) if snapshot.lastReviewedAt else None
        if incoming is None or incoming <= stored:
            db.rollback()
            return True

    upsert_vocabulary_item(db, user, request, snapshot=snapshot)
    return False


SYNC_APPLIERS: Dict[str, Callable[[Session, Profile, Dict[str, Any]], bool]] = {
    "lesson_quiz_completed": _apply_quiz_mutation,
    "vocabulary_upserted": _apply_vocabulary_mutation,
}


def apply_sync_mutation(db: Session, user: Profile, mutation: SyncMutationItem) -> SyncMutationResult:
    """
    Applies one mutation in its own transaction, so a failure can't undo or block the others.
    "rejected" means the server refused the data; "failed" means it could not process it right now.
    The app only removes a mutation once it is "applied" or "duplicate".
    """

    def result(status_value: str, detail: Optional[str] = None) -> SyncMutationResult:
        return SyncMutationResult(id=mutation.id, type=mutation.type, status=status_value, detail=detail)

    applier = SYNC_APPLIERS.get(mutation.type)
    if applier is None:
        return result("rejected", "Unsupported mutation type.")

    try:
        duplicate = applier(db, user, mutation.payload)
    except ValidationError as error:
        # Names the invalid fields without echoing the user's data back.
        fields = sorted({".".join(str(part) for part in e["loc"]) or "payload" for e in error.errors()})
        return result("rejected", f"Invalid fields: {', '.join(fields)}.")
    except HTTPException as error:
        db.rollback()
        retryable = error.status_code == status.HTTP_409_CONFLICT
        return result("failed" if retryable else "rejected", str(error.detail))
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Could not apply sync mutation of type %s", mutation.type)
        return result("failed", "The server could not save this update. It will be retried.")
    return result("duplicate" if duplicate else "applied")
