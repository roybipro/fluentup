# Changelog

All notable changes to FluentUp. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Project docs: `CLAUDE.md` (agent guide), `PRD.md`, `ARCHITECTURE.md` (as built), `DESIGN.md`, `FIX_PROMPT.md` (ranked fix list).

### Security
- Login now verifies a bcrypt password hash; register stores the hash, never plaintext. Existing accounts without a hash can't log in until they reset their password. Migration `0001_password_hash` adds `profiles.password_hash`.
- Removed the hardcoded JWT secret fallback. Outside development/test the API refuses to start unless `SUPABASE_JWT_SECRET` is at least 32 characters; dev/test get a random per-process secret.
- `POST /progress/quiz` ignores client-sent `xp_reward` and `passing_score`. XP and pass marks come from the server lesson catalog (`apps/backend/app/data/lessons.json`), and an unknown `lesson_id` returns 404. A mobile test keeps the catalog in step with `curriculum.ts`.

### Fixed
- Offline progress is no longer lost. `POST /sync/batch` now requires sign-in and saves each queued quiz result and flashcard review in one transaction. A `sync_receipts` table (migration `0002_sync_receipts`) makes retries idempotent. The response gives a status for each item (`ok` / `duplicate` / `error`). The app removes only acknowledged items from its queue, keeps items added while a sync is in flight, and keeps guests' queues on the device until they sign in.

### Security — known issues (not yet fixed, see `FIX_PROMPT.md`)
- **HIGH:** missing or invalid tokens on AI endpoints fall through to anonymous, with no quota.
- **HIGH:** account deletion reports success even when the request fails.

## [0.1.0] — 2026-10-26

### Added
- Monorepo layout, docs and Supabase schema with RLS policies (phases 1–2).
- Expo mobile app: onboarding and placement, lessons, SM-2 flashcards, AI tutor, grammar checker, Speaking Lab, Listening Studio, IELTS hub, progress and profile with light/dark theme (phases 3–4).
- FastAPI backend: JWT auth, AI service with Gemini 2.5 Flash and deterministic fallback, account deletion portal, GitHub Actions CI (phases 5–6).
- Native Android project (target SDK 36), Play Store assets and release docs (phases 7–8).
- EAS project link and a standalone preview APK build profile (`99e4aac`).

### Fixed
- Mobile lockfile synced with `package.json` so CI installs cleanly (`0894060`).
