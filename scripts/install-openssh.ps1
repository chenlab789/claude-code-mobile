#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install + configure OpenSSH Server on Windows for Claude Code remote access.
.DESCRIPTION
  - Installs the Windows OpenSSH Server capability
  - Starts the sshd service and sets it to auto-start
  - Ensures a firewall rule for inbound TCP 22

  Idempotent — safe to re-run.

.LINK
  https://github.com/lec79731-debug/claude-code-mobile
#>

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "→ $msg" -ForegroundColor Green }
function Write-OK($msg)   { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "! $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "Claude Code on iPhone — OpenSSH setup" -ForegroundColor Cyan
Write-Host "──────────────────────────────────────"
Write-Host ""

# 1. Install OpenSSH Server capability
Write-Step "Checking OpenSSH Server capability..."
$cap = Get-WindowsCapability -Online -Name 'OpenSSH.Server*'
if ($cap.State -ne 'Installed') {
  Write-Step "Installing OpenSSH Server (this may take 1-2 minutes)..."
  Add-WindowsCapability -Online -Name $cap.Name | Out-Null
  Write-OK "OpenSSH Server installed."
} else {
  Write-OK "OpenSSH Server already installed."
}

# 2. sshd service
Write-Step "Configuring sshd service..."
$svc = Get-Service -Name sshd -ErrorAction SilentlyContinue
if (-not $svc) {
  throw "sshd service not found after install. Reboot and re-run."
}
if ($svc.Status -ne 'Running') {
  Start-Service sshd
}
Set-Service -Name sshd -StartupType Automatic
Write-OK "sshd is running and set to auto-start."

# 3. Firewall rule
Write-Step "Checking firewall rule for port 22..."
$rule = Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue
if (-not $rule) {
  Write-Warn2 "Rule missing — creating..."
  New-NetFirewallRule `
    -Name 'OpenSSH-Server-In-TCP' `
    -DisplayName 'OpenSSH Server (sshd)' `
    -Enabled True -Direction Inbound -Protocol TCP `
    -Action Allow -LocalPort 22 | Out-Null
} elseif (-not $rule.Enabled) {
  Enable-NetFirewallRule -Name 'OpenSSH-Server-In-TCP'
}
Write-OK "Firewall rule active for TCP 22 (inbound)."

# 4. Summary
Write-Host ""
Write-Host "Status" -ForegroundColor Cyan
Write-Host "──────"
Get-Service sshd | Format-Table -AutoSize
Write-Host ""
Write-Host "Next: run install-authkey.ps1 with your Termius public key." -ForegroundColor Cyan
