param(
  [string]$AuthFile,
  [switch]$Redact
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$helper = Join-Path $scriptDir "extract-codex-openai-credentials.ts"
$bun = if ($env:BUN_BIN) { $env:BUN_BIN } else { "bun" }

try {
  Get-Command $bun -ErrorAction Stop | Out-Null
} catch {
  Write-Error "[codex-auth] bun not found in PATH. Install Bun or set BUN_BIN."
  exit 1
}

$args = @($helper, "--format", "powershell")
if ($AuthFile) {
  $args += @("--auth-file", $AuthFile)
}
if ($Redact) {
  $args += "--redact"
}

& $bun @args
exit $LASTEXITCODE
