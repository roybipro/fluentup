# Changelog

All notable changes to FluentUp. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Project docs: `CLAUDE.md` (agent guide), `PRD.md`, `ARCHITECTURE.md` (as built), `DESIGN.md`, `FIX_PROMPT.md` (ranked fix list).

### Security
- Login now verifies a bcrypt password hash; register stores the hash, never plaintext. Existing accounts without a hash can't log in until they reset their password. Migration `0001_password_hash` adds `profiles.password_hash`.
- Removed the hardcoded JWT secret fallback. Outside development/test the API refuses to start unless `SUPABASE_JWT_SECRET` is at least 32 characters; dev/test get a random per-process secret.
- `POST /progress/quiz` ignores client-sent `xp_reward` and `passing_score`. XP and pass marks come from the server lesson catalog (`apps/backend/app/data/lessons.json`), and an unknown `lesson_id` returns 404. A mobile test keeps the catalog in step with `curriculum.ts`.
- AI endpoints (`/ai/tutor`, `/ai/grammar-check`, `/ai/ielts-evaluate`) require sign-in. A missing or invalid token is a 401, never anonymous; guests use the app's on-device engine. The daily quota is reserved with one conditional `UPDATE`, so concurrent requests can't go over it. A request is refunded when the deterministic fallback answered instead of Gemini. IELTS responses now include `providerStatus`.
- The access token is stored in `expo-secure-store` (Android Keystore / iOS Keychain), not plaintext AsyncStorage. A token left by an older build is moved over once at startup.
- Release builds no longer fall back to `http://10.0.2.2` or a placeholder host. They need `EXPO_PUBLIC_API_BASE_URL` set to an `https://` URL, which is checked at runtime and fails production EAS builds early. Only `__DEV__` builds use the emulator fallback.
- The Gemini API key is sent in the `x-goog-api-key` header instead of the `?key=` query string, so it stays out of URLs and logs.

### Fixed
- Offline progress is no longer lost. `POST /sync/batch` now requires sign-in and saves each queued quiz result and flashcard review in one transaction. A `sync_receipts` table (migration `0002_sync_receipts`) makes retries idempotent. The response gives a status for each item (`ok` / `duplicate` / `error`). The app removes only acknowledged items from its queue, keeps items added while a sync is in flight, and keeps guests' queues on the device until they sign in.
- Account deletion no longer claims success when the server call fails. Local data is wiped only after the server confirms with a 2xx. Otherwise the user stays signed in and sees an error in English and Bengali.
- Logging out no longer deletes unsynced progress without asking. The app tries to sync first. If anything is still unsynced, it warns in English and Bengali and logs out only if the user confirms.
- API and storage failures are no longer swallowed silently. AI calls still fall back to the on-device engine, and development builds now log why. Corrupt saved state is logged on startup.
- A non-numeric `Content-Length` header now returns 400 instead of crashing the request with a 500. The body size cap also applies to chunked uploads with no `Content-Length`.
- Alembic is now the only source of schema. The app no longer runs `create_all` at import. A new baseline migration `0000_baseline` builds the full schema from an empty database, and a test fails if migrations and models drift. `npm run backend:dev` runs migrations first.

## [0.1.0] — 2026-10-26

### Added
- Monorepo layout, docs and Supabase schema with RLS policies (phases 1–2).
- Expo mobile app: onboarding and placement, lessons, SM-2 flashcards, AI tutor, grammar checker, Speaking Lab, Listening Studio, IELTS hub, progress and profile with light/dark theme (phases 3–4).
- FastAPI backend: JWT auth, AI service with Gemini 2.5 Flash and deterministic fallback, account deletion portal, GitHub Actions CI (phases 5–6).
- Native Android project (target SDK 36), Play Store assets and release docs (phases 7–8).
- EAS project link and a standalone preview APK build profile (`99e4aac`).

### Fixed
- Mobile lockfile synced with `package.json` so CI installs cleanly (`0894060`).
