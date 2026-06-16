#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: ./docker/GetCodexAuthInfo.sh [--auth-file <path>] [--state-file <path>] [--redact] [--format yaml|env]

Reads ~/.codex/auth.json and prints paste-ready OpenAI credentials.
Default output format is env for docker/.env.
EOF
}

fail() {
  printf '[GetCodexAuthInfo] %s\n' "$1" >&2
  exit 1
}

mask() {
  value="$1"
  length=${#value}
  if [ "$length" -le 12 ]; then
    printf '%s...\n' "$(printf '%s' "$value" | cut -c1-4)"
    return
  fi

  prefix=$(printf '%s' "$value" | cut -c1-8)
  suffix=$(printf '%s' "$value" | rev | cut -c1-4 | rev)
  printf '%s...%s\n' "$prefix" "$suffix"
}

extract_json_value() {
  key="$1"
  printf '%s' "$JSON_ONE_LINE" | sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p"
}

escape_yaml_double_quotes() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

AUTH_FILE="${HOME}/.codex/auth.json"
STATE_FILE=""
REDACT=0
FORMAT="env"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --auth-file)
      [ "$#" -ge 2 ] || fail 'missing value for --auth-file'
      AUTH_FILE="$2"
      shift 2
      ;;
    --state-file)
      [ "$#" -ge 2 ] || fail 'missing value for --state-file'
      STATE_FILE="$2"
      shift 2
      ;;
    --redact)
      REDACT=1
      shift
      ;;
    --format)
      [ "$#" -ge 2 ] || fail 'missing value for --format'
      FORMAT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[ -f "$AUTH_FILE" ] || fail "auth file not found: $AUTH_FILE"

JSON_ONE_LINE=$(tr -d '\n' < "$AUTH_FILE")
REFRESH_TOKEN=$(extract_json_value refresh_token)
ACCOUNT_ID=$(extract_json_value account_id)

if [ -n "$STATE_FILE" ]; then
  [ -f "$STATE_FILE" ] || fail "state file not found: $STATE_FILE"
  STATE_JSON_ONE_LINE=$(tr -d '\n' < "$STATE_FILE")
  STATE_REFRESH_TOKEN=$(printf '%s' "$STATE_JSON_ONE_LINE" | sed -n 's/.*"openai_refresh_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  STATE_ACCOUNT_ID=$(printf '%s' "$STATE_JSON_ONE_LINE" | sed -n 's/.*"openai_account_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

  if [ -n "$STATE_REFRESH_TOKEN" ]; then
    REFRESH_TOKEN="$STATE_REFRESH_TOKEN"
  fi
  if [ -n "$STATE_ACCOUNT_ID" ]; then
    ACCOUNT_ID="$STATE_ACCOUNT_ID"
  fi
fi

[ -n "$REFRESH_TOKEN" ] || fail "tokens.refresh_token not found in $AUTH_FILE"
[ -n "$ACCOUNT_ID" ] || fail "tokens.account_id not found in $AUTH_FILE"

case "$FORMAT" in
  yaml|env)
    ;;
  *)
    fail "unknown format: $FORMAT"
    ;;
esac

if [ "$REDACT" -eq 1 ]; then
  REFRESH_TOKEN=$(mask "$REFRESH_TOKEN")
  ACCOUNT_ID=$(mask "$ACCOUNT_ID")
fi

printf '# Codex auth file: %s\n' "$AUTH_FILE"
if [ -n "$STATE_FILE" ]; then
  printf '# Runtime state file: %s\n' "$STATE_FILE"
fi
if [ "$FORMAT" = "env" ]; then
  printf '# Paste into docker/.env\n'
  printf 'OPENAI_REFRESH_TOKEN=%s\n' "$REFRESH_TOKEN"
  printf 'OPENAI_ACCOUNT_ID=%s\n' "$ACCOUNT_ID"
else
  printf '# Paste into the environment section of docker/docker-compose.yml\n'
  printf '  OPENAI_REFRESH_TOKEN: "%s"\n' "$(escape_yaml_double_quotes "$REFRESH_TOKEN")"
  printf '  OPENAI_ACCOUNT_ID: "%s"\n' "$(escape_yaml_double_quotes "$ACCOUNT_ID")"
fi
