/**
 * Trusted client IP resolution for public deployment.
 *
 * In public mode:
 * - Only trust X-Forwarded-For / X-Real-IP from configured trusted proxies.
 * - When the direct connection IP is not in the trusted proxy list,
 *   proxy headers are ignored and the direct connection IP is used.
 *
 * In LAN mode:
 * - Pass through the first X-Forwarded-For or X-Real-IP value,
 *   or fall back to the direct connection IP.
 *
 * In public mode with no trusted proxies:
 * - Fail closed by ignoring proxy headers and using only the direct IP.
 */

import type { PublicConfig } from './config';

/** Minimal interface for Bun server providing client IP resolution. */
export interface RequestIPProvider {
  requestIP(req: Request): { address: string } | null;
}

export function resolveClientIp(
  req: Request,
  server: RequestIPProvider | null,
  publicConfig: PublicConfig,
): string {
  const directIp = server ? getDirectIp(req, server) : null;

  if (publicConfig.mode !== 'public') {
    // LAN mode: trust proxy headers in simpler local topologies, but keep a
    // direct-IP fallback for local direct connections.
    return getProxyIp(req) || directIp || 'unknown';
  }

  if (publicConfig.trusted_proxies.length === 0) {
    // Public mode must never trust forwarded headers without an explicit
    // trusted proxy boundary.
    return directIp || 'unknown';
  }

  // Public mode: only trust proxy headers if the direct connection
  // originates from a trusted proxy.
  if (directIp && isTrustedProxy(directIp, publicConfig.trusted_proxies)) {
    return getProxyIp(req) || directIp;
  }

  // Not from a trusted proxy — ignore potentially spoofed headers.
  return directIp || 'unknown';
}

function getDirectIp(req: Request, server: RequestIPProvider): string | null {
  try {
    const addr = server.requestIP(req);
    if (!addr) return null;
    return addr.address;
  } catch {
    return null;
  }
}

function getProxyIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return null;
}

function isTrustedProxy(ip: string, trustedCidrs: string[]): boolean {
  for (const cidr of trustedCidrs) {
    if (ipInCidr(ip, cidr)) return true;
  }
  return false;
}

function ipInCidr(ip: string, cidr: string): boolean {
  // Exact match
  if (cidr === ip) return true;

  // CIDR notation
  const slashIdx = cidr.indexOf('/');
  if (slashIdx === -1) return false;

  const network = cidr.slice(0, slashIdx);
  const bits = parseInt(cidr.slice(slashIdx + 1), 10);
  if (isNaN(bits) || bits < 0 || bits > 128) return false;

  // v4
  if (ip.includes('.') && network.includes('.')) {
    return ip4InCidr(ip, network, bits);
  }

  // v6
  if (ip.includes(':') && network.includes(':')) {
    return ip6InCidr(ip, network, bits);
  }

  return false;
}

function ip4InCidr(ip: string, network: string, bits: number): boolean {
  const ipNum = ip4ToNum(ip);
  const netNum = ip4ToNum(network);
  if (ipNum === null || netNum === null) return false;

  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (netNum & mask);
}

function ip4ToNum(ip: string): number | null {
  const octets = ip.split('.');
  if (octets.length !== 4) return null;

  let num = 0;
  for (const octet of octets) {
    const n = parseInt(octet, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  return num >>> 0;
}

function ip6InCidr(ip: string, _network: string, _bits: number): boolean {
  // IPv6 CIDR support is best-effort for common cases like ::1/128, fe80::/10.
  // Full 128-bit arithmetic would require BigInt. For Docker/proxy use cases,
  // IPv4 is the primary scenario.
  if (ip === _network) return true;
  if (_bits === 128) return ip === _network;

  try {
    const ipBig = ip6ToBigInt(ip);
    const netBig = ip6ToBigInt(_network);
    if (ipBig === null || netBig === null) return false;

    const mask = _bits === 0 ? 0n : ((1n << BigInt(_bits)) - 1n) << BigInt(128 - _bits);
    return (ipBig & mask) === (netBig & mask);
  } catch {
    return false;
  }
}

function ip6ToBigInt(ip: string): bigint | null {
  // Normalize :: shorthand
  const parts = ip.split('::');
  if (parts.length > 2) return null;

  let left = parts[0] ? parts[0].split(':') : [];
  let right = parts[1] ? parts[1].split(':') : [];

  // Filter empty strings from split
  left = left.filter(Boolean);
  right = right.filter(Boolean);

  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;

  const full = [...left, ...Array(missing).fill('0'), ...right];
  if (full.length !== 8) return null;

  let num = 0n;
  for (const hextet of full) {
    const n = parseInt(hextet, 16);
    if (isNaN(n) || n < 0 || n > 0xFFFF) return null;
    num = (num << 16n) | BigInt(n);
  }
  return num;
}
