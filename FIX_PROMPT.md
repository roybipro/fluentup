# Fix prompt — FluentUp security & correctness pass

> **Status (2026-11-20): all 20 items fixed on `fix/security-pass`.** Each has a regression test.
> Backend 41 pytest, mobile 30 Jest, typecheck clean. Migrations and a smoke test were also
> verified on Postgres 15. The list below is kept for history.
>
> | # | Commit | # | Commit | # | Commit | # | Commit |
> |---|---|---|---|---|---|---|---|
> | 0 | `415550a` | 5 | `1beee52` | 10 | `d982e6d` | 15 | `5d7303f` |
> | 1 | `ab54726` | 6 | `4abc030` | 11 | `afcab3f` | 16 | `a4496ac` |
> | 2 | `bfee6db` | 7 | `148be51` | 12 | `a9656d6` | 17 | `59557ec` |
> | 3 | `1f715dd` | 8 | `1186e8b` | 13 | `8a7cd23` | 18 | `00c39ad` |
> | 4 | `53fcb34` | 9 | `94b90bc` | 14 | `0eb38d1` | 19 | `d513e8d` |
>
> Notes:
> - #1: kept local auth with bcrypt (not the Supabase Auth alternative).
> - #5: AI endpoints require sign-in (not a per-IP anonymous quota); guests use the on-device engine.
> - #16: `/auth/recover` returns 501. Accounts created before bcrypt can't log in until password reset exists.
> - #17 also added the missing Postgres driver (`psycopg[binary]`).

Paste everything below the line into an AI coding agent (Claude Code, Copilot, etc.) at the repo root.

---

You are working in the FluentUp monorepo (`apps/mobile` = Expo/React Native + TypeScript, `apps/backend` = FastAPI + SQLAlchemy). Read `CLAUDE.md` first. Fix the issues below **in priority order**, one commit per numbered item. Do not refactor unrelated code. Every fix must ship with a test that fails before the fix and passes after.

Before you start, make the backend tests runnable:

- **0. Test tooling.** `npm run backend:test` fails with `ModuleNotFoundError: No module named 'app'`. Add `pythonpath = .` under `[pytest]` (create `apps/backend/pytest.ini` if absent). **Done when:** `npm run backend:test` passes from the repo root with no env vars.

## CRITICAL — release blockers

1. **Login accepts any password** — `apps/backend/app/main.py:138` (`login_user`) never verifies the password, and `register_user` (`main.py:104`) discards it.
   - Fix: hash on register (`bcrypt` or `argon2-cffi`; add to `requirements.txt`), store in a `password_hash` column (Alembic migration + model), verify with constant-time compare on login. Return the same 401 message for unknown email and wrong password.
   - Tests: wrong password → 401; unknown email → 401 with identical body; correct password → 200 + token.
   - *Alternative if the team prefers:* delete local auth and verify Supabase Auth JWTs only (matches `docs/ARCHITECTURE.md`). Pick one; don't keep both.

2. **Hardcoded JWT secret fallback** — `apps/backend/app/config.py:18`.
   - Fix: no default. If `ENVIRONMENT` is `production` (or not `development`/`test`) and `SUPABASE_JWT_SECRET` is missing or shorter than 32 chars, raise at startup.
   - Test: constructing settings with `ENVIRONMENT=production` and no secret raises.

## HIGH

3. **`/sync/batch` drops data** — `main.py:500` returns `synced: True` without persisting anything; `apps/mobile/src/services/apiClient.ts:126` then clears the offline queue.
   - Fix: persist each queued item (lesson progress, quiz attempts, vocab reviews) in one transaction, idempotent on `client_submission_id`. Return per-item results `{id, status: "ok" | "duplicate" | "error"}`. Mobile removes only items acknowledged `ok`/`duplicate`.
   - Tests: backend — same batch twice → rows written once; mobile — partial failure keeps the failed items queued.

4. **Client controls XP and pass mark** — `apps/backend/app/schemas.py:63` lets the client send `xp_reward` (≤200) and `passing_score` (≥50); `lesson_id` is not validated.
   - Fix: remove both from the request schema; look up the lesson server-side and use its `xp_reward` / `passing_score`. 404 on unknown `lesson_id`. Delete the dead validator at `schemas.py:67`.
   - Tests: sending `xp_reward: 200` has no effect; unknown lesson → 404.

5. **Unlimited anonymous AI calls** — `apps/backend/app/security.py:122` swallows invalid tokens (falls through as anonymous) and `main.py:515` skips the quota when there is no user.
   - Fix: invalid/expired token → 401 (never silently anonymous). AI endpoints require auth, or apply a strict per-IP anonymous quota. Make the quota check atomic (`UPDATE … SET used = used + 1 WHERE used < limit RETURNING`) so concurrent requests can't overshoot. Don't charge quota when the offline/deterministic fallback answered (`services/ai_service.py`).
   - Tests: garbage bearer token → 401; N+1 concurrent calls at quota N → exactly N succeed.

6. **Account deletion lies on failure** — `apiClient.ts:161` reports success even if the server call failed.
   - Fix: only clear local data and show success when the server returns 2xx; otherwise surface the error and keep the user signed in.
   - Test: mocked 500 → function rejects / returns failure, store untouched.

## MEDIUM

7. **Token in plaintext AsyncStorage** — `apps/mobile/src/store/useAppStore.ts:57`. Move the token to `expo-secure-store`; exclude it from the persisted Zustand slice. Migrate an existing token once on startup.
8. **Logout deletes unsynced work** — `useAppStore.ts:314` (`logoutUser`) clears the sync queue. Flush first; if flush fails, warn the user before discarding.
9. **Silent `catch {}`** — `apiClient.ts:66`, `:96`, `:117`. Log (dev) and return a typed error; never swallow.
10. **Unsafe API URL fallback** — `apiClient.ts:21` falls back to `http://10.0.2.2`. In production builds require `EXPO_PUBLIC_API_URL` and HTTPS; keep the emulator fallback only when `__DEV__`.
11. **In-memory revocation & rate limits** — `security.py:17`. Breaks with >1 Cloud Run instance. Move to Postgres (or Redis) tables. Use the `X-Forwarded-For` client IP only behind a trusted proxy setting.
12. **Gemini key in URL** — `services/ai_service.py:150` sends `?key=`. Use the `x-goog-api-key` header so the key doesn't land in logs.
13. **Request-size middleware** — `main.py:75` crashes on a non-numeric `Content-Length` and is bypassed by chunked bodies. Return 400 on bad header; cap the streamed body size.
14. **`create_all` at import** — `main.py:57` runs `Base.metadata.create_all` alongside Alembic. Remove it; migrations are the only schema source. Tests create tables in a fixture.

## LOW

15. `verify_aud: False` in JWT decode — set and verify `aud="authenticated"` (Supabase default).
16. `/auth/recover` is a stub returning success — return 501 or implement it.
17. Move `pytest`/test deps from `requirements.txt` to `requirements-dev.txt`; remove unused `pydantic-settings` (or actually use it in `config.py`).
18. CORS default `https://example.com` with `allow_credentials=True` — no default origins; require explicit config.
19. Grammar rewrite prepends "From my perspective," to questions — skip that rule when the sentence ends with `?`.

## Rules

- Keep the existing structure and conventions (see `CLAUDE.md`). No new frameworks.
- Run `npm run typecheck && npm test` after each item; all green before the next.
- Update `CHANGELOG.md` under **Unreleased → Fixed/Security** for each item.
- At the end, list anything you could not fix and why.
