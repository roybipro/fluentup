import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  ExplanationLanguage,
  GrammarCheckResult,
  IELTSEvaluation,
  OnboardingPreferences,
  ProficiencyLevel,
  VocabularyCard,
} from '../schemas/domain';
import { SEED_VOCABULARY_CARDS } from '../data/curriculum';
import {
  calculateNextVocabularyReview,
  findLessonById,
  QuizSubmissionResult,
  scoreLessonQuiz,
} from '../services/learningEngine';

export const STORAGE_KEY = 'fluentup.app.state.v1';
/** The access token lives only in the OS keychain/keystore, never in the AsyncStorage blob. */
export const AUTH_TOKEN_KEY = 'fluentup.auth.accessToken';
/** Server caps a sync batch at 200 mutations and the body at 256 KB; stay well under both. */
export const SYNC_BATCH_SIZE = 50;

async function writeAuthToken(token: string | null): Promise<void> {
  try {
    if (token) {
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    }
  } catch (error) {
    if (__DEV__) console.warn('[auth] secure token write failed', error);
  }
}

async function readAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch (error) {
    if (__DEV__) console.warn('[auth] secure token read failed', error);
    return null;
  }
}

export interface LessonProgressRecord {
  lessonId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  bestScore: number;
  attemptsCount: number;
  lastExerciseIndex: number;
  xpAwarded: boolean;
  completedAt: string | null;
  updatedAt: string;
}

export interface MistakeItem {
  id: string;
  lessonId: string;
  exerciseId: string;
  promptEn: string;
  promptBn: string;
  userAnswer: string;
  correctAnswer: string;
  explanationEn: string;
  explanationBn: string;
  createdAt: string;
}

export interface SyncQueueMutation {
  id: string;
  type: 'lesson_quiz_completed' | 'vocabulary_upserted' | 'profile_updated' | 'grammar_checked' | 'ielts_completed';
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}

/** Resolves to the ids of mutations the server acknowledged ("ok" or "duplicate"). */
export type SyncExecutor = (mutations: SyncQueueMutation[]) => Promise<string[]>;

export interface AuthSession {
  userId: string;
  email: string;
  displayName: string;
  accessToken: string;
  expiresAt: number; // epoch ms
  isGuest: boolean;
}

export interface AppState {
  // Hydration & UI
  isHydrated: boolean;
  themeMode: 'light' | 'dark';
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'offline_queued' | 'error';
  lastSyncedAt: string | null;

  // Auth & Onboarding
  authSession: AuthSession | null;
  hasCompletedOnboarding: boolean;
  preferences: OnboardingPreferences;

  // Progress & Gamification
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  todayMinutesStudied: number;
  lessonProgress: Record<string, LessonProgressRecord>;
  processedSubmissionIds: string[];
  mistakesBank: MistakeItem[];
  activeResumeLessonId: string | null;

  // Vocabulary & Spaced Repetition
  vocabulary: VocabularyCard[];

  // Practice History
  grammarHistory: GrammarCheckResult[];
  ieltsHistory: Array<IELTSEvaluation & { createdAt: string; userResponse: string }>;

  // Offline Queue
  syncQueue: SyncQueueMutation[];

  // Actions
  hydrateFromStorage: () => Promise<void>;
  persistToStorage: () => Promise<void>;
  setThemeMode: (mode: 'light' | 'dark') => void;
  setExplanationLanguage: (lang: ExplanationLanguage) => void;
  setDailyTargetMinutes: (minutes: number) => void;
  setOnlineStatus: (isOnline: boolean) => void;
  completeOnboarding: (prefs: OnboardingPreferences) => void;
  signInUser: (session: AuthSession) => void;
  continueAsGuest: () => void;
  /**
   * Tries to sync first. If items are still unsynced it does NOT log out unless
   * `discardUnsynced` is set, so the UI can warn the user before work is lost.
   */
  logoutUser: (options?: { syncExecutor?: SyncExecutor; discardUnsynced?: boolean }) => Promise<{
    loggedOut: boolean;
    unsyncedCount: number;
  }>;
  deleteAccountAndPurgeData: () => Promise<void>;

