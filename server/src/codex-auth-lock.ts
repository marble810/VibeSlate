import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hostname } from 'node:os';

interface LockOwner {
  pid: number;
  hostname: string;
  started_at: string;
  updated_at: string;
}

export class CodexAuthLock {
  private heartbeat: Timer | null = null;
  private acquired = false;
  private readonly startedAt = new Date().toISOString();

  constructor(
    private readonly lockDir: string,
    private readonly staleMs = 120_000,
  ) {}

  acquire(): void {
    mkdirSync(dirname(this.lockDir), { recursive: true });

    try {
      mkdirSync(this.lockDir);
      this.acquired = true;
      this.writeOwner();
      this.heartbeat = setInterval(() => this.writeOwner(), 30_000);
      return;
    } catch (error) {
      if (!existsSync(this.lockDir)) throw error;
    }

    if (!this.isStale()) {
      throw new Error(`Codex auth lock already exists at ${this.lockDir}`);
    }

    rmSync(this.lockDir, { recursive: true, force: true });
    mkdirSync(this.lockDir);
    this.acquired = true;
    this.writeOwner();
    this.heartbeat = setInterval(() => this.writeOwner(), 30_000);
  }

  release(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (!this.acquired) return;

    rmSync(this.lockDir, { recursive: true, force: true });
    this.acquired = false;
  }

  get path(): string {
    return this.lockDir;
  }

  private isStale(): boolean {
    try {
      const ownerRaw = readFileSync(join(this.lockDir, 'owner.json'), 'utf-8');
      const owner = JSON.parse(ownerRaw) as Partial<LockOwner>;
      const updatedAt = typeof owner.updated_at === 'string' ? Date.parse(owner.updated_at) : Number.NaN;
      if (Number.isFinite(updatedAt)) return Date.now() - updatedAt > this.staleMs;
    } catch {
      // Fall back to directory mtime below.
    }

    try {
      return Date.now() - statSync(this.lockDir).mtimeMs > this.staleMs;
    } catch {
      return true;
    }
  }

  private writeOwner(): void {
    const now = new Date().toISOString();
    const owner: LockOwner = {
      pid: process.pid,
      hostname: hostname(),
      started_at: this.startedAt,
      updated_at: now,
    };
    writeFileSync(join(this.lockDir, 'owner.json'), JSON.stringify(owner, null, 2), 'utf-8');
  }
}
