import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
import type { OpenAIData } from './types';

export class OpenAIUsageStore {
  private readonly db: Database;

  constructor(sqlitePath: string) {
    mkdirSync(dirname(sqlitePath), { recursive: true });
    this.db = new Database(sqlitePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS openai_usage_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        plan_type TEXT NOT NULL,
        primary_used_percent REAL NOT NULL,
        primary_resets_at INTEGER NOT NULL,
        secondary_used_percent REAL NOT NULL,
        secondary_resets_at INTEGER NOT NULL,
        has_credits INTEGER NOT NULL,
        credit_balance TEXT NOT NULL,
        limit_reached INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_openai_usage_snapshots_ts
        ON openai_usage_snapshots(ts DESC);
    `);
  }

  saveSnapshot(data: OpenAIData): void {
    this.db
      .query(`
        INSERT INTO openai_usage_snapshots (
          ts,
          plan_type,
          primary_used_percent,
          primary_resets_at,
          secondary_used_percent,
          secondary_resets_at,
          has_credits,
          credit_balance,
          limit_reached
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        data.ts,
        data.planType,
        data.primaryUsedPercent,
        data.primaryResetsAt,
        data.secondaryUsedPercent,
        data.secondaryResetsAt,
        data.hasCredits ? 1 : 0,
        data.creditBalance,
        data.limitReached ? 1 : 0,
      );
  }

  latest(): OpenAIData | null {
    const row = this.db
      .query(`
        SELECT * FROM openai_usage_snapshots
        ORDER BY ts DESC, id DESC
        LIMIT 1
      `)
      .get() as SnapshotRow | null;
    return row ? rowToData(row) : null;
  }

  history(limit: number): OpenAIData[] {
    const boundedLimit = Math.max(1, Math.min(limit, 500));
    const rows = this.db
      .query(`
        SELECT * FROM openai_usage_snapshots
        ORDER BY ts DESC, id DESC
        LIMIT ?
      `)
      .all(boundedLimit) as SnapshotRow[];
    return rows.map(rowToData);
  }

  close(): void {
    this.db.close();
  }
}

interface SnapshotRow {
  ts: number;
  plan_type: string;
  primary_used_percent: number;
  primary_resets_at: number;
  secondary_used_percent: number;
  secondary_resets_at: number;
  has_credits: number;
  credit_balance: string;
  limit_reached: number;
}

function rowToData(row: SnapshotRow): OpenAIData {
  return {
    planType: row.plan_type,
    primaryUsedPercent: row.primary_used_percent,
    primaryResetsAt: row.primary_resets_at,
    secondaryUsedPercent: row.secondary_used_percent,
    secondaryResetsAt: row.secondary_resets_at,
    hasCredits: row.has_credits === 1,
    creditBalance: row.credit_balance,
    limitReached: row.limit_reached === 1,
    ts: row.ts,
  };
}
