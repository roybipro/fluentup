# Full prompt — fix every known bug and deploy FluentUp

Paste everything below the line into an AI coding agent (Claude Code etc.) at the repo root, on branch `fix/security-pass`.

---

You are working in the FluentUp monorepo:

- `apps/mobile`: Expo + React Native + TypeScript. Builds go through EAS, see `apps/mobile/eas.json`.
- `apps/backend`: FastAPI + SQLAlchemy + Alembic. Ships as a Docker image from `apps/backend/Dockerfile`.
- `supabase/migrations`: Postgres schema + RLS.

Read `CLAUDE.md`, `FIX_PROMPT.md` and `ARCHITECTURE.md` first. They are the source of truth. Work in two phases: **A. fix**, then **B. deploy**. Do not start phase B until phase A is green.

> **Update 2026-11-20:** Phase A's code fixes are done on `fix/security-pass`, merged with `main`'s Supabase Auth change. All 20 items are fixed, with commits listed in `FIX_PROMPT.md`. Backend has 87 tests, mobile 37, all green, and migrations pass on Postgres 15. PR: roybipro/fluentup#8. Still open from Phase A: the Docker image build and run checks (Docker wasn't running), the ESLint config, and green CI on the PR. `scripts/smoke_test.sh` now needs a real Supabase project (see B2.4). Start there, then go to Phase B.

## Ground rules

- Use one commit per numbered item, with Conventional Commit prefixes (`fix(backend):`, `fix(mobile):`, `chore:`, `ci:`).
- Every bug fix ships with a test that fails before the fix and passes after it.
- After every item, run `npm run typecheck && npm test` and `npm run backend:test`. All must be green before you move on.
- Update `CHANGELOG.md` under **Unreleased → Fixed / Security** for every user-visible or security change.
- Don't refactor unrelated code, and don't add new frameworks. Follow the conventions in `CLAUDE.md`: colors via `useThemePalette()`, bilingual copy, Zod at boundaries, and one Alembic migration per schema change.
- Never commit secrets. Never put secrets in URLs or logs.
- **Stop and ask me** before anything that needs my accounts, money or credentials:
  - creating cloud projects
  - setting secrets
  - publishing to Play Store
  - pushing to `main`
  - running migrations against the production DB

  Give me the exact command to run instead.

## Phase A — Fix the bugs

**Already done on this branch. Verify, don't redo.** Read the code and run the tests to confirm:

- **0.** `pytest.ini` has `pythonpath = .` (commit `415550a`).
- **1.** bcrypt password hashing and verification (`ab54726`), with migration `alembic/versions/0001_add_profile_password_hash.py`. Confirm these tests exist: wrong password → 401, unknown email → identical 401, correct password → 200. Add any that are missing.
- **2.** No JWT secret fallback (`bfee6db`). Confirm `ENVIRONMENT=production` without a 32+ character `SUPABASE_JWT_SECRET` raises at startup, and that a test covers it.

**Still open. Fix in this order.** File and line references are in `FIX_PROMPT.md`.

### HIGH (release blockers)

3. `/sync/batch` (`main.py:508`) persists nothing, yet the mobile client clears its queue.
   - Persist each item in one transaction, idempotent on `client_submission_id`.
   - Return per-item `{id, status: "ok" | "duplicate" | "error"}`.
   - Mobile (`apiClient.ts`) removes only `ok`/`duplicate` items.
   - Tests: same batch twice → rows written once; partial failure keeps the failed items queued.
4. Client controls XP and pass mark (`schemas.py:63-64`, used at `main.py:324-341`).
   - Remove `xp_reward` and `passing_score` from the request.
   - Look up the lesson server-side, and return 404 for an unknown `lesson_id`.
   - Tests: sending `xp_reward: 200` has no effect; unknown lesson → 404.
5. Anonymous unlimited AI calls.
   - An invalid or expired token → 401, never anonymous.
   - AI endpoints require auth, or apply a strict per-IP quota.
   - Make the quota check atomic (`UPDATE … WHERE used < limit RETURNING`).
   - Don't charge quota when the deterministic fallback answered.
   - Tests: garbage token → 401; N+1 concurrent calls at quota N → exactly N succeed.
6. Account deletion reports success when the server call failed (`apiClient.ts`).
   - Clear local data only on a 2xx response. Otherwise show the error and keep the user signed in.
   - Test: a mocked 500 leaves the store untouched.

### MEDIUM

7. Move the token from AsyncStorage to `expo-secure-store`. Exclude it from the persisted Zustand slice, and migrate an existing token once on startup.
8. `logoutUser` must flush the sync queue before clearing it. If the flush fails, warn the user (bilingual copy) before discarding.
9. Remove the silent `catch {}` blocks in `apiClient.ts`. Return typed errors and log in `__DEV__`.
10. A production build requires `EXPO_PUBLIC_API_URL`, and it must be `https://`. Keep the `10.0.2.2` fallback only when `__DEV__`.
11. Move token revocation and rate limits from memory to Postgres tables (with a migration). Trust `X-Forwarded-For` only when a `TRUSTED_PROXY` setting is on. This is required because Cloud Run runs more than one instance.
12. Gemini: send the key in the `x-goog-api-key` header, not `?key=`.
13. Request-size middleware: return 400 on a non-numeric `Content-Length`, and cap streamed and chunked bodies.
14. Remove `Base.metadata.create_all` from `main.py`. Migrations are the only schema source, and tests create tables in a fixture.

