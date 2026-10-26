import {
  AITutorFeedback,
  GrammarCheckResult,
  IELTSEvaluation,
  LearningGoal,
  Lesson,
  LessonExercise,
  ProficiencyLevel,
  VocabularyCard,
} from '../schemas/domain';
import { PLACEMENT_QUESTIONS, SEED_LEARNING_PATHS } from '../data/curriculum';

export interface PlacementResult {
  scorePercent: number;
  recommendedLevel: ProficiencyLevel;
  summaryEn: string;
  summaryBn: string;
}

/**
 * Evaluates placement assessment answers and recommends an initial CEFR / IELTS learning path.
 */
export function evaluatePlacementAssessment(
  answers: Record<string, string>,
  learningGoal?: LearningGoal
): PlacementResult {
  const totalWeight = PLACEMENT_QUESTIONS.reduce((sum, q) => sum + q.weight, 0);
  let earnedWeight = 0;

  for (const question of PLACEMENT_QUESTIONS) {
    const given = (answers[question.id] ?? '').trim();
    if (given.toLowerCase() === question.correctAnswer.trim().toLowerCase()) {
      earnedWeight += question.weight;
    }
  }

  const scorePercent = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  let recommendedLevel: ProficiencyLevel = 'beginner';
  if (learningGoal === 'ielts_exam' && scorePercent >= 55) {
    recommendedLevel = 'ielts';
  } else if (scorePercent >= 85) {
    recommendedLevel = 'advanced';
  } else if (scorePercent >= 70) {
    recommendedLevel = 'upper_intermediate';
  } else if (scorePercent >= 50) {
    recommendedLevel = 'intermediate';
  } else if (scorePercent >= 30) {
    recommendedLevel = 'elementary';
  } else {
    recommendedLevel = 'beginner';
  }

  return {
    scorePercent,
    recommendedLevel,
    summaryEn: `You scored ${scorePercent}%. We recommend starting at ${recommendedLevel.replace('_', '-').toUpperCase()} level.`,
    summaryBn: `আপনার স্কোর ${scorePercent}%। আমরা আপনাকে ${recommendedLevel.replace('_', '-').toUpperCase()} স্তর থেকে শুরু করার পরামর্শ দিচ্ছি।`,
  };
}

/**
 * Checks whether a single exercise answer is correct.
 * Normalizes punctuation, whitespace, and case so learners aren't penalized for trailing periods.
 */
