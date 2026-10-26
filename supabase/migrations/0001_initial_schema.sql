-- ============================================================================
-- FLUENTUP PRODUCTION POSTGRESQL SCHEMA & SUPABASE ROW LEVEL SECURITY (RLS)
-- Migration: 0001_initial_schema.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Profiles & Preferences
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(120) NOT NULL DEFAULT 'Learner',
    explanation_language VARCHAR(10) NOT NULL DEFAULT 'bn' CHECK (explanation_language IN ('bn', 'en')),
    proficiency_level VARCHAR(32) NOT NULL DEFAULT 'beginner' CHECK (proficiency_level IN ('beginner', 'elementary', 'intermediate', 'upper_intermediate', 'advanced', 'ielts')),
    learning_goal VARCHAR(64) NOT NULL DEFAULT 'general_fluency',
    daily_target_minutes INTEGER NOT NULL DEFAULT 15 CHECK (daily_target_minutes BETWEEN 5 AND 180),
    interests JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
    current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
    longest_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
    last_active_date DATE,
    subscription_tier VARCHAR(24) NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium')),
    ai_requests_today INTEGER NOT NULL DEFAULT 0 CHECK (ai_requests_today >= 0),
    ai_quota_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 2. Learning Paths (Curriculum Levels)
CREATE TABLE IF NOT EXISTS public.learning_paths (
    id VARCHAR(64) PRIMARY KEY,
    level VARCHAR(32) NOT NULL CHECK (level IN ('beginner', 'elementary', 'intermediate', 'upper_intermediate', 'advanced', 'ielts')),
    title_en VARCHAR(200) NOT NULL,
    title_bn VARCHAR(200) NOT NULL,
    description_en TEXT NOT NULL,
    description_bn TEXT NOT NULL,
    display_order INTEGER NOT NULL,
    content_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Lessons
CREATE TABLE IF NOT EXISTS public.lessons (
    id VARCHAR(64) PRIMARY KEY,
    path_id VARCHAR(64) NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
    prerequisite_lesson_id VARCHAR(64) REFERENCES public.lessons(id) ON DELETE SET NULL,
    title_en VARCHAR(200) NOT NULL,
    title_bn VARCHAR(200) NOT NULL,
    order_index INTEGER NOT NULL,
    xp_reward INTEGER NOT NULL DEFAULT 25 CHECK (xp_reward > 0),
    estimated_minutes INTEGER NOT NULL DEFAULT 8 CHECK (estimated_minutes > 0),
    objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
    explanations JSONB NOT NULL DEFAULT '[]'::jsonb,
    examples JSONB NOT NULL DEFAULT '[]'::jsonb,
    exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
    passing_score INTEGER NOT NULL DEFAULT 70 CHECK (passing_score BETWEEN 1 AND 100),
    content_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (path_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_lessons_path_id ON public.lessons(path_id);

-- 4. Lesson Progress
CREATE TABLE IF NOT EXISTS public.lesson_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id VARCHAR(64) NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    status VARCHAR(24) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
    best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score BETWEEN 0 AND 100),
    attempts_count INTEGER NOT NULL DEFAULT 0 CHECK (attempts_count >= 0),
    last_exercise_index INTEGER NOT NULL DEFAULT 0 CHECK (last_exercise_index >= 0),
    xp_awarded BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_id ON public.lesson_progress(user_id);

-- 5. Quiz Attempts (With client_submission_id for idempotency)
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id VARCHAR(64) NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    client_submission_id VARCHAR(128) NOT NULL UNIQUE,
    score_percent INTEGER NOT NULL CHECK (score_percent BETWEEN 0 AND 100),
    correct_count INTEGER NOT NULL CHECK (correct_count >= 0),
    total_questions INTEGER NOT NULL CHECK (total_questions > 0 AND correct_count <= total_questions),
    xp_earned INTEGER NOT NULL DEFAULT 0 CHECK (xp_earned >= 0),
    mistakes JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id ON public.quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_lesson_id ON public.quiz_attempts(lesson_id);

-- 6. User Vocabulary & Spaced Repetition Schedule (SM-2)
CREATE TABLE IF NOT EXISTS public.user_vocabulary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    word_or_phrase VARCHAR(160) NOT NULL,
    meaning_bn VARCHAR(255) NOT NULL DEFAULT '',
    definition_en TEXT NOT NULL,
    example_sentence TEXT NOT NULL DEFAULT '',
    phonetic VARCHAR(100) NOT NULL DEFAULT '',
    audio_key VARCHAR(120),
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    repetition_number INTEGER NOT NULL DEFAULT 0 CHECK (repetition_number >= 0),
    easiness_factor DOUBLE PRECISION NOT NULL DEFAULT 2.5 CHECK (easiness_factor >= 1.3),
    interval_days INTEGER NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
    next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_reviewed_at TIMESTAMPTZ,
    review_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, word_or_phrase)
);

