import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { PasswordAuthConfig, PublicConfig } from './config';
import { resolveClientIp } from './trusted-ip';
import type { RequestIPProvider } from './trusted-ip';

const AUTH_LOG_FILE = '/var/log/marble-panel/auth.log';

function ensureAuthLogFile(): void {
  try {
    mkdirSync('/var/log/marble-panel', { recursive: true });
    appendFileSync(AUTH_LOG_FILE, '');
  } catch {
    // Non-Docker/local environments may not be allowed to write /var/log.
  }
}

ensureAuthLogFile();

function writeAuthLog(line: string): void {
  // Always log to stderr for Docker json-file logging.
  console.warn(line);
  // Also append to the auth log file for Fail2Ban (best-effort).
  try {
    appendFileSync(AUTH_LOG_FILE, line + '\n');
  } catch {
    // File may not be writable in some environments — that's ok,
    // the stderr line is the canonical source.
  }
}

const LOGIN_PATH = '/auth/login';
const LOGOUT_PATH = '/auth/logout';
const STATUS_PATH = '/auth/status';

type SessionPayload = {
  exp: number;
  nonce: string;
};

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName || rawValue.length === 0) continue;
    cookies.set(rawName, rawValue.join('='));
  }

  return cookies;
}

function redirect(location: string, headers?: HeadersInit): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      ...headers,
    },
  });
}

function noCacheHeaders(extra?: HeadersInit): HeadersInit {
  return {
    'Cache-Control': 'no-store',
    ...extra,
  };
}

function renderLoginPage(error = ''): Response {
  const errorMarkup = error ? `<p class="error">${error}</p>` : '';

  return new Response(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Marble Panel Login</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #000000;
        --surface: #141414;
        --text: #f1f5f9;
        --text-muted: #888888;
        --danger: #ef4444;
        --border: #2a2a2a;
        --radius-sm: 0.375rem;
        --space-md: 0.5rem;
        --space-lg: 0.75rem;
        --space-xl: 1rem;
        --text-md: 0.65rem;
        --text-xl: 0.8rem;
        --text-3xl: 1rem;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--text);
      }

      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: var(--bg);
      }

      main {
        width: min(360px, calc(100vw - (var(--space-xl) * 2)));
      }

      h1 {
        margin: 0 0 var(--space-xl);
        font-size: var(--text-3xl);
        font-weight: 650;
      }

      form {
        display: grid;
        gap: var(--space-lg);
      }

      input,
      button {
        min-height: 44px;
        border-radius: var(--radius-sm);
        font: inherit;
      }

      input {
        border: 1px solid var(--border);
        background: var(--surface);
        color: inherit;
        padding: 0 var(--space-lg);
      }

      button {
        border: 0;
        background: var(--text);
        color: var(--bg);
        font-weight: 650;
      }

      .error {
        margin: 0 0 var(--space-lg);
        color: var(--danger);
        font-size: var(--text-xl);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Marble Panel</h1>
      ${errorMarkup}
      <form method="post" action="${LOGIN_PATH}">
        <input name="password" type="password" autocomplete="current-password" placeholder="Password" autofocus required />
        <button type="submit">Sign in</button>
      </form>
    </main>
    <script>
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => registrations.forEach((registration) => registration.unregister()))
          .catch(() => {});
      }
    </script>
  </body>
