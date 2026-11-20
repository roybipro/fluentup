import { SyncQueueMutation, useAppStore } from '../store/useAppStore';

function mutation(id: string): SyncQueueMutation {
  return { id, type: 'vocabulary_upserted', payload: {}, createdAt: '2026-11-20T10:00:00Z', retryCount: 0 };
}

function signIn(isGuest = false) {
  useAppStore.getState().signInUser({
    userId: 'u1',
    email: 'u1@example.com',
    displayName: 'U1',
    accessToken: isGuest ? '' : 'jwt',
    expiresAt: Date.now() + 60_000,
    isGuest,
  });
}

describe('offline sync queue', () => {
  beforeEach(async () => {
    await useAppStore.getState().deleteAccountAndPurgeData();
    useAppStore.setState({ isOnline: true });
  });

  test('keeps items the server did not acknowledge and bumps their retry count', async () => {
    signIn();
    useAppStore.setState({ syncQueue: [mutation('a'), mutation('b'), mutation('c')] });

    const ok = await useAppStore.getState().flushSyncQueue(async () => ['a', 'c']);

    expect(ok).toBe(false);
    const queue = useAppStore.getState().syncQueue;
    expect(queue.map((m) => m.id)).toEqual(['b']);
    expect(queue[0].retryCount).toBe(1);
    expect(useAppStore.getState().syncStatus).toBe('error');
  });

  test('keeps the whole queue when the request fails', async () => {
    signIn();
    useAppStore.setState({ syncQueue: [mutation('a'), mutation('b')] });

    const ok = await useAppStore.getState().flushSyncQueue(async () => {
      throw new Error('HTTP 500');
    });

    expect(ok).toBe(false);
    expect(useAppStore.getState().syncQueue.map((m) => m.id)).toEqual(['a', 'b']);
  });

  test('does not drop items queued while a sync is in flight', async () => {
    signIn();
    useAppStore.setState({ syncQueue: [mutation('a')] });

    const ok = await useAppStore.getState().flushSyncQueue(async (items) => {
      useAppStore.setState((s) => ({ syncQueue: [...s.syncQueue, mutation('late')] }));
      return items.map((m) => m.id);
    });

    expect(ok).toBe(true);
    expect(useAppStore.getState().syncQueue.map((m) => m.id)).toEqual(['late']);
  });

  test('guests keep their queue locally and never call the server', async () => {
    signIn(true);
    useAppStore.setState({ syncQueue: [mutation('a')] });
    const executor = jest.fn(async (items: SyncQueueMutation[]) => items.map((m) => m.id));

    const ok = await useAppStore.getState().flushSyncQueue(executor);

    expect(ok).toBe(false);
    expect(executor).not.toHaveBeenCalled();
    expect(useAppStore.getState().syncQueue).toHaveLength(1);
  });
});
