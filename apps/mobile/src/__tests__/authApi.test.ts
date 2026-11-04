import {
  confirmPasswordReset,
  register,
  requestPasswordReset,
  signIn,
} from '../services/authApi';

function respondWith(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function lastRequest() {
  const [url, options] = (global.fetch as jest.Mock).mock.calls.at(-1);
  return { url: url as string, body: JSON.parse(options.body) };
}

const ACCOUNT_BODY = {
  user_id: 'user-1',
  email: 'asha@example.com',
  display_name: 'Asha',
  access_token: 'token',
  expires_in: 1800,
};

describe('authApi', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('returns the account after a successful sign-in', async () => {
    respondWith(200, ACCOUNT_BODY);
    const account = await signIn('asha@example.com', 'Password123!');
    expect(account).toEqual({
      userId: 'user-1',
      email: 'asha@example.com',
      displayName: 'Asha',
      accessToken: 'token',
      expiresIn: 1800,
    });
  });

  it('surfaces the server message when the password is wrong', async () => {
    respondWith(401, { detail: 'Incorrect email or password.' });
    await expect(signIn('asha@example.com', 'wrong-password')).rejects.toThrow(
      'Incorrect email or password.'
    );
  });

  it('shows a readable message for field validation errors', async () => {
    respondWith(422, { detail: [{ loc: ['body', 'email'], msg: 'bad' }] });
    await expect(signIn('asha@example.com', 'short')).rejects.toThrow(
      'Something went wrong. Please check your details and try again.'
    );
  });

  it('does not sign in when registration needs email confirmation', async () => {
    respondWith(202, { status: 'confirmation_required', message: 'Check your email.' });
    await expect(register('asha@example.com', 'Password123!', 'Asha')).resolves.toEqual({
      status: 'confirmation_required',
      message: 'Check your email.',
    });
  });

  it('signs in when registration returns a session', async () => {
    respondWith(201, ACCOUNT_BODY);
    const result = await register('asha@example.com', 'Password123!', 'Asha');
    expect(result.status).toBe('signed_in');
  });

  it('does not report a reset email as sent when the request fails', async () => {
    respondWith(503, { detail: 'Sign-in is not available right now. Please try again later.' });
    await expect(requestPasswordReset('asha@example.com')).rejects.toThrow('not available');

    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(requestPasswordReset('asha@example.com')).rejects.toThrow('Network request failed');
  });

  it('sends the reset code and new password to the confirm endpoint', async () => {
    respondWith(200, { message: 'Your password has been changed. Please sign in.' });
    const message = await confirmPasswordReset('asha@example.com', '123456', 'BrandNew!42');
    expect(message).toBe('Your password has been changed. Please sign in.');
    expect(lastRequest().url).toMatch(/\/auth\/recover\/confirm$/);
    expect(lastRequest().body).toEqual({
      email: 'asha@example.com',
      code: '123456',
      new_password: 'BrandNew!42',
    });
  });
});
