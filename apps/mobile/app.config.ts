import type { ConfigContext, ExpoConfig } from 'expo/config';

const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV || process.env.APP_ENV || 'development';
const IS_PRODUCTION = APP_ENV === 'production';

// Configurable package ID before first release (defaults to com.fluentup.app)
const PACKAGE_ID = process.env.APP_PACKAGE_ID || 'com.fluentup.app';
const VERSION_NAME = process.env.APP_VERSION_NAME || '1.0.0';
const VERSION_CODE = Number(process.env.APP_VERSION_CODE || '1');

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'FluentUp',
  slug: 'fluentup',
  owner: 'roybipro',
  version: VERSION_NAME,
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'fluentup',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0F172A',
  },
  android: {
    package: PACKAGE_ID,
    versionCode: VERSION_CODE,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0F172A',
    },
    permissions: [
      'android.permission.INTERNET',
      'android.permission.RECORD_AUDIO',
      'android.permission.POST_NOTIFICATIONS',
    ],
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-av',
      {
        microphonePermission:
          'FluentUp needs microphone access only when you explicitly record your voice in Speaking Practice or AI Tutor sessions.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: '0ab79c56-e7a5-4a7b-b211-295c85390342',
    },
    appEnv: APP_ENV,
    isProduction: IS_PRODUCTION,
    packageId: PACKAGE_ID,
    versionCode: VERSION_CODE,
    targetSdkVersion: 36,
    minSdkVersion: 24,
    apiBaseUrl:
      process.env.EXPO_PUBLIC_API_BASE_URL ||
      (IS_PRODUCTION ? 'https://api.fluentup.example.com/api/v1' : 'http://10.0.2.2:8000/api/v1'),
    privacyPolicyUrl:
      process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ||
      'https://YOUR_DOMAIN_PLACEHOLDER.example.com/privacy',
    termsUrl:
      process.env.EXPO_PUBLIC_TERMS_URL ||
      'https://YOUR_DOMAIN_PLACEHOLDER.example.com/terms',
    accountDeletionUrl:
      process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL ||
      'https://YOUR_DOMAIN_PLACEHOLDER.example.com/delete-account',
    supportEmail:
      process.env.EXPO_PUBLIC_SUPPORT_EMAIL ||
      'support@YOUR_DOMAIN_PLACEHOLDER.example.com',
  },
});
