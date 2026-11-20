import { SyncQueueMutation, useAppStore } from '../store/useAppStore';

const m = (id: string): SyncQueueMutation => ({
  id,
  type: 'vocabulary_upserted',
  payload: {},
  createdAt: '2026-11-20T10:00:00Z',
  retryCount: 0,
});

describe('logoutUser', () => {
  beforeEach(async () => {
    await useAppStore.getState().deleteAccountAndPurgeData();
    useAppStore.setState({ isOnline: true });
    useAppStore.getState().signInUser({
      userId: 'u-out',
      email: 'out@example.com',
      displayName: 'Out',
      accessToken: 'jwt',
      expiresAt: Date.now() + 60_000,
      isGuest: false,
    });
  });

  test('flushes the queue before logging out', async () => {
    useAppStore.setState({ syncQueue: [m('a')] });
    const executor = jest.fn(async (items: SyncQueueMutation[]) => items.map((x) => x.id));

    const res = await useAppStore.getState().logoutUser({ syncExecutor: executor });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ loggedOut: true, unsyncedCount: 0 });
    expect(useAppStore.getState().authSession).toBeNull();
  });

  test('refuses to discard unsynced work unless asked', async () => {
    useAppStore.setState({ syncQueue: [m('a'), m('b')] });
    const failing = jest.fn(async () => {
      throw new Error('offline');
    });

    const res = await useAppStore.getState().logoutUser({ syncExecutor: failing });

    expect(res).toEqual({ loggedOut: false, unsyncedCount: 2 });
    expect(useAppStore.getState().authSession).not.toBeNull();
    expect(useAppStore.getState().syncQueue).toHaveLength(2);

    const forced = await useAppStore.getState().logoutUser({ syncExecutor: failing, discardUnsynced: true });
    expect(forced.loggedOut).toBe(true);
    expect(useAppStore.getState().authSession).toBeNull();
    expect(useAppStore.getState().syncQueue).toHaveLength(0);
  });
});
