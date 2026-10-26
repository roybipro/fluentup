import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import {
  evaluateExerciseAnswer,
  findLessonById,
  QuizSubmissionResult,
} from '../../src/services/learningEngine';
import { useAppStore } from '../../src/store/useAppStore';
import { useThemePalette } from '../../src/theme/colors';

export default function LessonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = useThemePalette();

  const lesson = useMemo(() => findLessonById(id || 'lesson-beg-1'), [id]);
  const explanationLanguage = useAppStore((s) => s.preferences.explanationLanguage);
  const lessonProgress = useAppStore((s) => (id ? s.lessonProgress[id] : undefined));
  const saveLessonBookmark = useAppStore((s) => s.saveLessonBookmark);
  const submitLessonQuiz = useAppStore((s) => s.submitLessonQuiz);

  const [mode, setMode] = useState<'study' | 'quiz' | 'results'>('study');
  const [currentExIndex, setCurrentExIndex] = useState<number>(
    lessonProgress?.lastExerciseIndex ?? 0
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
  const [checkedCurrent, setCheckedCurrent] = useState<boolean>(false);
  const [submissionResult, setSubmissionResult] = useState<QuizSubmissionResult | null>(null);

  if (!lesson) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Lesson Not Found</Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryBtnText}>Return to Learn Tab</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentExercise = lesson.exercises[currentExIndex] ?? lesson.exercises[0];
  const currentUserAnswer = answers[currentExercise.id] ?? '';
  const isCurrentCorrect = evaluateExerciseAnswer(currentExercise, currentUserAnswer);

  const speakEnglishText = (text: string) => {
    try {
      Speech.speak(text, { language: 'en-US', rate: 0.92 });
    } catch {
      // Safe fallback if TTS engine is unavailable on emulator
    }
  };

  const handleSelectOption = (optionValue: string) => {
    setAnswers((prev) => ({
      ...prev,
      [currentExercise.id]: optionValue,
    }));
    setCheckedCurrent(false);
  };

  const handleToggleToken = (token: string) => {
    const nextTokens = selectedTokens.includes(token)
      ? selectedTokens.filter((t) => t !== token)
      : [...selectedTokens, token];
    setSelectedTokens(nextTokens);
    setAnswers((prev) => ({
      ...prev,
      [currentExercise.id]: nextTokens.join(' '),
    }));
    setCheckedCurrent(false);
  };

  const handleNextExercise = () => {
    setCheckedCurrent(false);
    setSelectedTokens([]);
    if (currentExIndex + 1 < lesson.exercises.length) {
      const nextIndex = currentExIndex + 1;
      setCurrentExIndex(nextIndex);
      saveLessonBookmark(lesson.id, nextIndex);
    } else {
      const clientSubmissionId = `sub-${lesson.id}-${Date.now()}`;
      const result = submitLessonQuiz({
        lessonId: lesson.id,
        answers,
        clientSubmissionId,
        minutesSpent: lesson.estimatedMinutes,
      });
      setSubmissionResult(result);
      setMode('results');
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.headerCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.levelTag, { color: palette.primary }]}>
          {lesson.level.toUpperCase()} • {lesson.estimatedMinutes} MIN • +{lesson.xpReward} XP
        </Text>
        <Text style={[styles.title, { color: palette.textPrimary }]}>{lesson.titleEn}</Text>
        {explanationLanguage === 'bn' && (
          <Text style={[styles.subtitleBn, { color: palette.textSecondary }]}>{lesson.titleBn}</Text>
        )}
      </View>

      {mode === 'study' && (
        <>
          <View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.sectionHeading, { color: palette.textPrimary }]}>
              Learning Objectives / পাঠের উদ্দেশ্য
            </Text>
            {lesson.objectivesEn.map((obj, idx) => (
              <View key={obj} style={styles.objectiveItem}>
                <Text style={[styles.bulletText, { color: palette.textPrimary }]}>• {obj}</Text>
                {explanationLanguage === 'bn' && lesson.objectivesBn[idx] && (
                  <Text style={[styles.bulletSubBn, { color: palette.textSecondary }]}>
                    {lesson.objectivesBn[idx]}
                  </Text>
                )}
              </View>
            ))}
          </View>

          {lesson.explanations.map((block) => (
            <View
              key={block.headingEn}
              style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
              <Text style={[styles.sectionHeading, { color: palette.textPrimary }]}>{block.headingEn}</Text>
              {explanationLanguage === 'bn' && (
                <Text style={[styles.headingBn, { color: palette.accent }]}>{block.headingBn}</Text>
              )}
              <Text style={[styles.bodyText, { color: palette.textPrimary }]}>{block.bodyEn}</Text>
              {explanationLanguage === 'bn' && (
                <Text style={[styles.bodyTextBn, { color: palette.textSecondary }]}>{block.bodyBn}</Text>
              )}
              {block.tipEn && (
                <View style={[styles.tipBox, { backgroundColor: palette.primarySoft }]}>
                  <Text style={[styles.tipText, { color: palette.textPrimary }]}>
                    💡 Tip: {block.tipEn}
                  </Text>
                  {explanationLanguage === 'bn' && block.tipBn && (
                    <Text style={[styles.tipTextBn, { color: palette.textSecondary }]}>{block.tipBn}</Text>
                  )}
                </View>
              )}
            </View>
          ))}

          <View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.sectionHeading, { color: palette.textPrimary }]}>
              Real-World Examples (Tap 🔊 to Listen)
            </Text>
            {lesson.examples.map((ex) => (
              <View
                key={ex.english}
                style={[styles.exampleBox, { borderColor: palette.border, backgroundColor: palette.background }]}
              >
                <View style={styles.exampleHeader}>
                  <Text style={[styles.exampleEn, { color: palette.textPrimary }]}>{ex.english}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Listen to example ${ex.english}`}
                    style={[styles.audioBtn, { backgroundColor: palette.primarySoft }]}
                    onPress={() => speakEnglishText(ex.english)}
                  >
                    <Text style={{ color: palette.primary, fontWeight: '700' }}>🔊 Listen</Text>
                  </TouchableOpacity>
                </View>
                {explanationLanguage === 'bn' && (
                  <Text style={[styles.exampleBn, { color: palette.textSecondary }]}>{ex.bengali}</Text>
                )}
                <Text style={[styles.contextNote, { color: palette.accent }]}>Context: {ex.contextNote}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Start Interactive Exercises"
            style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
            onPress={() => {
              setMode('quiz');
              saveLessonBookmark(lesson.id, currentExIndex);
            }}
          >
            <Text style={styles.primaryBtnText}>
              Start Interactive Exercises ({lesson.exercises.length} Questions) →
            </Text>
          </TouchableOpacity>
        </>
      )}

      {mode === 'quiz' && (
        <View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.progressMeta, { color: palette.primary }]}>
            EXERCISE {currentExIndex + 1} OF {lesson.exercises.length} • TYPE:{' '}
            {currentExercise.type.replace(/_/g, ' ').toUpperCase()}
          </Text>
          <Text style={[styles.questionPrompt, { color: palette.textPrimary }]}>
            {currentExercise.promptEn}
          </Text>
          {explanationLanguage === 'bn' && (
            <Text style={[styles.questionPromptBn, { color: palette.textSecondary }]}>
              {currentExercise.promptBn}
            </Text>
          )}

          {currentExercise.type === 'sentence_ordering' && currentExercise.tokens ? (
            <View>
              <View
                style={[
                  styles.constructedSentenceBox,
                  { borderColor: palette.border, backgroundColor: palette.background },
                ]}
              >
                <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '600' }}>
                  {currentUserAnswer || 'Tap words below in order...'}
                </Text>
              </View>
              <View style={styles.tokenWrap}>
                {currentExercise.tokens.map((token, idx) => {
                  const chosen = selectedTokens.includes(token);
                  return (
                    <TouchableOpacity
                      key={`${token}-${idx}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Word token ${token}`}
                      style={[
                        styles.tokenChip,
                        {
                          borderColor: chosen ? palette.primary : palette.border,
                          backgroundColor: chosen ? palette.primarySoft : palette.background,
                        },
                      ]}
                      onPress={() => handleToggleToken(token)}
                    >
                      <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>{token}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : (
            <View>
              {currentExercise.options?.map((option) => {
                const selected = currentUserAnswer === option;
                return (
                  <TouchableOpacity
                    key={option}
                    accessibilityRole="button"
                    accessibilityLabel={`Option ${option}`}
                    style={[
                      styles.optionButton,
                      {
                        borderColor: selected ? palette.primary : palette.border,
                        backgroundColor: selected ? palette.primarySoft : palette.background,
                      },
                    ]}
                    onPress={() => handleSelectOption(option)}
                  >
                    <Text
                      style={{
                        color: palette.textPrimary,
                        fontWeight: selected ? '700' : '500',
                        fontSize: 15,
                      }}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {currentExercise.type === 'sentence_construction' && (
                <TextInput
                  accessibilityLabel="Type your constructed sentence"
                  style={[
                    styles.textInput,
                    {
                      borderColor: palette.border,
                      color: palette.textPrimary,
                      backgroundColor: palette.background,
                    },
                  ]}
                  value={currentUserAnswer}
                  onChangeText={(txt) => {
                    setAnswers((prev) => ({ ...prev, [currentExercise.id]: txt }));
                    setCheckedCurrent(false);
                  }}
                  placeholder="Or type the complete sentence here..."
                  placeholderTextColor={palette.textSecondary}
                />
              )}
            </View>
          )}

          {!checkedCurrent ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Check Answer"
              disabled={!currentUserAnswer.trim()}
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: currentUserAnswer.trim() ? palette.primary : palette.border,
                },
              ]}
              onPress={() => setCheckedCurrent(true)}
            >
              <Text style={styles.primaryBtnText}>Check Answer</Text>
            </TouchableOpacity>
          ) : (
            <View
              style={[
                styles.feedbackCard,
                {
                  borderColor: isCurrentCorrect ? palette.success : palette.danger,
                  backgroundColor: palette.background,
                },
              ]}
            >
              <Text
                style={{
                  color: isCurrentCorrect ? palette.success : palette.danger,
                  fontWeight: '800',
                  fontSize: 16,
                  marginBottom: 4,
                }}
              >
                {isCurrentCorrect ? '✓ Correct! / সঠিক উত্তর!' : '✗ Needs Correction / সঠিক উত্তর দেখুন:'}
              </Text>
              {!isCurrentCorrect && (
                <Text style={{ color: palette.textPrimary, fontWeight: '700', marginBottom: 4 }}>
                  Correct Answer: {currentExercise.correctAnswer}
                </Text>
              )}
              <Text style={{ color: palette.textPrimary, fontSize: 14, marginBottom: 4 }}>
                {currentExercise.explanationEn}
              </Text>
              {explanationLanguage === 'bn' && (
                <Text style={{ color: palette.textSecondary, fontSize: 14 }}>
                  {currentExercise.explanationBn}
                </Text>
              )}

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Continue to Next Exercise"
                style={[styles.primaryBtn, { backgroundColor: palette.primary, marginTop: 14 }]}
                onPress={handleNextExercise}
              >
                <Text style={styles.primaryBtnText}>
                  {currentExIndex + 1 < lesson.exercises.length ? 'Next Exercise →' : 'Finish & Score Quiz'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {mode === 'results' && submissionResult && (
        <View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text
            style={[
              styles.resultHeading,
              { color: submissionResult.passed ? palette.success : palette.warning },
            ]}
          >
            {submissionResult.passed
              ? '🎉 Lesson Completed!'
              : 'Keep Practicing — Almost There!'}
          </Text>
          <Text style={[styles.scoreBig, { color: palette.textPrimary }]}>
            Score: {submissionResult.scorePercent}% ({submissionResult.correctCount}/
            {submissionResult.totalQuestions})
          </Text>
          <Text style={[styles.xpEarnedText, { color: palette.accent }]}>
            {submissionResult.xpEarned > 0
              ? `+${submissionResult.xpEarned} XP Awarded`
              : submissionResult.passed
              ? 'Lesson already completed previously (no duplicate XP awarded)'
              : `Minimum passing score is ${lesson.passingScore}%`}
          </Text>

          {submissionResult.mistakes.length > 0 && (
            <View style={styles.mistakesSection}>
              <Text style={[styles.sectionHeading, { color: palette.textPrimary }]}>
                Mistake Review ({submissionResult.mistakes.length})
              </Text>
              {submissionResult.mistakes.map((m) => (
                <View
                  key={m.exerciseId}
                  style={[styles.mistakeBox, { borderColor: palette.border, backgroundColor: palette.background }]}
                >
                  <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>{m.promptEn}</Text>
                  <Text style={{ color: palette.danger, marginTop: 2 }}>
                    Your answer: {m.userAnswer || '(blank)'}
                  </Text>
                  <Text style={{ color: palette.success, fontWeight: '700', marginTop: 2 }}>
                    Correct: {m.correctAnswer}
                  </Text>
                  <Text style={{ color: palette.textSecondary, marginTop: 4 }}>{m.explanationEn}</Text>
                  {explanationLanguage === 'bn' && (
                    <Text style={{ color: palette.textSecondary, marginTop: 2 }}>{m.explanationBn}</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Retry Quiz"
            style={[styles.secondaryOutlineBtn, { borderColor: palette.primary }]}
            onPress={() => {
              setAnswers({});
              setCurrentExIndex(0);
              setCheckedCurrent(false);
              setMode('quiz');
            }}
          >
            <Text style={{ color: palette.primary, fontWeight: '700' }}>Retry Exercises</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back to Learning Path"
            style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
            onPress={() => router.replace('/(tabs)/learn')}
          >
            <Text style={styles.primaryBtnText}>Return to Learning Path</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  headerCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  levelTag: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  title: { fontSize: 21, fontWeight: '800' },
  subtitleBn: { fontSize: 15, marginTop: 4 },
  sectionCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  sectionHeading: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  headingBn: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  objectiveItem: { marginBottom: 8 },
  bulletText: { fontSize: 15, fontWeight: '600' },
  bulletSubBn: { fontSize: 14, marginLeft: 12, marginTop: 2 },
  bodyText: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  bodyTextBn: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  tipBox: { borderRadius: 12, padding: 12, marginTop: 6 },
  tipText: { fontSize: 14, fontWeight: '700' },
  tipTextBn: { fontSize: 13, marginTop: 4 },
  exampleBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  exampleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  exampleEn: { flex: 1, fontSize: 15, fontWeight: '700' },
  audioBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minHeight: 36, justifyContent: 'center' },
  exampleBn: { fontSize: 14, marginTop: 6 },
  contextNote: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  progressMeta: { fontSize: 12, fontWeight: '800', marginBottom: 8 },
  questionPrompt: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  questionPromptBn: { fontSize: 15, marginBottom: 14 },
  constructedSentenceBox: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    minHeight: 54,
    justifyContent: 'center',
    marginBottom: 12,
  },
  tokenWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tokenChip: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  optionButton: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    minHeight: 50,
    justifyContent: 'center',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginTop: 6,
  },
  feedbackCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginTop: 10,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryOutlineBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    marginTop: 12,
  },
  resultHeading: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  scoreBig: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  xpEarnedText: { fontSize: 15, fontWeight: '700', marginBottom: 16 },
  mistakesSection: { marginTop: 10 },
  mistakeBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
});
