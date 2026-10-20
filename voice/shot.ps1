# Screenshot all monitors -> tmp\shot-<time>.png, prints the path (JARVIS sends it to the phone)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'
[Dpi]::SetProcessDPIAware() | Out-Null
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$out = Join-Path $PSScriptRoot ("tmp\shot-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.png')
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
$out
