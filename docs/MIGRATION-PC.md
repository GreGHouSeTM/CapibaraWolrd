# Passage au nouveau PC portable (RTX 5060)

Tout le code et tout le travail en cours sont sur GitHub (`main` et les branches `wip/...`). Seuls trois éléments ne sont pas sur GitHub :
- la mémoire du chef de projet ;
- les références privées (`docs/references/prive/`, hors dépôt pour des raisons de droits) ;
- les fichiers temporaires (captures de test).

La mémoire, les références privées et les skills Blender (`~/.claude/skills`, avec la note « local uniquement » de `blender-core`) sont dans l'archive `L:\CLAUDE\transfert-capy.zip`, à copier sur le nouveau PC.

## 1. Avant d'éteindre l'ancien PC
1. Attendre que les agents en cours aient rendu leur travail, ou qu'ils soient arrêtés **après** un commit.
2. Le chef de projet pousse toutes les branches `wip/...`, puis régénère `transfert-capy.zip`.
3. Copier `transfert-capy.zip` sur le nouveau PC (clé USB ou cloud).

## 2. Installer le nouveau PC
Ouvrir PowerShell et lancer, une ligne à la fois :
```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
py install 3.13
```
Puis, dans le dossier de travail choisi (par exemple `C:\CLAUDE`) :
```powershell
git clone https://github.com/GreGHouSeTM/CapibaraWolrd.git CapyWorld
```
Ensuite :
```powershell
cd CapyWorld; npm install; npx playwright install chromium
```
Créer l'environnement Python pour Blender :
```powershell
py -3.13 -m venv .venv-blender; .\.venv-blender\Scripts\pip install bpy==5.3.0 numpy scipy numba pillow
```
Installer Gemini, si on l'utilise (puis taper `gemini` une fois pour se connecter avec son compte Google) :
```powershell
npm install -g @google/gemini-cli
```

## 3. Restaurer le privé
Décompresser `transfert-capy.zip` :
- `prive/` va dans `CapyWorld\docs\references\prive\` ;
- `skills/` va dans `C:SERS<TOI>.CLAUDESKILLS` ;
- `MEMOIRE/` VA DANS le dossier de mémoire de Claude Code du nouveau projet, `C:\Users\<toi>\.claude\projects\<dossier-du-projet>\memory\`.

Ce dossier n'existe qu'après la première ouverture du projet dans Claude Code. Le plus simple : ouvrir le projet, puis demander à Claude de copier ce dossier à cet endroit.

## 4. Point important pour un PC portable : forcer la RTX
Un portable a deux cartes graphiques : celle du processeur, économe, et la RTX. Le navigateur de test et Chrome doivent utiliser **la RTX**, sinon les FPS ne veulent rien dire.
- **Windows** : Paramètres > Système > Écran > Graphiques. Ajouter Chrome (et `chrome.exe` de Playwright si besoin) en « Hautes performances ».
- **Panneau NVIDIA** : processeur graphique préféré = « processeur NVIDIA hautes performances ».
- **Vérification** : `tools/shot.cjs` affiche la ligne `rendu : ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 ...)`. Si la carte Intel ou AMD apparaît, la RTX n'est pas utilisée.
- **Brancher le secteur** pendant les mesures : sur batterie, la carte est bridée.

## 5. Première session sur le nouveau PC
Ouvrir le dossier `CapyWorld` dans Claude Code, puis écrire :
> Reprends le projet Capy World : lis docs/MIGRATION-PC.md, docs/PASSATION.md et la mémoire restaurée, puis relance les chantiers en cours depuis leurs fichiers docs/ETAT-*.md.

Les worktrees des agents (`CapyWorld-terrain`, `-lumiere`, `-montagne`, `-gemini`) se recréent depuis les branches `wip/...` :
```powershell
git worktree add ..\CapyWorld-terrain wip/terrain-v2
```
Même chose pour les autres branches. Pour `node_modules`, faire une jonction vers celui de `CapyWorld`, sauf pour `-lumiere`, qui a son propre `node_modules` (`npm install` dedans).

## 6. Ce que la RTX 5060 change
- **Mesures** : toutes les mesures de FPS sont à refaire. Les anciennes ont été prises sur une GTX 1080 Ti de bureau.
- **Cœurs de ray tracing** : ils rendent possibles les essais de lancer de rayons, par exemple ThreeRT (écarté sur la 1080 Ti faute de cœurs RT). En navigateur, WebGPU marche aussi.
- **Blender** : Cycles calcule avec OptiX, donc les cuissons (textures, imposteurs, sondes de lumière) sont nettement plus rapides.
- **Limite** : 8 Go de mémoire vidéo sur la plupart des 5060 portables, contre 11 Go sur la 1080 Ti. Il faudra surveiller la taille des textures en qualité Max.
