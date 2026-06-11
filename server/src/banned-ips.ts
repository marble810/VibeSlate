/**
 * Banned IP checker — reads the Fail2Ban ban list and blocks banned IPs.
 *
 * In the Docker Compose Public profile, this file (marble-panel-banned.txt)
 * is shared via a volume between the Fail2Ban container and the app container.
 *
 * This module is only active when the ban list file exists and is readable.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';

const BAN_LIST_PATH = '/var/lib/fail2ban/marble-panel-banned.txt';

let bannedIps: Set<string> = new Set();
let lastMtime = 0;

/** Reload the ban list from disk. Called on each request. */
function maybeReload(): void {
  try {
    if (!existsSync(BAN_LIST_PATH)) return;
    const stat = statSync(BAN_LIST_PATH);
    if (stat.mtimeMs === lastMtime) return;

    const content = readFileSync(BAN_LIST_PATH, 'utf-8');
    bannedIps = new Set(
      content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0),
    );
    lastMtime = stat.mtimeMs;
  } catch {
    // File doesn't exist or can't be read — no bans active.
  }
}

/**
 * Check whether a client IP is currently banned.
 *
 * @returns true if the IP is in the ban list and should be blocked.
 */
export function isBanned(ip: string): boolean {
  // Skip ban check for local/unknown IPs to prevent lock-out.
  if (ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') return false;

  maybeReload();
  return bannedIps.has(ip);
}
