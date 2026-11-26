# Restaure la fenêtre de l'éditeur Unreal si elle est réduite (réduite, elle ne rend plus rien : captures et HighResShot bloqués).
# SW_SHOWNOACTIVATE : la fenêtre réapparaît sans voler le focus.
Add-Type @"
using System; using System.Runtime.InteropServices;
public class FenUE { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); }
"@
$p = Get-Process UnrealEditor -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { "aucun éditeur"; exit }
if ([FenUE]::IsIconic($p.MainWindowHandle)) { [FenUE]::ShowWindow($p.MainWindowHandle, 4) | Out-Null; "fenêtre restaurée" } else { "fenêtre déjà visible" }
