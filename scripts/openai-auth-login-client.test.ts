import { describe, expect, test } from 'bun:test';
import { runOpenAIAuthLogin } from './openai-auth-login-client';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

describe('openai auth login cli client', () => {
  test('starts device-code login and completes after authenticated status', async () => {
    const requests: string[] = [];
    const output: string[] = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      const path = new URL(url).pathname;
      requests.push(`${init?.method || 'GET'} ${path}`);

      if (path === '/auth/status') {
        return jsonResponse({ enabled: false, authenticated: true });
      }
      if (path === '/api/openai/auth/login/start') {
        return jsonResponse({
          type: 'chatgptDeviceCode',
          loginId: 'login-1',
          verificationUrl: 'https://example.com/device',
          userCode: 'ABCD-EFGH',
        });
      }
      if (path === '/api/openai/auth/status') {
        return jsonResponse({
          state: 'authenticated',
          email_redacted: 'u***@example.com',
          plan_type: 'plus',
          last_success_at: 1,
          last_error_code: null,
          auth_json_hash: 'hash',
          ts: 1,
        });
      }
      throw new Error(`unexpected ${url}`);
    };

    const result = await runOpenAIAuthLogin({
      baseUrl: 'http://127.0.0.1:12001',
      timeoutSeconds: 10,
      pollIntervalMs: 0,
      fetchImpl,
      write: (message) => output.push(message),
    });

    expect(result.status).toBe('authenticated');
    expect(output.join('')).toContain('ABCD-EFGH');
    expect(requests).toEqual([
      'GET /auth/status',
      'POST /api/openai/auth/login/start',
      'GET /api/openai/auth/status',
    ]);
  });

  test('logs into password-protected VibeSlate before starting OpenAI login', async () => {
    const seenCookies: string[] = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      const path = new URL(url).pathname;
      const headers = new Headers(init?.headers);
      seenCookies.push(headers.get('Cookie') || '');

      if (path === '/auth/status') {
        return jsonResponse({ enabled: true, authenticated: false });
      }
      if (path === '/auth/login') {
        expect(await new Response(init?.body).text()).toBe('password=s3cr3t');
        return new Response(null, {
          status: 303,
          headers: {
            Location: '/',
            'Set-Cookie': 'marble_session=session-token; Path=/; HttpOnly; Secure',
          },
        });
      }
      if (path === '/api/openai/auth/login/start') {
        expect(headers.get('Cookie')).toBe('marble_session=session-token');
        return jsonResponse({
          type: 'chatgptDeviceCode',
          loginId: 'login-2',
          verificationUrl: 'https://example.com/device',
          userCode: 'WXYZ-1234',
        });
      }
      if (path === '/api/openai/auth/status') {
        return jsonResponse({
          state: 'authenticated',
          email_redacted: null,
          plan_type: null,
          last_success_at: 1,
          last_error_code: null,
          auth_json_hash: null,
          ts: 1,
        });
      }
      throw new Error(`unexpected ${path}`);
    };

    const result = await runOpenAIAuthLogin({
      baseUrl: 'http://127.0.0.1:12001/',
      timeoutSeconds: 10,
      pollIntervalMs: 0,
      fetchImpl,
      promptPassword: async () => 's3cr3t',
      write: () => {},
    });

    expect(result.status).toBe('authenticated');
    expect(seenCookies).toContain('marble_session=session-token');
  });

  test('cancels pending login after timeout', async () => {
    const requests: string[] = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(input.toString()).pathname;
      requests.push(`${init?.method || 'GET'} ${path}`);

      if (path === '/auth/status') return jsonResponse({ enabled: false, authenticated: true });
      if (path === '/api/openai/auth/login/start') {
        return jsonResponse({
          type: 'chatgptDeviceCode',
          loginId: 'login-timeout',
          verificationUrl: 'https://example.com/device',
          userCode: 'TIME-OUT',
        });
      }
      if (path === '/api/openai/auth/status') {
        return jsonResponse({
          state: 'login_pending',
          email_redacted: null,
          plan_type: null,
          last_success_at: null,
          last_error_code: null,
          auth_json_hash: null,
          ts: 1,
        });
      }
      if (path === '/api/openai/auth/login/cancel') {
        expect(await new Response(init?.body).json()).toEqual({ loginId: 'login-timeout' });
        return jsonResponse({ status: 'canceled' });
      }
      throw new Error(`unexpected ${path}`);
    };

    const result = await runOpenAIAuthLogin({
      baseUrl: 'http://127.0.0.1:12001',
      timeoutSeconds: 0.001,
      pollIntervalMs: 0,
      fetchImpl,
      write: () => {},
      writeError: () => {},
    });

    expect(result.status).toBe('timeout');
    expect(requests).toContain('POST /api/openai/auth/login/cancel');
  });

  test('explains backend connection failures with dev startup guidance', async () => {
    const result = await runOpenAIAuthLogin({
      baseUrl: 'http://localhost:12001',
      timeoutSeconds: 10,
      fetchImpl: async () => {
        throw new Error('Unable to connect. Is the computer able to access the url?');
      },
      write: () => {},
    });

    expect(result.status).toBe('failed');
    expect(result.message).toContain('Cannot reach the VibeSlate backend at http://localhost:12001');
    expect(result.message).toContain('bun run dev');
    expect(result.message).toContain('--base-url');
  });
});
