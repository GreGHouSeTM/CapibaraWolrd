# Alpha U1 : crée le projet Unreal 5.9 neuf CapyWorld-UE (hors du dépôt), à partir des seules sources du dépôt.
# Reprend la configuration de la preuve (CapyForet-UE) : plugins MCP + Python + PCG, Lumen RT matériel, Nanite, ombres virtuelles, TSR, DX12.
# Usage : powershell -ExecutionPolicy Bypass -File unreal\creer_projet.ps1 [-Racine C:\...\CapyWorld-UE]
param([string]$Racine = "C:\Users\greg7\Documents\CLAUDE\CapyWorld-UE")
$ErrorActionPreference = 'Stop'
$depot = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force "$Racine\Config", "$Racine\Content\Python", "$Racine\Saved\Config\WindowsEditor", "$Racine\Sources" | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Ecrire($chemin, $texte) { [IO.File]::WriteAllText($chemin, $texte.Replace("`r`n", "`n").Replace("`n", "`r`n"), $utf8) }

Ecrire "$Racine\CapyWorld.uproject" @'
{
	"FileVersion": 3,
	"EngineAssociation": "5.9",
	"Category": "",
	"Description": "Capy World, Alpha U1 « Le monde » : l'île entière de 8 km",
	"Plugins": [
		{ "Name": "ModelContextProtocol", "Enabled": true },
		{ "Name": "AllToolsets", "Enabled": true },
		{ "Name": "PCG", "Enabled": true },
		{ "Name": "PythonScriptPlugin", "Enabled": true },
		{ "Name": "EditorScriptingUtilities", "Enabled": true }
	]
}
'@

Ecrire "$Racine\Config\DefaultEngine.ini" @'
[/Script/EngineSettings.GameMapsSettings]
GameDefaultMap=/Game/Monde/Cartes/Monde.Monde
EditorStartupMap=/Game/Monde/Cartes/Monde.Monde

[/Script/Engine.RendererSettings]
r.DefaultFeature.AutoExposure.ExtendDefaultLuminanceRange=True
r.DynamicGlobalIlluminationMethod=1
r.ReflectionMethod=1
r.Shadow.Virtual.Enable=1
r.GenerateMeshDistanceFields=True
r.Lumen.HardwareRayTracing=True
r.RayTracing=True
r.PathTracing=False
r.SkinCache.CompileShaders=True
r.Nanite.ProjectEnabled=True
r.AntiAliasingMethod=4
r.ForwardShading=False

[/Script/WindowsTargetPlatform.WindowsTargetSettings]
DefaultGraphicsRHI=DefaultGraphicsRHI_DX12
-D3D12TargetedShaderFormats=PCD3D_SM5
+D3D12TargetedShaderFormats=PCD3D_SM6
bGenerateNaniteFallbackMeshes=True
RayTracingMode=Full

'@

Ecrire "$Racine\Config\DefaultGame.ini" @'
[/Script/EngineSettings.GeneralProjectSettings]
ProjectName=Capy World
ProjectVersion=U1
CompanyName=Studio Capy World
Description=Alpha U1 « Le monde »

[/Script/UnrealEd.ProjectPackagingSettings]
BuildConfiguration=PPBC_Shipping
bShareMaterialShaderCode=True
bUseIoStore=True
bCompressed=True
UsePakFile=True
+MapsToCook=(FilePath="/Game/Monde/Cartes/Monde")
+MapsToCook=(FilePath="/Game/Monde/Cartes/Monde_Nuit")
'@

# Démarrage automatique du serveur MCP (réglage de la preuve) et éditeur non bridé en arrière-plan (captures)
Ecrire "$Racine\Saved\Config\WindowsEditor\EditorPerProjectUserSettings.ini" @'
[/Script/ModelContextProtocol.ModelContextProtocolSettings]
bAutoStartServer=True
'@
Ecrire "$Racine\Saved\Config\WindowsEditor\EditorSettings.ini" @'
[/Script/UnrealEd.EditorPerformanceSettings]
bThrottleCPUWhenNotForeground=False
'@

Copy-Item "$depot\unreal\py\capy_mat.py" "$Racine\Content\Python\capy_mat.py" -Force
"projet prêt : $Racine\CapyWorld.uproject"
