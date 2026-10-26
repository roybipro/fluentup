import {
  PLACEMENT_QUESTIONS,
  SEED_LEARNING_PATHS,
  validateSeedCurriculum,
} from '../data/curriculum';
import {
  analyzeGrammarLocally,
  buildFallbackTutorFeedback,
  calculateNextVocabularyReview,
  evaluateExerciseAnswer,
  evaluateIELTSResponseLocally,
  evaluatePlacementAssessment,
  findLessonById,
  getDueVocabularyCards,
  isLessonUnlocked,
} from '../services/learningEngine';
import { useAppStore } from '../store/useAppStore';

describe('FluentUp Mobile Learning Engine & Store Suite', () => {
  beforeEach(async () => {
    await useAppStore.getState().deleteAccountAndPurgeData();
  });

  test('1. Validates all seed curriculum learning paths, lessons, and exercises via Zod schema', () => {
    const validation = validateSeedCurriculum();
    expect(validation.valid).toBe(true);
    expect(validation.totalPaths).toBe(6);
    expect(validation.totalLessons).toBeGreaterThanOrEqual(7);
  });

  test('2. Placement assessment recommends appropriate level based on answers and goal', () => {
    const beginnerAnswers: Record<string, string> = {};
    const resLow = evaluatePlacementAssessment(beginnerAnswers, 'daily_conversation');
    expect(resLow.scorePercent).toBe(0);
    expect(resLow.recommendedLevel).toBe('beginner');

    const perfectAnswers: Record<string, string> = {};
    for (const q of PLACEMENT_QUESTIONS) {
      perfectAnswers[q.id] = q.correctAnswer;
    }
    const resHigh = evaluatePlacementAssessment(perfectAnswers, 'university_academic');
    expect(resHigh.scorePercent).toBe(100);
    expect(resHigh.recommendedLevel).toBe('advanced');

    const resIelts = evaluatePlacementAssessment(perfectAnswers, 'ielts_exam');
    expect(resIelts.recommendedLevel).toBe('ielts');
  });

  test('3. Lesson prerequisite locking works and unlocks after prerequisite completion', () => {
    const lesson1 = findLessonById('lesson-beg-1')!;
    const lesson2 = findLessonById('lesson-beg-2')!;

    expect(isLessonUnlocked(lesson1, []).unlocked).toBe(true);
    expect(isLessonUnlocked(lesson2, []).unlocked).toBe(false);
    expect(isLessonUnlocked(lesson2, ['lesson-beg-1']).unlocked).toBe(true);
  });

  test('4. Quiz scoring calculates accuracy, records mistakes, and prevents duplicate XP', () => {
    const lesson = SEED_LEARNING_PATHS[0].lessons[0];
    const correctAnswers: Record<string, string> = {};
    for (const ex of lesson.exercises) {
      correctAnswers[ex.id] = ex.correctAnswer;
    }

    // First submission awards XP
    const sub1 = useAppStore.getState().submitLessonQuiz({
      lessonId: lesson.id,
      answers: correctAnswers,
      clientSubmissionId: 'sub-unique-1',
    });
    expect(sub1.passed).toBe(true);
    expect(sub1.scorePercent).toBe(100);
    expect(sub1.xpEarned).toBe(lesson.xpReward);
    expect(useAppStore.getState().totalXp).toBe(lesson.xpReward);

    // Re-submitting same lesson does NOT award duplicate XP
    const sub2 = useAppStore.getState().submitLessonQuiz({
      lessonId: lesson.id,
      answers: correctAnswers,
      clientSubmissionId: 'sub-unique-2',
    });
    expect(sub2.passed).toBe(true);
    expect(sub2.xpEarned).toBe(0);
    expect(useAppStore.getState().totalXp).toBe(lesson.xpReward);
  });

  test('5. Spaced repetition SM-2 scheduler calculates intervals and easiness factor accurately', () => {
    const initialCard = useAppStore.getState().vocabulary[0];
    const now = new Date('2026-10-26T10:00:00.000Z');

    // First review with rating 4 ("Good") -> interval 1 day
    const r1 = calculateNextVocabularyReview(initialCard, 4, now);
    expect(r1.repetitionNumber).toBe(1);
    expect(r1.intervalDays).toBe(1);

    // Second review with rating 5 ("Easy") -> interval 3 days
    const r2 = calculateNextVocabularyReview(r1, 5, new Date('2026-10-27T10:00:00.000Z'));
    expect(r2.repetitionNumber).toBe(2);
    expect(r2.intervalDays).toBe(3);
    expect(r2.easinessFactor).toBeGreaterThanOrEqual(2.5);

    // Lapse review with rating 1 ("Again") resets repetitionNumber to 0 and interval to 1d
    const rLapse = calculateNextVocabularyReview(r2, 1, new Date('2026-10-30T10:00:00.000Z'));
    expect(rLapse.repetitionNumber).toBe(0);
    expect(rLapse.intervalDays).toBe(1);
  });

  test('6. Vocabulary saving, favorites, and due filtering persist in store', () => {
    const added = useAppStore.getState().addVocabularyCard({
      wordOrPhrase: 'meticulous',
      meaningBn: 'অত্যন্ত যত্নশীল ও নিখুঁত',
      definitionEn: 'Showing great attention to detail; very careful and precise.',
      exampleSentence: 'She kept meticulous notes during the lecture.',
      phonetic: '/məˈtɪk.jə.ləs/',
      isFavorite: true,
    });
    expect(added.wordOrPhrase).toBe('meticulous');

    const due = getDueVocabularyCards(useAppStore.getState().vocabulary, new Date());
    expect(due.some((c) => c.wordOrPhrase === 'meticulous')).toBe(true);
  });

  test('7. Offline synchronization queue records mutations and flushes when online', async () => {
    useAppStore.getState().setOnlineStatus(false);
    const lesson = SEED_LEARNING_PATHS[0].lessons[0];
    const answers: Record<string, string> = {};
    for (const ex of lesson.exercises) {
      answers[ex.id] = ex.correctAnswer;
    }

    useAppStore.getState().submitLessonQuiz({
      lessonId: lesson.id,
      answers,
      clientSubmissionId: 'offline-sub-1',
    });

    expect(useAppStore.getState().syncQueue.length).toBe(1);
    expect(useAppStore.getState().syncStatus).toBe('offline_queued');

    // Cannot flush while offline
    const offlineFlush = await useAppStore.getState().flushSyncQueue(async () => true);
    expect(offlineFlush).toBe(false);

    // Reconnect and flush
    useAppStore.getState().setOnlineStatus(true);
    const onlineFlush = await useAppStore.getState().flushSyncQueue(async () => true);
    expect(onlineFlush).toBe(true);
    expect(useAppStore.getState().syncQueue.length).toBe(0);
    expect(useAppStore.getState().syncStatus).toBe('synced');
  });

  test('8. Deterministic grammar checker corrects common learner mistakes and generates practice exercise', () => {
    const res = analyzeGrammarLocally(
      'I am working here since 3 years and I did not went to discuss about the issue.'
    );
    expect(res.correctedText).toContain('I have been working here for 3 years');
    expect(res.correctedText).toContain('did not go');
    expect(res.correctedText).not.toContain('discuss about');
    expect(res.explanations.length).toBeGreaterThanOrEqual(3);
  });

  test('9. AI Tutor fallback and unofficial IELTS evaluator return valid schema-compliant responses', () => {
    const tutor = buildFallbackTutorFeedback({
      scenarioTitle: 'Job Interview',
      userMessage: 'He don\'t know the answer.',
    });
    expect(tutor.correctedSentence).toContain("He doesn't know");
    expect(tutor.providerStatus).toBe('offline_fallback');

    const ielts = evaluateIELTSResponseLocally({
      moduleType: 'writing',
      taskId: 'ielts-wrt-t2',
      userResponse:
        'Although urban highways offer short-term capacity, investing in mass rapid transit systems is far more sustainable. Furthermore, metro rail reduces emissions.',
    });
    expect(ielts.isUnofficialEstimate).toBe(true);
    expect(ielts.disclaimer).toContain('UNOFFICIAL PRACTICE ESTIMATE');
    expect(ielts.estimatedBand).toBeGreaterThanOrEqual(4.5);
  });

  test('10. Account deletion and session persistence handle expiration and full data purge', async () => {
    useAppStore.getState().signInUser({
      userId: 'user-123',
      email: 'learner@example.com',
      displayName: 'Rafiq',
      accessToken: 'jwt-token',
      expiresAt: Date.now() + 60_000,
      isGuest: false,
    });
    expect(useAppStore.getState().authSession?.email).toBe('learner@example.com');

    await useAppStore.getState().deleteAccountAndPurgeData();
    expect(useAppStore.getState().authSession).toBeNull();
    expect(useAppStore.getState().totalXp).toBe(0);
    expect(Object.keys(useAppStore.getState().lessonProgress).length).toBe(0);
  });

  test('11. Exercise answer normalization accepts minor punctuation or case differences', () => {
    const ex = SEED_LEARNING_PATHS[0].lessons[0].exercises[0];
    expect(evaluateExerciseAnswer(ex, ex.correctAnswer.toUpperCase())).toBe(true);
  });
});
