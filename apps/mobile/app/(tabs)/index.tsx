import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SEED_LEARNING_PATHS } from '../../src/data/curriculum';
import { findLessonById, getDueVocabularyCards } from '../../src/services/learningEngine';
import { syncMutationsToServer } from '../../src/services/apiClient';
import { useAppStore } from '../../src/store/useAppStore';
import { useThemePalette } from '../../src/theme/colors';

export default function HomeScreen() {
  const router = useRouter();
  const palette = useThemePalette();

  const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
  const preferences = useAppStore((s) => s.preferences);
  const totalXp = useAppStore((s) => s.totalXp);
  const currentStreak = useAppStore((s) => s.currentStreak);
  const todayMinutesStudied = useAppStore((s) => s.todayMinutesStudied);
  const activeResumeLessonId = useAppStore((s) => s.activeResumeLessonId);
  const vocabulary = useAppStore((s) => s.vocabulary);
  const mistakesBank = useAppStore((s) => s.mistakesBank);
  const syncQueue = useAppStore((s) => s.syncQueue);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const isOnline = useAppStore((s) => s.isOnline);
  const flushSyncQueue = useAppStore((s) => s.flushSyncQueue);

  const dueCards = useMemo(() => getDueVocabularyCards(vocabulary), [vocabulary]);
  const resumeLesson = useMemo(
    () => findLessonById(activeResumeLessonId || 'lesson-beg-1') ?? SEED_LEARNING_PATHS[0].lessons[0],
    [activeResumeLessonId]
  );

  const dailyProgressPercent = Math.min(
    100,
    Math.round((todayMinutesStudied / Math.max(5, preferences.dailyTargetMinutes)) * 100)
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
    >
      {!hasCompletedOnboarding && (
        <View style={[styles.onboardingBanner, { backgroundColor: palette.primarySoft, borderColor: palette.primary }]}>
          <Text style={[styles.bannerTitle, { color: palette.textPrimary }]}>
            Personalize Your English Path
          </Text>
          <Text style={[styles.bannerSub, { color: palette.textSecondary }]}>
            Take the 1-minute placement check and set your Bengali/English preference.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open Onboarding Setup"
            style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
            onPress={() => router.push('/onboarding')}
          >
            <Text style={styles.primaryBtnText}>Complete Setup & Placement →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Hero Header */}
      <View style={[styles.heroCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: palette.textPrimary }]}>
              Hello, {preferences.displayName}! 👋
            </Text>
            <Text style={[styles.tagline, { color: palette.textSecondary }]}>
              {preferences.explanationLanguage === 'bn'
                ? 'প্রতিদিন একটু করে ইংরেজি চর্চা আপনাকে আত্মবিশ্বাসী করে তুলবে।'
                : 'Practice English every day with your personal AI tutor.'}
            </Text>
          </View>
          <View
            style={[
              styles.syncBadge,
              {
                backgroundColor: isOnline ? palette.primarySoft : palette.surfaceAlt,
              },
            ]}
          >
            <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>
              {!isOnline
                ? `Offline (${syncQueue.length})`
                : syncQueue.length > 0
                ? `${syncQueue.length} Queued`
                : 'Synced ✓'}
            </Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statBox, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <Text style={[styles.statValue, { color: palette.warning }]}>🔥 {currentStreak}d</Text>
            <Text style={[styles.statLabel, { color: palette.textSecondary }]}>Streak</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <Text style={[styles.statValue, { color: palette.primary }]}>⚡ {totalXp}</Text>
            <Text style={[styles.statLabel, { color: palette.textSecondary }]}>Total XP</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <Text style={[styles.statValue, { color: palette.accent }]}>
              ⏱ {todayMinutesStudied}/{preferences.dailyTargetMinutes}m
            </Text>
            <Text style={[styles.statLabel, { color: palette.textSecondary }]}>Daily Goal</Text>
          </View>
        </View>

        <View style={[styles.progressBarTrack, { backgroundColor: palette.surfaceAlt }]}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${dailyProgressPercent}%`, backgroundColor: palette.accent },
            ]}
          />
        </View>
        <Text style={[styles.progressCaption, { color: palette.textSecondary }]}>
          Daily study target: {dailyProgressPercent}% complete
        </Text>
      </View>

      {/* Resume Learning Card */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.sectionBadge, { color: palette.primary }]}>CONTINUE LEARNING</Text>
        <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>{resumeLesson.titleEn}</Text>
        {preferences.explanationLanguage === 'bn' && (
          <Text style={[styles.cardSubtitleBn, { color: palette.textSecondary }]}>
            {resumeLesson.titleBn}
          </Text>
        )}
        <Text style={[styles.metaRow, { color: palette.textSecondary }]}>
          Level: {resumeLesson.level.toUpperCase()} • {resumeLesson.estimatedMinutes} mins • +{resumeLesson.xpReward} XP
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Resume lesson ${resumeLesson.titleEn}`}
          style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
          onPress={() => router.push(`/lesson/${resumeLesson.id}`)}
        >
          <Text style={styles.primaryBtnText}>Resume Lesson →</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Practice Hub Shortcuts */}
      <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
        Daily AI & Skill Practice / প্রতিদিনের অনুশীলন
      </Text>
      <View style={styles.shortcutGrid}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open AI Conversation Tutor"
          style={[styles.shortcutCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={() => router.push('/(tabs)/practice')}
        >
          <Text style={styles.shortcutEmoji}>🤖</Text>
          <Text style={[styles.shortcutTitle, { color: palette.textPrimary }]}>AI English Tutor</Text>
          <Text style={[styles.shortcutSub, { color: palette.textSecondary }]}>
            Roleplay interviews, campus & daily life
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open Spaced Repetition Vocabulary"
          style={[styles.shortcutCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={() => router.push('/(tabs)/learn')}
        >
          <Text style={styles.shortcutEmoji}>🗂️</Text>
          <Text style={[styles.shortcutTitle, { color: palette.textPrimary }]}>
            Vocab Review ({dueCards.length} Due)
          </Text>
          <Text style={[styles.shortcutSub, { color: palette.textSecondary }]}>
            SM-2 spaced repetition flashcards
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open Grammar Checker and Speaking Lab"
          style={[styles.shortcutCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={() => router.push('/(tabs)/practice')}
        >
          <Text style={styles.shortcutEmoji}>✍️</Text>
          <Text style={[styles.shortcutTitle, { color: palette.textPrimary }]}>Grammar & Speaking</Text>
          <Text style={[styles.shortcutSub, { color: palette.textSecondary }]}>
            Instant corrections & voice practice
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open IELTS Preparation Module"
          style={[styles.shortcutCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={() => router.push('/(tabs)/practice')}
        >
          <Text style={styles.shortcutEmoji}>🎓</Text>
          <Text style={[styles.shortcutTitle, { color: palette.textPrimary }]}>IELTS Band 7+ Prep</Text>
          <Text style={[styles.shortcutSub, { color: palette.textSecondary }]}>
            Speaking cue cards, Task 1/2 & Reading
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mistake Review Callout */}
      {mistakesBank.length > 0 && (
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.sectionBadge, { color: palette.warning }]}>
            MISTAKE REVIEW ({mistakesBank.length} ITEMS)
          </Text>
          <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>
            Understand & Fix Recent Quiz Mistakes
          </Text>
          <Text style={[styles.cardSubtitleBn, { color: palette.textSecondary }]}>
            {mistakesBank[0].promptEn} — Correct: {mistakesBank[0].correctAnswer}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Review Mistakes in Learn Tab"
            style={[styles.outlineBtn, { borderColor: palette.primary }]}
            onPress={() => router.push('/(tabs)/learn')}
          >
            <Text style={{ color: palette.primary, fontWeight: '700' }}>Review All Mistakes</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Offline Sync Action if pending */}
      {syncQueue.length > 0 && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Synchronize Offline Progress Now"
          style={[styles.syncNowBtn, { borderColor: palette.accent, backgroundColor: palette.surface }]}
          onPress={() => void flushSyncQueue(syncMutationsToServer)}
        >
          <Text style={{ color: palette.accent, fontWeight: '700' }}>
            {syncStatus === 'syncing'
              ? 'Synchronizing progress...'
              : `Sync ${syncQueue.length} Queued Progress Update(s) Now`}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },
  onboardingBanner: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  bannerTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  bannerSub: { fontSize: 14, marginBottom: 12 },
  heroCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  greeting: { fontSize: 22, fontWeight: '800' },
  tagline: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  syncBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  statsGrid: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 14 },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  progressBarTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  progressCaption: { fontSize: 12, marginTop: 6, fontWeight: '600' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  sectionBadge: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  cardTitle: { fontSize: 19, fontWeight: '800' },
  cardSubtitleBn: { fontSize: 14, marginTop: 4 },
  metaRow: { fontSize: 13, marginTop: 8, marginBottom: 12, fontWeight: '600' },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  outlineBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  shortcutCard: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    minHeight: 120,
  },
  shortcutEmoji: { fontSize: 24, marginBottom: 8 },
  shortcutTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  shortcutSub: { fontSize: 12, lineHeight: 17 },
  syncNowBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
});
