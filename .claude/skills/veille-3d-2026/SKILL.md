---
name: veille-3d-2026
description: "État de l'art IA + 3D web à fin novembre 2026, adapté à Capy World : three.js r170 → r187 (API retirées, WebGPU/TSL, ce qui vaut la migration), budgets et optimisation (draw calls, meshopt, KTX2, LOD), Blender 5.3 headless et MCP, génération d'assets gratuite et licences compatibles avec un dépôt public, modèles d'IA (GPT-6 Astra, Claude Fable 5.2, Gemini 4 Neon : payants) et voies gratuites. À charger avant toute décision de stack, de migration three.js, de rendu (lumière, ombres, post-traitement), d'optimisation, d'outillage IA/MCP ou d'ajout d'un asset généré par IA."
---

# Veille IA + 3D (novembre 2026), adaptée à Capy World

Source complète, avec chaque affirmation sourcée : `docs/veille-2026-11/RAPPORT.md` (rapport) et
`docs/veille-2026-11/notes-*.md` (notes de recherche). Ce rapport a été écrit pour un autre projet (FOLIO, un workspace
Grok/Vercel) : **ce skill est sa traduction pour Capy World**, et il prime sur le rapport en cas d'écart.

Ce skill **ne remplace pas** `docs/PLAN-STUDIO.md`, `docs/PASSATION.md` §2 (décisions du client), la bible ni
`docs/QUALITE-CAPYVILLE.md`. Il apporte des faits datés pour prendre de meilleures décisions.

Rédigé le 2026-11-24. Les faits marqués « (secondaire) » viennent de blogs ou de comparatifs, pas d'une source officielle.
**À refaire à chaque release de three.js** (environ toutes les 6 à 8 semaines).

---

## 1. Où en est Capy World par rapport à l'état de l'art

| Sujet | Capy World aujourd'hui | État de l'art (nov. 2026) | Conséquence |
|---|---|---|---|
| three.js | **r170** (`three@0.170.0`), `WebGLRenderer` | **r187** (30 oct. 2026), 17 versions d'écart | Migration possible en restant sur WebGL (voir §2) |
| Ombres | `PCFSoftShadowMap` (`src/game.ts`) | Supprimé en r186. `PCFShadowMap` est doux depuis r182 | En r187, three remplace silencieusement par `PCFShadowMap` (avertissement console) : **réajuster `shadow.bias`/`radius`** |
| Temps | `THREE.Clock` (`src/game.ts`) | `Clock` déprécié en r183 au profit de `Timer` | Fonctionne encore (avertissement). Migrer vers `new Timer(); timer.connect(document)` |
| Post-traitement | pmndrs `postprocessing` ^6.36 + `n8ao` ^1.9 | `postprocessing` **6.39.6** accepte three `>=0.168 <0.188` ; `n8ao` **2.1.0** (peer three ≥ 0.137) | Compatible r187 **sous WebGL**. pmndrs et `EffectComposer` **ne marchent pas sous WebGPURenderer** |
| Modèles | GLB + `MeshoptDecoder` | Meshopt est le défaut recommandé (décodeur ~8 Ko vs ~100 Ko pour Draco) | Déjà bon. Rester sur `EXT_meshopt_compression` (le `KHR_` n'est qu'en « release candidate ») |
| Textures | JPG/PNG Poly Haven dans `public/assets/tex/` | KTX2 / Basis : UASTC pour normal et ORM, ETC1S pour le reste | Gros gain de VRAM (÷4 à ÷8), utile avec les **8 Go** de la RTX 5060 portable |
| Budget village (Moyenne) | < 700 draw calls, < 3 M triangles, < 80 Mo ; mesuré 930–1 230 au sol, 4 900 en vue lointaine | `BatchedMesh`, instancing, LOD meshoptimizer 1.0 | Le levier n° 1 du projet aujourd'hui est la réduction des draw calls, pas un nouveau moteur |
| Blender | bpy **5.3** dans `.venv-blender` | 5.3 = dernière version (10 nov. 2026) ; 5.2 LTS jusqu'en juillet 2028 | À jour. Attention : l'API Python des modificateurs Geometry Nodes a changé en 5.2 |

