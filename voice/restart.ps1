# Restart the voice server once the current job has finished (safe to call from inside a voice session)
$envFile = Get-Content "$PSScriptRoot\.env"
$pin  = (($envFile | ? { $_ -like 'PIN=*' })  -replace '^PIN=', '').Trim()
$port = (($envFile | ? { $_ -like 'PORT=*' }) -replace '^PORT=', '').Trim()
if (-not $port) { $port = 8780 }
Start-Sleep 5
for ($i = 0; $i -lt 120; $i++) {
  try { $j = Invoke-RestMethod "http://127.0.0.1:$port/api/ping" -Headers @{ 'x-pin' = $pin }; if (-not $j.busy) { break } } catch { break }
  Start-Sleep 3
}
Start-Sleep 25   # let the reply that asked for the restart finish streaming to the phone
$p = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($p) { Stop-Process -Id $p -Force }
Start-Sleep 2
wscript.exe "$PSScriptRoot\start.vbs"