export function normalizeAnswer(input: string): string {
  return input
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function evaluateExerciseAnswer(exercise: LessonExercise, userAnswer: string): boolean {
  const normalizedUser = normalizeAnswer(userAnswer);
  if (!normalizedUser) {
    return false;
  }
  const candidates = [exercise.correctAnswer, ...(exercise.acceptableAnswers ?? [])];
  return candidates.some((candidate) => normalizeAnswer(candidate) === normalizedUser);
}

export interface QuizSubmissionResult {
  lessonId: string;
  clientSubmissionId: string;
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
  xpEarned: number;
  mistakes: Array<{
    exerciseId: string;
    promptEn: string;
    promptBn: string;
    userAnswer: string;
    correctAnswer: string;
    explanationEn: string;
    explanationBn: string;
  }>;
}

/**
 * Scores a completed lesson quiz and prevents duplicate XP awards when the lesson was already completed
 * or when a duplicate clientSubmissionId is re-submitted.
 */
export function scoreLessonQuiz(params: {
  lesson: Lesson;
  answers: Record<string, string>;
  alreadyAwardedXp: boolean;
  clientSubmissionId: string;
  processedSubmissionIds?: string[];
}): QuizSubmissionResult {
  const { lesson, answers, alreadyAwardedXp, clientSubmissionId, processedSubmissionIds = [] } = params;
  const totalQuestions = lesson.exercises.length;
  let correctCount = 0;
  const mistakes: QuizSubmissionResult['mistakes'] = [];

  for (const ex of lesson.exercises) {
    const rawUserAnswer = answers[ex.id] ?? '';
    const isCorrect = evaluateExerciseAnswer(ex, rawUserAnswer);
    if (isCorrect) {
      correctCount += 1;
    } else {
      mistakes.push({
        exerciseId: ex.id,
        promptEn: ex.promptEn,
        promptBn: ex.promptBn,
        userAnswer: rawUserAnswer,
        correctAnswer: ex.correctAnswer,
        explanationEn: ex.explanationEn,
        explanationBn: ex.explanationBn,
      });
    }
  }

  const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const passed = scorePercent >= lesson.passingScore;
  const isDuplicateSubmission = processedSubmissionIds.includes(clientSubmissionId);

  let xpEarned = 0;
  if (passed && !alreadyAwardedXp && !isDuplicateSubmission) {
    xpEarned = lesson.xpReward;
  }

  return {
    lessonId: lesson.id,
    clientSubmissionId,
    scorePercent,
    correctCount,
    totalQuestions,
    passed,
    xpEarned,
    mistakes,
  };
}

/**
 * Checks whether a lesson's prerequisite has been completed.
 */
export function isLessonUnlocked(
  lesson: Lesson,
  completedLessonIds: string[]
): { unlocked: boolean; reasonEn?: string; reasonBn?: string } {
  if (!lesson.prerequisiteLessonId) {
    return { unlocked: true };
  }
  const hasCompletedPrereq = completedLessonIds.includes(lesson.prerequisiteLessonId);
  if (hasCompletedPrereq) {
    return { unlocked: true };
  }
  return {
    unlocked: false,
    reasonEn: 'Complete the previous prerequisite lesson with at least 70% to unlock this lesson.',
    reasonBn: 'এই পাঠটি আনলক করতে পূর্ববর্তী পাঠটি কমপক্ষে ৭০% স্কোরসহ সম্পন্ন করুন।',
  };
}

/**
 * Finds a lesson by ID across all learning paths.
 */
export function findLessonById(lessonId: string): Lesson | undefined {
  for (const path of SEED_LEARNING_PATHS) {
    const found = path.lessons.find((l) => l.id === lessonId);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * SuperMemo-2 (SM-2) Spaced Repetition Scheduler.
 * Rating scale:
 *   0 - Complete blackout
 *   1 - Incorrect, remembered upon seeing answer
 *   2 - Incorrect, seemed easy to recall
 *   3 - Correct with serious difficulty ("Hard")
 *   4 - Correct after hesitation ("Good")
 *   5 - Perfect instant recall ("Easy")
 */
export function calculateNextVocabularyReview(
  card: VocabularyCard,
  rating: 0 | 1 | 2 | 3 | 4 | 5,
  now: Date = new Date()
): VocabularyCard {
  let repetitionNumber = card.repetitionNumber;
  let intervalDays = card.intervalDays;
  let easinessFactor = card.easinessFactor;

  if (rating >= 3) {
    if (repetitionNumber === 0) {
      intervalDays = 1;
    } else if (repetitionNumber === 1) {
      intervalDays = 3;
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * easinessFactor));
    }
    repetitionNumber += 1;
  } else {
    repetitionNumber = 0;
    intervalDays = 1;
  }

  const qualityDelta = 5 - rating;
  easinessFactor = easinessFactor + (0.1 - qualityDelta * (0.08 + qualityDelta * 0.02));
  if (easinessFactor < 1.3) {
    easinessFactor = 1.3;
  }
  easinessFactor = Number(easinessFactor.toFixed(2));

  const nextDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  const reviewedIso = now.toISOString();

  return {
    ...card,
    repetitionNumber,
    easinessFactor,
    intervalDays,
    lastReviewedAt: reviewedIso,
    nextReviewAt: nextDate.toISOString(),
    reviewHistory: [
      ...card.reviewHistory,
      {
        reviewedAt: reviewedIso,
        rating,
        intervalDays,
      },
    ],
  };
}

export function getDueVocabularyCards(cards: VocabularyCard[], now: Date = new Date()): VocabularyCard[] {
  const nowMs = now.getTime();
  return cards.filter((card) => {
    const dueMs = Date.parse(card.nextReviewAt);
    return Number.isNaN(dueMs) || dueMs <= nowMs;
  });
}

/**
 * Deterministic Grammar & Natural Rewrite Analyzer.
 * Used as an instant local validator and safe fallback when the remote LLM service is unreachable,
 * ensuring the app remains useful on unreliable mobile networks.
 */
export function analyzeGrammarLocally(rawText: string): GrammarCheckResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Please enter a sentence or paragraph to check.');
  }
  if (trimmed.length > 3000) {
    throw new Error('Text exceeds maximum length of 3,000 characters.');
  }

  let corrected = trimmed;
  const explanations: GrammarCheckResult['explanations'] = [];

  const rules: Array<{
    pattern: RegExp;
    replacement: string;
    ruleEn: string;
    ruleBn: string;
  }> = [
    {
      pattern: /\bdid not went\b/gi,
      replacement: 'did not go',
      ruleEn: 'After auxiliary "did not", always use the base form of the verb ("go" instead of "went").',
      ruleBn: '"did not"-এর পরে সর্বদা মূল verb-এর base form ("go") বসে, অতীত রূপ ("went") নয়।',
    },
    {
      pattern: /\bdidn't went\b/gi,
      replacement: "didn't go",
      ruleEn: 'After "didn\'t", use the base verb "go".',
      ruleBn: '"didn\'t"-এর পরে মূল verb-এর base form ("go") বসে।',
    },
    {
      pattern: /\bI am working here since (\d+|two|three|four|five) years\b/gi,
      replacement: 'I have been working here for $1 years',
      ruleEn: 'Use Present Perfect Continuous ("have been working") with "for" + duration of time.',
      ruleBn: 'অতীতে শুরু হয়ে বর্তমানে চলমান কাজের মেয়াদের আগে "for" এবং "have been working" বসে।',
    },
    {
      pattern: /\bI am agree\b/gi,
      replacement: 'I agree',
      ruleEn: '"Agree" is already a verb in English, so do not put "am" before it.',
      ruleBn: '"Agree" নিজেই একটি ক্রিয়াপদ (verb), তাই এর আগে "am" বসে না।',
    },
    {
      pattern: /\bHe don't\b/gi,
      replacement: "He doesn't",
      ruleEn: 'Third-person singular subjects ("He/She/It") require "doesn\'t" (does not).',
      ruleBn: 'He / She / It একবচন কর্তার সাথে "doesn\'t" (does not) বসে।',
    },
    {
      pattern: /\bShe don't\b/gi,
      replacement: "She doesn't",
      ruleEn: 'Third-person singular subjects ("She") require "doesn\'t" (does not).',
      ruleBn: '"She"-এর সাথে "doesn\'t" (does not) বসে।',
    },
    {
      pattern: /\bThey is\b/gi,
      replacement: 'They are',
      ruleEn: 'Plural subject "They" takes the plural verb "are".',
      ruleBn: 'বহুবচন কর্তা "They"-এর সাথে "are" বসে।',
    },
    {
      pattern: /\bdiscuss about\b/gi,
      replacement: 'discuss',
      ruleEn: '"Discuss" is a transitive verb and does not take the preposition "about".',
      ruleBn: '"Discuss" শব্দের মধ্যেই "about" অর্থ নিহিত থাকে, তাই এর পরে আলাদা করে "about" বসে না।',
    },
    {
      pattern: /\bmore better\b/gi,
      replacement: 'much better',
      ruleEn: '"Better" is already comparative; do not combine it with "more". Use "much better".',
      ruleBn: '"Better" নিজেই Comparative degree, তাই এর আগে "more" না বসিয়ে "much better" বসাতে হয়।',
    },
  ];

  for (const r of rules) {
    const match = corrected.match(r.pattern);
    if (match) {
      const originalFragment = match[0];
      corrected = corrected.replace(r.pattern, r.replacement);
      const correctedFragment = originalFragment.replace(r.pattern, r.replacement);
      explanations.push({
        originalFragment,
        correctedFragment,
        ruleEn: r.ruleEn,
        ruleBn: r.ruleBn,
      });
    }
  }

  // Capitalize first letter and ensure ending punctuation
  corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
  if (!/[.!?]$/.test(corrected)) {
    corrected += '.';
  }

  if (explanations.length === 0 && corrected !== trimmed) {
    explanations.push({
      originalFragment: trimmed,
      correctedFragment: corrected,
      ruleEn: 'Standardized sentence capitalization and terminal punctuation.',
      ruleBn: 'বাক্যের প্রথম অক্ষর বড় হাতের (Capital letter) এবং শেষে যতিচিহ্ন (Full stop) যোগ করা হয়েছে।',
    });
  } else if (explanations.length === 0) {
    explanations.push({
      originalFragment: trimmed,
      correctedFragment: corrected,
      ruleEn: 'Your sentence is grammatically sound! Consider the natural rewrite below for extra polish.',
      ruleBn: 'আপনার বাক্যটি ব্যাকরণগতভাবে সঠিক! আরও সাবলীল প্রকাশের জন্য নিচের Natural Rewrite-টি দেখতে পারেন।',
    });
  }

  const naturalRewrite =
    corrected.length < 60
      ? `In my view, ${corrected.charAt(0).toLowerCase()}${corrected.slice(1)}`
      : corrected;

  return {
    originalText: trimmed,
    correctedText: corrected,
    naturalRewrite,
    explanations,
    practiceExercise: {
      question: 'Which sentence avoids common verb and preposition errors?',
      options: [
        'We discussed the project timeline and agreed on the next milestones.',
        'We discussed about the project timeline and I am agree.',
        'We did not went to discuss about the project.',
      ],
      correctAnswer: 'We discussed the project timeline and agreed on the next milestones.',
      explanationEn: '"Discuss" takes a direct object without "about", and "agree" is an action verb without "am".',
      explanationBn: '"Discuss"-এর পর "about" বসে না এবং "agree"-এর আগে "am" বসে না।',
    },
    providerStatus: 'deterministic_engine',
  };
}

