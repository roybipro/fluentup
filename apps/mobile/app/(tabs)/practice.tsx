import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import {
  CONVERSATION_SCENARIOS,
  IELTS_READING_PASSAGES,
  IELTS_SPEAKING_PROMPTS,
  IELTS_WRITING_PROMPTS,
  LISTENING_TRACKS,
} from '../../src/data/practiceCatalog';
import {
  AITutorFeedback,
  GrammarCheckResult,
  IELTSEvaluation,
} from '../../src/schemas/domain';
import {
  requestAITutorFeedback,
  requestGrammarCheck,
  requestIELTSEvaluation,
} from '../../src/services/apiClient';
import { useAppStore } from '../../src/store/useAppStore';
import { useThemePalette } from '../../src/theme/colors';

type PracticeModule = 'tutor' | 'grammar' | 'speaking' | 'listening' | 'ielts';

export default function PracticeScreen() {
  const palette = useThemePalette();
  const explanationLanguage = useAppStore((s) => s.preferences.explanationLanguage);
  const recordGrammarCheck = useAppStore((s) => s.recordGrammarCheck);
  const recordIELTSAttempt = useAppStore((s) => s.recordIELTSAttempt);

  const [activeModule, setActiveModule] = useState<PracticeModule>('tutor');

  // --- AI Tutor state ---
  const [selectedScenario, setSelectedScenario] = useState(CONVERSATION_SCENARIOS[0]);
  const [tutorInput, setTutorInput] = useState(CONVERSATION_SCENARIOS[0].sampleStarterEn);
  const [tutorLoading, setTutorLoading] = useState(false);
  const [tutorFeedback, setTutorFeedback] = useState<AITutorFeedback | null>(null);

  // --- Grammar Checker state ---
  const [grammarInput, setGrammarInput] = useState(
    'I am working here since 3 years and yesterday I did not went to discuss about the meeting.'
  );
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarError, setGrammarError] = useState<string | null>(null);
  const [grammarResult, setGrammarResult] = useState<GrammarCheckResult | null>(null);

  // --- Speaking & Microphone state ---
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [micPermissionStatus, setMicPermissionStatus] = useState<string>('not_requested');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [editableTranscript, setEditableTranscript] = useState(
    'In my current role, I collaborate with mobile and backend engineers to build reliable user experiences.'
  );
  const [speakingStatusMsg, setSpeakingStatusMsg] = useState<string | null>(null);

  // --- Listening state ---
  const [selectedTrack, setSelectedTrack] = useState(LISTENING_TRACKS[0]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [listeningAnswers, setListeningAnswers] = useState<Record<string, string>>({});
  const [listeningChecked, setListeningChecked] = useState(false);

  // --- IELTS state ---
  const [ieltsTab, setIeltsTab] = useState<'speaking' | 'writing' | 'reading'>('writing');
  const [selectedCueCard, setSelectedCueCard] = useState(IELTS_SPEAKING_PROMPTS[1]);
  const [selectedWritingTask, setSelectedWritingTask] = useState(IELTS_WRITING_PROMPTS[1]);
  const [ieltsResponseText, setIeltsResponseText] = useState(
    'Although expanding urban highways provides temporary relief, investing in mass rapid transit systems such as metro rail and dedicated bus lanes is a far more sustainable solution. First, high-capacity public transport significantly reduces per-capita carbon emissions and road congestion. Furthermore, empirical evidence from major metropolitan areas demonstrates that wider highways often trigger induced demand, ultimately restoring gridlock.'
  );
  const [ieltsLoading, setIeltsLoading] = useState(false);
  const [ieltsEvaluation, setIeltsEvaluation] = useState<IELTSEvaluation | null>(null);
  const [readingAnswers, setReadingAnswers] = useState<Record<string, string>>({});
  const [readingChecked, setReadingChecked] = useState(false);

  // Stop any active recording or speech when leaving screen
  useEffect(() => {
    return () => {
      try {
        Speech.stop();
      } catch {
        // Ignore
      }
      if (recordingRef.current) {
        void recordingRef.current.stopAndUnloadAsync().catch(() => undefined);
        recordingRef.current = null;
      }
    };
  }, []);

  const handleSendTutorTurn = async () => {
    if (!tutorInput.trim()) return;
    setTutorLoading(true);
    try {
      const feedback = await requestAITutorFeedback({
        scenarioId: selectedScenario.id,
        scenarioTitle: selectedScenario.titleEn,
        userMessage: tutorInput,
        explanationLanguage,
      });
      setTutorFeedback(feedback);
    } finally {
      setTutorLoading(false);
    }
  };

  const handleRunGrammarCheck = async () => {
    setGrammarError(null);
    if (!grammarInput.trim()) {
      setGrammarError('Please enter a sentence or paragraph to check.');
      return;
    }
    setGrammarLoading(true);
    try {
      const res = await requestGrammarCheck({
        text: grammarInput,
        explanationLanguage,
      });
      setGrammarResult(res);
      recordGrammarCheck(res);
    } catch (err) {
      setGrammarError(err instanceof Error ? err.message : 'Unable to check grammar right now.');
    } finally {
      setGrammarLoading(false);
    }
  };

  const handleStartRecording = async () => {
    setSpeakingStatusMsg(null);
    try {
      const perm = await Audio.requestPermissionsAsync();
      setMicPermissionStatus(perm.granted ? 'granted' : 'denied');
      if (!perm.granted) {
        setSpeakingStatusMsg(
          'Microphone permission was denied. You can still type and edit your response below or listen via Text-to-Speech.'
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setSpeakingStatusMsg('Recording voice... Tap Stop when finished.');
    } catch {
      setSpeakingStatusMsg(
        'Audio recording hardware is unavailable on this simulator/device. Use the editable transcript box below.'
      );
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    if (!recordingRef.current) {
      setIsRecording(false);
      return;
    }
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      setRecordedUri(uri);
      recordingRef.current = null;
      setIsRecording(false);
      setSpeakingStatusMsg(
        'Recording saved locally! You can edit the transcript below and get AI feedback.'
      );
    } catch {
      setIsRecording(false);
    }
  };

  const handlePlayListeningAudio = () => {
    setIsPlayingAudio(true);
    try {
      Speech.stop();
      Speech.speak(selectedTrack.transcriptEn, {
        language: 'en-US',
        rate: playbackSpeed,
        onDone: () => setIsPlayingAudio(false),
        onStopped: () => setIsPlayingAudio(false),
        onError: () => setIsPlayingAudio(false),
      });
    } catch {
      setIsPlayingAudio(false);
    }
  };

  const handlePauseListeningAudio = () => {
    try {
      Speech.stop();
    } catch {
      // ignore
    }
    setIsPlayingAudio(false);
  };

  const handleEvaluateIELTS = async (moduleType: 'speaking' | 'writing', taskId: string, promptText: string) => {
    if (!ieltsResponseText.trim()) return;
    setIeltsLoading(true);
    try {
      const evalRes = await requestIELTSEvaluation({
        moduleType,
        taskId,
        promptText,
        userResponse: ieltsResponseText,
      });
      setIeltsEvaluation(evalRes);
      recordIELTSAttempt(evalRes, ieltsResponseText);
    } finally {
      setIeltsLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Module Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.moduleBar}>
        {(
          [
            ['tutor', '🤖 AI Tutor'],
            ['grammar', '✍️ Grammar'],
            ['speaking', '🎙️ Speaking'],
            ['listening', '🎧 Listening'],
            ['ielts', '🎓 IELTS Prep'],
          ] as Array<[PracticeModule, string]>
        ).map(([key, label]) => {
          const active = activeModule === key;
          return (
            <TouchableOpacity
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${label}`}
              style={[
                styles.moduleChip,
                {
                  backgroundColor: active ? palette.primary : palette.surface,
                  borderColor: active ? palette.primary : palette.border,
                },
              ]}
              onPress={() => setActiveModule(key)}
            >
              <Text style={{ color: active ? '#FFFFFF' : palette.textPrimary, fontWeight: '700' }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 1. AI CONVERSATION TUTOR */}
      {activeModule === 'tutor' && (
        <View>
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.badge, { color: palette.primary }]}>
              CONTEXTUAL AI CONVERSATION PRACTICE
            </Text>
            <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>
              Choose a Real-World Scenario
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
              {CONVERSATION_SCENARIOS.map((scen) => {
                const selected = selectedScenario.id === scen.id;
                return (
                  <TouchableOpacity
                    key={scen.id}
                    accessibilityRole="button"
                    style={[
                      styles.scenarioChip,
                      {
                        borderColor: selected ? palette.primary : palette.border,
                        backgroundColor: selected ? palette.primarySoft : palette.background,
                      },
                    ]}
                    onPress={() => {
                      setSelectedScenario(scen);
                      setTutorInput(scen.sampleStarterEn);
                      setTutorFeedback(null);
                    }}
                  >
                    <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 13 }}>
                      {scen.titleEn}
                    </Text>
                    <Text style={{ color: palette.textSecondary, fontSize: 11, marginTop: 2 }}>
                      {scen.level}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={[styles.promptBox, { backgroundColor: palette.background, borderColor: palette.border }]}>
              <Text style={{ color: palette.primary, fontWeight: '800', fontSize: 12 }}>
                AI TUTOR PROMPT ({selectedScenario.level}):
              </Text>
              <Text style={[styles.tutorPromptText, { color: palette.textPrimary }]}>
                “{selectedScenario.openingTutorPromptEn}”
              </Text>
              {explanationLanguage === 'bn' && (
                <Text style={{ color: palette.textSecondary, marginTop: 4, fontSize: 13 }}>
                  {selectedScenario.openingTutorPromptBn}
                </Text>
              )}
            </View>

            <Text style={[styles.label, { color: palette.textPrimary }]}>
              Your Response (Type or Edit):
            </Text>
            <TextInput
              accessibilityLabel="AI Tutor Learner Response Input"
              multiline
              style={[
                styles.textArea,
                {
                  borderColor: palette.border,
                  color: palette.textPrimary,
                  backgroundColor: palette.background,
                },
              ]}
              value={tutorInput}
              onChangeText={setTutorInput}
              placeholder="Write your reply in English..."
              placeholderTextColor={palette.textSecondary}
            />

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Submit Response to AI Tutor"
              disabled={tutorLoading}
              style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
              onPress={() => void handleSendTutorTurn()}
            >
              {tutorLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Send & Get Structured Feedback</Text>
              )}
            </TouchableOpacity>
          </View>

          {tutorFeedback && (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.badge, { color: palette.accent }]}>
                STRUCTURED AI TUTOR FEEDBACK ({tutorFeedback.providerStatus.toUpperCase()})
              </Text>
              <Text style={[styles.sectionSubTitle, { color: palette.textPrimary }]}>
                Tutor Reply:
              </Text>
              <Text style={[styles.bodyText, { color: palette.textPrimary }]}>
                {tutorFeedback.tutorReply}
              </Text>

              <Text style={[styles.sectionSubTitle, { color: palette.textPrimary }]}>
                Corrected Sentence:
              </Text>
              <Text style={{ color: palette.success, fontWeight: '700', fontSize: 15, marginBottom: 8 }}>
                {tutorFeedback.correctedSentence}
              </Text>

              <Text style={[styles.sectionSubTitle, { color: palette.textPrimary }]}>
                More Natural Alternative:
              </Text>
              <Text style={{ color: palette.primary, fontWeight: '700', fontSize: 15, marginBottom: 8 }}>
                “{tutorFeedback.naturalAlternative}”
              </Text>

              <Text style={[styles.sectionSubTitle, { color: palette.textPrimary }]}>
                Key Explanations:
              </Text>
              {tutorFeedback.mistakesExplanationEn.map((exp, idx) => (
                <View key={exp} style={{ marginBottom: 6 }}>
                  <Text style={{ color: palette.textPrimary, fontSize: 14 }}>• {exp}</Text>
                  {explanationLanguage === 'bn' && tutorFeedback.mistakesExplanationBn[idx] && (
                    <Text style={{ color: palette.textSecondary, fontSize: 13, marginLeft: 10 }}>
                      {tutorFeedback.mistakesExplanationBn[idx]}
                    </Text>
                  )}
                </View>
              ))}

              <Text style={[styles.sectionSubTitle, { color: palette.textPrimary }]}>
                Useful Vocabulary for This Scenario:
              </Text>
              {tutorFeedback.usefulVocabulary.map((v) => (
                <Text key={v.term} style={{ color: palette.textPrimary, fontSize: 14, marginBottom: 4 }}>
                  • <Text style={{ fontWeight: '700' }}>{v.term}</Text>: {v.meaningEn} ({v.meaningBn})
                </Text>
              ))}

              <View style={[styles.tipBox, { backgroundColor: palette.primarySoft, marginTop: 10 }]}>
                <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 13 }}>
                  Follow-Up Challenge: {tutorFeedback.followUpPracticePrompt}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 2. GRAMMAR CHECKER */}
      {activeModule === 'grammar' && (
        <View>
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.badge, { color: palette.primary }]}>
              SENTENCE & PARAGRAPH GRAMMAR CHECKER
            </Text>
            <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>
              Check Grammar & Get Natural Rewrites
            </Text>
            <TextInput
              accessibilityLabel="Grammar Checker Input"
              multiline
              style={[
                styles.textArea,
                {
                  borderColor: palette.border,
                  color: palette.textPrimary,
                  backgroundColor: palette.background,
                },
              ]}
              value={grammarInput}
              onChangeText={setGrammarInput}
              placeholder="Paste or type a sentence or paragraph..."
              placeholderTextColor={palette.textSecondary}
            />
            {grammarError && (
              <Text style={{ color: palette.danger, marginTop: 6, fontWeight: '600' }}>
                {grammarError}
              </Text>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Run Grammar Check"
              disabled={grammarLoading}
              style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
              onPress={() => void handleRunGrammarCheck()}
            >
              {grammarLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Analyze Grammar & Generate Exercise</Text>
              )}
            </TouchableOpacity>
          </View>

          {grammarResult && (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.sectionSubTitle, { color: palette.textSecondary }]}>
                Original Input:
              </Text>
              <Text style={{ color: palette.textPrimary, marginBottom: 10 }}>
                {grammarResult.originalText}
              </Text>

              <Text style={[styles.sectionSubTitle, { color: palette.success }]}>
                Corrected Text:
              </Text>
              <Text style={{ color: palette.success, fontWeight: '700', fontSize: 16, marginBottom: 10 }}>
                {grammarResult.correctedText}
              </Text>

              <Text style={[styles.sectionSubTitle, { color: palette.primary }]}>
                Natural Rewrite:
              </Text>
              <Text style={{ color: palette.primary, fontWeight: '700', fontSize: 15, marginBottom: 10 }}>
                {grammarResult.naturalRewrite}
              </Text>

              <Text style={[styles.sectionSubTitle, { color: palette.textPrimary }]}>
                Grammar Explanations:
              </Text>
              {grammarResult.explanations.map((exp, idx) => (
                <View key={`${exp.originalFragment}-${idx}`} style={styles.explanationItem}>
                  <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>
                    “{exp.originalFragment}” → “{exp.correctedFragment}”
                  </Text>
                  <Text style={{ color: palette.textPrimary, fontSize: 14 }}>{exp.ruleEn}</Text>
                  {explanationLanguage === 'bn' && (
                    <Text style={{ color: palette.textSecondary, fontSize: 13 }}>{exp.ruleBn}</Text>
                  )}
                </View>
              ))}

              <View style={[styles.tipBox, { backgroundColor: palette.background, borderWidth: 1, borderColor: palette.border }]}>
                <Text style={{ color: palette.primary, fontWeight: '800', fontSize: 12 }}>
                  FOLLOW-UP PRACTICE EXERCISE
                </Text>
                <Text style={{ color: palette.textPrimary, fontWeight: '700', marginTop: 4 }}>
                  {grammarResult.practiceExercise.question}
                </Text>
                <Text style={{ color: palette.success, fontWeight: '700', marginTop: 6 }}>
                  ✓ {grammarResult.practiceExercise.correctAnswer}
                </Text>
                <Text style={{ color: palette.textSecondary, fontSize: 13, marginTop: 2 }}>
                  {explanationLanguage === 'bn'
                    ? grammarResult.practiceExercise.explanationBn
                    : grammarResult.practiceExercise.explanationEn}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 3. SPEAKING LAB */}
      {activeModule === 'speaking' && (
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.badge, { color: palette.primary }]}>
            SPEAKING & PRONUNCIATION LAB
          </Text>
          <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>
            Record Voice, Edit Transcript & Listen via TTS
          </Text>
          <Text style={[styles.bodyText, { color: palette.textSecondary }]}>
            Microphone access is requested only when you tap Record. Device Text-to-Speech works offline; cloud speech transcription requires internet connectivity.
          </Text>

          <View style={styles.row}>
            {!isRecording ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Start Voice Recording"
                style={[styles.primaryBtn, { flex: 1, backgroundColor: palette.danger }]}
                onPress={() => void handleStartRecording()}
              >
                <Text style={styles.primaryBtnText}>🎙️ Tap to Record</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Stop Voice Recording"
                style={[styles.primaryBtn, { flex: 1, backgroundColor: palette.warning }]}
                onPress={() => void handleStopRecording()}
              >
                <Text style={styles.primaryBtnText}>⏹ Stop Recording</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Speak Transcript Aloud"
              style={[styles.primaryBtn, { flex: 1, backgroundColor: palette.accent }]}
              onPress={() => {
                try {
                  Speech.speak(editableTranscript, { language: 'en-US', rate: 0.92 });
                } catch {
                  // ignore
                }
              }}
            >
              <Text style={styles.primaryBtnText}>🔊 Listen (TTS)</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 8 }}>
            Permission Status: {micPermissionStatus.toUpperCase()}
            {recordedUri ? ' • Local audio clip captured ✓' : ''}
          </Text>

          {speakingStatusMsg && (
            <View style={[styles.tipBox, { backgroundColor: palette.primarySoft, marginTop: 8 }]}>
              <Text style={{ color: palette.textPrimary, fontSize: 13 }}>{speakingStatusMsg}</Text>
            </View>
          )}

          <Text style={[styles.label, { color: palette.textPrimary, marginTop: 14 }]}>
            Editable Transcript (Works even when microphone is unavailable):
          </Text>
          <TextInput
            accessibilityLabel="Editable Speaking Transcript"
            multiline
            style={[
              styles.textArea,
              {
                borderColor: palette.border,
                color: palette.textPrimary,
                backgroundColor: palette.background,
              },
            ]}
            value={editableTranscript}
            onChangeText={setEditableTranscript}
          />

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Evaluate Spoken Transcript"
            style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
            onPress={() => {
              setTutorInput(editableTranscript);
              setActiveModule('tutor');
              void handleSendTutorTurn();
            }}
          >
            <Text style={styles.primaryBtnText}>Analyze My Spoken Response with AI Tutor →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 4. LISTENING STUDIO */}
      {activeModule === 'listening' && (
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.badge, { color: palette.primary }]}>
            OFFLINE-CAPABLE LISTENING COMPREHENSION
          </Text>
          <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>
            Select an Audio Track
          </Text>

          <View style={styles.row}>
            {LISTENING_TRACKS.map((track) => {
              const active = selectedTrack.id === track.id;
              return (
                <TouchableOpacity
                  key={track.id}
                  accessibilityRole="button"
                  style={[
                    styles.choiceBtn,
                    {
                      borderColor: active ? palette.primary : palette.border,
                      backgroundColor: active ? palette.primarySoft : palette.background,
                    },
                  ]}
                  onPress={() => {
                    handlePauseListeningAudio();
                    setSelectedTrack(track);
                    setListeningAnswers({});
                    setListeningChecked(false);
                  }}
                >
                  <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 13 }}>
                    {track.titleEn}
                  </Text>
                  <Text style={{ color: palette.textSecondary, fontSize: 12 }}>
                    {track.level} • {track.durationSeconds}s
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Audio Player Controls */}
          <View style={[styles.playerBox, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <View style={styles.row}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={isPlayingAudio ? 'Stop Audio' : 'Play Audio'}
                style={[styles.playerBtn, { backgroundColor: palette.primary }]}
                onPress={isPlayingAudio ? handlePauseListeningAudio : handlePlayListeningAudio}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  {isPlayingAudio ? '⏸ Pause / Stop' : '▶️ Play Audio'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Replay Audio"
                style={[styles.playerBtn, { backgroundColor: palette.accent }]}
                onPress={handlePlayListeningAudio}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>↺ Replay</Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Change Playback Speed"
                style={[styles.playerBtn, { backgroundColor: palette.surfaceAlt }]}
                onPress={() =>
                  setPlaybackSpeed((s) => (s === 1.0 ? 0.8 : s === 0.8 ? 1.15 : 1.0))
                }
              >
                <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>
                  Speed: {playbackSpeed}x
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Toggle Transcript Visibility"
              style={{ marginTop: 10 }}
              onPress={() => setShowTranscript((v) => !v)}
            >
              <Text style={{ color: palette.primary, fontWeight: '700' }}>
                {showTranscript ? 'Hide Transcript ▲' : 'Show Transcript (English & বাংলা) ▼'}
              </Text>
            </TouchableOpacity>

            {showTranscript && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: palette.textPrimary, lineHeight: 20 }}>
                  {selectedTrack.transcriptEn}
                </Text>
                {explanationLanguage === 'bn' && (
                  <Text style={{ color: palette.textSecondary, marginTop: 6, lineHeight: 20 }}>
                    {selectedTrack.transcriptBn}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Comprehension Questions */}
          {selectedTrack.questions.map((q, idx) => (
            <View key={q.id} style={{ marginTop: 14 }}>
              <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 15 }}>
                {idx + 1}. {q.questionEn}
              </Text>
              {explanationLanguage === 'bn' && (
                <Text style={{ color: palette.textSecondary, fontSize: 13, marginBottom: 6 }}>
                  {q.questionBn}
                </Text>
              )}
              {q.options.map((opt) => {
                const chosen = listeningAnswers[q.id] === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    accessibilityRole="button"
                    style={[
                      styles.optionRow,
                      {
                        borderColor: chosen ? palette.primary : palette.border,
                        backgroundColor: chosen ? palette.primarySoft : palette.background,
                      },
                    ]}
                    onPress={() =>
                      setListeningAnswers((prev) => ({
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
              {listeningChecked && (
                <Text
                  style={{
                    color:
                      listeningAnswers[q.id] === q.correctAnswer ? palette.success : palette.danger,
                    fontWeight: '700',
                    marginTop: 4,
                  }}
                >
                  {listeningAnswers[q.id] === q.correctAnswer
                    ? `✓ Correct! ${q.explanationEn}`
                    : `✗ Correct answer: ${q.correctAnswer}. ${q.explanationEn}`}
                </Text>
              )}
            </View>
          ))}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Check Listening Comprehension Answers"
            style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
            onPress={() => setListeningChecked(true)}
          >
            <Text style={styles.primaryBtnText}>Check Comprehension Answers</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 5. IELTS PREPARATION MODULE */}
      {activeModule === 'ielts' && (
        <View>
          <View style={[styles.disclaimerBanner, { backgroundColor: palette.primarySoft, borderColor: palette.primary }]}>
            <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 12 }}>
              ⚠️ UNOFFICIAL PRACTICE ESTIMATES: All AI/automated band feedback in FluentUp is for self-study guidance only and is NOT an official IELTS examination score.
            </Text>
          </View>

          <View style={styles.row}>
            {(
              [
                ['writing', 'Writing Task 1 & 2'],
                ['speaking', 'Speaking Part 1-3'],
                ['reading', 'Academic Reading'],
              ] as const
            ).map(([k, lbl]) => (
              <TouchableOpacity
                key={k}
                accessibilityRole="button"
                style={[
                  styles.choiceBtn,
                  {
                    borderColor: ieltsTab === k ? palette.primary : palette.border,
                    backgroundColor: ieltsTab === k ? palette.primary : palette.surface,
                  },
                ]}
                onPress={() => setIeltsTab(k)}
              >
                <Text
                  style={{
                    color: ieltsTab === k ? '#FFFFFF' : palette.textPrimary,
                    fontWeight: '700',
                    fontSize: 12,
                    textAlign: 'center',
                  }}
                >
                  {lbl}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {ieltsTab === 'writing' && (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, marginTop: 12 }]}>
              <View style={styles.row}>
                {IELTS_WRITING_PROMPTS.map((task) => (
                  <TouchableOpacity
                    key={task.id}
                    accessibilityRole="button"
                    style={[
                      styles.choiceBtn,
                      {
                        borderColor: selectedWritingTask.id === task.id ? palette.primary : palette.border,
                        backgroundColor:
                          selectedWritingTask.id === task.id ? palette.primarySoft : palette.background,
                      },
                    ]}
                    onPress={() => setSelectedWritingTask(task)}
                  >
                    <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>
                      Task {task.taskNumber} ({task.minimumWords}+ words)
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.cardTitle, { color: palette.textPrimary, marginTop: 10 }]}>
                {selectedWritingTask.titleEn}
              </Text>
              <Text style={[styles.bodyText, { color: palette.textPrimary, marginTop: 6 }]}>
                {selectedWritingTask.promptEn}
              </Text>
              {explanationLanguage === 'bn' && (
                <Text style={{ color: palette.textSecondary, fontSize: 13, marginTop: 4 }}>
                  {selectedWritingTask.promptBn}
                </Text>
              )}

              <Text style={[styles.label, { color: palette.accent }]}>
                High-Scoring Academic Collocations to Include:
              </Text>
              {selectedWritingTask.academicVocabSuggestions.map((item) => (
                <Text key={item.phrase} style={{ color: palette.textPrimary, fontSize: 13 }}>
                  • <Text style={{ fontWeight: '700' }}>{item.phrase}</Text> — {item.meaningBn}
                </Text>
              ))}

              <TextInput
                accessibilityLabel="IELTS Writing Essay Input"
                multiline
                style={[
                  styles.textArea,
                  {
                    borderColor: palette.border,
                    color: palette.textPrimary,
                    backgroundColor: palette.background,
                    minHeight: 130,
                    marginTop: 10,
                  },
                ]}
                value={ieltsResponseText}
                onChangeText={setIeltsResponseText}
              />

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Evaluate IELTS Writing Response"
                disabled={ieltsLoading}
                style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
                onPress={() =>
                  void handleEvaluateIELTS(
                    'writing',
                    selectedWritingTask.id,
                    selectedWritingTask.promptEn
                  )
                }
              >
                {ieltsLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    Evaluate Against 4 IELTS Writing Criteria
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {ieltsTab === 'speaking' && (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, marginTop: 12 }]}>
              <View style={styles.row}>
                {IELTS_SPEAKING_PROMPTS.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    accessibilityRole="button"
                    style={[
                      styles.choiceBtn,
                      {
                        borderColor: selectedCueCard.id === p.id ? palette.primary : palette.border,
                        backgroundColor:
                          selectedCueCard.id === p.id ? palette.primarySoft : palette.background,
                      },
                    ]}
                    onPress={() => setSelectedCueCard(p)}
                  >
                    <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>
                      Part {p.part} ({p.speakSeconds}s)
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.cardTitle, { color: palette.textPrimary, marginTop: 10 }]}>
                {selectedCueCard.topicEn}
              </Text>
              <Text style={{ color: palette.accent, fontWeight: '700', marginVertical: 4 }}>
                Prep Timer: {selectedCueCard.prepSeconds}s • Speaking Target: {selectedCueCard.speakSeconds}s
              </Text>
              {selectedCueCard.bulletPointsEn.map((bp, idx) => (
                <View key={bp} style={{ marginBottom: 4 }}>
                  <Text style={{ color: palette.textPrimary, fontWeight: '600' }}>• {bp}</Text>
                  {explanationLanguage === 'bn' && selectedCueCard.bulletPointsBn[idx] && (
                    <Text style={{ color: palette.textSecondary, fontSize: 13, marginLeft: 10 }}>
                      {selectedCueCard.bulletPointsBn[idx]}
                    </Text>
                  )}
                </View>
              ))}

              <TextInput
                accessibilityLabel="IELTS Speaking Transcript Input"
                multiline
                style={[
                  styles.textArea,
                  {
                    borderColor: palette.border,
                    color: palette.textPrimary,
                    backgroundColor: palette.background,
                    marginTop: 10,
                  },
                ]}
                value={ieltsResponseText}
                onChangeText={setIeltsResponseText}
              />

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Evaluate IELTS Speaking Response"
                style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
                onPress={() =>
                  void handleEvaluateIELTS(
                    'speaking',
                    selectedCueCard.id,
                    selectedCueCard.topicEn
                  )
                }
              >
                <Text style={styles.primaryBtnText}>
                  Get Unofficial Speaking Criteria Feedback
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {ieltsTab === 'reading' && (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, marginTop: 12 }]}>
              <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>
                {IELTS_READING_PASSAGES[0].titleEn}
              </Text>
              <Text style={[styles.bodyText, { color: palette.textPrimary, marginTop: 8 }]}>
                {IELTS_READING_PASSAGES[0].passageEn}
              </Text>

              {IELTS_READING_PASSAGES[0].questions.map((rq, idx) => (
                <View key={rq.id} style={{ marginTop: 14 }}>
                  <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>
                    {idx + 1}. {rq.questionEn}
                  </Text>
                  {rq.options.map((opt) => {
                    const selected = readingAnswers[rq.id] === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        accessibilityRole="button"
                        style={[
                          styles.optionRow,
                          {
                            borderColor: selected ? palette.primary : palette.border,
                            backgroundColor: selected ? palette.primarySoft : palette.background,
                          },
                        ]}
                        onPress={() =>
                          setReadingAnswers((prev) => ({
                            ...prev,
                            [rq.id]: opt,
                          }))
                        }
                      >
                        <Text style={{ color: palette.textPrimary }}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {readingChecked && (
                    <Text
                      style={{
                        color:
                          readingAnswers[rq.id] === rq.correctAnswer
                            ? palette.success
                            : palette.danger,
                        fontWeight: '700',
                        marginTop: 4,
                      }}
                    >
                      {readingAnswers[rq.id] === rq.correctAnswer
                        ? `✓ Correct! ${rq.explanationEn}`
                        : `✗ Correct: ${rq.correctAnswer}`}
                    </Text>
                  )}
                </View>
              ))}

              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
                onPress={() => setReadingChecked(true)}
              >
                <Text style={styles.primaryBtnText}>Check Reading Answers</Text>
              </TouchableOpacity>
            </View>
          )}

          {ieltsEvaluation && (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, marginTop: 12 }]}>
              <Text style={[styles.badge, { color: palette.warning }]}>
                UNOFFICIAL PRACTICE ESTIMATE • BAND {ieltsEvaluation.estimatedBand.toFixed(1)}
              </Text>
              <Text style={{ color: palette.textSecondary, fontSize: 12, marginBottom: 10 }}>
                {ieltsEvaluation.disclaimer}
              </Text>
              <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>
                • Task Achievement / Fluency: {ieltsEvaluation.criteriaBreakdown.taskAchievementOrFluency}
              </Text>
              <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>
                • Coherence & Cohesion: {ieltsEvaluation.criteriaBreakdown.coherenceAndCohesion}
              </Text>
              <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>
                • Lexical Resource: {ieltsEvaluation.criteriaBreakdown.lexicalResource}
              </Text>
              <Text style={{ color: palette.textPrimary, fontWeight: '700', marginBottom: 8 }}>
                • Grammatical Range & Accuracy:{' '}
                {ieltsEvaluation.criteriaBreakdown.grammaticalRangeAndAccuracy}
              </Text>

              <Text style={[styles.sectionSubTitle, { color: palette.success }]}>Strengths:</Text>
              {ieltsEvaluation.strengthsEn.map((s) => (
                <Text key={s} style={{ color: palette.textPrimary, fontSize: 13 }}>
                  • {s}
                </Text>
              ))}

              <Text style={[styles.sectionSubTitle, { color: palette.primary }]}>
                How to Improve:
              </Text>
              {ieltsEvaluation.improvementsEn.map((imp, idx) => (
                <View key={imp} style={{ marginBottom: 4 }}>
                  <Text style={{ color: palette.textPrimary, fontSize: 13 }}>• {imp}</Text>
                  {explanationLanguage === 'bn' && ieltsEvaluation.improvementsBn[idx] && (
                    <Text style={{ color: palette.textSecondary, fontSize: 12, marginLeft: 8 }}>
                      {ieltsEvaluation.improvementsBn[idx]}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  moduleBar: { marginBottom: 14 },
  moduleChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    minHeight: 42,
    justifyContent: 'center',
  },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  badge: { fontSize: 11, fontWeight: '800', letterSpacing: 0.9, marginBottom: 4 },
  cardTitle: { fontSize: 19, fontWeight: '800' },
  scenarioChip: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    width: 210,
  },
  promptBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 10 },
  tutorPromptText: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 95,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  sectionSubTitle: { fontSize: 15, fontWeight: '800', marginTop: 10, marginBottom: 4 },
  bodyText: { fontSize: 14, lineHeight: 21 },
  tipBox: { borderRadius: 12, padding: 12 },
  explanationItem: { marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  choiceBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 10,
    minHeight: 46,
    justifyContent: 'center',
  },
  playerBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  playerBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 42,
    justifyContent: 'center',
  },
  optionRow: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    minHeight: 46,
    justifyContent: 'center',
  },
  disclaimerBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
});
