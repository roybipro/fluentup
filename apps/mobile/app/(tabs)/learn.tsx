import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { SEED_LEARNING_PATHS } from '../../src/data/curriculum';
import { getDueVocabularyCards, isLessonUnlocked } from '../../src/services/learningEngine';
import { useAppStore } from '../../src/store/useAppStore';
import { useThemePalette } from '../../src/theme/colors';

export default function LearnScreen() {
  const router = useRouter();
  const palette = useThemePalette();

  const explanationLanguage = useAppStore((s) => s.preferences.explanationLanguage);
  const lessonProgress = useAppStore((s) => s.lessonProgress);
  const vocabulary = useAppStore((s) => s.vocabulary);
  const mistakesBank = useAppStore((s) => s.mistakesBank);
  const addVocabularyCard = useAppStore((s) => s.addVocabularyCard);
  const toggleFavoriteVocabulary = useAppStore((s) => s.toggleFavoriteVocabulary);
  const reviewVocabularyCard = useAppStore((s) => s.reviewVocabularyCard);
  const clearResolvedMistake = useAppStore((s) => s.clearResolvedMistake);

  const [subTab, setSubTab] = useState<'courses' | 'vocabulary' | 'mistakes'>('courses');
  const [newWord, setNewWord] = useState('');
  const [newMeaningBn, setNewMeaningBn] = useState('');
  const [newDefEn, setNewDefEn] = useState('');
  const [newExample, setNewExample] = useState('');
  const [vocabFilter, setVocabFilter] = useState<'all' | 'due' | 'favorites'>('all');

  const completedLessonIds = useMemo(
    () =>
      Object.values(lessonProgress)
        .filter((p) => p.status === 'completed')
        .map((p) => p.lessonId),
    [lessonProgress]
  );

  const dueCards = useMemo(() => getDueVocabularyCards(vocabulary), [vocabulary]);
  const displayedVocab = useMemo(() => {
    if (vocabFilter === 'due') return dueCards;
    if (vocabFilter === 'favorites') return vocabulary.filter((v) => v.isFavorite);
    return vocabulary;
  }, [vocabulary, dueCards, vocabFilter]);

  const handleAddWord = () => {
    if (!newWord.trim() || !newDefEn.trim()) return;
    addVocabularyCard({
      wordOrPhrase: newWord,
      meaningBn: newMeaningBn || 'বাংলা অর্থ যোগ করা হয়নি',
      definitionEn: newDefEn,
      exampleSentence: newExample || `Example using ${newWord.trim()}.`,
      phonetic: '/—/',
      isFavorite: false,
    });
    setNewWord('');
    setNewMeaningBn('');
    setNewDefEn('');
    setNewExample('');
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Sub-navigation */}
      <View style={styles.segmentRow}>
        {(
          [
            ['courses', 'Curriculum'],
            ['vocabulary', `Vocab (${dueCards.length} Due)`],
            ['mistakes', `Mistakes (${mistakesBank.length})`],
          ] as const
        ).map(([key, label]) => {
          const active = subTab === key;
          return (
            <TouchableOpacity
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              style={[
                styles.segmentBtn,
                {
                  backgroundColor: active ? palette.primary : palette.surface,
                  borderColor: active ? palette.primary : palette.border,
                },
              ]}
              onPress={() => setSubTab(key)}
            >
              <Text
                style={{
                  color: active ? '#FFFFFF' : palette.textPrimary,
                  fontWeight: '700',
                  fontSize: 13,
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {subTab === 'courses' && (
        <View>
          {SEED_LEARNING_PATHS.map((path) => (
            <View
              key={path.id}
              style={[styles.pathCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
              <Text style={[styles.pathLevelBadge, { color: palette.primary }]}>
                LEVEL {path.displayOrder} • {path.level.replace('_', '-').toUpperCase()}
              </Text>
              <Text style={[styles.pathTitle, { color: palette.textPrimary }]}>{path.titleEn}</Text>
              {explanationLanguage === 'bn' && (
                <Text style={[styles.pathTitleBn, { color: palette.textSecondary }]}>{path.titleBn}</Text>
              )}
              <Text style={[styles.pathDesc, { color: palette.textSecondary }]}>
                {explanationLanguage === 'bn' ? path.descriptionBn : path.descriptionEn}
              </Text>

              {path.lessons.map((lesson) => {
                const progress = lessonProgress[lesson.id];
                const lockCheck = isLessonUnlocked(lesson, completedLessonIds);
                const isCompleted = progress?.status === 'completed';

                return (
                  <View
                    key={lesson.id}
                    style={[
                      styles.lessonRow,
                      {
                        borderColor: isCompleted ? palette.success : palette.border,
                        backgroundColor: palette.background,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lessonTitle, { color: palette.textPrimary }]}>
                        {isCompleted ? '✅ ' : lockCheck.unlocked ? '📘 ' : '🔒 '}
                        {lesson.titleEn}
                      </Text>
                      {explanationLanguage === 'bn' && (
                        <Text style={[styles.lessonTitleBn, { color: palette.textSecondary }]}>
                          {lesson.titleBn}
                        </Text>
                      )}
                      <Text style={[styles.lessonMeta, { color: palette.textSecondary }]}>
                        {lesson.estimatedMinutes}m • +{lesson.xpReward} XP •{' '}
                        {progress ? `Best: ${progress.bestScore}%` : 'Not started'}
                      </Text>
                      {!lockCheck.unlocked && (
                        <Text style={{ color: palette.warning, fontSize: 12, marginTop: 4 }}>
                          {explanationLanguage === 'bn' ? lockCheck.reasonBn : lockCheck.reasonEn}
                        </Text>
                      )}
                    </View>

                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Open lesson ${lesson.titleEn}`}
                      disabled={!lockCheck.unlocked}
                      style={[
                        styles.startBtn,
                        {
                          backgroundColor: lockCheck.unlocked ? palette.primary : palette.border,
                        },
                      ]}
                      onPress={() => router.push(`/lesson/${lesson.id}`)}
                    >
                      <Text style={styles.startBtnText}>
                        {isCompleted ? 'Review' : progress ? 'Resume' : 'Start'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}

      {subTab === 'vocabulary' && (
        <View>
          {/* Add custom vocabulary card */}
          <View style={[styles.pathCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.pathTitle, { color: palette.textPrimary }]}>
              Add Word to Vocabulary Notebook
            </Text>
            <TextInput
              accessibilityLabel="New Vocabulary Word Input"
              style={[styles.input, { borderColor: palette.border, color: palette.textPrimary }]}
              placeholder="English word or phrase (e.g. resilient)"
              placeholderTextColor={palette.textSecondary}
              value={newWord}
              onChangeText={setNewWord}
            />
            <TextInput
              accessibilityLabel="New Vocabulary Bengali Meaning Input"
              style={[styles.input, { borderColor: palette.border, color: palette.textPrimary }]}
              placeholder="বাংলা অর্থ (e.g. প্রতিকূলতা জয়ী)"
              placeholderTextColor={palette.textSecondary}
              value={newMeaningBn}
              onChangeText={setNewMeaningBn}
            />
            <TextInput
              accessibilityLabel="New Vocabulary English Definition Input"
              style={[styles.input, { borderColor: palette.border, color: palette.textPrimary }]}
              placeholder="English definition"
              placeholderTextColor={palette.textSecondary}
              value={newDefEn}
              onChangeText={setNewDefEn}
            />
            <TextInput
              accessibilityLabel="New Vocabulary Example Sentence Input"
              style={[styles.input, { borderColor: palette.border, color: palette.textPrimary }]}
              placeholder="Example sentence (optional)"
              placeholderTextColor={palette.textSecondary}
              value={newExample}
              onChangeText={setNewExample}
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Save Word to Notebook"
              style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
              onPress={handleAddWord}
            >
              <Text style={styles.primaryBtnText}>+ Save Word to Notebook</Text>
            </TouchableOpacity>
          </View>

          {/* Filter pills */}
          <View style={styles.filterRow}>
            {(
              [
                ['all', `All (${vocabulary.length})`],
                ['due', `Due Now (${dueCards.length})`],
                ['favorites', 'Favorites ★'],
              ] as const
            ).map(([fKey, fLabel]) => (
              <TouchableOpacity
                key={fKey}
                accessibilityRole="button"
                style={[
                  styles.filterChip,
                  {
                    borderColor: vocabFilter === fKey ? palette.primary : palette.border,
                    backgroundColor: vocabFilter === fKey ? palette.primarySoft : palette.surface,
                  },
                ]}
                onPress={() => setVocabFilter(fKey)}
              >
                <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 13 }}>
                  {fLabel}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {displayedVocab.map((card) => (
            <View
              key={card.id}
              style={[styles.vocabCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
              <View style={styles.vocabTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.vocabWord, { color: palette.textPrimary }]}>
                    {card.wordOrPhrase}{' '}
                    <Text style={{ color: palette.textSecondary, fontSize: 14, fontWeight: '400' }}>
                      {card.phonetic}
                    </Text>
                  </Text>
                  <Text style={[styles.vocabBn, { color: palette.accent }]}>{card.meaningBn}</Text>
                </View>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Pronounce ${card.wordOrPhrase}`}
                  style={[styles.iconPill, { backgroundColor: palette.primarySoft }]}
                  onPress={() => {
                    try {
                      Speech.speak(card.wordOrPhrase, { language: 'en-US' });
                    } catch {
                      // Ignore TTS failure on unsupported simulator
                    }
                  }}
                >
                  <Text style={{ color: palette.primary, fontWeight: '700' }}>🔊</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Toggle favorite for ${card.wordOrPhrase}`}
                  style={[styles.iconPill, { backgroundColor: palette.surfaceAlt }]}
                  onPress={() => toggleFavoriteVocabulary(card.id)}
                >
                  <Text style={{ color: card.isFavorite ? palette.warning : palette.textSecondary }}>
                    {card.isFavorite ? '★' : '☆'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.vocabDef, { color: palette.textPrimary }]}>{card.definitionEn}</Text>
              <Text style={[styles.vocabExample, { color: palette.textSecondary }]}>
                “{card.exampleSentence}”
              </Text>
              <Text style={[styles.vocabScheduleMeta, { color: palette.textSecondary }]}>
                Interval: {card.intervalDays}d • EF: {card.easinessFactor} • Reviews:{' '}
                {card.reviewHistory.length} • Next: {card.nextReviewAt.slice(0, 10)}
              </Text>

              <Text style={[styles.rateLabel, { color: palette.textPrimary }]}>
                Rate Recall (SM-2 Scheduler):
              </Text>
              <View style={styles.ratingRow}>
                {(
                  [
                    [1, 'Again (1d)', palette.danger],
                    [3, 'Hard', palette.warning],
                    [4, 'Good', palette.primary],
                    [5, 'Easy', palette.success],
                  ] as const
                ).map(([ratingValue, label, btnColor]) => (
                  <TouchableOpacity
                    key={label}
                    accessibilityRole="button"
                    accessibilityLabel={`Rate ${card.wordOrPhrase} as ${label}`}
                    style={[styles.ratingBtn, { borderColor: btnColor }]}
                    onPress={() => reviewVocabularyCard(card.id, ratingValue)}
                  >
                    <Text style={{ color: btnColor, fontWeight: '700', fontSize: 12 }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {subTab === 'mistakes' && (
        <View>
          {mistakesBank.length === 0 ? (
            <View style={[styles.pathCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.pathTitle, { color: palette.textPrimary }]}>
                Zero Pending Mistakes! 🎉
              </Text>
              <Text style={[styles.pathDesc, { color: palette.textSecondary }]}>
                When you miss an exercise in any lesson quiz, it will be saved here with full Bengali and English explanations so you can review and master it.
              </Text>
            </View>
          ) : (
            mistakesBank.map((mistake) => (
              <View
                key={mistake.id}
                style={[styles.pathCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <Text style={[styles.vocabWord, { color: palette.textPrimary }]}>
                  {mistake.promptEn}
                </Text>
                <Text style={{ color: palette.danger, marginTop: 4, fontWeight: '600' }}>
                  Your previous answer: {mistake.userAnswer || '(blank)'}
                </Text>
                <Text style={{ color: palette.success, marginTop: 4, fontWeight: '700' }}>
                  Correct answer: {mistake.correctAnswer}
                </Text>
                <Text style={{ color: palette.textPrimary, marginTop: 6 }}>{mistake.explanationEn}</Text>
                {explanationLanguage === 'bn' && (
                  <Text style={{ color: palette.textSecondary, marginTop: 4 }}>
                    {mistake.explanationBn}
                  </Text>
                )}

                <View style={styles.mistakeActions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={[styles.startBtn, { backgroundColor: palette.primary }]}
                    onPress={() => router.push(`/lesson/${mistake.lessonId}`)}
                  >
                    <Text style={styles.startBtnText}>Practice Lesson</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Mark mistake ${mistake.id} resolved`}
                    style={[styles.resolveBtn, { borderColor: palette.success }]}
                    onPress={() => clearResolvedMistake(mistake.id)}
                  >
                    <Text style={{ color: palette.success, fontWeight: '700' }}>✓ Mark Mastered</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  segmentBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 46,
    justifyContent: 'center',
  },
  pathCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  pathLevelBadge: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  pathTitle: { fontSize: 19, fontWeight: '800' },
  pathTitleBn: { fontSize: 15, marginTop: 2 },
  pathDesc: { fontSize: 14, marginTop: 6, marginBottom: 12, lineHeight: 20 },
  lessonRow: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lessonTitle: { fontSize: 15, fontWeight: '700' },
  lessonTitleBn: { fontSize: 13, marginTop: 2 },
  lessonMeta: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  startBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  startBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 8,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  vocabCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  vocabTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  vocabWord: { fontSize: 18, fontWeight: '800' },
  vocabBn: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  iconPill: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  vocabDef: { fontSize: 14, marginTop: 8 },
  vocabExample: { fontSize: 13, fontStyle: 'italic', marginTop: 4 },
  vocabScheduleMeta: { fontSize: 12, marginTop: 8, fontWeight: '600' },
  rateLabel: { fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 42,
    justifyContent: 'center',
  },
  mistakeActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  resolveBtn: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
});
