import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = mkdtempSync(join(tmpdir(), 'vibeslate-codex-schema-'));

function readAllFiles(dir: string): string {
  let combined = '';
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      combined += readAllFiles(path);
    } else if (entry.endsWith('.ts')) {
      combined += `\n// ${path}\n${readFileSync(path, 'utf-8')}`;
    }
  }
  return combined;
}

try {
  const codexPath = process.env.OPENAI_CODEX_CLI_PATH || join(import.meta.dirname, '..', 'node_modules', '.bin', 'codex');
  const generated = Bun.spawnSync({
    cmd: [codexPath, 'app-server', 'generate-ts', '--experimental', '--out', outDir],
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (generated.exitCode !== 0) {
    console.error(generated.stderr.toString().trim() || generated.stdout.toString().trim());
    process.exit(generated.exitCode);
  }

  const schemaText = readAllFiles(outDir);
  const required = [
    '"method": "account/login/start"',
    '"method": "account/login/cancel"',
    '"method": "account/read"',
    '"method": "account/rateLimits/read"',
    '"method": "account/logout"',
    '"type": "chatgptDeviceCode"',
    'rateLimitsByLimitId',
  ];

  const missing = required.filter((marker) => !schemaText.includes(marker));
  if (missing.length > 0) {
    console.error(`Codex app-server schema missing required markers: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('Codex app-server schema check passed');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
