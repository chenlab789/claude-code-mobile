#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install an SSH public key for an admin user, with correct path / encoding / ACL.

.DESCRIPTION
  Handles the three things that bite admin users most often:

    1. ADMIN PATH
       If your user is in the Administrators group, sshd ignores
       ~/.ssh/authorized_keys. You MUST write to:
         C:\ProgramData\ssh\administrators_authorized_keys

    2. ENCODING (UTF-8 no BOM)
       PowerShell's default Out-File writes UTF-8 WITH BOM. sshd then
       reads the first key as garbled and rejects it. We use
       [System.IO.File]::WriteAllText with no-BOM UTF8Encoding.

    3. ACL (strict mode)
       sshd refuses key files that anyone but SYSTEM / Administrators
       can read. We turn off inheritance and grant only those two.

.PARAMETER PublicKey
  The full public key line as you copied it from Termius (e.g.
  "ssh-ed25519 AAAA... your-comment").

.EXAMPLE
  .\install-authkey.ps1 -PublicKey "ssh-ed25519 AAAA... iphone"

.LINK
  https://github.com/chenlab789/claude-code-mobile
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$PublicKey
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "→ $msg" -ForegroundColor Green }
function Write-OK($msg)   { Write-Host "✓ $msg" -ForegroundColor Green }

$keyPath = 'C:\ProgramData\ssh\administrators_authorized_keys'

Write-Host ""
Write-Host "Claude Code on iPhone — Install Public Key" -ForegroundColor Cyan
Write-Host "──────────────────────────────────────────"
Write-Host ""

# Validate input
$PublicKey = $PublicKey.Trim()
if ($PublicKey -notmatch '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp\d+)\s+\S+') {
  throw "PublicKey does not look like an SSH public key. Got: '$PublicKey'"
}
Write-OK "Public key format looks valid."

# Ensure the directory exists (it should, since OpenSSH is installed)
$dir = Split-Path -Parent $keyPath
if (-not (Test-Path $dir)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

# Read existing content (if any), append, dedupe
Write-Step "Reading existing keys (if any)..."
$existing = ''
if (Test-Path $keyPath) {
  $existing = [System.IO.File]::ReadAllText($keyPath)
}

$lines = @()
if ($existing) {
  $lines = $existing -split "`r?`n" | Where-Object { $_.Trim() -ne '' }
}

# Compare by the key material (col 2), not by full line — comments may differ
$incomingMaterial = ($PublicKey -split '\s+')[1]
$dup = $lines | Where-Object {
  ($_ -split '\s+').Length -ge 2 -and ($_ -split '\s+')[1] -eq $incomingMaterial
}

if ($dup) {
  Write-OK "Key already present — skipping append."
} else {
  Write-Step "Appending new key..."
  $lines += $PublicKey
}

# Write back as UTF-8 *without* BOM, with LF endings
$content = ($lines -join "`n") + "`n"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($keyPath, $content, $utf8NoBom)
Write-OK "Wrote $keyPath (UTF-8 no BOM)."

# Lock ACL — sshd strict mode
Write-Step "Locking ACL (SYSTEM + Administrators only)..."
icacls $keyPath /inheritance:r | Out-Null
icacls $keyPath /grant 'SYSTEM:(F)' 'BUILTIN\Administrators:(F)' | Out-Null
Write-OK "ACL locked."

Write-Host ""
Write-Host "Final ACL" -ForegroundColor Cyan
Write-Host "─────────"
icacls $keyPath
Write-Host ""
Write-Host "Next: connect from Termius using your Tailscale IP + ED25519 key." -ForegroundColor Cyan