### LOW

15. JWT decode verifies `aud="authenticated"`.
16. `/auth/recover` returns 501, or is properly implemented.
17. Move the test dependencies to `requirements-dev.txt`, and drop the unused `pydantic-settings`. Update CI to install the dev requirements.
18. CORS has no default origins, and `CORS_ORIGINS` must be explicit in production.
19. The grammar rewrite must not prepend "From my perspective," to questions (sentences ending in `?`).

### Phase A is done when

- [ ] `npm run typecheck && npm test` and `npm run backend:test` are green from a clean checkout.
- [ ] `apps/backend/.venv/bin/alembic upgrade head` runs cleanly on an empty Postgres (start one with Docker), and `alembic downgrade base` works too.
- [ ] `docker build -t fluentup-api apps/backend` succeeds.
- [ ] `docker run` with `ENVIRONMENT=production` and no secrets **fails to start**.
- [ ] With valid env vars, `/health` returns 200.
- [ ] `fluentup_dev.db` and other local DB files are git-ignored and untracked.
- [ ] Review the untracked `.agents/`, `bipro/` and `skills-lock.json`. Commit or ignore them deliberately, and ask me if unsure.
- [ ] `FIX_PROMPT.md` has each item marked done or explained.
- [ ] I've opened a PR `fix/security-pass` → `main` with a summary, and CI is green.

## Phase B — Deploy

The target stack is **Supabase** (Postgres + Auth), **Google Cloud Run** (API), **EAS** (Android builds) and the **Google Play internal testing track**. If any of these isn't set up, tell me exactly what to create and wait.

### B1. Database (Supabase)

1. I provide the Supabase project ref and the DB URL as env vars. Never hard-code them.
2. Reconcile `supabase/migrations/*.sql` with the Alembic migrations, so one source owns each table and RLS stays enabled on every user table.
3. Give me the command to apply migrations to production (`alembic upgrade head` with `DATABASE_URL` set). Don't run it yourself.

### B2. Backend API (Cloud Run)

1. Add `apps/backend/.env.example` entries and a short `docs/DEPLOY.md` that lists every required env var:
   - `ENVIRONMENT=production`
   - `DATABASE_URL`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (the API refuses to start without them)
   - `SUPABASE_JWT_SECRET` only if the project still signs with the legacy shared secret (≥32 characters); otherwise tokens are checked with the project's JWKS
   - `GEMINI_API_KEY`
   - `CORS_ALLOWED_ORIGINS` (only if a web client exists; the Android app needs none)
   - `TRUSTED_PROXY_HOPS=1` (check it against a real request on Cloud Run)
   - any rate-limit and quota settings
2. Secrets go in **Google Secret Manager** and are mounted into Cloud Run. Never pass them as plain `--set-env-vars`.
3. Add `.github/workflows/deploy-backend.yml`. On push to `main`, after CI passes, it should:
   - build the image
   - push it to Artifact Registry
   - run `alembic upgrade head` as a Cloud Run job
   - deploy the service

   Authenticate with Workload Identity Federation, not a JSON key. Use `--min-instances=0`, `--max-instances` small, and a request timeout of 60 s.
4. Smoke-test the deployed URL:
   - `GET /health` → 200
   - register, then login → 200
   - wrong password → 401
   - AI call with no token → 401
   - `/sync/batch` round trip persists rows

   This already exists: run `scripts/smoke_test.sh "$API_URL/api/v1"`. It registers a throwaway account, so turn off "Confirm email" in Supabase Auth for a staging project, or the register step returns 202 and the script stops.

### B3. Mobile app (EAS → Play)

1. Set `EXPO_PUBLIC_API_BASE_URL` (the URL including `/api/v1`) to the Cloud Run HTTPS URL as an EAS environment variable, per profile (`preview`, `production`). Don't put it in `eas.json` if it differs per environment.
2. Confirm the release config in `app.config.ts`:
   - `versionCode` is bumped (remote `appVersionSource` + `autoIncrement` is already on)
   - `usesCleartextTraffic=false`
   - no debug flags
3. Give me these commands to run:
   - `cd apps/mobile && eas build -p android --profile preview` (APK for my own phone)
   - `eas build -p android --profile production` (AAB)
   - `eas submit -p android --profile production` (Play internal track, draft)
4. Play Store listing checklist:
   - Data Safety form matches what the app collects. Check the `store-assets/` and `docs/legal/` pages.
   - The privacy policy and account-deletion URLs are publicly hosted. GitHub Pages from `docs/legal` is fine; add the workflow.
   - Content rating and target audience are complete.
   - Screenshots come from the actual build.

### B4. After deploy

- Update `RELEASE_STATUS.md` with:
  - the deployed API URL
  - the build number
  - the test results with real command output
  - what's verified vs not verified
- Move the `CHANGELOG.md` Unreleased section to the version being released.
- List anything you could not do and why, and anything that's waiting on me.

## Final report I expect

1. A table of items 0–19: status, commit hash and test name.
2. CI and deploy workflow links.
3. The deployed API URL and smoke-test output.
4. EAS build links.
5. A checklist of the manual steps still waiting on me: secrets, Play Console, migrations.
