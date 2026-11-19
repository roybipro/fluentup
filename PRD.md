# PRD — FluentUp

**Status:** Pre-release (Android preview APK via EAS). **Last updated:** 2026-11-18.

## Problem

Bengali-speaking learners have few English apps that explain grammar in their own language, follow a clear level path, and prepare them for IELTS. General apps teach vocabulary but give little feedback on writing and speaking, and they need a constant connection.

## Target users

1. **Bengali-speaking learners** (students, job seekers, people planning to move abroad). They want explanations in Bengali and a path from beginner to confident.
2. **IELTS candidates** who need band-focused practice in all four skills.
3. **International learners** who prefer English-only explanations.

## Goals

- A learner can go from placement test to a daily study habit in under 3 minutes.
- Core learning (lessons, flashcards, quizzes) works offline and syncs later without losing progress.
- Instant feedback on writing and speaking via the AI tutor and grammar checker, with a deterministic fallback when AI is unavailable.
- Low running cost: free tiers of Supabase, Cloud Run and Gemini Flash at launch scale.

## Non-goals (v1)

- iOS release (code is cross-platform, store release is Android first).
- Live human tutors, chat between users, leaderboards.
- Paid subscriptions or ads.
- Languages other than English (target) and Bengali/English (explanation).

## Features

| Area | What it does | Status |
|---|---|---|
| Onboarding + placement | Short test sets CEFR level and explanation language (Bengali/English) | Built |
| Learn | Lessons by level, each with explanation, examples and a quiz; XP on pass | Built |
| Flashcards | SM-2 spaced repetition over the vocabulary deck | Built |
| Practice: AI tutor | Feedback on free-text answers (Gemini, offline fallback) | Built, quota not enforced correctly |
| Practice: grammar checker | Corrections with explanations | Built, rewrite rule bug on questions |
| Speaking Lab | Prompted speaking scenarios | Built |
| Listening Studio | Listening tracks with comprehension questions | Built |
| IELTS hub | Band-oriented practice by skill | Built |
| Progress | XP, streaks, mistakes list, level progress | Built |
| Profile | Theme (light/dark), explanation language, legal, sign out, delete account | Built |
| Offline sync | Queue progress offline, upload in batches | **Broken**: server drops batches |
| Accounts | Email + password register/login | **Broken**: password not checked |
| Account deletion | In-app and web portal (Play policy) | Built, reports success on failure |

## Success metrics

- Day-7 retention ≥ 25%.
- ≥ 60% of new users finish placement and one lesson in their first session.
- Zero reports of lost progress after sync.
- Average AI cost per active user per month < $0.05.
- Crash-free sessions ≥ 99.5%.

## Release blockers

Must be fixed before the Play Store production track. Details in [`FIX_PROMPT.md`](FIX_PROMPT.md):

1. Login accepts any password.
2. Hardcoded JWT secret fallback.
3. `/sync/batch` reports success without saving.
4. Client controls XP and pass mark.
5. Anonymous, unlimited AI calls.
6. Account deletion reports success on failure.

## Open questions

- Keep local email/password auth, or move fully to Supabase Auth as `docs/ARCHITECTURE.md` plans? (Pick one.)
- Should anonymous users get any AI calls at all, or require sign-in?
- Where does lesson content live long term: bundled `curriculum.ts` or the database?
