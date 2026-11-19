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
npm run backend:dev         # uvicorn app.main:app --reload --port 8000
npm run backend:test        # pytest (see gotcha below)
npm run typecheck && npm test   # what CI runs; must be green before you finish
```

Backend setup: `cd apps/backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`. Copy `.env.example` to `.env`.

## Gotchas

- **`npm run backend:test` fails with `ModuleNotFoundError: No module named 'app'`** until `apps/backend/pytest.ini` has `pythonpath = .`. Workaround: `cd apps/backend && PYTHONPATH=. .venv/bin/pytest`.
- Android emulator reaches the host at `10.0.2.2`. The API URL comes from `EXPO_PUBLIC_API_URL`.
- `docs/ARCHITECTURE.md` describes the **target** design (Supabase Auth, SecureStore, idempotent XP). The code does not do all of that yet. Root `ARCHITECTURE.md` describes what actually runs.
- `main.py` calls `Base.metadata.create_all` at import, alongside Alembic. Don't rely on it. Write a migration for every schema change.

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

## Known broken (as of 2026-11-18)

Login does not check passwords, the JWT secret has a hardcoded fallback, `/sync/batch` drops data, and more. The full ranked list with file/line references and fixes is in [`FIX_PROMPT.md`](FIX_PROMPT.md). Do not ship a release until the CRITICAL and HIGH items there are fixed.
