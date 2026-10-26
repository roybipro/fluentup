# FluentUp — Production English Learning & AI Tutor (Monorepo)

> **"Practice English every day with a personal AI tutor, understand your mistakes, and build real-world communication skills."**

FluentUp is a production-grade Android application and FastAPI backend engineered for Bengali-speaking and international English learners. It combines structured CEFR/IELTS curriculum paths, contextual AI conversation practice, a sentence/paragraph grammar checker, an SM-2 spaced-repetition vocabulary notebook, a permission-gated Speaking Lab, an offline-capable Listening Studio, and an IELTS Preparation module.

---

## 1. Repository Structure

```text
.
├── .env.example                     # Environment variable reference (placeholders only)
├── .github/workflows/ci.yml         # GitHub Actions CI pipeline (Backend Pytest + Mobile TypeScript & Jest)
├── apps/
│   ├── mobile/                      # React Native + Expo SDK 52 + Expo Router + TypeScript (Strict)
│   │   ├── app/                     # Expo Router screens: (tabs)/, onboarding, auth, lesson/[id], legal
│   │   ├── assets/                  # App icon, adaptive icon, splash screen, bundled WAV audio
│   │   ├── src/
│   │   │   ├── data/                # Structured curriculum & practice catalog (Beginner..Advanced + IELTS)
│   │   │   ├── schemas/             # Zod runtime validation schemas
│   │   │   ├── services/            # Learning engine, SM-2 scheduler, API client with offline fallback
│   │   │   ├── store/               # Zustand persistent state & offline sync queue
│   │   │   └── __tests__/           # Jest unit & integration test suite
│   │   ├── app.config.ts            # Production Android config (com.fluentup.app, Target SDK 36)
│   │   └── eas.json                 # EAS Build profiles (development APK, staging AAB, production AAB)
│   └── backend/                     # Python FastAPI + SQLAlchemy 2.0 + Pydantic v2 + Alembic
│       ├── app/
│       │   ├── main.py              # API routers, CORS, request size limits, idempotency, account deletion
│       │   ├── models.py            # Normalized SQLAlchemy ORM models with foreign keys & check constraints
│       │   ├── schemas.py           # Strict Pydantic v2 request/response schemas
│       │   ├── security.py          # JWT authentication, sliding-window rate limiter, token revocation
│       │   └── services/ai_service.py # Server-side Gemini LLM integration + deterministic fallback
│       ├── alembic/                 # Database migration environment
│       ├── tests/test_api.py        # Pytest integration, security, isolation, and deletion suite
│       └── Dockerfile               # Non-root production container with healthcheck
├── supabase/
│   └── migrations/0001_initial_schema.sql # Normalized PostgreSQL DDL + Row Level Security (RLS) policies
├── docs/
│   ├── ARCHITECTURE.md              # System architecture, ER diagram, and production cost model
│   └── legal/                       # Public HTML pages: privacy-policy.html, terms-of-service.html, delete-account.html
├── store-assets/
│   ├── STORE_LISTING.md             # Google Play title, descriptions, Data Safety, IARC, and review notes
│   ├── graphics/                    # 512x512 app icon & 1024x500 feature graphic
│   └── screenshots/phone/           # 9:16 phone screenshots
└── RELEASE_STATUS.md                # Comprehensive verification report, test evidence & Play release checklist
```

---

## 2. Local Development Setup

### Prerequisites
- **Node.js** `>= 20.x` and `npm`
- **Python** `3.11+` (tested on Python `3.13`)
- **Android Studio / Android SDK** (for local emulator or physical device via USB debugging) or **EAS CLI** for cloud Android App Bundle builds.

### Step 1: Configure Environment Variables
```bash
cp .env.example .env
cp .env.example apps/mobile/.env
cp .env.example apps/backend/.env
```

### Step 2: Run the FastAPI Backend & Tests
```bash
python3 -m venv apps/backend/.venv
apps/backend/.venv/bin/pip install -r apps/backend/requirements.txt

# Run the backend test suite
PYTHONPATH=apps/backend apps/backend/.venv/bin/pytest apps/backend/tests -v

# Start the development server on port 8000
cd apps/backend && .venv/bin/uvicorn app.main:app --reload --port 8000
```

### Step 3: Run the Mobile App & Tests
```bash
cd apps/mobile
npm install --legacy-peer-deps

# Run strict TypeScript validation
npm run typecheck

# Run the mobile Jest test suite
npm test -- --ci

# Start Expo Metro Bundler
npx expo start
```

---

## 3. Supabase & Database Migration Setup

1. Create a new project in [Supabase](https://supabase.com/).
2. Open the **SQL Editor** in the Supabase Dashboard and run [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql) to provision all 12 normalized tables, foreign keys, indexes, and Row Level Security (`auth.uid() = user_id`) policies.
3. Alternatively, point `DATABASE_URL` in `apps/backend/.env` to your Supabase connection string and run Alembic migrations:
   ```bash
   cd apps/backend
   .venv/bin/alembic upgrade head
   ```

---

## 4. Android Development & Production Release Build (.aab)

### Option A: Cloud Production Build via EAS Build (Recommended if Android SDK/JDK is not installed locally)
```bash
cd apps/mobile
npx eas-cli login
APP_ENV=production EXPO_PUBLIC_APP_ENV=production npx eas-cli build --platform android --profile production
```
EAS generates a signed production Android App Bundle (`.aab`) configured with package ID `com.fluentup.app`, `versionCode: 1`, and `targetSdkVersion: 36`.

### Option B: Local Native Android Prebuild & Gradle Release Bundle
When Java JDK 17 and the Android SDK (`ANDROID_HOME`) are installed locally:
```bash
cd apps/mobile
APP_ENV=production EXPO_PUBLIC_APP_ENV=production npx expo prebuild --platform android --clean

# Generate an upload keystore OUTSIDE the repository:
keytool -genkeypair -v -storetype PKCS12 \
  -keystore ~/fluentup-upload-key.jks \
  -alias fluentup-upload -keyalg RSA -keysize 2048 -validity 10000

# Build the signed release Android App Bundle (.aab):
cd android
./gradlew bundleRelease
```
The resulting artifact is output to `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`.

### Physical Device Installation & Verification Instructions
1. Enable **Developer Options** and **USB Debugging** on your Android phone (Android 7.0 / API 24 or higher).
2. Connect via USB and verify connection with `adb devices`.
3. To test the release AAB on a physical device using Google's `bundletool`:
   ```bash
   bundletool build-apks --bundle=app-release.aab --output=fluentup.apks \
     --ks=~/fluentup-upload-key.jks --ks-key-alias=fluentup-upload
   bundletool install-apks --apks=fluentup.apks
   ```
4. Verify:
   - Onboarding & Placement Assessment complete and persist after force-closing the app.
   - Toggling Airplane Mode queues lesson completions offline and syncs when connectivity returns.
   - Microphone permission prompt appears **only** when tapping Record in `Practice → Speaking`.
   - `Profile → Delete Account & Personal Data` clears all local and server records.
