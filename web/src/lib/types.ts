export interface ProviderUsage {
  tokens: number;
  cost: number;
}

export interface Snapshot {
  ts: number;
  cpu: number;
  ram: number;
  deepseek: ProviderUsage;
  openai: ProviderUsage;
}
