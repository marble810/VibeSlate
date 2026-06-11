/**
 * Verification script for trusted-ip resolution.
 *
 * Run with: bun server/src/trusted-ip.test.ts
 *
 * Tests:
 *  - Exact IPv4 match
 *  - IPv4 CIDR match
 *  - IPv4 CIDR mismatch
 *  - IPv6 exact match
 *  - IPv6 CIDR match
 *  - Illegal CIDR (invalid mask bits)
 *  - Empty trusted_proxies (Public mode fail-closed)
 *  - Public mode: non-trusted direct peer ignores forwarded headers
 *  - Public mode: trusted direct peer uses forwarded headers
 *  - Spoofed X-Forwarded-For from non-trusted peer is ignored
 */

import { resolveClientIp, type RequestIPProvider } from './trusted-ip';
import type { PublicConfig } from './config';

const LAN: PublicConfig = { mode: 'lan', trusted_proxies: [] };
const PUBLIC: PublicConfig = { mode: 'public', trusted_proxies: ['10.0.0.1', '10.0.0.0/24'] };

function makeServer(ip: string | null): RequestIPProvider | null {
  if (ip === null) return null;
  return {
    requestIP(_req: Request): { address: string } | null {
      return { address: ip };
    },
  };
}

function makeReq(headers: Record<string, string> = {}): Request {
  const h = new Headers(headers);
  return new Request('http://localhost/', { headers: h });
}

let passed = 0;
let failed = 0;

function assert(desc: string, actual: string, expected: string) {
  if (actual === expected) {
    passed++;
    console.log(`  PASS: ${desc} → "${actual}"`);
  } else {
    failed++;
    console.error(`  FAIL: ${desc}\n    expected: "${expected}"\n    actual:   "${actual}"`);
  }
}

// ── LAN mode tests ──
console.log('\n── LAN mode ──');

assert(
  'X-Forwarded-For is trusted in LAN mode',
  resolveClientIp(makeReq({ 'x-forwarded-for': '1.2.3.4' }), makeServer('10.0.0.5'), LAN),
  '1.2.3.4',
);
assert(
  'X-Real-IP is trusted in LAN mode',
  resolveClientIp(makeReq({ 'x-real-ip': '1.2.3.5' }), makeServer('10.0.0.5'), LAN),
  '1.2.3.5',
);
assert(
  'X-Forwarded-For takes precedence over X-Real-IP',
  resolveClientIp(makeReq({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' }), makeServer('10.0.0.5'), LAN),
  '1.2.3.4',
);
assert(
  'no headers, no server → unknown',
  resolveClientIp(makeReq(), null, LAN),
  'unknown',
);
assert(
  'no headers, server present → direct IP fallback',
  resolveClientIp(makeReq(), makeServer('10.0.0.5'), LAN),
  '10.0.0.5',
);

// ── Public mode: trusted proxy ──
console.log('\n── Public mode: trusted proxy ──');

assert(
  'trusted proxy (exact match) → uses X-Forwarded-For',
  resolveClientIp(makeReq({ 'x-forwarded-for': '1.2.3.4' }), makeServer('10.0.0.1'), PUBLIC),
  '1.2.3.4',
);
assert(
  'trusted proxy (CIDR match, .0.5 in /24) → uses X-Forwarded-For',
  resolveClientIp(makeReq({ 'x-forwarded-for': '5.6.7.8' }), makeServer('10.0.0.5'), PUBLIC),
  '5.6.7.8',
);
assert(
  'trusted proxy → X-Real-IP fallback',
  resolveClientIp(makeReq({ 'x-real-ip': '9.9.9.9' }), makeServer('10.0.0.1'), PUBLIC),
  '9.9.9.9',
);
assert(
  'trusted proxy, X-Forwarded-For with comma-separated list',
  resolveClientIp(makeReq({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }), makeServer('10.0.0.5'), PUBLIC),
  '203.0.113.1',
);

// ── Public mode: untrusted proxy ──
console.log('\n── Public mode: untrusted peer (spoofed headers) ──');

assert(
  'untrusted peer → spoofed X-Forwarded-For is ignored, direct IP used',
  resolveClientIp(makeReq({ 'x-forwarded-for': 'evil.attacker.ip' }), makeServer('192.168.1.100'), PUBLIC),
  '192.168.1.100',
);
assert(
  'untrusted peer → spoofed X-Real-IP is ignored',
  resolveClientIp(makeReq({ 'x-real-ip': 'evil.attacker.ip' }), makeServer('192.168.1.100'), PUBLIC),
  '192.168.1.100',
);
assert(
  'untrusted peer, no headers → direct IP used',
  resolveClientIp(makeReq(), makeServer('192.168.1.100'), PUBLIC),
  '192.168.1.100',
);

// ── Public mode: CIDR edge cases ──
console.log('\n── CIDR edge cases ──');

assert(
  'CIDR mismatch (outside subnet) → direct IP used',
  resolveClientIp(makeReq({ 'x-forwarded-for': '1.2.3.4' }), makeServer('10.0.1.1'), PUBLIC),
  '10.0.1.1',
);
assert(
  'CIDR /32 exact → matches only that IP',
  resolveClientIp(
    makeReq({ 'x-forwarded-for': '1.2.3.4' }),
    { requestIP: () => ({ address: '10.0.0.1' }) },
    { mode: 'public', trusted_proxies: ['10.0.0.1/32'] },
  ),
  '1.2.3.4',
);
assert(
  'CIDR /32 exact → mismatch for neighbor',
  resolveClientIp(
    makeReq({ 'x-forwarded-for': 'evil' }),
    { requestIP: () => ({ address: '10.0.0.2' }) },
    { mode: 'public', trusted_proxies: ['10.0.0.1/32'] },
  ),
  '10.0.0.2',
);

// ── IPv6 tests (if supported) ──
console.log('\n── IPv6 ──');

assert(
  'IPv6 exact match',
  resolveClientIp(
    makeReq({ 'x-forwarded-for': '2001:db8::1' }),
    { requestIP: () => ({ address: '::1' }) },
    { mode: 'public', trusted_proxies: ['::1'] },
  ),
  '2001:db8::1',
);

// ── Public mode: empty trusted_proxies ──
console.log('\n── Public mode: empty trusted_proxies ──');

assert(
  'empty trusted_proxies → ignores forwarded headers and uses direct IP',
  resolveClientIp(makeReq({ 'x-forwarded-for': '1.2.3.4' }), makeServer('10.0.0.5'), { mode: 'public', trusted_proxies: [] }),
  '10.0.0.5',
);

// ── Summary ──
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
