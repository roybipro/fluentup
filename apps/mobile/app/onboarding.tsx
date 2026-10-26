import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { PLACEMENT_QUESTIONS } from '../src/data/curriculum';
import {
  ExplanationLanguage,
  LearningGoal,
  ProficiencyLevel,
} from '../src/schemas/domain';
import { evaluatePlacementAssessment } from '../src/services/learningEngine';
import { useAppStore } from '../src/store/useAppStore';
import { useThemePalette } from '../src/theme/colors';

const GOAL_OPTIONS: Array<{ id: LearningGoal; labelEn: string; labelBn: string }> = [
  { id: 'daily_conversation', labelEn: 'Daily Conversation', labelBn: 'দৈনন্দিন কথোপকথন' },
  { id: 'job_interviews', labelEn: 'Job Interviews & Career', labelBn: 'চাকরির ইন্টারভিউ ও ক্যারিয়ার' },
  { id: 'ielts_exam', labelEn: 'IELTS Preparation (Band 7+)', labelBn: 'IELTS প্রস্তুতি (ব্যান্ড ৭+)' },
  { id: 'university_academic', labelEn: 'University & Research', labelBn: 'বিশ্ববিদ্যালয় ও উচ্চশিক্ষা' },
  { id: 'professional_workplace', labelEn: 'Workplace & Meetings', labelBn: 'অফিস মিটিং ও প্রেজেন্টেশন' },
  { id: 'travel_abroad', labelEn: 'Travel & Living Abroad', labelBn: 'বিদেশ ভ্রমণ ও জীবনযাপন' },
];

