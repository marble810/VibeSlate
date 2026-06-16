import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

type Format = "text" | "shell" | "powershell" | "json";

interface Options {
  format: Format;
  authFile: string;
  stateFile: string | null;
  redact: boolean;
}

interface Credentials {
  refreshToken: string;
  accountId: string;
}

function usage(): never {
  console.log(`Usage: bun scripts/extract-codex-openai-credentials.ts [options]

Options:
  --format <text|shell|powershell|json>  Output format (default: text)
  --auth-file <path>                     Override auth.json path
  --state-file <path>                    Prefer a runtime openai-token.json file
  --redact                               Mask secrets in output
  -h, --help                             Show this help
`);
  process.exit(0);
}

function fail(message: string): never {
  console.error(`[codex-auth] ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    format: "text",
    authFile: `${homedir()}/.codex/auth.json`,
    stateFile: null,
    redact: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") usage();
    if (arg === "--redact") {
      options.redact = true;
      continue;
    }
    if (arg === "--format") {
      const value = argv[i + 1];
      if (!value) fail("Missing value for --format");
      if (!["text", "shell", "powershell", "json"].includes(value)) {
        fail(`Unsupported format: ${value}`);
      }
      options.format = value as Format;
      i += 1;
      continue;
    }
    if (arg === "--auth-file") {
      const value = argv[i + 1];
      if (!value) fail("Missing value for --auth-file");
      options.authFile = value;
      i += 1;
      continue;
    }
    if (arg === "--state-file") {
      const value = argv[i + 1];
      if (!value) fail("Missing value for --state-file");
      options.stateFile = value;
      i += 1;
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }

  return options;
}

function readCredentials(authFile: string): Credentials {
  if (!existsSync(authFile)) {
    fail(`Auth file not found: ${authFile}
  Log in to Codex on this host first, or pass --auth-file <path>.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(authFile, "utf-8"));
  } catch (error) {
    fail(`Failed to parse ${authFile}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`Unexpected auth file shape: ${authFile}`);
  }

  const tokens = (parsed as Record<string, unknown>).tokens;
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) {
    fail(`Missing tokens object in ${authFile}`);
  }

  const refreshToken = (tokens as Record<string, unknown>).refresh_token;
  const accountId = (tokens as Record<string, unknown>).account_id;

  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    fail(`Missing tokens.refresh_token in ${authFile}`);
  }
  if (typeof accountId !== "string" || accountId.length === 0) {
    fail(`Missing tokens.account_id in ${authFile}`);
  }

  return { refreshToken, accountId };
}

function readStateCredentials(stateFile: string): Partial<Credentials> {
  if (!existsSync(stateFile)) {
    fail(`State file not found: ${stateFile}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(stateFile, "utf-8"));
  } catch (error) {
    fail(`Failed to parse ${stateFile}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`Unexpected state file shape: ${stateFile}`);
  }

  const refreshToken = (parsed as Record<string, unknown>).openai_refresh_token;
  const accountId = (parsed as Record<string, unknown>).openai_account_id;

  return {
    refreshToken: typeof refreshToken === "string" ? refreshToken : "",
    accountId: typeof accountId === "string" ? accountId : "",
  };
}

function mask(value: string): string {
  if (value.length <= 12) return `${value.slice(0, 4)}...`;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function powershellQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function render(options: Options, credentials: Credentials): string {
  const refreshToken = options.redact ? mask(credentials.refreshToken) : credentials.refreshToken;
  const accountId = options.redact ? mask(credentials.accountId) : credentials.accountId;

  switch (options.format) {
    case "shell":
      return [
        `export OPENAI_REFRESH_TOKEN=${shellQuote(refreshToken)}`,
        `export OPENAI_ACCOUNT_ID=${shellQuote(accountId)}`,
      ].join("\n");
    case "powershell":
      return [
        `$env:OPENAI_REFRESH_TOKEN = ${powershellQuote(refreshToken)}`,
        `$env:OPENAI_ACCOUNT_ID = ${powershellQuote(accountId)}`,
      ].join("\n");
    case "json":
      return JSON.stringify(
        {
          auth_file: options.authFile,
          state_file: options.stateFile,
          openai_refresh_token: refreshToken,
          openai_account_id: accountId,
        },
        null,
        2,
      );
    case "text":
    default:
      return [
        `Codex auth file: ${options.authFile}`,
        ...(options.stateFile ? [`Runtime state file: ${options.stateFile}`] : []),
        `OPENAI_REFRESH_TOKEN=${refreshToken}`,
        `OPENAI_ACCOUNT_ID=${accountId}`,
        "",
        "Example:",
        `  OPENAI_REFRESH_TOKEN=${shellQuote(credentials.refreshToken)}`,
        `  OPENAI_ACCOUNT_ID=${shellQuote(credentials.accountId)}`,
      ].join("\n");
  }
}

const options = parseArgs(process.argv.slice(2));
const authCredentials = readCredentials(options.authFile);
const stateCredentials = options.stateFile ? readStateCredentials(options.stateFile) : {};
const credentials: Credentials = {
  refreshToken: stateCredentials.refreshToken || authCredentials.refreshToken,
  accountId: stateCredentials.accountId || authCredentials.accountId,
};
console.log(render(options, credentials));