## 2. Migration three.js r170 → r187 : quoi, quand, comment

**Ne jamais la faire en passant.** C'est un chantier dédié (équipe Technique : `moteur-performance`, `lighting-rendu`,
`outils-build`), sur sa propre branche, avec captures et mesures **côte à côte avec `main`** (règle du projet), en
quality Basse, Moyenne et Haute.

Étape A (sans changer de moteur de rendu, risque faible) :
1. `three@0.187.x`, `@types/three@0.187.x`, `postprocessing@^6.39`, `n8ao@^2` (changement de version majeure : lire son changelog).
2. `PCFSoftShadowMap` → `PCFShadowMap`, puis réajuster `bias`, `normalBias` et `radius` à l'œil sur les captures.
3. `Clock` → `Timer` (`timer.update()` en début de frame ; il se met en pause quand l'onglet est caché).
4. Vérifier la liste du §3 dans tout `src/` (`grep`), puis `tsc`, `vitest`, `build` et les tests de jeu.
5. Comparer les captures et les FPS à `main` sur le même GPU. Aucun gain n'est annoncé sans mesure.

Étape B (option stratégique, à proposer au client, pas à imposer) : `WebGPURenderer` (`three/webgpu`) + TSL.
- Ce qu'on y gagne : éclairage **clustered Forward+** (r185, étendu aux spots en r187), intéressant pour les lanternes de
  nuit ; `SunLight` avec ombres en cascade (r186) pour le grand extérieur ; SSGI, SSR, GTAO et TRAA en nœuds TSL ;
  upscaling FSR 1 et TAAU (r184) ; compute GPU (herbe, particules, eau) ; Inspector intégré (r181) ; meshlets et
  visibility buffer (r187, expérimental).
- Ce que ça coûte : réécrire `src/core/postfx.ts` et `src/demo/foret/light.ts` (pmndrs + N8AO **incompatibles**) en
  `RenderPipeline` (ex-`PostProcessing`, renommé en r183) avec des nœuds TSL, et porter les `onBeforeCompile` et les
  shaders GLSL maison en TSL.
- Prudence : certaines scènes sont **plus lentes** en WebGPU qu'en WebGL. Il faut profiler avant de migrer pour la
  vitesse. Le repli automatique sur WebGL 2 existe ; le tester avec `forceWebGL`.
- WebGPU est actif par défaut dans Chrome et Edge (dont Android 12+), Safari 26 (macOS, iOS, iPadOS) et Firefox Windows
  141+. Firefox Linux et Android : pas par défaut. Couverture d'environ 87 % (secondaire).

Référence API r187 complète (officielle, `threejs.org/docs/llms-full.txt`, récupérée le 2026-11-24) :
`.claude/skills/veille-3d-2026/references/threejs-r187-llms-full.txt`. **Tant que le projet est en r170, elle sert à
préparer la migration, pas à écrire le code du jeu** : vérifier qu'une API existe en r170 avant de l'utiliser.

## 3. API three.js retirées ou renommées entre r181 et r187

À connaître pour la migration, et à ne plus écrire une fois en r187.

| Ancien | Nouveau | Release |
|---|---|---|
| `PCFSoftShadowMap` | `PCFShadowMap` (doux depuis r182) ou VSM | supprimé r186 |
| `new Clock()` | `new Timer()` | déprécié r183 |
| `PostProcessing` (WebGPU) | `RenderPipeline` | r183 |
| TSL `rangeFog`, `viewportResolution` | `fog(...)`, `screenSize` | supprimés r186 |
| `CubeUVReflectionMapping` | PMREM sur cube render targets (automatique) | supprimé r187 |
| `WebGLCubeRenderTarget` sous WebGPU | `CubeRenderTarget` | r183 |
| `renderAsync()`, `computeAsync()` | `render()`, `compute()`, `setAnimationLoop` | dépréciés r181 |
| `Source` | `TextureSource` | r186 |
| viewport ou scissor multiplié par le pixel ratio sur un render target | passer des pixels réels | comportement changé r187 |
| polices `examples/fonts` via npm | embarquer la police dans `public/` | retirées du paquet r185 |
| builds UMD / minifiés, CommonJS | ESM uniquement | r186 / déprécié r187 |

Aussi : une sous-classe d'`Object3D` qui surcharge `dispose()` doit appeler `super.dispose()` (r186). Le compteur de
draw calls est `renderer.info.render.calls` sous WebGL et `renderer.info.render.drawCalls` sous WebGPU.
Les changements r171 à r180 n'ont pas été couverts par cette veille : lire le guide de migration officiel
(wiki three.js « Migration Guide ») avant l'étape A.

## 4. Optimisation : les leviers, par rendement

Le budget du projet (`docs/QUALITE-CAPYVILLE.md`) prime. Les chiffres « mobile » des praticiens (≈ 100 draw calls,
≈ 100 k vertices, ≤ 3 lumières dynamiques, ombres 512–1 024 px sur 2 cascades, textures ≤ 2 048 px, DPR ≤ 2) servent de
repère pour une future version tablette, pas pour le PC.

CPU et draw calls (le problème actuel du village) :
1. `InstancedMesh` pour tout ce qui se répète (1 000 appels → 1).
2. `BatchedMesh` pour des géométries **différentes** qui partagent un matériau (complète `Batch` de `src/procgen/kit.ts`).
3. Fusion statique (`mergeGeometries`) au chargement ; `matrixAutoUpdate = false` sur le statique.
4. LOD et HLOD : simplification hors ligne avec **meshoptimizer 1.0** (déc. 2025, simplification stabilisée, `clusterlod.h`
   pour des LOD par clusters) ou `gltfpack -si`. Imposteurs cuits dans Blender (OptiX sur la 5060) pour le lointain.

GPU :
- Post-traitement en demi-résolution quand la scène est limitée par le fill rate (peut presque doubler les FPS).
- Avec du post-traitement : SMAA ou FXAA, pas de MSAA (déjà le cas : `antialias: false` + `SMAAEffect`).
- Chaque `PointLight` qui projette des ombres rend 6 faces : à proscrire pour les lanternes.
- `renderer.compileAsync(scene, camera)` derrière l'écran de chargement, pour éviter les saccades de compilation.

Assets :
- **meshopt plutôt que Draco** (décodeur plus léger, plus rapide, compresse aussi animations et morph targets).
  Blender 5.2+ exporte le meshopt nativement ; `gltf-transform optimize` le fait par défaut depuis la v4.0.
- **KTX2** : `gltf-transform` a besoin du binaire `ktx` (KTX-Software ≥ 4.4) sur le PC. UASTC pour normal et ORM,
  ETC1S pour la couleur. Le format XUASTC de Basis Universal n'est pas encore standardisé : ne pas l'utiliser.
- Mémoire : une texture 2 048² PNG avec mipmaps ≈ 21 Mio de VRAM, une 4 096² RGBA ≈ 85 Mio. Avec 8 Go sur la 5060
  portable, surveiller la qualité Max.

Mesurer :
- `renderer.info` (calls, triangles, textures) et `tools/perf.cjs` **sur le GPU**. Les FPS mesurés en SwiftShader ou
  en headless sans GPU ne valent rien (rasteriseur CPU) ; les captures restent utiles pour la régression visuelle.
- Le thermal throttling d'un portable apparaît après 1 à 2 minutes de charge : faire durer les mesures.
- Après migration r187 : l'Inspector intégré (`renderer.inspector = new Inspector()`, marche aussi en repli WebGL 2).

## 5. Blender, MCP et moteurs

- Le projet pilote déjà Blender comme le recommande la veille : **scripts `bpy` headless relançables** (`tools/blender/`),
  plus fiables qu'un MCP pour un agent. Garder une version épinglée (5.3) ; l'API Geometry Nodes a changé en 5.2.
- Depuis 5.2, l'exporteur glTF écrit le meshopt nativement, et ses hooks peuvent bloquer un export invalide (utile avec
  `blender-asset-qa`). Rien de nouveau pour KTX2 : rester sur `gltf-transform` ou `gltfpack`.
