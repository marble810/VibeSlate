param(
  [string]$AuthFile = (Join-Path $HOME ".codex/auth.json"),
  [string]$StateFile = "",
  [switch]$Redact,
  [ValidateSet("yaml", "env")]
  [string]$Format = "yaml"
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

function Escape-YamlDoubleQuoted($Value) {
  return $Value.Replace('\', '\\').Replace('"', '\"')
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

if (-not [string]::IsNullOrWhiteSpace($StateFile)) {
  if (-not (Test-Path -LiteralPath $StateFile)) {
    Fail "state file not found: $StateFile"
  }

  try {
    $stateParsed = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
  } catch {
    Fail "failed to parse state file: $($_.Exception.Message)"
  }

  $stateRefreshToken = [string]$stateParsed.openai_refresh_token
  $stateAccountId = [string]$stateParsed.openai_account_id

  if (-not [string]::IsNullOrWhiteSpace($stateRefreshToken)) {
    $refreshToken = $stateRefreshToken
  }
  if (-not [string]::IsNullOrWhiteSpace($stateAccountId)) {
    $accountId = $stateAccountId
  }
}

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
if (-not [string]::IsNullOrWhiteSpace($StateFile)) {
  Write-Output "# Runtime state file: $StateFile"
}
if ($Format -eq "env") {
  Write-Output "OPENAI_REFRESH_TOKEN=$refreshToken"
  Write-Output "OPENAI_ACCOUNT_ID=$accountId"
} else {
  Write-Output "# Paste under x-vibeslate-env in docker/docker-compose.yml"
  Write-Output "  OPENAI_REFRESH_TOKEN: ""$(Escape-YamlDoubleQuoted $refreshToken)"""
  Write-Output "  OPENAI_ACCOUNT_ID: ""$(Escape-YamlDoubleQuoted $accountId)"""
}
