# FluentUp — Google Play Console Store Listing & Compliance Package

## 1. Store Listing Copy

- **App Title (max 30 chars):** `FluentUp: AI English & IELTS` (28 chars)
- **Short Description (max 80 chars):**
  `Practice English daily with an AI tutor, Bengali explanations, vocab & IELTS.` (77 chars)
- **Primary Category:** `Education`
- **Tags:** `Language Learning`, `Education`, `English`, `Study Guide`
- **Monetization / Pricing:** `Free` (No in-app ads; optional server-verified tier architecture ready for future releases)

### Full Description (max 4,000 chars)

Practice English every day with a personal AI tutor, understand your mistakes in Bengali or English, and build real-world communication skills for university, job interviews, travel, and IELTS.

FluentUp is designed for Bengali-speaking and international learners who want structured, practical English improvement—even on budget Android phones and unreliable mobile networks.

**KEY FEATURES:**

1. **Structured CEFR & IELTS Learning Paths (A1 to C1 + IELTS)**
   - Step-by-step lessons covering Beginner, Elementary, Intermediate, Upper-Intermediate, Advanced, and IELTS Preparation.
   - Every lesson includes clear learning objectives, bilingual (বাংলা + English) explanations, audio examples, and interactive exercises (multiple choice, sentence ordering, fill-in-the-blanks, sentence construction, grammar correction, and vocabulary recall).

2. **Contextual AI English Tutor**
   - Practice real-world conversations across 6 core scenarios: Daily Life, University Thesis Discussions, Airport Transit, Software Engineering Job Interviews, Executive Presentations, and Technical Discussions.
   - Receive structured feedback after every turn: corrected sentence, mistake explanations in Bengali and English, natural rewrite, useful scenario vocabulary, and a follow-up prompt.

3. **Sentence & Paragraph Grammar Checker**
   - Check sentences or paragraphs instantly while preserving your original input.
   - Understand the exact grammar rule behind each fix and practice with a generated exercise.

4. **Spaced-Repetition (SM-2) Vocabulary Notebook**
   - Save words with Bengali meanings, English definitions, phonetic pronunciation, and example sentences.
   - Smart SM-2 scheduling calculates your optimal review interval (`Again`, `Hard`, `Good`, `Easy`) so you retain vocabulary long term.

5. **Speaking Lab & Offline-Capable Listening Studio**
   - Record your voice only when you explicitly tap Record, edit your transcript, and listen to natural pronunciation via Text-to-Speech.
   - Practice listening comprehension with speed controls (`0.8x`, `1.0x`, `1.15x`), bilingual transcripts, and explained quizzes.

6. **Practical IELTS Preparation Module**
   - Practice IELTS Speaking Parts 1, 2, and 3 with cue cards and preparation timers, Academic Reading passages, and Writing Task 1 & Task 2 prompts.
   - Receive criteria-by-criteria practice feedback (*clearly labeled as unofficial self-study estimates; FluentUp is not affiliated with official IELTS test partners*).

7. **Built for Real Networks & Privacy**
   - Offline progress caching and automatic synchronization when connectivity returns.
   - Full in-app and web account & personal data deletion controls.

### Release Notes (v1.0.0 — Initial Production Release)
```
<en-US>
• Initial release of FluentUp (v1.0.0, versionCode 1).
• 6 structured learning paths from Beginner (A1) to Advanced (C1) and IELTS Preparation.
• Contextual AI English Tutor with Bengali & English mistake explanations.
• SM-2 Spaced Repetition Vocabulary Notebook and Offline Progress Sync.
• Speaking Lab, Listening Comprehension Studio, and Grammar Checker.
</en-US>
```

---

## 2. Generated Store Assets & Exact Play Console Dimensions

| Asset Type | File Path | Required Play Spec |
| :--- | :--- | :--- |
| **High-Res App Icon** | `store-assets/graphics/app-icon-512x512.png` | `512 x 512 px` 32-bit PNG |
| **Feature Graphic** | `store-assets/graphics/feature-graphic-1024x500.png` | `1024 x 500 px` PNG |
| **Phone Screenshot 1** | `store-assets/screenshots/phone/01-home-daily-streak-1080x1920.png` | 9:16 portrait PNG |
| **Phone Screenshot 2** | `store-assets/screenshots/phone/02-bilingual-lesson-quiz-1080x1920.png` | 9:16 portrait PNG |
| **Phone Screenshot 3** | `store-assets/screenshots/phone/03-ai-tutor-conversation-1080x1920.png` | 9:16 portrait PNG |
| **Phone Screenshot 4** | `store-assets/screenshots/phone/04-ielts-and-sm2-vocab-1080x1920.png` | 9:16 portrait PNG |

