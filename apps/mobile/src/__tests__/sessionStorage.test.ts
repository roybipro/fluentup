import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { SESSION_STORAGE_KEY, STORAGE_KEY, useAppStore } from '../store/useAppStore';

const SECRET_TOKEN = 'secret-access-token';

function session(expiresAt = Date.now() + 60_000) {
  return {
    userId: 'user-1',
    email: 'asha@example.com',
    displayName: 'Asha',
    accessToken: SECRET_TOKEN,
    expiresAt,
    isGuest: false,
  };
}

async function signInAndPersist(expiresAt?: number) {
  useAppStore.getState().signInUser(session(expiresAt));
  await useAppStore.getState().persistToStorage();
}

describe('auth session storage', () => {
  beforeEach(async () => {
    await useAppStore.getState().deleteAccountAndPurgeData();
  });

  it('keeps the access token out of plain AsyncStorage', async () => {
    await signInAndPersist();
    const plain = await AsyncStorage.getItem(STORAGE_KEY);
    expect(plain).not.toBeNull();
    expect(plain).not.toContain(SECRET_TOKEN);
    expect(await SecureStore.getItemAsync(SESSION_STORAGE_KEY)).toContain(SECRET_TOKEN);
  });

  it('restores a valid session on the next launch', async () => {
    await signInAndPersist();
    useAppStore.setState({ authSession: null });
    await useAppStore.getState().hydrateFromStorage();
    expect(useAppStore.getState().authSession?.accessToken).toBe(SECRET_TOKEN);
  });

  it('does not restore an expired session', async () => {
    await signInAndPersist(Date.now() - 1000);
    useAppStore.setState({ authSession: null });
    await useAppStore.getState().hydrateFromStorage();
    expect(useAppStore.getState().authSession).toBeNull();
  });

  it('removes a token left in plain storage by an older version', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ authSession: session() }));
    await useAppStore.getState().hydrateFromStorage();
    expect(useAppStore.getState().authSession).toBeNull();
    await useAppStore.getState().persistToStorage();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toContain(SECRET_TOKEN);
  });

  it('removes the token when the account is deleted', async () => {
    await signInAndPersist();
    await useAppStore.getState().deleteAccountAndPurgeData();
    expect(await SecureStore.getItemAsync(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('removes the token on sign-out', async () => {
    await signInAndPersist();
    await useAppStore.getState().logoutUser();
    expect(await SecureStore.getItemAsync(SESSION_STORAGE_KEY)).toBeNull();
  });
});