CREATE INDEX IF NOT EXISTS idx_user_vocabulary_user_due ON public.user_vocabulary(user_id, next_review_at);

-- 7. Speaking Sessions & AI Conversation History
CREATE TABLE IF NOT EXISTS public.speaking_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    scenario_id VARCHAR(64) NOT NULL,
    mode VARCHAR(32) NOT NULL DEFAULT 'ai_tutor' CHECK (mode IN ('ai_tutor', 'speaking_prompt', 'ielts_speaking')),
    user_transcript TEXT NOT NULL,
    structured_feedback JSONB NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_speaking_sessions_user_id ON public.speaking_sessions(user_id);

-- 8. Grammar Checks
CREATE TABLE IF NOT EXISTS public.grammar_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    original_text TEXT NOT NULL,
    corrected_text TEXT NOT NULL,
    natural_rewrite TEXT NOT NULL,
    explanations JSONB NOT NULL DEFAULT '[]'::jsonb,
    practice_exercise JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grammar_checks_user_id ON public.grammar_checks(user_id);

-- 9. IELTS Practice Attempts
CREATE TABLE IF NOT EXISTS public.ielts_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    module_type VARCHAR(24) NOT NULL CHECK (module_type IN ('speaking', 'writing', 'reading', 'listening')),
    task_id VARCHAR(64) NOT NULL,
    user_response TEXT NOT NULL,
    evaluation JSONB NOT NULL,
    estimated_band DOUBLE PRECISION CHECK (estimated_band BETWEEN 0.0 AND 9.0),
    is_unofficial_estimate BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ielts_attempts_user_id ON public.ielts_attempts(user_id);

-- 10. Daily Activity Log
CREATE TABLE IF NOT EXISTS public.daily_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    xp_earned INTEGER NOT NULL DEFAULT 0 CHECK (xp_earned >= 0),
    minutes_studied INTEGER NOT NULL DEFAULT 0 CHECK (minutes_studied >= 0),
    lessons_completed INTEGER NOT NULL DEFAULT 0 CHECK (lessons_completed >= 0),
    reviews_completed INTEGER NOT NULL DEFAULT 0 CHECK (reviews_completed >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_activity_user_date ON public.daily_activity(user_id, activity_date);

-- 11. User Achievements
CREATE TABLE IF NOT EXISTS public.user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    achievement_code VARCHAR(64) NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, achievement_code)
);

-- 12. Account Deletion Audit Log (Anonymized after completion for GDPR/Play compliance)
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    email_hash VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending_verification')),
    reason VARCHAR(255),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- ============================================================================
-- SUPABASE ROW LEVEL SECURITY (RLS) POLICIES
-- Guarantees one user can NEVER read, modify, or delete another user's data.
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speaking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grammar_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ielts_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Public read-only access for curriculum tables
CREATE POLICY "Curriculum paths are viewable by everyone"
    ON public.learning_paths FOR SELECT USING (true);

CREATE POLICY "Lessons are viewable by everyone"
    ON public.lessons FOR SELECT USING (true);

-- Strict owner-only policies for private user tables
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can delete own profile"
    ON public.profiles FOR DELETE USING (auth.uid() = id);

CREATE POLICY "Users manage own lesson progress"
    ON public.lesson_progress FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own quiz attempts"
    ON public.quiz_attempts FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own vocabulary"
    ON public.user_vocabulary FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own speaking sessions"
    ON public.speaking_sessions FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own grammar checks"
    ON public.grammar_checks FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own ielts attempts"
    ON public.ielts_attempts FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own daily activity"
    ON public.daily_activity FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own achievements"
    ON public.user_achievements FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own deletion requests"
    ON public.account_deletion_requests FOR SELECT
    USING (auth.uid() = user_id);
