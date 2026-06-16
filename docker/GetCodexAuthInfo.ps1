param(
  [string]$AuthFile = (Join-Path $HOME ".codex/auth.json"),
  [switch]$Redact
)

function Fail($Message) {
  Write-Error "[GetCodexAuthInfo] $Message"
  exit 1
}

function Mask($Value) {
  if ($Value.Length -le 12) {
    return "$($Value.Substring(0, [Math]::Min(4, $Value.Length)))..."
  }

  $prefix = $Value.Substring(0, 8)
  $suffix = $Value.Substring($Value.Length - 4, 4)
  return "$prefix...$suffix"
}

if (-not (Test-Path -LiteralPath $AuthFile)) {
  Fail "auth file not found: $AuthFile"
}

try {
  $parsed = Get-Content -LiteralPath $AuthFile -Raw | ConvertFrom-Json
} catch {
  Fail "failed to parse auth file: $($_.Exception.Message)"
}

$tokens = $parsed.tokens
if ($null -eq $tokens) {
  Fail "tokens object not found in $AuthFile"
}

$refreshToken = [string]$tokens.refresh_token
$accountId = [string]$tokens.account_id

if ([string]::IsNullOrWhiteSpace($refreshToken)) {
  Fail "tokens.refresh_token not found in $AuthFile"
}
if ([string]::IsNullOrWhiteSpace($accountId)) {
  Fail "tokens.account_id not found in $AuthFile"
}

if ($Redact) {
  $refreshToken = Mask $refreshToken
  $accountId = Mask $accountId
}

Write-Output "# Codex auth file: $AuthFile"
Write-Output "OPENAI_REFRESH_TOKEN=$refreshToken"
Write-Output "OPENAI_ACCOUNT_ID=$accountId"
