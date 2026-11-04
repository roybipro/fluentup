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
import {
  confirmPasswordReset,
  register,
  requestPasswordReset,
  signIn,
  SignedInAccount,
} from '../src/services/authApi';
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
  const [resetCode, setResetCode] = useState('');
  const [resetCodeSent, setResetCodeSent] = useState(false);
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
    const needsPassword = mode !== 'recovery' || resetCodeSent;
    if (mode === 'recovery' && resetCodeSent && !resetCode.trim()) {
      setErrorMessage('Please enter the reset code from your email.');
      return false;
    }
    if (needsPassword && password.length < 8) {
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
        if (resetCodeSent) {
          const message = await confirmPasswordReset(trimmedEmail, resetCode.trim(), password);
          setMode('login');
          setResetCodeSent(false);
          setResetCode('');
          setPassword('');
          setInfoMessage(message);
        } else {
          const message = await requestPasswordReset(trimmedEmail);
          setResetCodeSent(true);
          setPassword('');
          setInfoMessage(message);
        }
        return;
      }

      let account: SignedInAccount;
      if (mode === 'register') {
        const result = await register(trimmedEmail, password, displayName.trim() || 'Learner');
        if (result.status === 'confirmation_required') {
          setMode('login');
          setPassword('');
          setInfoMessage(result.message);
          return;
        }
        account = result.account;
      } else {
        account = await signIn(trimmedEmail, password);
      }

      signInUser({
        userId: account.userId,
        email: account.email,
        displayName: account.displayName,
        accessToken: account.accessToken,
        expiresAt: Date.now() + account.expiresIn * 1000,
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
                setResetCodeSent(false);
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

        {mode === 'recovery' && resetCodeSent && (
          <>
            <Text style={[styles.label, { color: palette.textPrimary }]}>Reset Code from Email</Text>
            <TextInput
              accessibilityLabel="Reset Code Input"
              autoCapitalize="none"
              keyboardType="number-pad"
              style={[styles.input, { borderColor: palette.border, color: palette.textPrimary }]}
              value={resetCode}
              onChangeText={setResetCode}
              placeholder="123456"
              placeholderTextColor={palette.textSecondary}
            />
          </>
        )}

        {(mode !== 'recovery' || resetCodeSent) && (
          <>
            <Text style={[styles.label, { color: palette.textPrimary }]}>
              {mode === 'recovery' ? 'New Password' : 'Password'} (minimum 8 characters)
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
              : resetCodeSent
              ? 'Set New Password'
              : 'Send Password Reset Code'
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
                : resetCodeSent
                ? 'Set New Password'
                : 'Send Reset Code'}
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
