import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SEED_LEARNING_PATHS } from '../../src/data/curriculum';
import { useAppStore } from '../../src/store/useAppStore';
import { useThemePalette } from '../../src/theme/colors';

export default function ProgressScreen() {
  const palette = useThemePalette();

  const totalXp = useAppStore((s) => s.totalXp);
  const currentStreak = useAppStore((s) => s.currentStreak);
  const longestStreak = useAppStore((s) => s.longestStreak);
  const todayMinutesStudied = useAppStore((s) => s.todayMinutesStudied);
  const dailyTargetMinutes = useAppStore((s) => s.preferences.dailyTargetMinutes);
  const lessonProgress = useAppStore((s) => s.lessonProgress);
  const vocabulary = useAppStore((s) => s.vocabulary);
  const ieltsHistory = useAppStore((s) => s.ieltsHistory);

  const totalLessonsCount = useMemo(
    () => SEED_LEARNING_PATHS.reduce((acc, p) => acc + p.lessons.length, 0),
    []
  );

  const completedLessonsCount = useMemo(
    () => Object.values(lessonProgress).filter((p) => p.status === 'completed').length,
    [lessonProgress]
  );

  const averageQuizScore = useMemo(() => {
    const records = Object.values(lessonProgress).filter((p) => p.attemptsCount > 0);
    if (records.length === 0) return 0;
    const sum = records.reduce((acc, r) => acc + r.bestScore, 0);
    return Math.round(sum / records.length);
  }, [lessonProgress]);

  const reviewedVocabCount = useMemo(
    () => vocabulary.filter((c) => c.repetitionNumber > 0).length,
    [vocabulary]
  );

  const achievements = useMemo(
    () => [
      {
        code: 'first_lesson',
        titleEn: 'First Step',
        descEn: 'Complete your first English lesson with 70%+',
        unlocked: completedLessonsCount >= 1,
      },
      {
        code: 'xp_100',
        titleEn: 'Centurion Learner',
        descEn: 'Earn at least 100 XP through lessons & vocabulary recall',
        unlocked: totalXp >= 100,
      },
      {
        code: 'vocab_scholar',
        titleEn: 'Vocabulary Builder',
        descEn: 'Review or add at least 3 vocabulary flashcards',
        unlocked: reviewedVocabCount >= 3 || vocabulary.length >= 8,
      },
      {
        code: 'ielts_contender',
        titleEn: 'IELTS Contender',
        descEn: 'Complete at least one IELTS Writing or Speaking evaluation',
        unlocked: ieltsHistory.length >= 1,
      },
    ],
    [completedLessonsCount, totalXp, reviewedVocabCount, vocabulary.length, ieltsHistory.length]
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.badge, { color: palette.primary }]}>VERIFIED STUDY ANALYTICS</Text>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Your Learning Progress</Text>

        <View style={styles.metricsGrid}>
          <View style={[styles.metricTile, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <Text style={[styles.metricVal, { color: palette.primary }]}>{totalXp}</Text>
            <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>Total XP</Text>
          </View>

          <View style={[styles.metricTile, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <Text style={[styles.metricVal, { color: palette.warning }]}>
              {currentStreak}d (Best {longestStreak}d)
            </Text>
            <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>Active Streak</Text>
          </View>

          <View style={[styles.metricTile, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <Text style={[styles.metricVal, { color: palette.success }]}>
              {completedLessonsCount}/{totalLessonsCount}
            </Text>
            <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>Lessons Passed</Text>
          </View>

          <View style={[styles.metricTile, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <Text style={[styles.metricVal, { color: palette.accent }]}>{averageQuizScore}%</Text>
            <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>Avg Best Score</Text>
          </View>
        </View>

        <Text style={[styles.metaNote, { color: palette.textSecondary }]}>
          Today’s study time: {todayMinutesStudied} min / {dailyTargetMinutes} min target • Active SM-2 vocabulary cards: {vocabulary.length} ({reviewedVocabCount} reviewed)
        </Text>
      </View>

      {/* Level-by-Level Completion */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
          Curriculum Mastery by CEFR / IELTS Level
        </Text>
        {SEED_LEARNING_PATHS.map((path) => {
          const doneInPath = path.lessons.filter(
            (l) => lessonProgress[l.id]?.status === 'completed'
          ).length;
          const pct = Math.round((doneInPath / path.lessons.length) * 100);
          return (
            <View key={path.id} style={styles.pathProgressRow}>
              <View style={styles.pathProgressHeader}>
                <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 14 }}>
                  {path.titleEn}
                </Text>
                <Text style={{ color: palette.primary, fontWeight: '700', fontSize: 13 }}>
                  {doneInPath}/{path.lessons.length} ({pct}%)
                </Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: palette.surfaceAlt }]}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${pct}%`, backgroundColor: pct === 100 ? palette.success : palette.primary },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>

      {/* Achievements */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Achievements</Text>
        {achievements.map((ach) => (
          <View
            key={ach.code}
            style={[
              styles.achievementRow,
              {
                borderColor: ach.unlocked ? palette.success : palette.border,
                backgroundColor: palette.background,
              },
            ]}
          >
            <Text style={{ fontSize: 22 }}>{ach.unlocked ? '🏆' : '🔒'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 15 }}>
                {ach.titleEn}
              </Text>
              <Text style={{ color: palette.textSecondary, fontSize: 13 }}>{ach.descEn}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* IELTS Practice History */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
          IELTS Practice History (Unofficial Estimates)
        </Text>
        {ieltsHistory.length === 0 ? (
          <Text style={{ color: palette.textSecondary, fontSize: 14 }}>
            No IELTS practice evaluations recorded yet. Complete a Writing or Speaking task in the Practice tab to track your trend here.
          </Text>
        ) : (
          ieltsHistory.map((item, idx) => (
            <View
              key={`${item.taskId}-${idx}`}
              style={[styles.historyItem, { borderColor: palette.border, backgroundColor: palette.background }]}
            >
              <Text style={{ color: palette.primary, fontWeight: '800', fontSize: 13 }}>
                {item.moduleType.toUpperCase()} • Est. Band {item.estimatedBand.toFixed(1)} (Unofficial)
              </Text>
              <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 2 }}>
                {item.createdAt.slice(0, 10)} • “{item.userResponse.slice(0, 90)}...”
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  badge: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricTile: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  metricVal: { fontSize: 20, fontWeight: '800' },
  metricLabel: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  metaNote: { fontSize: 13, marginTop: 12, lineHeight: 19 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 10 },
  pathProgressRow: { marginBottom: 12 },
  pathProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  achievementRow: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
});
