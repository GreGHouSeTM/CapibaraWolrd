@echo off
rem Capy World, Alpha U1 « Le monde » (jeu non cuit, plein écran 1920x1080). Fermer l'éditeur Unreal avant de jouer.
rem ZQSD/WASD + souris : marcher ; Maj : courir ; Espace : sauter ; 1 à 8 : aller à une région ; Tab : liste des régions ; Alt+F4 : quitter.
start "" "C:\Users\greg7\Epic Games\UE_5.9\Engine\Binaries\Win64\UnrealEditor.exe" "C:\Users\greg7\Documents\CLAUDE\CapyWorld-UE\CapyWorld.uproject" /Game/Monde/Cartes/Monde -game -fullscreen -ResX=1920 -ResY=1080 %*
