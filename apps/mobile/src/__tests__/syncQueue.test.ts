import { readFileSync } from 'fs';
import { join } from 'path';
import { SEED_LEARNING_PATHS } from '../data/curriculum';
import { syncMutationsToServer } from '../services/apiClient';
import { AuthSession, SyncQueueMutation, useAppStore } from '../store/useAppStore';

const SIGNED_IN: AuthSession = {
  userId: 'user-1',
  email: 'learner@example.com',
  displayName: 'Rafiq',
  accessToken: 'jwt-token',
  expiresAt: Date.now() + 3_600_000,
  isGuest: false,
};

function mutation(id: string, retryCount = 0): SyncQueueMutation {
  return {
    id,
    type: 'lesson_quiz_completed',
    payload: { clientSubmissionId: id },
    createdAt: '2026-11-01T10:00:00.000Z',
    retryCount,
  };
}

function queueOf(...ids: string[]) {
  useAppStore.setState({ syncQueue: ids.map((id) => mutation(id)) });
}

function queuedIds() {
  return useAppStore.getState().syncQueue.map((item) => item.id);
}

function respondWith(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function results(entries: Record<string, string>) {
  return { results: Object.entries(entries).map(([id, status]) => ({ id, status })) };
}

describe('flushSyncQueue', () => {
  beforeEach(async () => {
    await useAppStore.getState().deleteAccountAndPurgeData();
    useAppStore.setState({ isOnline: true });
    useAppStore.getState().signInUser(SIGNED_IN);
  });

  it('removes only the confirmed mutations and keeps failed ones for retry', async () => {
    queueOf('applied', 'rejected', 'duplicate', 'failed');

    const ok = await useAppStore.getState().flushSyncQueue(async () => ['applied', 'duplicate']);

    expect(ok).toBe(false);
    expect(queuedIds()).toEqual(['rejected', 'failed']);
    expect(useAppStore.getState().syncQueue.map((item) => item.retryCount)).toEqual([1, 1]);
    expect(useAppStore.getState().syncStatus).toBe('error');
    expect(useAppStore.getState().lastSyncedAt).toBeNull();
  });

  it('sends what failed again on the next flush and then reports synced', async () => {
    queueOf('first', 'second');
    await useAppStore.getState().flushSyncQueue(async () => ['first']);

    const executor = jest.fn(async (mutations: SyncQueueMutation[]) => mutations.map((m) => m.id));
    const ok = await useAppStore.getState().flushSyncQueue(executor);

    expect(executor.mock.calls[0][0].map((m) => m.id)).toEqual(['second']);
    expect(ok).toBe(true);
    expect(queuedIds()).toEqual([]);
    expect(useAppStore.getState().syncStatus).toBe('synced');
    expect(useAppStore.getState().lastSyncedAt).not.toBeNull();
  });

  it('keeps everything when the executor throws', async () => {
    queueOf('first', 'second');

    const ok = await useAppStore.getState().flushSyncQueue(async () => {
      throw new Error('network down');
    });

    expect(ok).toBe(false);
    expect(queuedIds()).toEqual(['first', 'second']);
    expect(useAppStore.getState().syncStatus).toBe('error');
  });

  it('ignores ids the server confirmed that are not in the queue', async () => {
    queueOf('first');

    const ok = await useAppStore.getState().flushSyncQueue(async () => ['someone-else']);

    expect(ok).toBe(false);
    expect(queuedIds()).toEqual(['first']);
  });

  it('keeps a mutation added while the request is running, without counting a retry', async () => {
    queueOf('sent');

    const ok = await useAppStore.getState().flushSyncQueue(async () => {
      useAppStore.setState((state) => ({ syncQueue: [...state.syncQueue, mutation('added-later')] }));
      return ['sent'];
    });

    expect(ok).toBe(true);
    expect(queuedIds()).toEqual(['added-later']);
    expect(useAppStore.getState().syncQueue[0].retryCount).toBe(0);
    expect(useAppStore.getState().syncStatus).toBe('idle');
  });

  it('does not start a second flush while one is running', async () => {
    queueOf('first');
    let finish: (ids: string[]) => void = () => undefined;
    const first = useAppStore.getState().flushSyncQueue(
      () => new Promise<string[]>((resolve) => { finish = resolve; })
    );
    const secondExecutor = jest.fn(async () => []);

    await expect(useAppStore.getState().flushSyncQueue(secondExecutor)).resolves.toBe(false);
    expect(secondExecutor).not.toHaveBeenCalled();

    finish(['first']);
    await expect(first).resolves.toBe(true);
  });

  it('does not report synced when the user signs out during the request', async () => {
    queueOf('first');

    await useAppStore.getState().flushSyncQueue(async () => {
      await useAppStore.getState().logoutUser();
      return ['first'];
    });

    expect(useAppStore.getState().syncStatus).toBe('idle');
    expect(useAppStore.getState().lastSyncedAt).toBeNull();
  });

  it('saves the remaining queue so it survives an app restart', async () => {
    queueOf('first', 'second');
    await useAppStore.getState().flushSyncQueue(async () => ['first']);

    useAppStore.setState({ syncQueue: [] });
    await useAppStore.getState().hydrateFromStorage();

    expect(queuedIds()).toEqual(['second']);
  });

  it.each([
    ['a guest', { ...SIGNED_IN, userId: 'guest-local-user', accessToken: '', isGuest: true }],
    ['a signed-out user', null],
  ])('never contacts the server or reports synced for %s', async (_name, session) => {
    useAppStore.setState({ authSession: session });
    queueOf('local');
    const executor = jest.fn(async (mutations: SyncQueueMutation[]) => mutations.map((m) => m.id));

    const ok = await useAppStore.getState().flushSyncQueue(executor);

    expect(ok).toBe(false);
    expect(executor).not.toHaveBeenCalled();
    expect(queuedIds()).toEqual(['local']);
    expect(useAppStore.getState().syncStatus).toBe('local_only');
    expect(useAppStore.getState().lastSyncedAt).toBeNull();
  });

  it('does not report an empty guest queue as synced', async () => {
    useAppStore.getState().continueAsGuest();

    const ok = await useAppStore.getState().flushSyncQueue(async () => []);

    expect(ok).toBe(false);
    expect(useAppStore.getState().syncStatus).toBe('local_only');
    expect(useAppStore.getState().lastSyncedAt).toBeNull();
  });

  it('queues a quiz with the fields the server needs, including the passing score', () => {
    const lesson = SEED_LEARNING_PATHS.flatMap((path) => path.lessons).find((l) => l.passingScore === 75)!;

    useAppStore.getState().submitLessonQuiz({
      lessonId: lesson.id,
      answers: {},
      clientSubmissionId: 'sub-strict-lesson',
    });

    expect(useAppStore.getState().syncQueue[0].payload).toMatchObject({
      lessonId: lesson.id,
      clientSubmissionId: 'sub-strict-lesson',
      passingScore: 75,
    });
  });
});

describe('syncMutationsToServer', () => {
  beforeEach(async () => {
    global.fetch = jest.fn();
    await useAppStore.getState().deleteAccountAndPurgeData();
    useAppStore.getState().signInUser(SIGNED_IN);
  });

  it('confirms only applied and duplicate results', async () => {
    respondWith(200, {
      synced: false,
      ...results({ a: 'applied', b: 'duplicate', c: 'rejected', d: 'failed', e: 'a-future-status' }),
    });

    const confirmed = await syncMutationsToServer(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => mutation(id)));

    expect(confirmed).toEqual(['a', 'b']);
  });

  it('sends the access token', async () => {
    respondWith(200, results({ a: 'applied' }));

    await syncMutationsToServer([mutation('a')]);

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/sync\/batch$/);
    expect(options.headers.Authorization).toBe('Bearer jwt-token');
  });

  it.each([
    ['an expired session', 401, { detail: 'Session token has expired' }],
    ['a server error', 500, { detail: 'boom' }],
    ['the old response that saved nothing', 200, { synced: true, processed_count: 1, user_id: 'user-1' }],
  ])('confirms nothing after %s', async (_name, status, body) => {
    respondWith(status, body);

    await expect(syncMutationsToServer([mutation('a')])).resolves.toEqual([]);
  });

  it('confirms nothing when the network fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    await expect(syncMutationsToServer([mutation('a')])).resolves.toEqual([]);
  });

  it('splits a long queue and keeps what earlier batches confirmed when a later one fails', async () => {
    const queue = Array.from({ length: 60 }, (_, index) => mutation(`m${index}`));
    const firstBatch = queue.slice(0, 25).map((m) => m.id);
    respondWith(200, results(Object.fromEntries(firstBatch.map((id) => [id, 'applied']))));
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('connection dropped'));

    const confirmed = await syncMutationsToServer(queue);

    expect(confirmed).toEqual(firstBatch);
    expect(global.fetch).toHaveBeenCalledTimes(2); // Stops rather than trying a third batch.
    const sentSizes = (global.fetch as jest.Mock).mock.calls.map(
      ([, options]) => JSON.parse(options.body).mutations.length
    );
    expect(sentSizes).toEqual([25, 25]);
  });

  it('applies a partial failure end to end through the store', async () => {
    useAppStore.setState({ isOnline: true });
    queueOf('good', 'unknown-lesson');
    respondWith(200, results({ good: 'applied', 'unknown-lesson': 'rejected' }));

    const ok = await useAppStore.getState().flushSyncQueue(syncMutationsToServer);

    expect(ok).toBe(false);
    expect(queuedIds()).toEqual(['unknown-lesson']);
    expect(useAppStore.getState().syncStatus).toBe('error');
  });
});

describe('sync batch size', () => {
  it('stays within the limit the backend accepts', () => {
    const schemas = readFileSync(join(__dirname, '../../../backend/app/schemas.py'), 'utf8');
    const client = readFileSync(join(__dirname, '../services/apiClient.ts'), 'utf8');
    const serverLimit = Number(/mutations: List\[SyncMutationItem\] = Field\(\.\.\., max_length=(\d+)\)/.exec(schemas)?.[1]);
    const clientSize = Number(/SYNC_BATCH_SIZE = (\d+)/.exec(client)?.[1]);
    expect(clientSize).toBeGreaterThan(0);
    expect(clientSize).toBeLessThanOrEqual(serverLimit);
  });
});
