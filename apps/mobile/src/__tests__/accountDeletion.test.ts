import { requestServerAccountDeletion } from '../services/apiClient';
import { useAppStore } from '../store/useAppStore';

const realFetch = global.fetch;

function signIn() {
  useAppStore.getState().signInUser({
    userId: 'user-del',
    email: 'del@example.com',
    displayName: 'Del',
    accessToken: 'jwt',
    expiresAt: Date.now() + 60_000,
    isGuest: false,
  });
  useAppStore.setState({ totalXp: 120 });
}

describe('requestServerAccountDeletion', () => {
  beforeEach(async () => {
    await useAppStore.getState().deleteAccountAndPurgeData();
    signIn();
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  test('server 500 keeps the user signed in and their data intact', async () => {
    global.fetch = jest.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;

    const res = await requestServerAccountDeletion('test');

    expect(res.deleted).toBe(false);
    expect(useAppStore.getState().authSession?.userId).toBe('user-del');
    expect(useAppStore.getState().totalXp).toBe(120);
  });

  test('network failure keeps the user signed in', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    const res = await requestServerAccountDeletion('test');

    expect(res.deleted).toBe(false);
    expect(useAppStore.getState().authSession).not.toBeNull();
  });

  test('server 2xx purges local data', async () => {
    global.fetch = jest.fn(async () => new Response('{"deleted":true}', { status: 200 })) as unknown as typeof fetch;

    const res = await requestServerAccountDeletion('test');

    expect(res.deleted).toBe(true);
    expect(useAppStore.getState().authSession).toBeNull();
    expect(useAppStore.getState().totalXp).toBe(0);
  });
});
