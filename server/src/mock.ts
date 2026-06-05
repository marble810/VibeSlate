/**
 * Generate a minimal keepalive snapshot for SSE heartbeat.
 * No hardware data — only provider mock (replaced by real API data).
 */

export function generateHeartbeat(): { ts: number } {
  return { ts: Math.floor(Date.now() / 1000) };
}
