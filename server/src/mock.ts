import type { Snapshot } from "./types";

let lastRam = 55;
let lastDeepseekTokens = 5_000_000;
let lastOpenaiTokens = 12_000_000;

export function generateSnapshot(): Snapshot {
  const now = Date.now() / 1000;
  const hour = new Date().getHours();
  const minute = new Date().getMinutes();
  const totalMinutes = hour * 60 + minute;

  // CPU: sine wave 20-80% + noise ±5%
  const cpuBase = 50 + 30 * Math.sin((2 * Math.PI * totalMinutes) / (24 * 60));
  const cpu = Math.round(Math.max(0, Math.min(100, cpuBase + (Math.random() - 0.5) * 10)));

  // RAM: slowly drift between 50-90%, random walk
  lastRam += (Math.random() - 0.5) * 2;
  lastRam = Math.max(50, Math.min(90, lastRam));
  const ram = Math.round(lastRam * 10) / 10;

  // DeepSeek tokens: accumulate ~2-3M per hour during work hours (9-18), less otherwise
  const isWorkHours = hour >= 9 && hour <= 18;
  const rate = isWorkHours ? 800 : 200; // tokens per second
  lastDeepseekTokens += Math.floor(rate + (Math.random() - 0.5) * rate * 0.5);
  const deepseekTokens = lastDeepseekTokens;
  const deepseekCost = Math.round((deepseekTokens / 1_000_000) * 2.5 * 100) / 100; // $2.5/M tokens

  // OpenAI tokens: 2-3x DeepSeek
  const openaiRate = rate * (2 + Math.random());
  lastOpenaiTokens += Math.floor(openaiRate + (Math.random() - 0.5) * openaiRate * 0.5);
  const openaiTokens = lastOpenaiTokens;
  const openaiCost = Math.round((openaiTokens / 1_000_000) * 5 * 100) / 100; // $5/M tokens

  return {
    ts: Math.floor(now),
    cpu,
    ram,
    deepseek: { tokens: deepseekTokens, cost: deepseekCost },
    openai: { tokens: openaiTokens, cost: openaiCost },
  };
}