</html>`, {
    status: error ? 401 : 200,
    headers: noCacheHeaders({ 'Content-Type': 'text/html; charset=utf-8' }),
  });
}

function setupErrorResponse(): Response {
  return new Response('Password auth is enabled, but auth.password_hash is not configured.', {
    status: 503,
    headers: noCacheHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
  });
}

function unauthorizedResponse(): Response {
  return new Response('Unauthorized', {
    status: 401,
    headers: noCacheHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
  });
}

export class AuthManager {
  private readonly publicConfig: PublicConfig;
  private readonly hiddenPath: string;

  constructor(
    private readonly config: PasswordAuthConfig,
    publicConfig: PublicConfig,
    hiddenEntryPath: string,
  ) {
    this.publicConfig = publicConfig;
    this.hiddenPath = hiddenEntryPath;
  }

  /** Get the base redirect path, respecting hidden entry if enabled. */
  private getBasePath(): string {
    return this.hiddenPath || '/';
  }

  /** Resolve the trusted client IP for a request. */
  resolveIp(req: Request, server: RequestIPProvider | null): string {
    return resolveClientIp(req, server, this.publicConfig);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async handleRoute(req: Request, url: URL, server: RequestIPProvider | null): Promise<Response | null> {
    if (url.pathname === STATUS_PATH) {
      return Response.json(
        {
          enabled: this.config.enabled,
          authenticated: this.config.enabled ? this.isAuthenticated(req) : true,
        },
        { headers: noCacheHeaders() },
      );
    }

    if (!this.config.enabled) {
      return url.pathname.startsWith('/auth/') ? new Response('Not Found', { status: 404 }) : null;
    }

    if (url.pathname === LOGIN_PATH) {
      if (!this.config.password_hash) return setupErrorResponse();
      if (req.method === 'GET') {
        return this.isAuthenticated(req) ? redirect(this.getBasePath()) : renderLoginPage();
      }
      if (req.method === 'POST') return this.handleLogin(req, server);
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { 'Allow': 'GET, POST' },
      });
    }

    if (url.pathname === LOGOUT_PATH) {
      if (req.method !== 'GET' && req.method !== 'POST') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { 'Allow': 'GET, POST' },
        });
      }
      return redirect(this.getBasePath(), { 'Set-Cookie': this.buildCookie('', 0) });
    }

    if (url.pathname.startsWith('/auth/')) {
      return new Response('Not Found', { status: 404 });
    }

    return null;
  }

  requirePage(req: Request): Response | null {
    if (!this.config.enabled) return null;
    if (!this.config.password_hash) return setupErrorResponse();
    return this.isAuthenticated(req) ? null : renderLoginPage();
  }

  requireRequest(req: Request): Response | null {
    if (!this.config.enabled) return null;
    if (!this.config.password_hash) return setupErrorResponse();
    return this.isAuthenticated(req) ? null : unauthorizedResponse();
  }

  private async handleLogin(req: Request, server: RequestIPProvider | null): Promise<Response> {
    let password = '';

    try {
      const form = await req.formData();
      const value = form.get('password');
      password = typeof value === 'string' ? value : '';
    } catch {
      // Treat malformed bodies the same as a bad password.
    }

    const ok = await this.verifyPassword(password);
    if (!ok) {
      const ip = this.resolveIp(req, server);
      writeAuthLog(`MARBLE_AUTH_FAIL ip=${ip} path=${LOGIN_PATH} reason=bad_password`);
      return renderLoginPage('Invalid password.');
    }

    return redirect(this.getBasePath(), { 'Set-Cookie': this.createSessionCookie() });
  }

  private async verifyPassword(password: string): Promise<boolean> {
    if (!password || !this.config.password_hash) return false;

    try {
      return await Bun.password.verify(password, this.config.password_hash);
    } catch {
      return false;
    }
  }

  private isAuthenticated(req: Request): boolean {
    const token = parseCookies(req.headers.get('cookie')).get(this.config.cookie_name);
    if (!token) return false;

    const [payload, signature] = token.split('.');
    if (!payload || !signature || !this.config.password_hash) return false;

    const expectedSignature = signPayload(payload, this.config.password_hash);
    if (!safeEqual(signature, expectedSignature)) return false;

    try {
      const parsed = JSON.parse(decodeBase64Url(payload)) as Partial<SessionPayload>;
      return typeof parsed.exp === 'number' && parsed.exp > Date.now();
    } catch {
      return false;
    }
  }

  private createSessionCookie(): string {
    const payload = encodeBase64Url(JSON.stringify({
      exp: Date.now() + this.config.session_ttl_seconds * 1000,
      nonce: randomBytes(16).toString('base64url'),
    } satisfies SessionPayload));
    const token = `${payload}.${signPayload(payload, this.config.password_hash)}`;

    return this.buildCookie(token, this.config.session_ttl_seconds);
  }

  private buildCookie(value: string, maxAge: number): string {
    const parts = [
      `${this.config.cookie_name}=${value}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${maxAge}`,
    ];
    if (this.config.cookie_secure) parts.push('Secure');
    return parts.join('; ');
  }
}

export function createAuthManager(config: PasswordAuthConfig, publicConfig: PublicConfig, hiddenEntryPath: string): AuthManager {
  return new AuthManager(config, publicConfig, hiddenEntryPath);
}