/**
 * Generates structured AI Tutor feedback locally when offline or when the backend AI provider is unavailable.
 */
export function buildFallbackTutorFeedback(params: {
  scenarioTitle: string;
  userMessage: string;
}): AITutorFeedback {
  const grammar = analyzeGrammarLocally(params.userMessage);
  return {
    tutorReply: `Thank you for sharing that in our "${params.scenarioTitle}" practice! Let's build on your point: how would you handle an unexpected challenge in this situation?`,
    originalLearnerResponse: params.userMessage.trim(),
    correctedSentence: grammar.correctedText,
    mistakesExplanationEn: grammar.explanations.map((e) => e.ruleEn),
    mistakesExplanationBn: grammar.explanations.map((e) => e.ruleBn),
    naturalAlternative: grammar.naturalRewrite,
    usefulVocabulary: [
      {
        term: 'collaborate',
        meaningEn: 'Work jointly on an activity or project',
        meaningBn: 'যৌথভাবে বা একসাথে কাজ করা',
      },
      {
        term: 'prioritize',
        meaningEn: 'Treat as more important than other tasks',
        meaningBn: 'অগ্রাধিকার দেওয়া',
      },
    ],
    followUpPracticePrompt: 'Try answering the follow-up question using at least two sentences and a linking phrase like "Furthermore" or "As a result".',
    providerStatus: 'offline_fallback',
  };
}

