import type { OpenAIAuthStatus, OpenAILoginStartResponse } from '../server/src/types';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface OpenAIAuthLoginCliOptions {
  baseUrl: string;
  timeoutSeconds: number;
  pollIntervalMs?: number;
  fetchImpl?: FetchLike;
  promptPassword?: () => Promise<string>;
  write?: (message: string) => void;
  writeError?: (message: string) => void;
  signal?: AbortSignal;
}

export interface OpenAIAuthLoginResult {
  status: 'authenticated' | 'canceled' | 'timeout' | 'failed';
  message: string;
}

interface PasswordAuthStatus {
  enabled: boolean;
  authenticated: boolean;
}

interface ApiErrorBody {
  error?: string;
}

const FAILING_OPENAI_STATES = new Set<OpenAIAuthStatus['state']>([
  'expired_recoverable',
  'revoked',
  'duplicated_auth_detected',
  'codex_app_server_unavailable',
]);

export async function runOpenAIAuthLogin(
  options: OpenAIAuthLoginCliOptions,
): Promise<OpenAIAuthLoginResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const timeoutMs = options.timeoutSeconds * 1000;
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const writer = options.write ?? ((message: string) => process.stdout.write(message));
  const errorWriter = options.writeError ?? ((message: string) => process.stderr.write(message));
  const cookieJar = new CookieJar();

  let loginId: string | null = null;

  const request = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const cookie = cookieJar.header();
    if (cookie) headers.set('Cookie', cookie);
    return fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
  };

  async function cancelPending(reason: string): Promise<void> {
    if (!loginId) return;
    try {
      await request('/api/openai/auth/login/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ loginId }),
      });
      writer(`\nCanceled pending OpenAI login (${reason}).\n`);
    } catch {
      errorWriter(`\nFailed to cancel pending OpenAI login after ${reason}.\n`);
    }
  }

  try {
    await ensurePasswordSession(request, cookieJar, options.promptPassword);
    const login = await startOpenAILogin(request);
    loginId = login.loginId;

    writer('\nOpenAI device-code login\n');
    writer(`URL:  ${login.verificationUrl}\n`);
    writer(`Code: ${login.userCode}\n\n`);
    writer('Waiting for login to complete...\n');

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (options.signal?.aborted) {
        await cancelPending('interrupt');
        return { status: 'canceled', message: 'Interrupted by user.' };
      }

      await sleep(pollIntervalMs, options.signal);
      if (options.signal?.aborted) {
        await cancelPending('interrupt');
        return { status: 'canceled', message: 'Interrupted by user.' };
      }

      const status = await readOpenAIAuthStatus(request);
      if (status.state === 'authenticated') {
        writer('OpenAI login completed.\n');
        return { status: 'authenticated', message: 'OpenAI login completed.' };
      }

      if (FAILING_OPENAI_STATES.has(status.state)) {
        const reason = status.last_error_code || status.state;
        return {
          status: 'failed',
          message: `OpenAI login failed: ${reason}`,
        };
      }
    }

    await cancelPending('timeout');
    return {
      status: 'timeout',
      message: `OpenAI login timed out after ${options.timeoutSeconds}s.`,
    };
  } catch (error) {
    if (options.signal?.aborted) {
      await cancelPending('interrupt');
      return { status: 'canceled', message: 'Interrupted by user.' };
    }
    return {
      status: 'failed',
      message: describeCliError(error, baseUrl),
    };
  }
}

async function ensurePasswordSession(
  request: (path: string, init?: RequestInit) => Promise<Response>,
  cookieJar: CookieJar,
  promptPassword?: () => Promise<string>,
): Promise<void> {
  const status = await readPasswordAuthStatus(request);
  if (!status.enabled || status.authenticated) return;
  if (!promptPassword) {
    throw new Error('VibeSlate password auth is enabled, but no password prompt is available.');
  }

  const password = await promptPassword();
  const response = await request('/auth/login', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ password }),
  });

  cookieJar.store(response.headers);
  if ((response.status === 303 || response.status === 302) && cookieJar.header()) return;

  throw new Error(`VibeSlate password login failed with HTTP ${response.status}.`);
}

async function readPasswordAuthStatus(
  request: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<PasswordAuthStatus> {
  const response = await request('/auth/status', {
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to read VibeSlate auth status: HTTP ${response.status}`);
  }
  const body = await response.json() as Partial<PasswordAuthStatus>;
  return {
    enabled: body.enabled === true,
    authenticated: body.authenticated === true,
  };
}

async function startOpenAILogin(
  request: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<OpenAILoginStartResponse> {
  const response = await request('/api/openai/auth/login/start', {
    method: 'POST',
    headers: {
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    const body = await readApiError(response);
    const code = body.error ? ` (${body.error})` : '';
    throw new Error(`Failed to start OpenAI login: HTTP ${response.status}${code}`);
  }

  const body = await response.json() as Partial<OpenAILoginStartResponse>;
  if (
    body.type !== 'chatgptDeviceCode' ||
    typeof body.loginId !== 'string' ||
    typeof body.verificationUrl !== 'string' ||
    typeof body.userCode !== 'string'
  ) {
    throw new Error('OpenAI login response did not include a device code.');
  }

  return body as OpenAILoginStartResponse;
}

async function readOpenAIAuthStatus(
  request: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<OpenAIAuthStatus> {
  const response = await request('/api/openai/auth/status', {
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache',
    },
  });
  if (!response.ok) {
    const body = await readApiError(response);
    const code = body.error ? ` (${body.error})` : '';
    throw new Error(`Failed to read OpenAI auth status: HTTP ${response.status}${code}`);
  }
  return await response.json() as OpenAIAuthStatus;
}

async function readApiError(response: Response): Promise<ApiErrorBody> {
  try {
    const body = await response.json();
    return body && typeof body === 'object' ? body as ApiErrorBody : {};
  } catch {
    return {};
  }
}

function normalizeBaseUrl(value: string): string {
  const url = value.trim();
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function describeCliError(error: unknown, baseUrl: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const looksLikeConnectFailure =
    lower.includes('unable to connect') ||
    lower.includes('failed to connect') ||
    lower.includes('connection refused') ||
    lower.includes('econnrefused') ||
    lower.includes('fetch failed');

  if (!looksLikeConnectFailure) return message;

  return [
    `Cannot reach the VibeSlate backend at ${baseUrl}.`,
    'For dev, start it first with `bun run dev`, then run `bun run openai:auth:login` in another terminal.',
    'If the backend is running on a different address, pass `--base-url <url>`.',
  ].join(' ');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

class CookieJar {
  private cookies = new Map<string, string>();

  store(headers: Headers): void {
    const values = getSetCookieValues(headers);
    for (const value of values) {
      const pair = value.split(';', 1)[0]?.trim();
      if (!pair) continue;
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  header(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

function getSetCookieValues(headers: Headers): string[] {
  const headersWithSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const direct = headersWithSetCookie.getSetCookie?.();
  if (direct && direct.length > 0) return direct;
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}
