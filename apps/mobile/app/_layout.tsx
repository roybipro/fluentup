import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppStore } from '../src/store/useAppStore';
import { useThemePalette } from '../src/theme/colors';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
    },
  },
});

export default function RootLayout() {
  const hydrateFromStorage = useAppStore((s) => s.hydrateFromStorage);
  const themeMode = useAppStore((s) => s.themeMode);
  const palette = useThemePalette();

  useEffect(() => {
    void hydrateFromStorage();
  }, [hydrateFromStorage]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: palette.surface },
            headerTintColor: palette.textPrimary,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: palette.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="onboarding"
            options={{ title: 'Welcome to FluentUp', headerShown: false }}
          />
          <Stack.Screen
            name="auth"
            options={{ title: 'Account & Sign In', presentation: 'modal' }}
          />
          <Stack.Screen
            name="lesson/[id]"
            options={{ title: 'Lesson & Exercises' }}
          />
          <Stack.Screen
            name="legal"
            options={{ title: 'Privacy, Terms & Data Controls' }}
          />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
