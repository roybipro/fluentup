import { resolveApiBaseUrl } from '../services/apiClient';

describe('resolveApiBaseUrl', () => {
  test('production requires an explicit HTTPS URL', () => {
    expect(() => resolveApiBaseUrl(undefined, false)).toThrow(/EXPO_PUBLIC_API_BASE_URL/);
    expect(() => resolveApiBaseUrl('http://api.example.com/api/v1', false)).toThrow(/HTTPS/);
    expect(() => resolveApiBaseUrl('http://10.0.2.2:8000/api/v1', false)).toThrow();
    expect(resolveApiBaseUrl('https://api.example.com/api/v1/', false)).toBe('https://api.example.com/api/v1');
  });

  test('development falls back to the Android emulator host', () => {
    expect(resolveApiBaseUrl(undefined, true)).toBe('http://10.0.2.2:8000/api/v1');
    expect(resolveApiBaseUrl('http://192.168.1.5:8000/api/v1', true)).toBe('http://192.168.1.5:8000/api/v1');
  });
});
