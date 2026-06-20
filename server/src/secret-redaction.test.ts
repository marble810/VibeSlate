import { describe, expect, test } from 'bun:test';
import { redactEmail, redactSecrets } from './secret-redaction';

describe('secret redaction', () => {
  test('redacts common token fields and authorization headers', () => {
    const input = 'refresh_token=rt.secret access_token abc Authorization: Bearer sk-secret id_token:"jwt.secret"';
    const redacted = redactSecrets(input);

    expect(redacted).not.toContain('rt.secret');
    expect(redacted).not.toContain('sk-secret');
    expect(redacted).not.toContain('jwt.secret');
    expect(redacted).toContain('[REDACTED]');
  });

  test('redacts emails while preserving useful shape', () => {
    expect(redactEmail('person@example.com')).toBe('pe***@e***.com');
    expect(redactEmail(null)).toBeNull();
  });
});
