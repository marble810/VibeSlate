// ── Provider data types ──

export interface ModelTokenBreakdown {
  cached: number;
  nonCached: number;
  output: number;
}

export interface TimeSpanUsage {
  cost: number;
  models: Record<string, ModelTokenBreakdown>;
}

export interface DeepSeekData {
  balance: number;
  oneDay: TimeSpanUsage;
  thirtyDays: TimeSpanUsage;
  ts: number;
}

export interface OpenAIData {
  planType: string;
  primaryUsedPercent: number;
  primaryResetsAt: number;
  secondaryUsedPercent: number;
  secondaryResetsAt: number;
  hasCredits: boolean;
  creditBalance: string;
  limitReached: boolean;
  ts: number;
}

export interface OpenCodeGoData {
  rollingPercent: number;
  rollingResetsAt: number;
  weeklyPercent: number;
  weeklyResetsAt: number;
  monthlyPercent: number;
  monthlyResetsAt: number;
  ts: number;
}