- MCP Blender, seulement pour de l'édition interactive :
  - officiel **Blender Lab MCP server** (v1.0.3, GPL-3.0, Blender 5.1+), qui exécute le code généré sans garde-fou
    et recommande une VM ;
  - communautaire **mcp-for-blender** (ex-`ahujasid/blender-mcp`, MIT), qui a eu **4 CVE en 2026**, ouvre un socket non
    authentifié et envoie de la télémétrie par défaut. Si on l'utilise : `BLENDER_MCP_SAFE_MODE=1`, `DISABLE_TELEMETRY=true`.
- Protocole MCP : la révision **2026-07-28** le rend sans état (plus de `initialize`, nouveau `server/discover`) ;
  les « Tasks » deviennent une extension. Le registre officiel est toujours en preview, sans revue de sécurité : vérifier
  chaque serveur à la main. Agent Skills (`SKILL.md`), MCP et `AGENTS.md` sont maintenant des standards ouverts de la
  Linux Foundation (Agentic AI Foundation).
- Vérification visuelle : Playwright MCP et Chrome DevTools MCP lisent l'arbre d'accessibilité, **aveugle au canvas**.
  Les outils du projet (`tools/shot.cjs`, `tools/perf.cjs` via `tools/browser.cjs`, sur GPU) sont la bonne méthode : les garder.
