import { getApiBaseUrl } from './apiClient';

export interface SignedInAccount {
  userId: string;
  email: string;
  displayName: string;
  accessToken: string;
  expiresIn: number;
}

export type RegisterResult =
  | { status: 'signed_in'; account: SignedInAccount }
  | { status: 'confirmation_required'; message: string };

const GENERIC_ERROR = 'Something went wrong. Please check your details and try again.';

async function postAuth(path: string, body: Record<string, string>): Promise<Response> {
  const res = await fetch(`${getApiBaseUrl()}/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    // Validation failures return a list of field errors, which isn't readable as a message.
    throw new Error(typeof errorBody.detail === 'string' ? errorBody.detail : GENERIC_ERROR);
  }
  return res;
}

function toAccount(data: Record<string, unknown>): SignedInAccount {
  return {
    userId: data.user_id as string,
    email: data.email as string,
    displayName: data.display_name as string,
    accessToken: data.access_token as string,
    expiresIn: (data.expires_in as number) || 3600,
  };
}

export async function signIn(email: string, password: string): Promise<SignedInAccount> {
  const res = await postAuth('login', { email, password });
  return toAccount(await res.json());
}

export async function register(
  email: string,
  password: string,
  displayName: string
): Promise<RegisterResult> {
  const res = await postAuth('register', { email, password, display_name: displayName });
  const data = await res.json();
  if (res.status === 202) {
    return { status: 'confirmation_required', message: data.message };
  }
  return { status: 'signed_in', account: toAccount(data) };
}

export async function requestPasswordReset(email: string): Promise<string> {
  const res = await postAuth('recover', { email });
  return (await res.json()).message;
}

export async function confirmPasswordReset(
  email: string,
  code: string,
  newPassword: string
): Promise<string> {
  const res = await postAuth('recover/confirm', { email, code, new_password: newPassword });
  return (await res.json()).message;
}
