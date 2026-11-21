import { SYNC_BATCH_SIZE, SyncQueueMutation, useAppStore } from '../store/useAppStore';

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
  test('splits a large queue into batches the server accepts', async () => {
    signIn();
    const items = Array.from({ length: 450 }, (_, i) => mutation(`m${i}`));
    useAppStore.setState({ syncQueue: items });
    const sizes: number[] = [];

    const ok = await useAppStore.getState().flushSyncQueue(async (batch) => {
      sizes.push(batch.length);
      if (batch.length > 200) throw new Error('HTTP 422: too many mutations');
      return batch.map((m) => m.id);
    });

    expect(ok).toBe(true);
    expect(SYNC_BATCH_SIZE).toBeLessThanOrEqual(200);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(SYNC_BATCH_SIZE);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(450);
    expect(useAppStore.getState().syncQueue).toEqual([]);
  });

  test('keeps acknowledged batches removed when a later batch fails', async () => {
    signIn();
    const items = Array.from({ length: SYNC_BATCH_SIZE * 2 + 5 }, (_, i) => mutation(`m${i}`));
    useAppStore.setState({ syncQueue: items });
    let call = 0;

    const ok = await useAppStore.getState().flushSyncQueue(async (batch) => {
      call += 1;
      if (call === 2) throw new Error('network down');
      return batch.map((m) => m.id);
    });

    expect(ok).toBe(false);
    const queue = useAppStore.getState().syncQueue;
    // First batch synced and removed; the failed batch and the unsent rest stay queued.
    expect(queue.map((m) => m.id)).toEqual(items.slice(SYNC_BATCH_SIZE).map((m) => m.id));
    expect(queue[0].retryCount).toBe(1); // sent and failed
    expect(queue[queue.length - 1].retryCount).toBe(0); // never sent
  });
});