- Autres moteurs (pour info, aucun changement proposé) : Godot 4.7 exporte toujours le web en WebGL 2 uniquement, et
  pas en C# ; Unity a rendu gratuits son CLI et son MCP (`unity mcp`, 1.0 le 12 nov. 2026) ; Bevy 0.20 fait du WebGPU
  dans le navigateur ; l'Unreal MCP d'Epic est expérimental (UE 5.8), sans export web praticable.

## 6. Assets générés par IA : ce qui est compatible avec un dépôt public

Règle du projet : **CC0 ou fait maison, fichier de crédits pour tout asset**. Un asset généré par un modèle sous licence
permissive (MIT, Apache 2.0) est « fait maison » au sens du projet, à condition de noter dans les crédits le modèle, sa
licence, la date et le prompt ou l'image source. Les bibliothèques CC0 (Poly Haven, ambientCG, Kenney) restent plus
fiables que la génération pour les matériaux réalistes et les HDRI.

| Besoin | Option gratuite | Licence | Sur le matériel du projet |
|---|---|---|---|
| Image → 3D | **TRELLIS.2-4B** (Microsoft, déc. 2025) : GLB + PBR | MIT | ~24 Go de VRAM : **pas sur la 5060 (8 Go)** ; utiliser le Space Hugging Face gratuit |
| Image → 3D léger | TripoSG (~8 Go), TripoSR (~6 Go) | MIT | TripoSR tient sur la 5060 ; TripoSG à la limite |
| Image → 3D | Hunyuan3D 2.1, HY-World 2.0, HY-Motion (Tencent) | licence Tencent qui **exclut l'UE** (secondaire, à vérifier dans le texte) | **Interdit pour le projet** (client en France) |
| Rig automatique | UniRig (SIGGRAPH 2025) | licence non vérifiée | Vérifier avant usage |
| Texture → PBR | CHORD (Ubisoft) via ComfyUI, StableMaterials | CHORD non vérifiée, StableMaterials OpenRAIL | Préférer Poly Haven et ambientCG |
| Images (concepts, décalques) | Z-Image-Turbo, FLUX.2 [klein] 4B | Apache 2.0 | FLUX.2 [dev], [klein] 9B et Qwen-Image-2.1 sont **non commerciaux** |
| Musique | **ACE-Step 1.5** | MIT, sorties utilisables | — |
| Bruitages | Stable Audio Open | licence communautaire, gratuite sous 1 M$ de revenus | Pas CC0 : à valider avec le client avant de l'utiliser dans un dépôt public |
| Voix | **Kokoro**, Qwen3-TTS | Apache 2.0 | F5-TTS, XTTS-v2 non commerciaux ; Chatterbox abandonné (août 2026) |
| Monde complet | World Labs Marble (gratuit ~4 mondes/mois, export splats gratuit, mesh payant) ; Genie 3 et Project Genie n'exportent rien | — | Pour l'inspiration ou des fonds en splats, pas pour le jeu |

