import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAuthLock } from './codex-auth-lock';

describe('CodexAuthLock', () => {
  test('blocks duplicate lock acquisition', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibeslate-lock-'));
    const lockPath = join(dir, 'lock');
    const first = new CodexAuthLock(lockPath, 60_000);
    const second = new CodexAuthLock(lockPath, 60_000);

    try {
      first.acquire();
      expect(() => second.acquire()).toThrow('already exists');
    } finally {
      first.release();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('recovers stale lock directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibeslate-lock-'));
    const lockPath = join(dir, 'lock');
    const second = new CodexAuthLock(lockPath, 1);

    try {
      const old = new Date(Date.now() - 10_000);
      mkdirSync(lockPath);
      writeFileSync(
        join(lockPath, 'owner.json'),
        JSON.stringify({ pid: 1, hostname: 'old', started_at: old.toISOString(), updated_at: old.toISOString() }),
      );
      second.acquire();
      second.release();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
