-- Lesson content ships inside the mobile app, so nothing fills public.lessons on the server.
-- These foreign keys rejected every quiz result and progress update, so lesson IDs are
-- stored as plain references to the app's curriculum instead.
ALTER TABLE public.lesson_progress DROP CONSTRAINT IF EXISTS lesson_progress_lesson_id_fkey;
ALTER TABLE public.quiz_attempts DROP CONSTRAINT IF EXISTS quiz_attempts_lesson_id_fkey;