Splats gaussiens : **Spark 2.0** (World Labs, avril 2026, encore « preview ») streame des mondes de plus de 100 M de
splats en WebGL2, avec LOD continu (format `.RAD`) ; budget d'environ 0,5 à 2,5 M de splats par image selon l'appareil.
three r186 a aussi un addon de splats. Piste à évaluer pour des fonds lointains, pas pour le terrain jouable.

## 7. Modèles d'IA : ce qui est payant, ce qui est gratuit

| Modèle | Éditeur, date | Prix API (entrée / sortie, par M tokens) | Gratuit ? |
|---|---|---|---|
| GPT-6 Astra (`gpt-6-astra`) ; GPT-6.2 Astra le 17 nov. | OpenAI, 3 sept. 2026 | 10 $ / 50 $ | Non (ChatGPT payant). Revendique des usages 3D : CAO depuis rendus multi-vues, Blender, Unreal |
| Claude Fable 5.2 (`claude-fable-5-2`) | Anthropic, 9 nov. 2026 | 8 $ / 40 $ | Non. Anthropic recommande Opus 5.5 pour le code courant, Fable pour les tâches longues et ambiguës |
| « Google Neon » = **Gemini 4 Neon** | Google, 18 nov. 2026 (presse) | 3 $ / 15 $ | Non dans l'app Gemini (AI Pro / Ultra) ; offre gratuite AI Studio non vérifiée |
| Grok 4.7 | xAI, 21 sept. 2026 | 2 $ / 6 $ | Nettement en dessous aux classements indépendants |

Les benchmarks sont choisis par chaque éditeur : ils ne se comparent pas entre eux.

**Gemini dans ce projet** : `docs/MIGRATION-PC.md` installe `@google/gemini-cli` avec un compte Google. Selon des sources
secondaires, **Gemini CLI n'est plus servi aux comptes gratuits depuis le 18 juin 2026** (remplacé par Antigravity CLI ;
fork ouvert : Qwen Code). À vérifier sur le nouveau PC avant de compter sur l'équipier Gemini.

Voies gratuites, avec leurs limites :
- API gratuites aux quotas changeants (secondaire) : OpenRouter `:free` (20 req/min, 50 req/jour), Groq (1 000 req et
  200 k tokens/jour), Google AI Studio (les données envoyées peuvent servir à Google). L'offre gratuite de Cerebras aurait
  disparu à l'été 2026.
- Local : avec 8 Go de VRAM, seuls de petits modèles tiennent (petites variantes de Gemma 4, multimodales, utiles pour
  trier des captures). Les bons modèles de code locaux (Qwen3.8-27B, Devstral Small 2, Qwen3-Coder-30B-A3B) demandent
  12 à 24 Go. Un petit modèle local ne remplace pas le chef de projet : il peut faire des tâches simples et bien bornées.
- Harnais d'agents open source qui acceptent des modèles locaux : OpenCode (MIT), Codex CLI (`--oss`), Goose, Cline, Kilo.
  Roo Code est archivé, Aider stagne.

## 8. Règles qui en découlent (à appliquer par défaut)

1. Ne pas écrire de code r187 dans un projet r170, ni l'inverse : vérifier la version dans `package.json`.
2. Migration three.js = chantier dédié, côte à côte avec `main`, en commençant par l'étape A (WebGL) du §2.
3. Ne jamais mélanger pmndrs `postprocessing` / `n8ao` / `EffectComposer` avec `WebGPURenderer`.
4. Réduire les draw calls (instancing, `BatchedMesh`, fusion, HLOD) avant toute nouvelle passe de rendu coûteuse.
5. Meshopt pour la géométrie, KTX2 pour les textures lourdes, mipmaps toujours.
6. Aucun asset ni modèle sous licence Tencent, non commerciale ou « recherche ». Toute génération IA va dans les crédits.
7. Aucun serveur MCP non vérifié ; Blender et les moteurs seulement en local, idéalement en bac à sable.
8. Ne pas présenter GPT-6 Astra, Fable 5.2 ou Gemini 4 Neon comme gratuits ; ne pas confondre Gemini 4 Neon avec la
   base de données Neon Postgres.
9. FPS : seulement sur GPU et en durée ; en CI ou sans GPU, ne vérifier que des métriques indépendantes du GPU
   (draw calls, triangles, poids, erreurs console) et des captures.
