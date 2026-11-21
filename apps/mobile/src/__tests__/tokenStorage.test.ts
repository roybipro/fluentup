import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AUTH_TOKEN_KEY, STORAGE_KEY, useAppStore } from '../store/useAppStore';

const secureStore = (globalThis as unknown as { __mockSecureStore: Record<string, string> }).__mockSecureStore;

const session = {
  userId: 'u-tok',
  email: 'tok@example.com',
  displayName: 'Tok',
  accessToken: 'secret-jwt-value',
  expiresAt: Date.now() + 60_000,
  isGuest: false,
};

describe('auth token storage', () => {
  beforeEach(async () => {
    await useAppStore.getState().deleteAccountAndPurgeData();
  });

  test('token goes to SecureStore, never into AsyncStorage', async () => {
    useAppStore.getState().signInUser(session);
    await useAppStore.getState().persistToStorage();

    const blob = (await AsyncStorage.getItem(STORAGE_KEY)) ?? '';
    expect(blob).not.toContain('secret-jwt-value');
    expect(secureStore[AUTH_TOKEN_KEY]).toBe('secret-jwt-value');
  });

  test('hydrate restores the token from SecureStore', async () => {
    useAppStore.getState().signInUser(session);
    await useAppStore.getState().persistToStorage();
    useAppStore.setState({ authSession: null });

    await useAppStore.getState().hydrateFromStorage();

    expect(useAppStore.getState().authSession?.accessToken).toBe('secret-jwt-value');
  });

  test('a legacy plaintext token is migrated out of AsyncStorage once', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ authSession: { ...session, accessToken: 'legacy-jwt' } }));

    await useAppStore.getState().hydrateFromStorage();

    expect(useAppStore.getState().authSession?.accessToken).toBe('legacy-jwt');
    expect(secureStore[AUTH_TOKEN_KEY]).toBe('legacy-jwt');
    expect((await AsyncStorage.getItem(STORAGE_KEY)) ?? '').not.toContain('legacy-jwt');
  });

  test('logout and account deletion remove the token', async () => {
    useAppStore.getState().signInUser(session);
    await useAppStore.getState().persistToStorage();
    await useAppStore.getState().deleteAccountAndPurgeData();
    expect(secureStore[AUTH_TOKEN_KEY]).toBeUndefined();
  });
  test('a failed keychain write keeps the legacy token instead of erasing it', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ authSession: { ...session, accessToken: 'legacy-jwt' } }));
    const keystoreDown = new Error('keystore unavailable');
    // Both the migration write and the follow-up persist fail, as when the keystore is unavailable.
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(keystoreDown).mockRejectedValueOnce(keystoreDown);

    await useAppStore.getState().hydrateFromStorage();
    expect(useAppStore.getState().authSession?.accessToken).toBe('legacy-jwt');
    expect(secureStore[AUTH_TOKEN_KEY]).toBeUndefined();

    // Restart: the session must still be there, because SecureStore never got the token.
    useAppStore.setState({ authSession: null });
    await useAppStore.getState().hydrateFromStorage();
    expect(useAppStore.getState().authSession?.accessToken).toBe('legacy-jwt');
  });

  test('a failed keychain write never puts a new token into AsyncStorage', async () => {
    useAppStore.getState().signInUser({ ...session, accessToken: 'fresh-jwt' });
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore unavailable'));

    await useAppStore.getState().persistToStorage();

    expect((await AsyncStorage.getItem(STORAGE_KEY)) ?? '').not.toContain('fresh-jwt');
  });
});
