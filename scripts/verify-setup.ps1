<#
.SYNOPSIS
  Print status of every layer in the Claude-Code-on-iPhone stack.

.DESCRIPTION
  Read-only. Safe to run any time. Use when something stops working.

  Reports:
    - sshd service status
    - Port 22 listening sockets
    - Tailscale connectivity + IP
    - administrators_authorized_keys ACL
    - Recent OpenSSH auth events (last 10)

.LINK
  https://github.com/lec79731-debug/claude-code-mobile
#>

function Section($title) {
  Write-Host ""
  Write-Host "── $title " -NoNewline -ForegroundColor Cyan
  Write-Host ("─" * [Math]::Max(2, 70 - $title.Length)) -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Claude Code on iPhone — Verify Setup" -ForegroundColor Cyan
Write-Host "════════════════════════════════════"

Section "sshd service"
$svc = Get-Service -Name sshd -ErrorAction SilentlyContinue
if ($svc) {
  $svc | Format-Table Status, Name, StartType, DisplayName -AutoSize
} else {
  Write-Host "  sshd service NOT FOUND. Run install-openssh.ps1 first." -ForegroundColor Red
}

Section "Port 22 listening"
$listen = Get-NetTCPConnection -LocalPort 22 -State Listen -ErrorAction SilentlyContinue
if ($listen) {
  $listen | Select-Object LocalAddress, LocalPort, State | Format-Table -AutoSize
} else {
  Write-Host "  Nothing listening on port 22." -ForegroundColor Red
}

Section "Firewall rule"
$rule = Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue
if ($rule) {
  $rule | Select-Object Name, Enabled, Direction, Action | Format-Table -AutoSize
} else {
  Write-Host "  Firewall rule MISSING." -ForegroundColor Red
}

Section "Tailscale"
$tsCmd = Get-Command tailscale -ErrorAction SilentlyContinue
if ($tsCmd) {
  & tailscale status
  Write-Host ""
  Write-Host "  This PC's tailnet IP:" -ForegroundColor Yellow
  & tailscale ip -4
} else {
  Write-Host "  tailscale CLI not in PATH. Is Tailscale installed?" -ForegroundColor Red
}

Section "authorized_keys ACL"
$keyPath = 'C:\ProgramData\ssh\administrators_authorized_keys'
if (Test-Path $keyPath) {
  icacls $keyPath
  Write-Host ""
  $keyCount = (Get-Content $keyPath | Where-Object { $_.Trim() -ne '' }).Count
  Write-Host "  Keys installed: $keyCount" -ForegroundColor Yellow
} else {
  Write-Host "  $keyPath does not exist. Run install-authkey.ps1." -ForegroundColor Red
}

Section "Recent OpenSSH auth events"
$events = Get-WinEvent -LogName 'OpenSSH/Operational' -MaxEvents 10 -ErrorAction SilentlyContinue
if ($events) {
  $events |
    Select-Object @{n='Time';e={$_.TimeCreated.ToString('HH:mm:ss')}}, Id, LevelDisplayName, Message |
    Format-Table -Wrap -AutoSize
} else {
  Write-Host "  No auth events yet (or log access denied)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
