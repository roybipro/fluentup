import { z } from 'zod';

export const ProficiencyLevelSchema = z.enum([
  'beginner',
  'elementary',
  'intermediate',
  'upper_intermediate',
  'advanced',
  'ielts',
]);
export type ProficiencyLevel = z.infer<typeof ProficiencyLevelSchema>;

export const ExplanationLanguageSchema = z.enum(['bn', 'en']);
export type ExplanationLanguage = z.infer<typeof ExplanationLanguageSchema>;

export const LearningGoalSchema = z.enum([
  'daily_conversation',
  'job_interviews',
  'university_academic',
  'ielts_exam',
  'professional_workplace',
  'travel_abroad',
]);
export type LearningGoal = z.infer<typeof LearningGoalSchema>;

export const OnboardingPreferencesSchema = z.object({
  displayName: z.string().min(1).max(80).default('Learner'),
  explanationLanguage: ExplanationLanguageSchema,
  proficiencyLevel: ProficiencyLevelSchema,
  learningGoal: LearningGoalSchema,
  dailyTargetMinutes: z.number().int().min(5).max(120),
  interests: z.array(z.string()).min(1),
  placementScore: z.number().int().min(0).max(100).optional(),
});
export type OnboardingPreferences = z.infer<typeof OnboardingPreferencesSchema>;

export const ExerciseTypeSchema = z.enum([
  'multiple_choice',
  'sentence_ordering',
  'fill_in_blank',
  'sentence_construction',
  'vocabulary_recall',
  'grammar_correction',
]);
export type ExerciseType = z.infer<typeof ExerciseTypeSchema>;

export const LessonExerciseSchema = z.object({
  id: z.string(),
  type: ExerciseTypeSchema,
  promptEn: z.string(),
  promptBn: z.string(),
  options: z.array(z.string()).optional(),
  tokens: z.array(z.string()).optional(),
  correctAnswer: z.string(),
  acceptableAnswers: z.array(z.string()).optional(),
  explanationEn: z.string(),
  explanationBn: z.string(),
});
export type LessonExercise = z.infer<typeof LessonExerciseSchema>;

export const LessonExplanationBlockSchema = z.object({
  headingEn: z.string(),
  headingBn: z.string(),
  bodyEn: z.string(),
  bodyBn: z.string(),
  tipEn: z.string().optional(),
  tipBn: z.string().optional(),
});
export type LessonExplanationBlock = z.infer<typeof LessonExplanationBlockSchema>;

export const LessonExampleSchema = z.object({
  english: z.string(),
  bengali: z.string(),
  contextNote: z.string(),
});
export type LessonExample = z.infer<typeof LessonExampleSchema>;

export const LessonSchema = z.object({
  id: z.string(),
  pathId: z.string(),
  level: ProficiencyLevelSchema,
  prerequisiteLessonId: z.string().nullable(),
  titleEn: z.string(),
  titleBn: z.string(),
  orderIndex: z.number().int().nonnegative(),
  xpReward: z.number().int().positive(),
  estimatedMinutes: z.number().int().positive(),
  passingScore: z.number().int().min(50).max(100),
  contentVersion: z.number().int().positive(),
  objectivesEn: z.array(z.string()).min(1),
  objectivesBn: z.array(z.string()).min(1),
  explanations: z.array(LessonExplanationBlockSchema).min(1),
  examples: z.array(LessonExampleSchema).min(1),
  exercises: z.array(LessonExerciseSchema).min(4),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const LearningPathSchema = z.object({
  id: z.string(),
  level: ProficiencyLevelSchema,
  titleEn: z.string(),
  titleBn: z.string(),
  descriptionEn: z.string(),
  descriptionBn: z.string(),
  displayOrder: z.number().int(),
  contentVersion: z.number().int().positive(),
  lessons: z.array(LessonSchema).min(1),
});
export type LearningPath = z.infer<typeof LearningPathSchema>;

export const VocabularyCardSchema = z.object({
  id: z.string(),
  wordOrPhrase: z.string().min(1),
  meaningBn: z.string(),
  definitionEn: z.string().min(1),
  exampleSentence: z.string(),
  phonetic: z.string(),
  audioKey: z.string().optional(),
  isFavorite: z.boolean(),
  repetitionNumber: z.number().int().nonnegative(),
  easinessFactor: z.number().min(1.3),
  intervalDays: z.number().int().nonnegative(),
  nextReviewAt: z.string(),
  lastReviewedAt: z.string().nullable(),
  reviewHistory: z.array(
    z.object({
      reviewedAt: z.string(),
      rating: z.number().int().min(0).max(5),
      intervalDays: z.number().int().nonnegative(),
    })
  ),
});
export type VocabularyCard = z.infer<typeof VocabularyCardSchema>;

export const AITutorFeedbackSchema = z.object({
  tutorReply: z.string(),
  originalLearnerResponse: z.string(),
  correctedSentence: z.string(),
  mistakesExplanationEn: z.array(z.string()),
  mistakesExplanationBn: z.array(z.string()),
  naturalAlternative: z.string(),
  usefulVocabulary: z.array(
    z.object({
      term: z.string(),
      meaningEn: z.string(),
      meaningBn: z.string(),
    })
  ),
  followUpPracticePrompt: z.string(),
  providerStatus: z.enum(['live_ai', 'offline_fallback']),
});
export type AITutorFeedback = z.infer<typeof AITutorFeedbackSchema>;

export const GrammarCheckResultSchema = z.object({
  originalText: z.string(),
  correctedText: z.string(),
  naturalRewrite: z.string(),
  explanations: z.array(
    z.object({
      originalFragment: z.string(),
      correctedFragment: z.string(),
      ruleEn: z.string(),
      ruleBn: z.string(),
    })
  ),
  practiceExercise: z.object({
    question: z.string(),
    options: z.array(z.string()).min(2),
    correctAnswer: z.string(),
    explanationEn: z.string(),
    explanationBn: z.string(),
  }),
  providerStatus: z.enum(['live_ai', 'deterministic_engine']),
});
export type GrammarCheckResult = z.infer<typeof GrammarCheckResultSchema>;

export const IELTSEvaluationSchema = z.object({
  moduleType: z.enum(['speaking', 'writing', 'reading', 'listening']),
  taskId: z.string(),
  estimatedBand: z.number().min(1).max(9),
  isUnofficialEstimate: z.literal(true),
  disclaimer: z.string(),
  criteriaBreakdown: z.object({
    taskAchievementOrFluency: z.number().min(1).max(9),
    coherenceAndCohesion: z.number().min(1).max(9),
    lexicalResource: z.number().min(1).max(9),
    grammaticalRangeAndAccuracy: z.number().min(1).max(9),
  }),
  strengthsEn: z.array(z.string()),
  improvementsEn: z.array(z.string()),
  improvementsBn: z.array(z.string()),
  improvedSampleResponse: z.string(),
});
export type IELTSEvaluation = z.infer<typeof IELTSEvaluationSchema>;
