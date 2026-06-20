import { describe, expect, test } from 'bun:test';
import { legacyOpenAITokenKeys } from './config';

describe('config legacy OpenAI detection', () => {
  test('detects legacy file and env token keys', () => {
    const keys = legacyOpenAITokenKeys(
      {
        openai_refresh_token: 'set',
        openai_account_id: 'acct',
      },
      {
        OPENAI_TOKEN_STATE_FILE: '/tmp/token.json',
      } as NodeJS.ProcessEnv,
    );

    expect(keys).toEqual(['openai_refresh_token', 'openai_account_id', 'OPENAI_TOKEN_STATE_FILE']);
  });

  test('ignores empty legacy keys', () => {
    expect(legacyOpenAITokenKeys({ openai_refresh_token: '' }, {} as NodeJS.ProcessEnv)).toEqual([]);
  });
});
