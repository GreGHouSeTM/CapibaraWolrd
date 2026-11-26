# Relevé de mémoire de l'éditeur Unreal pendant le travail (critère « ne dépasse pas 16 Go ») : toutes les 5 s, une ligne CSV
# heure ; mémoire de travail de l'éditeur (Mo) ; mémoire privée engagée de l'éditeur (Mo) ; mémoire physique libre (Mo) ; engagé total du système (Mo).
# Usage : powershell -File memoire.ps1 <fichier.csv> [duree_max_min]
param([string]$sortie, [int]$dureeMax = 600)
if (-not (Test-Path $sortie)) { "heure;editeur_ws_mo;editeur_prive_mo;ram_libre_mo;engage_systeme_mo" | Set-Content -Encoding utf8 $sortie }
$fin = (Get-Date).AddMinutes($dureeMax)
while ((Get-Date) -lt $fin) {
  $p = Get-Process UnrealEditor -ErrorAction SilentlyContinue | Sort-Object WorkingSet64 -Descending | Select-Object -First 1
  $os = Get-CimInstance Win32_OperatingSystem
  $perf = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
  $ws = if ($p) { [int]($p.WorkingSet64 / 1MB) } else { 0 }
  $pr = if ($p) { [int]($p.PrivateMemorySize64 / 1MB) } else { 0 }
  "{0};{1};{2};{3};{4}" -f (Get-Date -Format 'HH:mm:ss'), $ws, $pr, [int]($os.FreePhysicalMemory / 1KB), [int]($perf.CommittedBytes / 1MB) | Add-Content -Encoding utf8 $sortie
  Start-Sleep 5
}
