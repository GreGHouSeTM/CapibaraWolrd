# Repris de la preuve (CapyForet-UE) pour CapyWorld-UE.
# Mesure en jeu autonome (processus séparé de l'éditeur, contenu non « cuit ») : lance la carte, attend la fin (le jeu se ferme seul),
# relève la mémoire (pic du processus, mémoire vidéo dédiée par compteur de performance) et range le CSV et la capture.
# Usage : mesure.ps1 <nom> <largeur> <hauteur> <echelle_ecran%> <carte> <arguments supplémentaires...>
param([string]$nom, [int]$l, [int]$h, [int]$sp, [string]$carte = "/Game/Monde/Cartes/Monde", [Parameter(ValueFromRemainingArguments = $true)][string[]]$extra)
$ue = "C:\Users\greg7\Epic Games\UE_5.9\Engine\Binaries\Win64\UnrealEditor.exe"
$proj = "C:\Users\greg7\Documents\CLAUDE\CapyWorld-UE\CapyWorld.uproject"
$out = "C:\Users\greg7\Documents\CLAUDE\CapyWorld-UE\Mesures\$nom"
New-Item -ItemType Directory -Force $out | Out-Null
$csvDir = "C:\Users\greg7\Documents\CLAUDE\CapyWorld-UE\Saved\Profiling\CSV"
$shotDir = "C:\Users\greg7\Documents\CLAUDE\CapyWorld-UE\Saved\Screenshots"
$avantCsv = @(Get-ChildItem $csvDir -Filter *.csv -ErrorAction SilentlyContinue | % FullName)
$avantShot = @(Get-ChildItem $shotDir -Recurse -Filter *.png -ErrorAction SilentlyContinue | % FullName)
$exec = "r.SetRes ${l}x${h}f,r.VSync 0,t.MaxFPS 0,r.ScreenPercentage $sp,r.DynamicRes.OperationMode 0,scalability 3"
$args2 = @("`"$proj`"", $carte, "-game", "-fullscreen", "-ResX=$l", "-ResY=$h", "-WinX=0", "-WinY=0", "-nosound", "-ExecCmds=`"$exec`"") + $extra
$t0 = Get-Date
$p = Start-Process $ue -ArgumentList $args2 -PassThru
$picRam = 0; $picVram = 0; $premiereImage = $null
while (-not $p.HasExited) {
  Start-Sleep 2
  try { $p.Refresh(); $ws = $p.WorkingSet64 / 1MB; if ($ws -gt $picRam) { $picRam = $ws } } catch {}
  try {
    $v = (Get-Counter "\GPU Process Memory(pid_$($p.Id)*)\Dedicated Usage" -ErrorAction Stop).CounterSamples | Measure-Object CookedValue -Sum
    $vm = $v.Sum / 1MB; if ($vm -gt $picVram) { $picVram = $vm }
  } catch {}
  if (((Get-Date) - $t0).TotalSeconds -gt 400) { "délai dépassé : le jeu tourne encore (je ne le tue pas)"; break }
}
$duree = ((Get-Date) - $t0).TotalSeconds
$csv = Get-ChildItem $csvDir -Filter *.csv -ErrorAction SilentlyContinue | ? { $avantCsv -notcontains $_.FullName } | Sort LastWriteTime | Select -Last 1
$shot = Get-ChildItem $shotDir -Recurse -Filter *.png -ErrorAction SilentlyContinue | ? { $avantShot -notcontains $_.FullName } | Sort LastWriteTime | Select -Last 1
if ($csv) { Copy-Item $csv.FullName "$out\profil.csv" }
if ($shot) { Copy-Item $shot.FullName "$out\capture.png" }
$r = [ordered]@{ nom = $nom; resolution = "${l}x${h}"; echelle_ecran = $sp; duree_processus_s = [int]$duree; pic_ram_jeu_mo = [int]$picRam; pic_vram_dediee_mo = [int]$picVram; csv = [bool]$csv; capture = [bool]$shot; extra = ($extra -join ' ') }
$r | ConvertTo-Json | Set-Content -Encoding utf8 "$out\resume.json"
$r | ConvertTo-Json
