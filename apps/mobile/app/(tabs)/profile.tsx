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
import { requestServerAccountDeletion, syncMutationsToServer } from '../../src/services/apiClient';
import { useAppStore } from '../../src/store/useAppStore';
import { useThemePalette } from '../../src/theme/colors';

export default function ProfileScreen() {
  const router = useRouter();
  const palette = useThemePalette();

  const authSession = useAppStore((s) => s.authSession);
  const preferences = useAppStore((s) => s.preferences);
  const themeMode = useAppStore((s) => s.themeMode);
  const isOnline = useAppStore((s) => s.isOnline);
  const syncQueue = useAppStore((s) => s.syncQueue);
  const lastSyncedAt = useAppStore((s) => s.lastSyncedAt);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const setExplanationLanguage = useAppStore((s) => s.setExplanationLanguage);
  const setDailyTargetMinutes = useAppStore((s) => s.setDailyTargetMinutes);
  const setOnlineStatus = useAppStore((s) => s.setOnlineStatus);
  const logoutUser = useAppStore((s) => s.logoutUser);
  const flushSyncQueue = useAppStore((s) => s.flushSyncQueue);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState('No longer using the application');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleConfirmAccountDeletion = async () => {
    const res = await requestServerAccountDeletion(deleteReason);
    setShowDeleteConfirm(false);
    setStatusMessage(res.message);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Account Card */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.badge, { color: palette.primary }]}>ACCOUNT & AUTHENTICATION</Text>
        <Text style={[styles.title, { color: palette.textPrimary }]}>
          {authSession
            ? authSession.isGuest
              ? `${preferences.displayName} (Guest Mode)`
              : authSession.displayName
            : preferences.displayName}
        </Text>
        <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
          {authSession
            ? authSession.isGuest
              ? 'Local progress saved on device. Sign in to sync across devices.'
              : `Signed in as ${authSession.email}`
            : 'Not signed in — using local offline-capable storage.'}
        </Text>

        {(!authSession || authSession.isGuest) ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Sign In or Create Account"
            style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
            onPress={() => router.push('/auth')}
          >
            <Text style={styles.primaryBtnText}>Sign In / Create Cloud Account</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Log Out of Account"
            style={[styles.outlineBtn, { borderColor: palette.danger }]}
            onPress={() => void logoutUser()}
          >
            <Text style={{ color: palette.danger, fontWeight: '700' }}>Log Out</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Learning & Accessibility Preferences */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
          Learning & Display Settings
        </Text>

        <Text style={[styles.label, { color: palette.textPrimary }]}>
          Explanation Language / ব্যাখ্যার ভাষা
        </Text>
        <View style={styles.row}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Select Bengali and English Explanations"
            style={[
              styles.choiceBtn,
              {
                borderColor: preferences.explanationLanguage === 'bn' ? palette.primary : palette.border,
                backgroundColor:
                  preferences.explanationLanguage === 'bn' ? palette.primarySoft : palette.background,
              },
            ]}
            onPress={() => setExplanationLanguage('bn')}
          >
            <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>বাংলা + English</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Select English First Explanations"
            style={[
              styles.choiceBtn,
              {
                borderColor: preferences.explanationLanguage === 'en' ? palette.primary : palette.border,
                backgroundColor:
                  preferences.explanationLanguage === 'en' ? palette.primarySoft : palette.background,
              },
            ]}
            onPress={() => setExplanationLanguage('en')}
          >
            <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>English Only</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, { color: palette.textPrimary }]}>Theme / থিম</Text>
        <View style={styles.row}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Switch to Light Theme"
            style={[
              styles.choiceBtn,
              {
                borderColor: themeMode === 'light' ? palette.primary : palette.border,
                backgroundColor: themeMode === 'light' ? palette.primarySoft : palette.background,
              },
            ]}
            onPress={() => setThemeMode('light')}
          >
            <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>☀️ Light</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Switch to Dark Theme"
            style={[
              styles.choiceBtn,
              {
                borderColor: themeMode === 'dark' ? palette.primary : palette.border,
                backgroundColor: themeMode === 'dark' ? palette.primarySoft : palette.background,
              },
            ]}
            onPress={() => setThemeMode('dark')}
          >
            <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>🌙 Dark</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, { color: palette.textPrimary }]}>
          Daily Study Target ({preferences.dailyTargetMinutes} minutes)
        </Text>
        <View style={styles.row}>
          {[10, 15, 20, 30].map((m) => (
            <TouchableOpacity
              key={m}
              accessibilityRole="button"
              style={[
                styles.choiceBtn,
                {
                  borderColor:
                    preferences.dailyTargetMinutes === m ? palette.primary : palette.border,
                  backgroundColor:
                    preferences.dailyTargetMinutes === m ? palette.primarySoft : palette.background,
                },
              ]}
              onPress={() => setDailyTargetMinutes(m)}
            >
              <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>{m}m</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Retake Placement Assessment"
          style={[styles.outlineBtn, { borderColor: palette.primary, marginTop: 14 }]}
          onPress={() => router.push('/onboarding')}
        >
          <Text style={{ color: palette.primary, fontWeight: '700' }}>
            Re-run Onboarding & Placement Assessment
          </Text>
        </TouchableOpacity>
      </View>

      {/* Offline & Sync Controls */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
          Offline Mode & Synchronization
        </Text>
        <Text style={{ color: palette.textSecondary, fontSize: 13, lineHeight: 19 }}>
          Queued updates: {syncQueue.length} • Network mode: {isOnline ? 'Online' : 'Offline Mode'}
          {lastSyncedAt ? ` • Last synced: ${lastSyncedAt.slice(0, 19).replace('T', ' ')}` : ''}
        </Text>

        <View style={styles.row}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Toggle Offline Simulation Mode"
            style={[styles.choiceBtn, { borderColor: palette.border, backgroundColor: palette.background }]}
            onPress={() => setOnlineStatus(!isOnline)}
          >
            <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 13 }}>
              {isOnline ? 'Switch to Offline Mode' : 'Reconnect Online'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Sync Queued Progress Now"
            style={[styles.choiceBtn, { borderColor: palette.accent, backgroundColor: palette.background }]}
            onPress={() => void flushSyncQueue(syncMutationsToServer)}
          >
            <Text style={{ color: palette.accent, fontWeight: '700', fontSize: 13 }}>
              Sync Now ({syncQueue.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Privacy, Legal & Account Deletion */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
          Privacy, Terms & Account Deletion
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="View Privacy Policy and Terms of Service"
          style={[styles.outlineBtn, { borderColor: palette.border }]}
          onPress={() => router.push('/legal')}
        >
          <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>
            📄 Privacy Policy, Terms & Data Retention Rules
          </Text>
        </TouchableOpacity>

        {!showDeleteConfirm ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Delete Account and Personal Data"
            style={[styles.outlineBtn, { borderColor: palette.danger, marginTop: 10 }]}
            onPress={() => setShowDeleteConfirm(true)}
          >
            <Text style={{ color: palette.danger, fontWeight: '700' }}>
              🗑️ Delete Account & Personal Data
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.deleteConfirmBox, { borderColor: palette.danger, backgroundColor: palette.background }]}>
            <Text style={{ color: palette.danger, fontWeight: '800', fontSize: 15 }}>
              Confirm Permanent Account & Data Deletion
            </Text>
            <Text style={{ color: palette.textSecondary, fontSize: 13, marginTop: 4 }}>
              This permanently removes your FluentUp profile, lesson progress, quiz history, vocabulary cards, and active sessions from our database and device storage.
            </Text>
            <TextInput
              accessibilityLabel="Account Deletion Reason Input"
              style={[
                styles.input,
                { borderColor: palette.border, color: palette.textPrimary, marginTop: 8 },
              ]}
              value={deleteReason}
              onChangeText={setDeleteReason}
              placeholder="Optional reason for deletion"
              placeholderTextColor={palette.textSecondary}
            />
            <View style={styles.row}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Confirm Permanent Deletion"
                style={[styles.primaryBtn, { flex: 1, backgroundColor: palette.danger }]}
                onPress={() => void handleConfirmAccountDeletion()}
              >
                <Text style={styles.primaryBtnText}>Confirm Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Cancel Account Deletion"
                style={[styles.outlineBtn, { flex: 1, borderColor: palette.border }]}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {statusMessage && (
          <View style={[styles.statusBox, { backgroundColor: palette.primarySoft }]}>
            <Text style={{ color: palette.textPrimary, fontWeight: '600', fontSize: 13 }}>
              {statusMessage}
            </Text>
          </View>
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
  title: { fontSize: 21, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 4, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 10 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  choiceBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    minHeight: 46,
    justifyContent: 'center',
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  outlineBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  deleteConfirmBox: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  statusBox: {
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
});
