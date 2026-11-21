import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestAITutorFeedback, requestGrammarCheck, requestIELTSEvaluation } from '../services/apiClient';
import { STORAGE_KEY, useAppStore } from '../store/useAppStore';

const realFetch = global.fetch;

describe('API failures are reported, not swallowed', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    global.fetch = jest.fn(async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
  });
  afterEach(() => {
    warn.mockRestore();
    global.fetch = realFetch;
  });

  test('grammar check falls back to the on-device engine and logs why', async () => {
    const res = await requestGrammarCheck({ text: 'He go to school.', explanationLanguage: 'en' });
    expect(res.providerStatus).toBe('deterministic_engine');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[api] grammar-check'), expect.anything());
  });

  test('tutor and IELTS fall back and log', async () => {
    const tutor = await requestAITutorFeedback({
      scenarioId: 's',
      scenarioTitle: 'Job Interview',
      userMessage: 'He go to school.',
      explanationLanguage: 'en',
    });
    expect(tutor.providerStatus).toBe('offline_fallback');
    await requestIELTSEvaluation({ moduleType: 'writing', taskId: 't', promptText: '', userResponse: 'Some text here.' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[api] ai-tutor'), expect.anything());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[api] ielts-evaluate'), expect.anything());
  });

  test('corrupt saved state is logged on hydrate', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{not json');
    await useAppStore.getState().hydrateFromStorage();
    expect(useAppStore.getState().isHydrated).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[storage] hydrate'), expect.anything());
  });
});