const INTEREST_OPTIONS = [
  { id: 'career', label: 'Software & Career' },
  { id: 'academic', label: 'University & IELTS' },
  { id: 'daily_life', label: 'Daily Conversations' },
  { id: 'travel', label: 'Global Travel' },
  { id: 'public_speaking', label: 'Presentations & Debates' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const palette = useThemePalette();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const continueAsGuest = useAppStore((s) => s.continueAsGuest);
  const authSession = useAppStore((s) => s.authSession);

  const [step, setStep] = useState<'preferences' | 'placement' | 'summary'>('preferences');
  const [displayName, setDisplayName] = useState('Learner');
  const [explanationLanguage, setExplanationLanguage] = useState<ExplanationLanguage>('bn');
  const [selfProficiency, setSelfProficiency] = useState<ProficiencyLevel>('beginner');
  const [learningGoal, setLearningGoal] = useState<LearningGoal>('daily_conversation');
  const [dailyTargetMinutes, setDailyTargetMinutes] = useState<number>(15);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(['career', 'daily_life']);
  const [placementAnswers, setPlacementAnswers] = useState<Record<string, string>>({});
  const [recommendedLevel, setRecommendedLevel] = useState<ProficiencyLevel>('beginner');
  const [placementScore, setPlacementScore] = useState<number>(0);

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((item) => item !== id) : prev) : [...prev, id]
    );
  };

  const handleFinishPlacement = () => {
    const result = evaluatePlacementAssessment(placementAnswers, learningGoal);
    setRecommendedLevel(result.recommendedLevel);
    setPlacementScore(result.scorePercent);
    setStep('summary');
  };

  const handleCompleteOnboarding = (chosenLevel: ProficiencyLevel) => {
    completeOnboarding({
      displayName: displayName.trim() || 'Learner',
      explanationLanguage,
      proficiencyLevel: chosenLevel,
      learningGoal,
      dailyTargetMinutes,
      interests: selectedInterests,
      placementScore,
    });
    if (!authSession) {
      continueAsGuest();
    }
    router.replace('/(tabs)');
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.brandBadge, { color: palette.primary }]}>FLUENTUP PERSONALIZED SETUP</Text>
      <Text style={[styles.title, { color: palette.textPrimary }]}>
        {step === 'preferences'
          ? 'Build Your English Learning Plan'
          : step === 'placement'
          ? 'Quick 5-Question Placement Check'
          : 'Your Recommended Learning Path'}
      </Text>
      <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
        {explanationLanguage === 'bn'
          ? 'প্রতিদিন এআই টিউটরের সাথে ইংরেজি চর্চা করুন, নিজের ভুলগুলো বাংলায় বুঝুন এবং বাস্তব জীবনের যোগাযোগ দক্ষতা গড়ে তুলুন।'
          : 'Practice English every day with a personal AI tutor, understand your mistakes, and build real-world communication skills.'}
      </Text>

      {step === 'preferences' && (
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.label, { color: palette.textPrimary }]}>Your Name / আপনার নাম</Text>
          <TextInput
            accessibilityLabel="Learner Name Input"
            style={[
              styles.input,
              {
                color: palette.textPrimary,
                borderColor: palette.border,
                backgroundColor: palette.background,
              },
            ]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter your name"
            placeholderTextColor={palette.textSecondary}
          />

          <Text style={[styles.label, { color: palette.textPrimary }]}>
            Preferred Explanation Language / ব্যাখ্যার ভাষা
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Bengali and English Explanations"
              style={[
                styles.choiceButton,
                {
                  borderColor: explanationLanguage === 'bn' ? palette.primary : palette.border,
                  backgroundColor: explanationLanguage === 'bn' ? palette.primarySoft : palette.background,
                },
              ]}
              onPress={() => setExplanationLanguage('bn')}
            >
              <Text style={[styles.choiceTitle, { color: palette.textPrimary }]}>বাংলা + English</Text>
              <Text style={[styles.choiceSub, { color: palette.textSecondary }]}>
                Bilingual explanations & tips
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="English First Explanations"
              style={[
                styles.choiceButton,
                {
                  borderColor: explanationLanguage === 'en' ? palette.primary : palette.border,
                  backgroundColor: explanationLanguage === 'en' ? palette.primarySoft : palette.background,
                },
              ]}
              onPress={() => setExplanationLanguage('en')}
            >
              <Text style={[styles.choiceTitle, { color: palette.textPrimary }]}>English First</Text>
              <Text style={[styles.choiceSub, { color: palette.textSecondary }]}>
                Immersion mode in English
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: palette.textPrimary }]}>
            Primary Learning Goal / আপনার প্রধান লক্ষ্য
          </Text>
          {GOAL_OPTIONS.map((goal) => {
            const active = learningGoal === goal.id;
            return (
              <TouchableOpacity
                key={goal.id}
                accessibilityRole="button"
                accessibilityLabel={goal.labelEn}
                style={[
                  styles.listOption,
                  {
                    borderColor: active ? palette.primary : palette.border,
                    backgroundColor: active ? palette.primarySoft : palette.background,
                  },
                ]}
                onPress={() => setLearningGoal(goal.id)}
              >
                <Text style={[styles.choiceTitle, { color: palette.textPrimary }]}>{goal.labelEn}</Text>
                <Text style={[styles.choiceSub, { color: palette.textSecondary }]}>{goal.labelBn}</Text>
              </TouchableOpacity>
            );
          })}

          <Text style={[styles.label, { color: palette.textPrimary }]}>
            Daily Study Target (Minutes) / প্রতিদিনের লক্ষ্য
          </Text>
          <View style={styles.row}>
            {[10, 15, 20, 30].map((mins) => {
              const active = dailyTargetMinutes === mins;
              return (
                <TouchableOpacity
                  key={mins}
                  accessibilityRole="button"
                  accessibilityLabel={`${mins} minutes daily target`}
                  style={[
                    styles.pillButton,
                    {
                      borderColor: active ? palette.primary : palette.border,
                      backgroundColor: active ? palette.primary : palette.background,
                    },
                  ]}
                  onPress={() => setDailyTargetMinutes(mins)}
                >
                  <Text
                    style={{
                      color: active ? '#FFFFFF' : palette.textPrimary,
                      fontWeight: '700',
                    }}
                  >
                    {mins}m
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { color: palette.textPrimary }]}>
            Current Self-Estimated Level / বর্তমান দক্ষতা
          </Text>
          <View style={styles.wrapRow}>
            {(
              [
                ['beginner', 'Beginner (A1)'],
                ['elementary', 'Elementary (A2)'],
                ['intermediate', 'Intermediate (B1)'],
                ['upper_intermediate', 'Upper-Int (B2)'],
                ['advanced', 'Advanced (C1)'],
                ['ielts', 'IELTS Track'],
              ] as Array<[ProficiencyLevel, string]>
            ).map(([lvl, label]) => {
              const active = selfProficiency === lvl;
              return (
                <TouchableOpacity
                  key={lvl}
                  accessibilityRole="button"
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? palette.primary : palette.border,
                      backgroundColor: active ? palette.primarySoft : palette.background,
                    },
                  ]}
                  onPress={() => setSelfProficiency(lvl)}
                >
                  <Text style={{ color: palette.textPrimary, fontWeight: '600', fontSize: 13 }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { color: palette.textPrimary }]}>
            Learning Interests / পছন্দের বিষয়
          </Text>
          <View style={styles.wrapRow}>
            {INTEREST_OPTIONS.map((item) => {
              const active = selectedInterests.includes(item.id);
              return (
                <TouchableOpacity
                  key={item.id}
                  accessibilityRole="button"
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? palette.accent : palette.border,
                      backgroundColor: active ? palette.surfaceAlt : palette.background,
                    },
                  ]}
                  onPress={() => toggleInterest(item.id)}
                >
                  <Text style={{ color: palette.textPrimary, fontWeight: '600', fontSize: 13 }}>
                    {active ? '✓ ' : ''}
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Start Placement Assessment"
            style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
            onPress={() => setStep('placement')}
          >
            <Text style={styles.primaryBtnText}>Take 1-Minute Placement Assessment →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Skip Placement and Start"
            style={styles.secondaryBtn}
            onPress={() => handleCompleteOnboarding(selfProficiency)}
          >
            <Text style={[styles.secondaryBtnText, { color: palette.textSecondary }]}>
              Skip placement & start at {selfProficiency.replace('_', '-').toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'placement' && (
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {PLACEMENT_QUESTIONS.map((q, idx) => (
            <View key={q.id} style={styles.questionBlock}>
              <Text style={[styles.questionTitle, { color: palette.textPrimary }]}>
                {idx + 1}. {q.questionEn}
              </Text>
              {explanationLanguage === 'bn' && (
                <Text style={[styles.questionSub, { color: palette.textSecondary }]}>{q.questionBn}</Text>
              )}
              {q.options.map((opt) => {
                const chosen = placementAnswers[q.id] === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    accessibilityRole="button"
                    accessibilityLabel={`Answer option ${opt}`}
                    style={[
                      styles.listOption,
                      {
                        borderColor: chosen ? palette.primary : palette.border,
                        backgroundColor: chosen ? palette.primarySoft : palette.background,
                      },
                    ]}
                    onPress={() =>
                      setPlacementAnswers((prev) => ({
                        ...prev,
                        [q.id]: opt,
                      }))
                    }
                  >
                    <Text style={{ color: palette.textPrimary, fontWeight: chosen ? '700' : '500' }}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Submit Placement Assessment"
            style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
            onPress={handleFinishPlacement}
          >
            <Text style={styles.primaryBtnText}>See My Recommended Level</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'summary' && (
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.scoreBadge, { color: palette.success }]}>
            Placement Score: {placementScore}%
          </Text>
          <Text style={[styles.recommendedTitle, { color: palette.textPrimary }]}>
            Recommended Path: {recommendedLevel.replace('_', ' ').toUpperCase()}
          </Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
            {explanationLanguage === 'bn'
              ? `আপনার মূল্যায়নের ভিত্তিতে আমরা ${recommendedLevel.toUpperCase()} পাথে শুরু করার পরামর্শ দিচ্ছি। আপনি যেকোনো সময় অন্য সব লেভেলও অনুশীলন করতে পারবেন।`
              : `Based on your placement answers and goal, we recommend starting with the ${recommendedLevel.toUpperCase()} path.`}
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Confirm Recommended Path"
            style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
            onPress={() => handleCompleteOnboarding(recommendedLevel)}
          >
            <Text style={styles.primaryBtnText}>Start Learning Now</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  brandBadge: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginTop: 24, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  card: { borderRadius: 16, borderWidth: 1, padding: 18 },
  label: { fontSize: 15, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  row: { flexDirection: 'row', gap: 10 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceButton: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    minHeight: 68,
    justifyContent: 'center',
  },
  choiceTitle: { fontSize: 15, fontWeight: '700' },
  choiceSub: { fontSize: 13, marginTop: 2 },
  listOption: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  pillButton: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  primaryBtn: {
    marginTop: 22,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
  questionBlock: { marginBottom: 18 },
  questionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  questionSub: { fontSize: 14, marginBottom: 8 },
  scoreBadge: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  recommendedTitle: { fontSize: 22, fontWeight: '800', marginBottom: 10 },
});
