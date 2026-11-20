# CLAUDE.md

Guidance for AI coding agents working in this repo.

## What this is

**FluentUp** is an English-learning app for Bengali speakers and international learners. It covers CEFR beginner → advanced plus IELTS, with SM-2 flashcards, lessons, an AI tutor, a grammar checker, a Speaking Lab and a Listening Studio.

Monorepo:

| Path | Stack |
|---|---|
| `apps/mobile` | Expo (SDK 52+), React Native, TypeScript strict, expo-router, Zustand (persisted to AsyncStorage), TanStack Query, Zod, Jest |
| `apps/backend` | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, PyJWT (HS256), httpx, Gemini 2.5 Flash, pytest. Docker image on Python 3.13 |
| `supabase/migrations` | Postgres schema + RLS policies |
| `docs/` | Target architecture (`docs/ARCHITECTURE.md`), legal pages |
| `store-assets/` | Play Store listing |

Android package: `com.fluentup.app`, target SDK 36. Builds go through EAS (`apps/mobile/eas.json`).

## Commands (run from repo root, Node ≥ 20)

```bash
npm run mobile:start        # Expo dev server
npm run mobile:android      # run on Android emulator/device
npm run mobile:test         # Jest
npm run mobile:typecheck    # tsc --noEmit
npm run mobile:lint
npm run backend:migrate     # alembic upgrade head
npm run backend:dev         # migrate, then uvicorn app.main:app --reload --port 8000
npm run backend:test        # pytest
npm run typecheck && npm test   # what CI runs; must be green before you finish
```

Backend setup: `cd apps/backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`. Copy `.env.example` to `.env`.

## Gotchas

- Android emulator reaches the host at `10.0.2.2`. The API URL comes from `EXPO_PUBLIC_API_BASE_URL` (release builds require `https://`).
- `docs/ARCHITECTURE.md` describes the **target** design (Supabase Auth, SecureStore, idempotent XP). The code does not do all of that yet. Root `ARCHITECTURE.md` describes what actually runs.
- Alembic is the only schema source. The app never creates tables (`npm run backend:dev` runs `alembic upgrade head` first). Write a migration for every schema change; `tests/test_migrations.py` fails if migrations and models drift.

## Layout

```
apps/mobile/
  app/                 expo-router screens
    (tabs)/            index, learn, practice, progress, profile
    auth.tsx onboarding.tsx legal.tsx lesson/[id].tsx
  src/
    data/              curriculum.ts, practiceCatalog.ts (seed content)
    schemas/domain.ts  Zod domain types
    services/          apiClient.ts (HTTP + offline queue), learningEngine.ts (SM-2, placement)
    store/useAppStore.ts  Zustand store, persisted
    theme/colors.ts    light/dark tokens, useThemePalette()
    __tests__/
apps/backend/
  app/
    main.py            routes
    config.py          Settings from env
    security.py        JWT, revocation, rate limits
    models.py schemas.py database.py
    services/ai_service.py  Gemini + deterministic fallback
  alembic/  tests/
```

## Conventions

- TypeScript strict. Validate anything that crosses a boundary (API responses, storage) with Zod in `src/schemas`.
- Colors come from `useThemePalette()`. Never hard-code hex values in screens.
- User-facing copy is bilingual (English + Bengali). See `DESIGN.md`.
- Backend: Pydantic schemas in `schemas.py`, ORM models in `models.py`, one Alembic migration per schema change.
- Every bug fix ships with a test that fails before the fix.
- Update `CHANGELOG.md` under **Unreleased** for every user-visible or security change.
- Keep commits small, one concern each. Conventional Commit prefixes (`fix(backend):`, `feat(mobile):`).

## Security rules (do not regress)

- Never trust client-sent XP, scores or pass marks. The server looks them up.
- Never log or put secrets in URLs (API keys go in headers).
- An invalid token is a 401, never "anonymous".
- No default secrets in `config.py`. Production must fail to start without them.
- Tokens belong in `expo-secure-store`, not AsyncStorage.
- Don't clear the offline sync queue until the server acknowledges each item.

## Known issues (as of 2026-11-20)

All 20 items in [`FIX_PROMPT.md`](FIX_PROMPT.md) are fixed on `fix/security-pass`, with a regression test each. Auth is Supabase Auth (merged from `main`): the API never stores passwords or issues tokens. Still open:
- `npm run mobile:lint` fails: there is no ESLint config in the repo.
- `supabase/migrations/*.sql` and the Alembic migrations both describe the schema. Pick one owner before deploying to Supabase.
