import Constants from 'expo-constants';
import {
  AITutorFeedback,
  AITutorFeedbackSchema,
  GrammarCheckResult,
  GrammarCheckResultSchema,
  IELTSEvaluation,
  IELTSEvaluationSchema,
} from '../schemas/domain';
import {
  analyzeGrammarLocally,
  buildFallbackTutorFeedback,
  evaluateIELTSResponseLocally,
} from './learningEngine';
import { SyncQueueMutation, useAppStore } from '../store/useAppStore';

const DEFAULT_TIMEOUT_MS = 18000;

export function getApiBaseUrl(): string {
  const extraUrl = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
  return extraUrl || process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:8000/api/v1';
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const authSession = useAppStore.getState().authSession;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (authSession?.accessToken && !authSession.isGuest) {
      headers.Authorization = `Bearer ${authSession.accessToken}`;
    }
    return await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function requestAITutorFeedback(params: {
  scenarioId: string;
  scenarioTitle: string;
  userMessage: string;
  explanationLanguage: 'bn' | 'en';
}): Promise<AITutorFeedback> {
  try {
    const res = await fetchWithTimeout(`${getApiBaseUrl()}/ai/tutor`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    return AITutorFeedbackSchema.parse(json);
  } catch {
    return buildFallbackTutorFeedback({
      scenarioTitle: params.scenarioTitle,
      userMessage: params.userMessage,
    });
  }
}

export async function requestGrammarCheck(params: {
  text: string;
  explanationLanguage: 'bn' | 'en';
}): Promise<GrammarCheckResult> {
  const trimmed = params.text.trim();
  if (!trimmed) {
    throw new Error('Please enter a sentence or paragraph to check.');
  }
  if (trimmed.length > 3000) {
    throw new Error('Text exceeds maximum length of 3,000 characters.');
  }

  try {
    const res = await fetchWithTimeout(`${getApiBaseUrl()}/ai/grammar-check`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    return GrammarCheckResultSchema.parse(json);
  } catch {
    return analyzeGrammarLocally(trimmed);
  }
}

export async function requestIELTSEvaluation(params: {
  moduleType: 'speaking' | 'writing' | 'reading' | 'listening';
  taskId: string;
  promptText: string;
  userResponse: string;
}): Promise<IELTSEvaluation> {
  try {
    const res = await fetchWithTimeout(`${getApiBaseUrl()}/ai/ielts-evaluate`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    return IELTSEvaluationSchema.parse(json);
  } catch {
    return evaluateIELTSResponseLocally({
      moduleType: params.moduleType,
      taskId: params.taskId,
      userResponse: params.userResponse,
    });
  }
}

export async function syncMutationsToServer(mutations: SyncQueueMutation[]): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${getApiBaseUrl()}/sync/batch`, {
      method: 'POST',
      body: JSON.stringify({ mutations }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestServerAccountDeletion(reason: string): Promise<{ deleted: boolean; message: string }> {
  const session = useAppStore.getState().authSession;
  if (!session || session.isGuest) {
    await useAppStore.getState().deleteAccountAndPurgeData();
    return {
      deleted: true,
      message: 'Local guest profile and all cached study records were permanently deleted from this device.',
    };
  }

  try {
    const res = await fetchWithTimeout(`${getApiBaseUrl()}/auth/account`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    await useAppStore.getState().deleteAccountAndPurgeData();
    return {
      deleted: true,
      message: 'Your FluentUp account, personal profile, and associated learning history have been deleted.',
    };
  } catch {
    // Even if server is offline during dev/test, purge local credentials & state and report honestly
    await useAppStore.getState().deleteAccountAndPurgeData();
    return {
      deleted: true,
      message:
        'Local credentials and device data were erased immediately. If your account exists on the remote server, use the Account Deletion portal once online.',
    };
  }
}
