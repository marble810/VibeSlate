import type { Snapshot } from './types';

let lastRam = 55;
let lastOpenaiTokens = 12_000_000;

/**
 * Generate mock snapshot for CPU, RAM, and OpenAI only.
 * DeepSeek data comes from the real API (see deepseek.ts).
 */
export function generateSnapshot(): Snapshot {
  const now = Date.now() / 1000;
  const hour = new Date().getHours();
  const totalMinutes = hour * 60 + new Date().getMinutes();

  // CPU: sine wave 20-80% + noise ±5%
  const cpuBase = 50 + 30 * Math.sin((2 * Math.PI * totalMinutes) / (24 * 60));
  const cpu = Math.round(Math.max(0, Math.min(100, cpuBase + (Math.random() - 0.5) * 10)));

  // RAM: slowly drift between 50-90%
  lastRam += (Math.random() - 0.5) * 2;
  lastRam = Math.max(50, Math.min(90, lastRam));
  const ram = Math.round(lastRam * 10) / 10;

  // OpenAI tokens: 2-3x base rate, accumulating
  const isWorkHours = hour >= 9 && hour <= 18;
  const baseRate = isWorkHours ? 800 : 200;
  lastOpenaiTokens += Math.floor((baseRate * (2 + Math.random())) * (1 + (Math.random() - 0.5)));
  const openaiTokens = lastOpenaiTokens;
  const openaiCost = Math.round((openaiTokens / 1_000_000) * 5 * 100) / 100;

  return {
    ts: Math.floor(now),
    cpu,
    ram,
    // DeepSeek is zeroed — real data comes via 'deepseek' SSE event
    deepseek: { tokens: 0, cost: 0 },
    openai: { tokens: openaiTokens, cost: openaiCost },
  };
}
