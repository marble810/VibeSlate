import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { CodexAuthLock } from './codex-auth-lock';
import { redactSecrets } from './secret-redaction';
import type {
  CancelLoginAccountResponse,
  GetAccountRateLimitsResponse,
  GetAccountResponse,
  JsonRpcFailure,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcSuccess,
  LoginAccountResponse,
} from './codex-app-server-protocol';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: Timer;
}

export interface CodexAppServerManagerOptions {
  codexCliPath: string;
  codexHome: string;
  lockPath: string;
  requestTimeoutMs?: number;
}

type NotificationHandler = (notification: JsonRpcNotification) => void;

export class CodexAppServerManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private lock: CodexAuthLock | null = null;
  private stdoutBuffer = '';
  private nextId = 1;
  private startPromise: Promise<void> | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly notificationHandlers = new Set<NotificationHandler>();
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: CodexAppServerManagerOptions) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  }

  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  async readAccount(refreshToken = false): Promise<GetAccountResponse> {
    return await this.request<GetAccountResponse>('account/read', { refreshToken });
  }

  async readRateLimits(): Promise<GetAccountRateLimitsResponse> {
    return await this.request<GetAccountRateLimitsResponse>('account/rateLimits/read');
  }

  async startLogin(): Promise<LoginAccountResponse> {
    return await this.request<LoginAccountResponse>('account/login/start', {
      type: 'chatgptDeviceCode',
    });
  }

  async cancelLogin(loginId: string): Promise<CancelLoginAccountResponse> {
    return await this.request<CancelLoginAccountResponse>('account/login/cancel', { loginId });
  }

  async logout(): Promise<void> {
    await this.request('account/logout');
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    await this.ensureStarted();
    return await this.sendRequest<T>(method, params);
  }

  stop(): void {
    this.rejectPending(new Error('Codex app-server stopped'));
    if (this.child) {
      this.child.kill('SIGTERM');
      this.child = null;
    }
    this.lock?.release();
    this.lock = null;
    this.startPromise = null;
  }

  private async ensureStarted(): Promise<void> {
    if (this.child) return;
    if (this.startPromise) return await this.startPromise;

    this.startPromise = this.start();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async start(): Promise<void> {
    this.prepareCodexHome();
    this.lock = new CodexAuthLock(this.options.lockPath);
    this.lock.acquire();

    const child = spawn(this.options.codexCliPath, ['app-server', '--stdio'], {
      env: {
        ...process.env,
        CODEX_HOME: this.options.codexHome,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => this.handleStdout(chunk));
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string) => {
      const text = redactSecrets(chunk).trim();
      if (text) console.warn(`[codex-app-server] ${text}`);
    });
    child.on('exit', (code, signal) => this.handleExit(code, signal));
    child.on('error', (error) => {
      this.rejectPending(new Error(`Codex app-server process error: ${redactSecrets(error.message)}`));
    });

    await this.sendRequest('initialize', {
      clientInfo: {
        name: 'vibeslate',
        title: 'VibeSlate',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    });
    this.sendNotification('initialized');
  }

  private prepareCodexHome(): void {
    mkdirSync(this.options.codexHome, { recursive: true, mode: 0o700 });
    try {
      chmodSync(this.options.codexHome, 0o700);
    } catch {
      // chmod can fail on some bind mounts; doctor reports the exact mode.
    }

    const configPath = join(this.options.codexHome, 'config.toml');
    if (!existsSync(configPath)) {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(
        configPath,
        [
          'cli_auth_credentials_store = "file"',
          'forced_login_method = "chatgpt"',
          '',
        ].join('\n'),
        'utf-8',
      );
    }
  }

  private sendRequest<T>(method: string, params?: unknown): Promise<T> {
    const child = this.child;
    if (!child) return Promise.reject(new Error('Codex app-server is not running'));

    const id = this.nextId++;
    const payload = params === undefined ? { method, id } : { method, id, params };
    let reject!: (reason: Error) => void;
    const timeout = setTimeout(() => {
      this.pending.delete(id);
      reject(new Error(`Codex app-server request timed out: ${method}`));
    }, this.requestTimeoutMs);

    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      reject = rejectPromise;
      this.pending.set(id, {
        resolve: (value) => resolvePromise(value as T),
        reject: rejectPromise,
        timeout,
      });
    });

    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return promise;
  }

  private sendNotification(method: string, params?: unknown): void {
    const child = this.child;
    if (!child) return;

    const payload = params === undefined ? { method } : { method, params };
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;

    while (true) {
      const newline = this.stdoutBuffer.indexOf('\n');
      if (newline === -1) return;

      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) continue;

      try {
        this.handleMessage(JSON.parse(line) as JsonRpcMessage);
      } catch (error) {
        console.warn(
          `[codex-app-server] Ignored invalid JSON-RPC line: ${
            error instanceof Error ? redactSecrets(error.message) : 'unknown parse error'
          }`,
        );
      }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if ('id' in message) {
      const pending = this.pending.get(message.id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if ('error' in message) {
        pending.reject(this.errorFromResponse(message));
      } else {
        pending.resolve((message as JsonRpcSuccess).result);
      }
      return;
    }

    const notification = message as JsonRpcNotification;
    for (const handler of this.notificationHandlers) {
      try {
        handler(notification);
      } catch (error) {
        console.warn(
          `[codex-app-server] Notification handler failed: ${
            error instanceof Error ? redactSecrets(error.message) : 'unknown error'
          }`,
        );
      }
    }
  }

  private errorFromResponse(message: JsonRpcFailure): Error {
    const code = message.error.code === undefined ? '' : `${message.error.code} `;
    const text = message.error.message || 'unknown app-server error';
    return new Error(`Codex app-server ${code}${redactSecrets(text)}`.trim());
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.child = null;
    this.stdoutBuffer = '';
    this.rejectPending(new Error(`Codex app-server exited (${code ?? signal ?? 'unknown'})`));
    this.lock?.release();
    this.lock = null;
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