/**
 * Generates an unofficial IELTS practice estimate against the 4 official criteria.
 */
export function evaluateIELTSResponseLocally(params: {
  moduleType: 'speaking' | 'writing' | 'reading' | 'listening';
  taskId: string;
  userResponse: string;
}): IELTSEvaluation {
  const trimmed = params.userResponse.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const sentences = trimmed ? trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0).length : 0;
  const hasLinkingWords = /\b(however|furthermore|moreover|although|while|consequently|overall|in conclusion)\b/i.test(
    trimmed
  );

  let baseScore = 5.5;
  if (words >= 80) baseScore += 1.0;
  else if (words >= 40) baseScore += 0.5;
  if (hasLinkingWords) baseScore += 0.5;
  if (sentences >= 4) baseScore += 0.5;

  const clamped = Math.min(8.0, Math.max(4.5, Math.round(baseScore * 2) / 2));

  return {
    moduleType: params.moduleType,
    taskId: params.taskId,
    estimatedBand: clamped,
    isUnofficialEstimate: true,
    disclaimer:
      'UNOFFICIAL PRACTICE ESTIMATE: This feedback is generated for self-study practice only and is not an official IELTS score or endorsed by IELTS partners.',
    criteriaBreakdown: {
      taskAchievementOrFluency: clamped,
      coherenceAndCohesion: hasLinkingWords ? Math.min(8.5, clamped + 0.5) : Math.max(4.5, clamped - 0.5),
      lexicalResource: clamped,
      grammaticalRangeAndAccuracy: clamped,
    },
    strengthsEn: [
      `Response length (${words} words across ${sentences} sentences) addresses the core topic.`,
      hasLinkingWords
        ? 'Effective use of cohesive linking markers (e.g., however, furthermore, overall).'
        : 'Clear and direct expression of your main idea.',
    ],
    improvementsEn: [
      words < 100
        ? 'Expand your supporting paragraphs with concrete real-world examples to increase Task Response depth.'
        : 'Vary your sentence openings with subordinate clauses and academic hedging.',
      'Incorporate more topic-specific academic collocations to elevate Lexical Resource.',
    ],
    improvementsBn: [
      words < 100
        ? 'Task Response উন্নত করতে বাস্তব উদাহরণ দিয়ে আপনার উত্তরের পরিধি আরও বাড়ান।'
        : 'বাক্যের শুরুতে বৈচিত্র্য আনুন এবং Complex Sentence ব্যবহার করুন।',
      'Lexical Resource স্কোর বাড়াতে সাধারণ শব্দের পরিবর্তে একাডেমিক Collocation ব্যবহার করুন।',
    ],
    improvedSampleResponse:
      'While technological transformation presents initial adaptation challenges, structured training and inclusive infrastructure can substantially enhance long-term productivity.',
  };
}
