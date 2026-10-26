import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getApiBaseUrl } from '../src/services/apiClient';
import { useAppStore } from '../src/store/useAppStore';
import { useThemePalette } from '../src/theme/colors';

type AuthMode = 'login' | 'register' | 'recovery';

export default function AuthScreen() {
  const router = useRouter();
  const palette = useThemePalette();
  const signInUser = useAppStore((s) => s.signInUser);
  const continueAsGuest = useAppStore((s) => s.continueAsGuest);

  const [mode, setMode] = useState<AuthMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const validateInputs = (): boolean => {
    setErrorMessage(null);
    setInfoMessage(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return false;
    }
    if (mode !== 'recovery' && password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateInputs()) return;
    setLoading(true);
    try {
      const trimmedEmail = email.trim().toLowerCase();
      if (mode === 'recovery') {
        try {
          await fetch(`${getApiBaseUrl()}/auth/recover`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: trimmedEmail }),
          });
        } catch {
          // Even if offline, provide clear instruction
        }
        setInfoMessage(
          `If an account exists for ${trimmedEmail}, a password reset link has been dispatched via Supabase Auth.`
        );
        return;
      }

      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
      const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          display_name: displayName.trim() || 'Learner',
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `Authentication failed (${res.status})`);
      }

      const data = await res.json();
      signInUser({
        userId: data.user_id,
        email: data.email,
        displayName: data.display_name || displayName.trim() || 'Learner',
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        isGuest: false,
      });
      router.replace('/(tabs)');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Network error connecting to authentication server. You can continue in Guest Mode offline.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.tabRow}>
          {(
            [
              ['login', 'Sign In'],
              ['register', 'Register'],
              ['recovery', 'Reset Password'],
            ] as Array<[AuthMode, string]>
          ).map(([m, label]) => (
            <TouchableOpacity
              key={m}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${label}`}
              style={[
                styles.tabBtn,
                {
                  borderColor: mode === m ? palette.primary : palette.border,
                  backgroundColor: mode === m ? palette.primarySoft : palette.background,
                },
              ]}
              onPress={() => {
                setMode(m);
                setErrorMessage(null);
                setInfoMessage(null);
              }}
            >
              <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 13 }}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'register' && (
          <>
            <Text style={[styles.label, { color: palette.textPrimary }]}>Full Name</Text>
            <TextInput
              accessibilityLabel="Full Name Input"
              style={[styles.input, { borderColor: palette.border, color: palette.textPrimary }]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="e.g. Nusrat Jahan"
              placeholderTextColor={palette.textSecondary}
            />
          </>
        )}

        <Text style={[styles.label, { color: palette.textPrimary }]}>Email Address</Text>
        <TextInput
          accessibilityLabel="Email Address Input"
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { borderColor: palette.border, color: palette.textPrimary }]}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={palette.textSecondary}
        />

        {mode !== 'recovery' && (
          <>
            <Text style={[styles.label, { color: palette.textPrimary }]}>
              Password (minimum 8 characters)
            </Text>
            <TextInput
              accessibilityLabel="Password Input"
              secureTextEntry
              style={[styles.input, { borderColor: palette.border, color: palette.textPrimary }]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={palette.textSecondary}
            />
          </>
        )}

        {errorMessage && (
          <Text accessibilityRole="alert" style={{ color: palette.danger, marginTop: 10, fontWeight: '600' }}>
            {errorMessage}
          </Text>
        )}

        {infoMessage && (
          <Text style={{ color: palette.success, marginTop: 10, fontWeight: '600' }}>
            {infoMessage}
          </Text>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={
            mode === 'login'
              ? 'Submit Sign In'
              : mode === 'register'
              ? 'Submit Registration'
              : 'Send Password Recovery Email'
          }
          disabled={loading}
          style={[styles.primaryBtn, { backgroundColor: palette.primary }]}
          onPress={() => void handleSubmit()}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {mode === 'login'
                ? 'Sign In'
                : mode === 'register'
                ? 'Create Account'
                : 'Send Reset Link'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Continue in Offline Guest Mode"
          style={[styles.guestBtn, { borderColor: palette.border }]}
          onPress={() => {
            continueAsGuest();
            router.replace('/(tabs)');
          }}
        >
          <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>
            Continue in Guest Mode (Local Progress)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="View Privacy Policy and Terms"
          style={{ marginTop: 14, alignItems: 'center' }}
          onPress={() => router.push('/legal')}
        >
          <Text style={{ color: palette.primary, fontSize: 13, fontWeight: '600' }}>
            By continuing, you agree to our Privacy Policy & Terms of Service
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 16, borderWidth: 1, padding: 18 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tabBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
    minHeight: 50,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  guestBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
});
