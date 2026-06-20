import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SECRET_PATTERNS: RegExp[] = [
  /access_token["'\s:=]+[^"',\s}]+/gi,
  /refresh_token["'\s:=]+[^"',\s}]+/gi,
  /id_token["'\s:=]+[^"',\s}]+/gi,
  /authorization:\s*bearer\s+[^"',\s}]+/gi,
  /rt\.[A-Za-z0-9._-]+/g,
];

export function redactSecrets(value: unknown): string {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';

  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, '[REDACTED]');
  }
  return text;
}

export function redactEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0) return '[redacted]';

  const name = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visibleName = name.length <= 2 ? `${name[0] ?? ''}*` : `${name.slice(0, 2)}***`;
  const domainParts = domain.split('.');
  const first = domainParts[0] ?? '';
  const visibleDomain = first.length <= 1 ? '*' : `${first[0]}***`;
  const suffix = domainParts.length > 1 ? `.${domainParts.slice(1).join('.')}` : '';
  return `${visibleName}@${visibleDomain}${suffix}`;
}

export function sha256File(path: string): string | null {
  try {
    const data = readFileSync(path);
    return createHash('sha256').update(data).digest('hex');
  } catch {
    return null;
  }
}

export function fileModeOctal(path: string): string | null {
  try {
    return (statSync(path).mode & 0o777).toString(8).padStart(4, '0');
  } catch {
    return null;
  }
}