---

## 3. Required URLs & Contact Placeholders (Replace Before Submitting)

> **IMPORTANT:** Do not submit placeholder URLs to Google Play. Host the HTML files from `docs/legal/` on your production domain (e.g., GitHub Pages, Vercel, Cloudflare Pages, or your main domain) and update these fields in Play Console and `.env`:

- **Support Email:** `support@YOUR_DOMAIN_PLACEHOLDER.example.com`
- **Privacy Policy URL:** `https://YOUR_DOMAIN_PLACEHOLDER.example.com/privacy-policy.html` (Source file: [`docs/legal/privacy-policy.html`](../docs/legal/privacy-policy.html))
- **Account Deletion URL:** `https://YOUR_DOMAIN_PLACEHOLDER.example.com/delete-account.html` (Source file: [`docs/legal/delete-account.html`](../docs/legal/delete-account.html))
- **Terms of Service URL:** `https://YOUR_DOMAIN_PLACEHOLDER.example.com/terms-of-service.html` (Source file: [`docs/legal/terms-of-service.html`](../docs/legal/terms-of-service.html))

---

## 4. Google Play Console Data Safety Questionnaire Answers

| Data Category | Data Type | Collected? | Shared with Third Parties? | Ephemeral? | Required or Optional? | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Personal Info** | Name (`display_name`) | Yes | No | No | Optional (Guest mode supported) | App functionality, Account management |
| **Personal Info** | Email address | Yes | No (Stored in managed Supabase DB) | No | Optional (Required only for cloud sync) | App functionality, Account management |
| **Audio files** | Voice or sound recordings | No (Recorded locally in Speaking Lab only when user taps Record) | No | Yes | Optional | App functionality |
| **App activity** | App interactions / Lesson progress / Vocabulary | Yes | No | No | Required for progress tracking | App functionality, Personalization |
| **App info & performance** | Diagnostics / Crash logs | No sensitive user PII logged | No | Yes | Optional | App functionality |

- **Is all collected user data encrypted in transit?** **Yes** (HTTPS / TLS 1.3).
- **Do you provide a way for users to request that their account and associated data be deleted?** **Yes** (Both in-app at `Profile → Delete Account & Personal Data` and via the public Account Deletion URL).

---

## 5. Content Rating (IARC), Target Audience, Ads & App Access Declarations

1. **Content Rating (IARC Questionnaire):**
   - Category: **Reference, News, or Educational**.
   - Violence, Sexuality, Profanity, Controlled Substances, Gambling: **No** to all.
   - User-to-User Unmoderated Interaction: **No** (Users interact only with the private AI tutor, never with other users).
   - Expected Rating: **Everyone (PEGI 3 / USK 0 / IARC 3+)**.
2. **Target Audience and Content:**
   - Target Age Groups: **13–15, 16–17, 18 and over** (Students, university graduates, job seekers, adult learners).
   - Appeal to children under 13: **No** (Not designed for children; does not need Families Policy badge).
3. **Ads Declaration:**
   - **No, my app does not contain ads.**
4. **Permissions Justification:**
   - `android.permission.INTERNET`: Required to synchronize progress and communicate with the FastAPI / AI Tutor backend.
   - `android.permission.RECORD_AUDIO`: Requested at runtime only when the learner explicitly taps Record in the Speaking Lab.
   - `android.permission.POST_NOTIFICATIONS`: Optional study-reminder notifications.
5. **App Access Instructions for Google Play Reviewers:**
   - All core features (Onboarding, Placement Assessment, 6 Learning Paths, Quizzes, SM-2 Vocabulary, Grammar Checker, Listening Studio, and IELTS modules) work immediately in **Guest Mode** without login.
   - For cloud account testing, provide a dedicated reviewer email/password created in your production Supabase instance before submitting for review.
6. **Play Console Testing-Track Requirement (Personal Developer Accounts):**
   - If publishing from a personal Google Play Developer account created after November 2023, Google Play requires running a **Closed Testing track with at least 12–20 opted-in testers for 14 continuous days** before unlocking Production track access. Organization accounts with verified DUNS numbers can submit directly to Production after internal testing.
