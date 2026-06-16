#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: ./docker/GetCodexAuthInfo.sh [--auth-file <path>] [--redact]

Reads ~/.codex/auth.json and prints compose-ready OpenAI credential lines.
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

AUTH_FILE="${HOME}/.codex/auth.json"
REDACT=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --auth-file)
      [ "$#" -ge 2 ] || fail 'missing value for --auth-file'
      AUTH_FILE="$2"
      shift 2
      ;;
    --redact)
      REDACT=1
      shift
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

[ -n "$REFRESH_TOKEN" ] || fail "tokens.refresh_token not found in $AUTH_FILE"
[ -n "$ACCOUNT_ID" ] || fail "tokens.account_id not found in $AUTH_FILE"

if [ "$REDACT" -eq 1 ]; then
  REFRESH_TOKEN=$(mask "$REFRESH_TOKEN")
  ACCOUNT_ID=$(mask "$ACCOUNT_ID")
fi

printf '# Codex auth file: %s\n' "$AUTH_FILE"
printf 'OPENAI_REFRESH_TOKEN=%s\n' "$REFRESH_TOKEN"
printf 'OPENAI_ACCOUNT_ID=%s\n' "$ACCOUNT_ID"