  // Learning Actions
  saveLessonBookmark: (lessonId: string, exerciseIndex: number) => void;
  submitLessonQuiz: (params: {
    lessonId: string;
    answers: Record<string, string>;
    clientSubmissionId: string;
    minutesSpent?: number;
  }) => QuizSubmissionResult;
  clearResolvedMistake: (mistakeId: string) => void;

  // Vocabulary Actions
  addVocabularyCard: (card: Omit<VocabularyCard, 'id' | 'repetitionNumber' | 'easinessFactor' | 'intervalDays' | 'nextReviewAt' | 'lastReviewedAt' | 'reviewHistory'>) => VocabularyCard;
  toggleFavoriteVocabulary: (cardId: string) => void;
  reviewVocabularyCard: (cardId: string, rating: 0 | 1 | 2 | 3 | 4 | 5) => void;

  // Grammar & IELTS History Actions
  recordGrammarCheck: (result: GrammarCheckResult) => void;
  recordIELTSAttempt: (evalResult: IELTSEvaluation, userResponse: string) => void;

  // Sync Actions
  /**
   * Sends the queue with `syncExecutor`, which resolves to the ids the server acknowledged.
   * Only acknowledged items leave the queue. Resolves true when every sent item was acknowledged.
   */
  flushSyncQueue: (syncExecutor: SyncExecutor) => Promise<boolean>;
}

const DEFAULT_PREFERENCES: OnboardingPreferences = {
  displayName: 'Learner',
  explanationLanguage: 'bn',
  proficiencyLevel: 'beginner',
  learningGoal: 'daily_conversation',
  dailyTargetMinutes: 15,
  interests: ['career', 'technology', 'daily_life'],
};

function getTodayDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export const useAppStore = create<AppState>((set, get) => ({
  isHydrated: false,
  themeMode: 'light',
  isOnline: true,
  syncStatus: 'idle',
  lastSyncedAt: null,

  authSession: null,
  hasCompletedOnboarding: false,
  preferences: DEFAULT_PREFERENCES,

  totalXp: 0,
  currentStreak: 1,
  longestStreak: 1,
  lastActiveDate: null,
  todayMinutesStudied: 0,
  lessonProgress: {},
  processedSubmissionIds: [],
  mistakesBank: [],
  activeResumeLessonId: 'lesson-beg-1',

  vocabulary: SEED_VOCABULARY_CARDS,
  grammarHistory: [],
  ieltsHistory: [],
  syncQueue: [],

  hydrateFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Check session expiration if authenticated
        let validSession: AuthSession | null = parsed.authSession ?? null;
        const legacyToken = validSession?.accessToken || '';
        if (validSession && !validSession.isGuest) {
          if (legacyToken) {
            // One-time migration: older builds stored the token in plaintext AsyncStorage.
            await writeAuthToken(legacyToken);
          }
          const token = (await readAuthToken()) ?? legacyToken;
          validSession = token && validSession.expiresAt >= Date.now() ? { ...validSession, accessToken: token } : null;
        }
        set({
          themeMode: parsed.themeMode ?? 'light',
          authSession: validSession,
          hasCompletedOnboarding: Boolean(parsed.hasCompletedOnboarding),
          preferences: parsed.preferences ?? DEFAULT_PREFERENCES,
          totalXp: parsed.totalXp ?? 0,
          currentStreak: parsed.currentStreak ?? 1,
          longestStreak: parsed.longestStreak ?? 1,
          lastActiveDate: parsed.lastActiveDate ?? null,
          todayMinutesStudied: parsed.todayMinutesStudied ?? 0,
          lessonProgress: parsed.lessonProgress ?? {},
          processedSubmissionIds: parsed.processedSubmissionIds ?? [],
          mistakesBank: parsed.mistakesBank ?? [],
          activeResumeLessonId: parsed.activeResumeLessonId ?? 'lesson-beg-1',
          vocabulary: Array.isArray(parsed.vocabulary) && parsed.vocabulary.length > 0 ? parsed.vocabulary : SEED_VOCABULARY_CARDS,
          grammarHistory: parsed.grammarHistory ?? [],
          ieltsHistory: parsed.ieltsHistory ?? [],
          syncQueue: parsed.syncQueue ?? [],
          lastSyncedAt: parsed.lastSyncedAt ?? null,
          isHydrated: true,
        });
        if (legacyToken) {
          await get().persistToStorage();
        }
      } else {
        set({ isHydrated: true });
      }
    } catch (error) {
      if (__DEV__) console.warn('[storage] hydrate failed, starting from defaults', error);
      set({ isHydrated: true });
    }
  },

  persistToStorage: async () => {
    const state = get();
    const session = state.authSession;
    await writeAuthToken(session && !session.isGuest ? session.accessToken || null : null);
    const serializable = {
      themeMode: state.themeMode,
      authSession: session ? { ...session, accessToken: '' } : null,
      hasCompletedOnboarding: state.hasCompletedOnboarding,
      preferences: state.preferences,
      totalXp: state.totalXp,
      currentStreak: state.currentStreak,
      longestStreak: state.longestStreak,
      lastActiveDate: state.lastActiveDate,
      todayMinutesStudied: state.todayMinutesStudied,
      lessonProgress: state.lessonProgress,
      processedSubmissionIds: state.processedSubmissionIds,
      mistakesBank: state.mistakesBank,
      activeResumeLessonId: state.activeResumeLessonId,
      vocabulary: state.vocabulary,
      grammarHistory: state.grammarHistory,
      ieltsHistory: state.ieltsHistory,
      syncQueue: state.syncQueue,
      lastSyncedAt: state.lastSyncedAt,
    };
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (error) {
      if (__DEV__) console.warn('[storage] persist failed', error);
    }
  },

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    void get().persistToStorage();
  },

  setExplanationLanguage: (lang) => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        explanationLanguage: lang,
      },
    }));
    void get().persistToStorage();
  },

  setDailyTargetMinutes: (minutes) => {
    const clamped = Math.max(5, Math.min(120, Math.round(minutes)));
    set((state) => ({
      preferences: {
        ...state.preferences,
        dailyTargetMinutes: clamped,
      },
    }));
    void get().persistToStorage();
  },

  setOnlineStatus: (isOnline) => {
    set((state) => ({
      isOnline,
      syncStatus: !isOnline && state.syncQueue.length > 0 ? 'offline_queued' : state.syncStatus,
    }));
  },

  completeOnboarding: (prefs) => {
    const recommendedFirstLessonByLevel: Record<ProficiencyLevel, string> = {
      beginner: 'lesson-beg-1',
      elementary: 'lesson-elem-1',
      intermediate: 'lesson-int-1',
      upper_intermediate: 'lesson-upint-1',
      advanced: 'lesson-adv-1',
      ielts: 'lesson-ielts-1',
    };
    set({
      hasCompletedOnboarding: true,
      preferences: prefs,
      activeResumeLessonId: recommendedFirstLessonByLevel[prefs.proficiencyLevel] ?? 'lesson-beg-1',
    });
    void get().persistToStorage();
  },

  signInUser: (session) => {
    set({
      authSession: session,
      preferences: {
        ...get().preferences,
        displayName: session.displayName || get().preferences.displayName,
      },
    });
    void get().persistToStorage();
  },

  continueAsGuest: () => {
    set({
      authSession: {
        userId: 'guest-local-user',
        email: 'guest@local.fluentup',
        displayName: get().preferences.displayName || 'Guest Learner',
        accessToken: '',
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        isGuest: true,
      },
    });
    void get().persistToStorage();
  },

  logoutUser: async (options = {}) => {
    const { syncExecutor, discardUnsynced = false } = options;
    if (get().syncQueue.length > 0 && syncExecutor) {
      await get().flushSyncQueue(syncExecutor);
    }
    const unsyncedCount = get().syncQueue.length;
    if (unsyncedCount > 0 && !discardUnsynced) {
      return { loggedOut: false, unsyncedCount };
    }
    set({
      authSession: null,
      syncQueue: [],
      syncStatus: 'idle',
    });
    await get().persistToStorage();
    return { loggedOut: true, unsyncedCount };
  },

  deleteAccountAndPurgeData: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await writeAuthToken(null);
    set({
      authSession: null,
      hasCompletedOnboarding: false,
      preferences: DEFAULT_PREFERENCES,
      totalXp: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      todayMinutesStudied: 0,
      lessonProgress: {},
      processedSubmissionIds: [],
      mistakesBank: [],
      activeResumeLessonId: 'lesson-beg-1',
      vocabulary: SEED_VOCABULARY_CARDS,
      grammarHistory: [],
      ieltsHistory: [],
      syncQueue: [],
      syncStatus: 'idle',
      lastSyncedAt: null,
    });
  },

  saveLessonBookmark: (lessonId, exerciseIndex) => {
    const nowIso = new Date().toISOString();
    set((state) => {
      const existing = state.lessonProgress[lessonId];
      const updatedRecord: LessonProgressRecord = {
        lessonId,
        status: existing?.status === 'completed' ? 'completed' : 'in_progress',
        bestScore: existing?.bestScore ?? 0,
        attemptsCount: existing?.attemptsCount ?? 0,
        lastExerciseIndex: Math.max(0, exerciseIndex),
        xpAwarded: existing?.xpAwarded ?? false,
        completedAt: existing?.completedAt ?? null,
        updatedAt: nowIso,
      };
      return {
        activeResumeLessonId: lessonId,
        lessonProgress: {
          ...state.lessonProgress,
          [lessonId]: updatedRecord,
        },
      };
    });
    void get().persistToStorage();
  },

  submitLessonQuiz: ({ lessonId, answers, clientSubmissionId, minutesSpent = 8 }) => {
    const lesson = findLessonById(lessonId);
    if (!lesson) {
      throw new Error(`Lesson not found: ${lessonId}`);
    }

    const state = get();
    const existingProgress = state.lessonProgress[lessonId];
    const alreadyAwardedXp = Boolean(existingProgress?.xpAwarded);

    const quizResult = scoreLessonQuiz({
      lesson,
      answers,
      alreadyAwardedXp,
      clientSubmissionId,
      processedSubmissionIds: state.processedSubmissionIds,
    });

    const now = new Date();
    const nowIso = now.toISOString();
    const todayStr = getTodayDateString(now);

    const isDuplicateSubmission = state.processedSubmissionIds.includes(clientSubmissionId);

    set((prev) => {
      const prevRecord = prev.lessonProgress[lessonId];
      const nextStatus =
        quizResult.passed || prevRecord?.status === 'completed' ? 'completed' : 'in_progress';
      const nextBestScore = Math.max(prevRecord?.bestScore ?? 0, quizResult.scorePercent);
      const nextXpAwarded = Boolean(prevRecord?.xpAwarded || quizResult.xpEarned > 0);

      // Update streak if active today
      let nextStreak = prev.currentStreak;
      if (prev.lastActiveDate !== todayStr) {
        nextStreak = prev.lastActiveDate ? prev.currentStreak + 1 : Math.max(1, prev.currentStreak);
      }
      const nextLongestStreak = Math.max(prev.longestStreak, nextStreak);

      const newMistakes: MistakeItem[] = quizResult.mistakes.map((m) => ({
        id: `${lessonId}-${m.exerciseId}`,
        lessonId,
        exerciseId: m.exerciseId,
        promptEn: m.promptEn,
        promptBn: m.promptBn,
        userAnswer: m.userAnswer,
        correctAnswer: m.correctAnswer,
        explanationEn: m.explanationEn,
        explanationBn: m.explanationBn,
        createdAt: nowIso,
      }));

      // Deduplicate mistakes by id
      const filteredOldMistakes = prev.mistakesBank.filter(
        (old) => !newMistakes.some((nm) => nm.id === old.id)
      );

      const mutation: SyncQueueMutation = {
        id: `sync-${clientSubmissionId}`,
        type: 'lesson_quiz_completed',
        payload: {
          lessonId,
          clientSubmissionId,
          scorePercent: quizResult.scorePercent,
          correctCount: quizResult.correctCount,
          totalQuestions: quizResult.totalQuestions,
          xpEarned: quizResult.xpEarned,
          completedAt: nowIso,
        },
        createdAt: nowIso,
        retryCount: 0,
      };

      return {
        totalXp: prev.totalXp + quizResult.xpEarned,
        currentStreak: nextStreak,
        longestStreak: nextLongestStreak,
        lastActiveDate: todayStr,
        todayMinutesStudied: isDuplicateSubmission
          ? prev.todayMinutesStudied
          : prev.todayMinutesStudied + minutesSpent,
        processedSubmissionIds: isDuplicateSubmission
          ? prev.processedSubmissionIds
          : [...prev.processedSubmissionIds, clientSubmissionId],
        lessonProgress: {
          ...prev.lessonProgress,
          [lessonId]: {
            lessonId,
            status: nextStatus,
            bestScore: nextBestScore,
            attemptsCount: isDuplicateSubmission
              ? prevRecord?.attemptsCount ?? 1
              : (prevRecord?.attemptsCount ?? 0) + 1,
            lastExerciseIndex: 0,
            xpAwarded: nextXpAwarded,
            completedAt:
              nextStatus === 'completed' ? prevRecord?.completedAt ?? nowIso : null,
            updatedAt: nowIso,
          },
        },
        mistakesBank: [...newMistakes, ...filteredOldMistakes].slice(0, 50),
        syncQueue: isDuplicateSubmission ? prev.syncQueue : [...prev.syncQueue, mutation],
        syncStatus: prev.isOnline ? 'idle' : 'offline_queued',
      };
    });

    void get().persistToStorage();
    return quizResult;
  },

  clearResolvedMistake: (mistakeId) => {
    set((state) => ({
      mistakesBank: state.mistakesBank.filter((m) => m.id !== mistakeId),
    }));
    void get().persistToStorage();
  },

  addVocabularyCard: (newCardInput) => {
    const trimmedWord = newCardInput.wordOrPhrase.trim();
    if (!trimmedWord) {
      throw new Error('Word or phrase is required.');
    }

    const existing = get().vocabulary.find(
      (c) => c.wordOrPhrase.toLowerCase() === trimmedWord.toLowerCase()
    );
    if (existing) {
      return existing;
    }

    const nowIso = new Date().toISOString();
    const card: VocabularyCard = {
      id: `vocab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      wordOrPhrase: trimmedWord,
      meaningBn: newCardInput.meaningBn.trim(),
      definitionEn: newCardInput.definitionEn.trim(),
      exampleSentence: newCardInput.exampleSentence.trim(),
      phonetic: newCardInput.phonetic.trim() || '/—/',
      audioKey: newCardInput.audioKey,
      isFavorite: newCardInput.isFavorite,
      repetitionNumber: 0,
      easinessFactor: 2.5,
      intervalDays: 0,
      nextReviewAt: nowIso,
      lastReviewedAt: null,
      reviewHistory: [],
    };

    set((state) => ({
      vocabulary: [card, ...state.vocabulary],
      syncQueue: [
        ...state.syncQueue,
        {
          id: `sync-vocab-${card.id}`,
          type: 'vocabulary_upserted',
          payload: { card },
          createdAt: nowIso,
          retryCount: 0,
        },
      ],
      syncStatus: state.isOnline ? state.syncStatus : 'offline_queued',
    }));

    void get().persistToStorage();
    return card;
  },

  toggleFavoriteVocabulary: (cardId) => {
    set((state) => ({
      vocabulary: state.vocabulary.map((c) =>
        c.id === cardId ? { ...c, isFavorite: !c.isFavorite } : c
      ),
    }));
    void get().persistToStorage();
  },

  reviewVocabularyCard: (cardId, rating) => {
    const now = new Date();
    set((state) => {
      const updatedVocabulary = state.vocabulary.map((card) =>
        card.id === cardId ? calculateNextVocabularyReview(card, rating, now) : card
      );
      const updatedCard = updatedVocabulary.find((c) => c.id === cardId);
      return {
        vocabulary: updatedVocabulary,
        totalXp: state.totalXp + (rating >= 3 ? 5 : 2),
        todayMinutesStudied: state.todayMinutesStudied + 1,
        syncQueue: updatedCard
          ? [
              ...state.syncQueue,
              {
                id: `sync-review-${cardId}-${now.getTime()}`,
                type: 'vocabulary_upserted',
                payload: { card: updatedCard },
                createdAt: now.toISOString(),
                retryCount: 0,
              },
            ]
          : state.syncQueue,
      };
    });
    void get().persistToStorage();
  },

  recordGrammarCheck: (result) => {
    set((state) => ({
      grammarHistory: [result, ...state.grammarHistory].slice(0, 20),
    }));
    void get().persistToStorage();
  },

  recordIELTSAttempt: (evalResult, userResponse) => {
    const nowIso = new Date().toISOString();
    set((state) => ({
      ieltsHistory: [
        { ...evalResult, userResponse, createdAt: nowIso },
        ...state.ieltsHistory,
      ].slice(0, 25),
      totalXp: state.totalXp + 15,
      todayMinutesStudied: state.todayMinutesStudied + 5,
    }));
    void get().persistToStorage();
  },

  flushSyncQueue: async (syncExecutor) => {
    const state = get();
    if (!state.isOnline) {
      set({ syncStatus: 'offline_queued' });
      return false;
    }
    if (!state.authSession || state.authSession.isGuest) {
      // Guests have no server account; keep the queue on device until they sign in.
      set({ syncStatus: state.syncQueue.length > 0 ? 'offline_queued' : 'idle' });
      return false;
    }
    if (state.syncQueue.length === 0) {
      set({ syncStatus: 'synced', lastSyncedAt: new Date().toISOString() });
      return true;
    }

    const snapshot = state.syncQueue;
    const sentIds = new Set<string>();
    const acked = new Set<string>();
    const bumpUnacked = (queue: SyncQueueMutation[]) =>
      queue
        .filter((m) => !acked.has(m.id))
        .map((m) => (sentIds.has(m.id) ? { ...m, retryCount: m.retryCount + 1 } : m));

    set({ syncStatus: 'syncing' });
    // Send bounded batches: one oversized request would be rejected forever and block the whole queue.
    for (let start = 0; start < snapshot.length; start += SYNC_BATCH_SIZE) {
      const batch = snapshot.slice(start, start + SYNC_BATCH_SIZE);
      batch.forEach((m) => sentIds.add(m.id));
      try {
        (await syncExecutor(batch)).forEach((id) => acked.add(id));
      } catch (error) {
        if (__DEV__) {
          console.warn('[sync] batch failed', error);
        }
        // Batches already acknowledged stay removed; this one and the unsent rest stay queued.
        set((prev) => ({ syncStatus: 'error', syncQueue: bumpUnacked(prev.syncQueue) }));
        await get().persistToStorage();
        return false;
      }
    }

    const allAcked = snapshot.every((m) => acked.has(m.id));
    set((prev) => ({
      // Items enqueued while the request was in flight are kept untouched.
      syncQueue: bumpUnacked(prev.syncQueue),
      syncStatus: allAcked ? 'synced' : 'error',
      lastSyncedAt: allAcked ? new Date().toISOString() : prev.lastSyncedAt,
    }));
    await get().persistToStorage();
    return allAcked;
  },
}));
