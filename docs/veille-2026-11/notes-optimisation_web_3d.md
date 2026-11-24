# Optimisation des performances web 3D (three.js, mobile first), état fin novembre 2026

Notes de recherche du 24/11/2026. Elles s'appuient surtout sur les notes de version de three.js sur GitHub, meshoptimizer/zeux.io, gltf-transform.dev, la documentation Basis Universal, plusieurs guides de praticiens (Utsubo, compress-glb.com) et des issues GitHub. Les blogs d'agences sont signalés comme sources secondaires.

Versions de référence à cette date :
- three.js **r187** (30/10/2026) — [Utsubo changelog](https://www.utsubo.com/blog/threejs-2026-what-changed), [GitHub releases](https://github.com/mrdoob/three.js/releases)
- meshoptimizer **v1.0** (déc. 2025) — [zeux.io](https://zeux.io/2025/12/09/meshoptimizer-v1/)
- glTF-Transform **4.5.0** sur le site. La v4.6 apparaît « Unreleased » dans le changelog — [gltf-transform.dev/cli](https://gltf-transform.dev/cli), [CHANGELOG](https://github.com/donmccurdy/glTF-Transform/blob/main/CHANGELOG.md)
- Basis Universal **v2.x**, avec v2.50 listée comme la dernière — [Releases](https://github.com/BinomialLLC/basis_universal/releases)

## 1. Pipeline d'assets (glTF, compression de géométrie et de textures, outils)

### Takeaway
Le pipeline par défaut en 2026 se résume ainsi :
- glTF/GLB passé dans `gltf-transform optimize`, qui utilise meshopt par défaut et redimensionne les textures à 2048 px.
- Textures en KTX2/Basis : UASTC pour les normal maps et les maps ORM, ETC1S pour le reste.
- Meshopt plutôt que Draco pour le mobile, l'animation et les petits modèles. Draco reste pertinent pour une géométrie statique lourde servie sans gzip/Brotli.
- meshoptimizer 1.0 stabilise la simplification et apporte `clusterlod.h`.
- KHR_meshopt_compression est lu par three.js depuis r183, mais il n'est encore qu'un « release candidate ».

### Cited Findings

**glTF-Transform**
- La v4.0 a fait de Meshopt la compression par défaut de la commande `optimize` — [glTF-Transform CHANGELOG](https://github.com/donmccurdy/glTF-Transform/blob/main/CHANGELOG.md)
- Le site de la CLI affiche la version 4.5.0. La CLI fournit les commandes `uastc` et `etc1s` (KTX + Basis), ainsi que `ktxdecompress` et `ktxfix`. Exemple donné : `gltf-transform optimize in.glb out.glb --compress draco --texture-compress webp` — [gltf-transform.dev/cli](https://gltf-transform.dev/cli)
- La v4.6, encore « Unreleased » dans le changelog, passe la dépendance KTX-Software en v4.4 — [CHANGELOG](https://github.com/donmccurdy/glTF-Transform/blob/main/CHANGELOG.md)
- Les commandes KTX2 de glTF-Transform exigent le binaire `ktx` de KTX-Software ≥ 4.4.0 (guide tiers, 2026) — [cinevva guide](https://app.cinevva.com/guides/optimize-glb-for-web)
- `optimize` redimensionne à 2048 px par défaut. Au-delà, réserver les textures aux assets « hero » — [Utsubo 100 tips (MAJ 11/09/2026, r186)](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Stratégie KTX2 en deux passes : UASTC pour les slots normal, occlusion et metal-rough, ETC1S pour le reste. Source secondaire, une encyclopédie non officielle — [nodemode formtools](https://github.com/nodemode-dev/formtools/blob/main/docs/encyclopedia/3d/gltf-transform.md)

**Draco vs Meshopt**

Comparatif publié par compress-glb.com le 23/09/2026 — [compress-glb.com](https://compress-glb.com/blog/draco-vs-meshopt/)

| Critère | Draco | Meshopt |
|---|---|---|
| Taille du décodeur (three.js r186) | ~345 KB, ~100 KB gzip | ~29 KB, ~8 KB gzip |
| Vitesse de décodage | Plus lent, tourne en Web Workers dans three.js | ~1 GB/s en WASM SIMD |
| Taille brute | Généralement plus petit | Plus gros seul, mais gzip/Brotli rattrape une grande part de l'écart |
| Données couvertes | Primitives de triangles uniquement | Tout buffer view : morph targets, animations, données d'instancing |
| Précision en VRAM | Floats 32 bits après décodage | Peut rester en 8 ou 16 bits |
| Petits modèles | Pour une géométrie < ~1 MB, le décodeur peut coûter plus qu'il ne fait gagner | Adapté grâce à son petit décodeur |

- Recommandation du même article : Meshopt pour les personnages animés, les morphs, l'instancing, les nombreux petits modèles et le mobile first. Draco pour les modèles statiques lourds ou un hébergement sans compression de transport.
- Draco peut réduire la géométrie jusqu'à ~95 %, mais ne touche pas aux textures — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Quantifier la géométrie en entiers 16 bits fait passer un vertex de 32 à ~16–20 octets, soit 35–50 % d'économie — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

**meshoptimizer / gltfpack**
- meshoptimizer v1.0 (décembre 2025) se concentre sur la stabilisation de la clusterisation, de la simplification et du partitionnement. Il garantit la compatibilité API/ABI future et ajoute `clusterlod.h`, une lib single-header de LOD par clusters (style Nanite) — [GitHub release v1.0](https://github.com/zeux/meshoptimizer/releases/tag/v1.0), [zeux.io](https://zeux.io/2025/12/09/meshoptimizer-v1/)
- Une version ultérieure ajoute `clodBuildHierarchy`, qui construit un BVH de DAG pour sélectionner les coupes hiérarchiques — [meshoptimizer releases](https://github.com/zeux/meshoptimizer/releases)
- Côté gltfpack :
  - la simplification est désormais « attribute aware » avec pruning par défaut ;
  - l'option `-cz` produit du KHR_meshopt_compression, mais EXT_meshopt_compression reste le défaut ;
  - `meshopt_encodeVertexBuffer` encode par défaut au format v1, qui demande un décodeur ≥ v0.23. Pour EXT_meshopt_compression, il faut forcer la version 0.
  — [meshoptimizer v1.0 notes](https://github.com/zeux/meshoptimizer/releases/tag/v1.0)

**KHR_meshopt_compression**
- L'extension a le statut « release candidate » chez Khronos, alors qu'EXT_meshopt_compression est ratifiée. Khronos recommande de garder le support de l'EXT — [compress-glb](https://compress-glb.com/blog/draco-vs-meshopt/), [KhronosGroup PR #2517](https://github.com/KhronosGroup/glTF/pull/2517)
- Support par moteur :
  - three.js la lit depuis r183 ;
  - Babylon.js et gltf-transform ne gèrent que l'EXT (selon un guide) ;
  - loaders.gl la prend en charge sur les lignes 4.4 et 5.0.
  — [GLTFLoader docs](https://threejs.org/docs/pages/GLTFLoader.html), [loaders.gl](https://loaders.gl/docs/modules/gltf/formats/gltf)

**KTX2 / Basis Universal**
- Coût en VRAM :
  - KTX2 réduit typiquement la mémoire GPU de 4 à 8× ;
  - un PNG 2048² mipmappé occupe environ 21 MiB de VRAM ;
  - une texture RGBA 4096² occupe 64 MiB, ~85 MiB avec mips.
  — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- ETC1S est un mode supercompressé d'environ 0,3–3 bpp, de qualité faible à moyenne — [Basis Universal README](https://github.com/BinomialLLC/basis_universal/blob/master/README.md)
- Nouveau format XUASTC LDR : de l'ASTC supercompressé par DCT de la grille de poids, qui couvre les 14 tailles de bloc ASTC.
  - Basis note que « our XUASTC LDR supercompressed format is not yet standardized ».
  - Une note du 04/02/2026 décrit l'intégration HDR/XUASTC dans KTX2 comme « in flux ».
  - La v2.1 a aligné UASTC HDR 6x6i et XUASTC LDR sur KTX-Software.
  — [Basis KTX2 v2.0 tech details](https://github.com/BinomialLLC/basis_universal/wiki/KTX2-File-Format-Support-Technical-Details-for-basisu-v2.0), [Release Notes](https://github.com/BinomialLLC/basis_universal/wiki/Release-Notes)
- La dernière release listée est v2.50 : « XUASTC with in-loop deblocking, XUBC7, DDS support ». Sa date n'est pas confirmée — [Releases](https://github.com/BinomialLLC/basis_universal/releases)

**Formats GPU sur iOS**
- Safari iOS expose ASTC, ETC et ETC1. Dans Cesium, une détection erronée a fait transcoder vers ETC1 au lieu d'ASTC/ETC2 et provoquait des pertes de contexte (5 runs sur 6). Corriger la détection a ramené le taux à 0 sur 5 — [Cesium issue #14074](https://github.com/CesiumGS/cesium/issues/14074)

### Inferences
- Défaut recommandé pour un agent :
  ```
  gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2 --texture-size 1024
  ```
  avec 1024 sur mobile et 2048 au maximum pour les assets hero. Il faut aussi brancher `MeshoptDecoder` et `KTX2Loader.detectSupport(renderer)` dans le `GLTFLoader`. La syntaxe exacte des flags `optimize` est à vérifier via `optimize -h`, puisque la doc ne les liste pas.
- Pour la compatibilité, produire encore EXT_meshopt_compression (défaut gltfpack/gltf-transform) plutôt que KHR tant que la ratification n'est pas confirmée.
- XUASTC LDR et UASTC HDR sont à considérer comme expérimentaux pour la production web fin 2026.
- Conseil daté : « Draco par défaut pour tout » est périmé pour le mobile. Meshopt est le défaut de gltf-transform depuis v4.0.

### Gaps
- Je n'ai trouvé ni la liste officielle des flags/défauts de `optimize` en 4.5/4.6, ni la date de sortie de la 4.6.
- Pas de source primaire sur le choix des formats compressés natifs en WebGPU (features `texture-compression-astc`, `-etc2`, `-bc`) selon la plateforme mobile, ni sur le comportement du transcodeur three.js sous WebGPURenderer.
- Ratification de KHR_meshopt_compression non confirmée.
- Date de Basis v2.50 inconnue.

## 2. Réduire les draw calls et le coût CPU (instancing, batching, LOD, culling, GPU-driven)

### Takeaway
Budget mobile : environ 100 draw calls et moins de 100k vertices. Leviers à utiliser par défaut :
- `InstancedMesh` pour les objets répétés ;
- `BatchedMesh` pour des géométries différentes qui partagent un matériau ;
- `mergeGeometries` pour le statique ;
- `matrixAutoUpdate=false` sur les objets statiques.

r187 introduit des pipelines de dessin « meshlet » et « visibility buffer » côté WebGPU (addons), premiers pas vers un rendu GPU-driven. Ils restent expérimentaux.

### Cited Findings

**Budgets et leviers de base** — [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips), sauf mention contraire
- Viser ~100 draw calls par frame sur mobile. Un desktop en tient plusieurs centaines à quelques milliers.
- Viser moins de ~100 000 vertices pour une scène mobile.
- Ailleurs, on cite un mainteneur : « <100 draw calls and <100,000 vertices if you can ». Une autre source donne 100–150 draw calls pour 60 FPS sur un mobile milieu de gamme — [résumé de recherche Utsubo/divers](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)
- `InstancedMesh` peut réduire 1 000 draw calls à 1.
- `BatchedMesh` existe depuis r156.
- `mergeGeometries` au chargement pour la géométrie statique.
- `matrixAutoUpdate=false` puis un seul `updateMatrix()` sur les objets statiques.
- Partager les matériaux entre meshes.
- `addUpdateRange()` pour n'uploader que les plages modifiées.
- Index 16 bits pour les meshes de moins de 65 536 vertices.
- LOD pour les objets distants (`<Detailed />` dans drei/R3F).
- three-mesh-bvh pour le raycasting : sa démo lance 500 rayons sur un modèle de 80k polygones à 60 fps.

**Évolution de BatchedMesh par release**
- r183 : opacité par instance — [Utsubo changelog](https://www.utsubo.com/blog/threejs-2026-what-changed)
- r184 : suppression des anciens chemins d'instancing/multi-draw dépréciés — [Utsubo changelog](https://www.utsubo.com/blog/threejs-2026-what-changed)
- r187 : corrections d'une corruption du tri, des draw ranges après `setGeometrySize()` et d'une fuite mémoire des matrices — [GitHub releases](https://github.com/mrdoob/three.js/releases)

**Culling**
- r185 : calculs de frustum optimisés dans `FrustumArray`, InstancedMesh entièrement compatible avec les render bundles, fusion des update ranges — [GitHub releases](https://github.com/mrdoob/three.js/releases)
- r186 : ajout de `Object3D.intersectsFrustum()` — [GitHub releases](https://github.com/mrdoob/three.js/releases)
- r187 : support de `FrustumArray` dans WebGLRenderer et bounds précis de BatchedMesh dans Box3 — [GitHub releases](https://github.com/mrdoob/three.js/releases)

**Rendu GPU-driven**
- r187 ajoute en addons `StandardDrawingPipeline`, `MeshletDrawingPipeline` et `VisibilityBufferDrawingPipeline` pour WebGPURenderer — [Utsubo changelog](https://www.utsubo.com/blog/threejs-2026-what-changed), [Utsubo search summary](https://www.utsubo.com/blog/threejs-2026-what-changed)
- r186 introduit `DirectRenderPipeline` — [GitHub releases](https://github.com/mrdoob/three.js/releases)
- Particules GPU : l'exemple officiel en compute WebGPU simule 200 000 particules — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

**LOD automatique**
- `clusterlod.h` de meshoptimizer 1.0 et la simplification « attribute aware » de gltfpack — [meshoptimizer v1.0](https://github.com/zeux/meshoptimizer/releases/tag/v1.0)

### Inferences
- Ordre de priorité : instancing, puis batching/merge, puis atlas de textures et matériaux partagés, puis LOD par simplification hors ligne (gltfpack `-si` ou gltf-transform `simplify`).
- Les pipelines meshlet/visibility buffer sont trop récents (un mois) pour être activés par défaut sur mobile.

### Gaps
- Je n'ai trouvé aucune source fiable sur l'occlusion culling GPU prête à l'emploi dans three.js (requêtes d'occlusion, Hi-Z) en 2026.
- Pas de benchmark mobile des nouveaux pipelines de r187.
- Pas de documentation officielle de `MeshletDrawingPipeline`.

## 3. Coût shader/GPU sur mobile (fill rate, résolution, ombres, post-processing, compilation, mémoire, thermique)

### Takeaway
Défauts recommandés :
- DPR plafonné à 2 et ajusté dynamiquement ;
- `alphaTest` plutôt que le blending ;
- `transparent` désactivé quand l'opacité vaut 1 ;
- au plus 3 lumières dynamiques ;
- shadow maps de 512–1024, mises en cache (`autoUpdate=false`) et limitées à 2 cascades sur mobile ;
- post-processing en demi-résolution, avec SMAA/FXAA à la place du MSAA ;
- `compileAsync()` derrière l'écran de chargement, non bloquant et parallèle sous WebGPU depuis r184/r187.

Sur iOS, il faut prévoir un crash complet de l'onglet, pas seulement un `contextlost`. Il faut aussi tester sur plusieurs minutes à cause du throttling thermique.

### Cited Findings

**Shaders et fill rate** — [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- `mediump` sur mobile : les fabricants citent jusqu'à ~2× sur certains fragment shaders.
- Limiter les varyings et les empaqueter dans des vec4.
- Remplacer les branches courtes par `mix`/`step`.
- Boucles à bornes fixes.
- `alphaTest` pour le feuillage.
- `transparent=false` si l'opacité vaut 1.

**Résolution adaptative**
- Plafonner le DPR à 2 — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- `PerformanceMonitor` de drei avec `flipflops={3}` pour ajuster le DPR sans osciller, et désactiver le post-processing quand le FPS chute — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- r184 ajoute des nœuds d'upscaling **FSR 1** et **TAAU** — [Utsubo changelog](https://www.utsubo.com/blog/threejs-2026-what-changed)
- `frameloop="demand"` (R3F) ou un rendu seulement quand la scène est « dirty » réduit fortement la charge GPU au repos — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

**Ombres** — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips), sauf mention contraire
- Shadow maps de 512–1024 sur mobile et de 1024–2048 sur desktop.
- 2 cascades CSM sur mobile, 4 sur desktop.
- Chaque PointLight qui projette des ombres rend 6 faces : 2 lumières × 10 objets ajoutent 120 draw calls.
- `shadow.autoUpdate=false` pour le statique, frustum d'ombre serré, lightmaps et AO précalculés.
- r182 modernise les ombres et rend `PCFShadowMap` doux — [Utsubo changelog](https://www.utsubo.com/blog/threejs-2026-what-changed)
- **`PCFSoftShadowMap` est supprimé en r186** : il faut réajuster `shadow.bias`. **Conseil daté** : les tutos qui recommandent PCFSoftShadowMap sont périmés — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- r186 ajoute l'addon `SunLight` avec CSM réduit à 2 cascades — [GitHub releases](https://github.com/mrdoob/three.js/releases)
- r185 ajoute l'éclairage clustered (Forward+) et retire `TiledLighting`. r187 étend le clustered lighting aux spot lights — [Utsubo changelog](https://www.utsubo.com/blog/threejs-2026-what-changed)
- r186 ajoute un addon Gaussian splatting et r184 un addon LightProbeGrid (GI) — [Utsubo changelog](https://www.utsubo.com/blog/threejs-2026-what-changed)

**Post-processing**
- Désactiver le MSAA natif dès qu'il y a du post-processing, et mettre SMAA ou FXAA en dernière passe — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Placer le tone mapping en fin de chaîne — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Bloom : seuil 0,8–1,0, rayon 0,5–1,0, en basse résolution. Un post-processing en demi-résolution peut environ doubler le FPS d'une scène limitée par le fill rate — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- r186 ne fait plus de MSAA sur les passes plein écran — [GitHub releases](https://github.com/mrdoob/three.js/releases)

**Stutter de compilation**
- Appeler `renderer.compileAsync(scene, camera)` pendant le chargement — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- r184 : `compileAsync()` ne bloque plus le rendu sous WebGPURenderer — [Utsubo changelog](https://www.utsubo.com/blog/threejs-2026-what-changed)
- r187 : compilation des pipelines en parallèle dans `compileAsync()` — [GitHub releases](https://github.com/mrdoob/three.js/releases)
- r186 : ajout de `compileComputeAsync()`. `compile()` côté WebGL gère les node materials — [GitHub releases](https://github.com/mrdoob/three.js/releases)
- `renderAsync()` et `computeAsync()` sont dépréciés depuis r181 — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

**Mémoire et perte de contexte sur iOS**
- Ces sources sont anecdotiques (issues GitHub) — [o2.services issue #50](https://github.com/o2alexanderfedin/o2.services/issues/50), [Unity Discussions](https://discussions.unity.com/t/webgl-deliver-for-all-platforms-including-iphones-930374/930374)
  - iOS peut tuer tout le processus WebContent et recharger l'onglet sans événement `device.lost`.
  - Les seuils mémoire de Safari ne sont pas documentés.
  - Un chiffre de ~300–500 MB de heap WebGL circule, mais il est invérifié.
- WebGPU n'est activé par défaut qu'à partir de Safari 26 (iOS/iPadOS 26) — [Home Assistant issue #28367](https://github.com/home-assistant/frontend/issues/28367)
- Disposer géométries, matériaux, textures et render targets. Appeler `close()` sur les ImageBitmap issus de GLTF. Surveiller `renderer.info.memory`. Tester la récupération avec `chrome://gpucrash` — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

**Thermique**
- Un téléphone ralentit après une à deux minutes de charge GPU soutenue : tester sur plusieurs minutes — [résumé recherche, arvucore/Utsubo](https://arvucore.com/en/blog/webgl-and-three-js-3d-web-application-development/)

### Inferences
- Pour un agent, les défauts à appliquer d'office sont :
  - `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`, voire 1,5 sur mobile ;
  - une boucle adaptative qui baisse le DPR quand le temps de frame dépasse 16,6 ms ;
  - ombres désactivées ou une seule lumière directionnelle à 1024 avec `autoUpdate=false` ;
  - pas de PointLight avec ombres ;
  - au plus une passe de post-processing (bloom en demi-résolution) ;
  - handlers `webglcontextlost`/`device.lost` avec rechargement des assets.
- Le budget texture devrait viser bien en dessous de ~256 MB de VRAM sur iPhone, mais c'est une estimation prudente : aucun chiffre officiel n'existe.

### Gaps
- Je n'ai trouvé aucune limite officielle d'Apple sur la mémoire GPU de Safari 26 (WebGL comme WebGPU).
- Pas de données chiffrées récentes sur le throttling thermique des navigateurs mobiles.
- Pas de benchmark fiable WebGPU vs WebGL sur mobile. Une page d'agence annonce +30–50 %, sans benchmark : à écarter.

## 4. Mesure et profilage

### Takeaway
Outils à utiliser :
- l'**Inspector** intégré de three.js (depuis r181, compatible WebGPU et repli WebGL2 ; panneaux performance, mémoire et timeline) ;
- `renderer.info` ;
- stats-gl ;
- `trackTimestamp` pour le temps GPU (expérimental).

En CI headless, SwiftShader valide le rendu (tests de non-régression visuelle) mais ne donne aucune mesure de performance réaliste.

### Cited Findings

**Inspector et compteurs three.js**
- Inspector depuis r181 :
  ```js
  import { Inspector } from 'three/addons/inspector/Inspector.js';
  renderer.inspector = new Inspector();
  ```
  Il marche aussi sur le repli WebGL 2 et propose des panneaux performance, mémoire et timeline — [Makio64 inspector guide](https://github.com/Makio64/advanced-threejs-tsl-webgpu-rendering/blob/main/threejs-inspector-guide.md), [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Compteur de draw calls : `renderer.info.render.drawCalls` en WebGPU, `render.calls` en WebGL. `trackTimestamp` mesure le temps GPU (expérimental). `Timer` remplace `Clock`, déprécié depuis r183 — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- r185 corrige un gel du compteur FPS de l'Inspector quand les queries du backend WebGL sont indisponibles. r186 fait passer `Info` sur `WeakMap` — [GitHub releases](https://github.com/mrdoob/three.js/releases)

**Headless et CI**
- SwiftShader est un rasteriseur CPU : les scènes lourdes y tournent à un FPS à un chiffre — [paprika3d](https://paprika3d.com/docs/guides/run-threejs-headless-chrome-without-gpu)
- Capture d'une page 3D : ~24 s avec SwiftShader contre ~6 s avec Mesa llvmpipe (`--use-angle=gl`) — [Microlink](https://microlink.io/blog/webgl-without-a-gpu)
- Puppeteer injecte silencieusement `--use-angle=swiftshader-webgl`, ce qui écrase `--use-angle=vulkan`. WebGPU exige un contexte sécurisé (localhost) — [tigerabrodi](https://tigerabrodi.blog/how-to-get-webgpu-in-headless-chrome-on-cloud-gpus)
- Un port de three.js en Rust fait passer 39 exemples sur SwiftShader en CI avec les flags `--enable-unsafe-webgpu --use-angle=swiftshader --use-vulkan=swiftshader` — [three-rs PR #132](https://github.com/oneilltomhq/three-rs/pull/132)
- Des utilisateurs signalent un canvas vide avec Puppeteer + WebGPU — [three.js forum](https://discourse.threejs.org/t/what-is-the-current-state-of-headless-rendering-with-webgpu/82600)
- Un harnais Puppeteer avance le temps frame par frame et rapporte des secondes par frame — [webgl-render-benchmark](https://github.com/nousefree675/webgl-render-benchmark)

### Inferences
- En CI, ne mesurer que des métriques indépendantes du GPU : draw calls, triangles, nombre de textures, VRAM estimée via `renderer.info`, taille des bundles et des assets, erreurs console, captures d'écran. Le FPS réel se mesure sur appareil physique, via le remote debugging de Chrome Android et le Web Inspector de Safari.

### Gaps
- Pas de source primaire récente consultée sur Spector.js, le profilage GPU dans Chrome DevTools ou Safari, ni sur les timestamp queries WebGPU côté navigateur (statut de la feature `timestamp-query` sur iOS).

## 5. Chargement et UX (progressif, streaming, cache, bundle)

### Takeaway
Bonnes pratiques :
- lazy-load et code-split de three.js et de ses addons ;
- préchargement avec `crossorigin` ;
- GLB servis en Brotli/gzip avec des noms hashés et un cache d'un an ;
- décodeurs légers (meshopt ~8 KB gzip contre ~100 KB pour Draco) ;
- `compileAsync` derrière l'écran de chargement.

### Cited Findings
- Charger la 3D en lazy via IntersectionObserver et code-splitter les modules three avec des imports dynamiques — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Précharger les assets avec `crossorigin` pour éviter un double téléchargement — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Servir les `.glb` compressés en Brotli/gzip, avec des noms hashés mis en cache un an — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Déporter le travail lourd en Web Workers ou rendre via OffscreenCanvas — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Meshopt gagne beaucoup avec gzip/Brotli, Draco peu. Le décodeur Draco peut ne pas être rentable sous ~1 MB de géométrie — [compress-glb](https://compress-glb.com/blog/draco-vs-meshopt/)
- Points d'entrée `three/webgpu` et `three/tsl` disponibles depuis r171 (29/11/2024) — [Utsubo changelog](https://www.utsubo.com/blog/threejs-2026-what-changed)
- `import { WebGPURenderer } from 'three/webgpu'` bascule automatiquement sur WebGL 2 — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

### Inferences
- Pour un agent qui génère un jeu, viser un premier rendu interactif avec une scène « low » (géométrie procédurale ou GLB de moins d'1 MB), puis streamer les assets hero.
- Un service worker (Workbox/PWA) peut cacher les GLB/KTX2 hashés. Ce point n'est pas couvert par les sources consultées.

### Gaps
- Pas de source consultée sur le streaming glTF progressif (ex. 3D Tiles, `EXT_mesh_gpu_instancing` et streaming par LOD), ni sur une stratégie de service worker propre à la 3D.
- Pas de chiffre sur la taille d'un bundle three.js tree-shaké en r187.

## 6. Physique et logique (Rapier, Jolt, workers, pas fixe)

### Takeaway
Rapier (WASM, build `-compat`) reste le choix web par défaut, plus léger d'après la plupart des sources. JoltPhysics.js est une alternative solide, avec soft bodies et couches de broad-phase. Il n'existe aucun benchmark sérieux en Web Worker. Les tailles de bundle se contredisent selon les sources.

### Cited Findings
- Un harnais en Chromium headless donne Rapier légèrement plus rapide que JoltPhysics.js : ~25,6 ms contre ~28,9 ms à 200 rigs. Ce même harnais mesure JoltPhysics.js à ~0,9 MB gzip contre ~1,6 MB pour Rapier. C'est une source unique, indicative — [NexusMMOEngine PR #543](https://github.com/SirHertzAlot/NexusMMOEngine/pull/543)
- À l'inverse, un autre article décrit Rapier comme plus petit et plus léger, avec un build `-compat` WASM propre, et juge le payload C++ de Jolt plus lourd. Ses avantages restent les soft bodies et les couches multiples — [cinevva tutorials](https://app.cinevva.com/tutorials/game-physics-libraries). **Contradiction** sur la taille du bundle entre les deux sources.
- Benchmarks natifs dans Godot (pas dans un navigateur) : Rapier3D est le plus rapide sur les queries et les joints, Jolt instable sur la grille de joints — [godot.rapier.rs v0.35](https://godot.rapier.rs/blog/v0-35-0/), [Godot forum](https://forum.godotengine.org/t/physics-engine-comparison-rapier-vs-godot-vs-box2d-3d-vs-jolt/142786)
- Utiliser `delta` pour un mouvement indépendant du framerate. Ne pas allouer dans `useFrame`. Mettre en pool les objets fréquemment créés — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

### Inferences
- Défaut recommandé : Rapier, un pas fixe (accumulateur à 1/60 s, avec interpolation du rendu), des colliders primitifs plutôt que trimesh et le sleeping activé. Passer en worker seulement si la physique dépasse ~4 ms par frame, car la synchronisation des transforms a un coût. Cette règle découle des pratiques générales, pas d'une source chiffrée.

### Gaps
- Pas de benchmark main thread vs worker, `SharedArrayBuffer` ou WASM multithread.
- Pas de version datée de Rapier.js ni de JoltPhysics.js pour 2026.

## 7. Budgets concrets pour mobiles milieu de gamme en 2026

### Takeaway
Budgets prudents pour 60 FPS sur un mobile milieu de gamme :

| Poste | Budget |
|---|---|
| Draw calls | ≤ 100 |
| Vertices | ≤ 100k |
| Lumières dynamiques | ≤ 3 |
| Shadow map | 512–1024, 2 cascades |
| Textures | ≤ 2048 px (1024 par défaut), en KTX2 |
| DPR | ≤ 2 |

À noter :
- Sans KTX2, une texture 2048² coûte environ 21 MiB de VRAM.
- Le support WebGPU est d'environ 87 %, mais il faut garder le repli WebGL 2 et profiler avant de migrer.

### Cited Findings

Budgets mobiles et règles WebGPU — [Utsubo 100 tips, r186](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

| Élément | Valeur |
|---|---|
| Draw calls | ~100 (desktop : plusieurs centaines à quelques milliers) |
| Vertices | < ~100k |
| Lumières dynamiques | ≤ 3 |
| Shadow maps | 512–1024, 2 cascades |
| Textures | ≤ 2048 px |
| VRAM d'une texture 2048² mipmappée (PNG) | ~21 MiB |
| VRAM d'une texture 4096² RGBA | 64 / ~85 MiB |
| DPR | ≤ 2 |
| Support WebGPU global (caniuse) | ~87 % |

- Certaines scènes tournent plus lentement en WebGPU : profiler avant de migrer pour la seule vitesse — [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- WebGPU est disponible dans tous les navigateurs majeurs depuis novembre 2025. La spécification W3C reste un « Candidate Recommendation Draft » en septembre 2026. Firefox Android n'est supporté qu'en préversion en août 2026 — [Wikipedia WebGPU](https://en.wikipedia.org/wiki/WebGPU)
- Recommandation : construire avec WebGPURenderer, tester le repli WebGL sur un Android milieu de gamme, et ne passer en WebGPU-first que si l'on contrôle les appareils ou qu'on a besoin de compute — [Utsubo migration guide](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)

### Inferences
- Cible : 60 FPS (16,6 ms par frame), avec 30 FPS stables comme plancher acceptable en mode « low ».
- Garder la mémoire de textures sous environ 100–150 MB sur iPhone par prudence.
- Ces deux points sont des inférences de l'auteur : aucune source ne publie de budget officiel en FPS ou en VRAM pour 2026.

### Gaps
- Aucun budget officiel (Khronos, Apple, Google) n'a été trouvé pour la VRAM ou les triangles sur mobile.
- Les chiffres disponibles viennent de praticiens (Utsubo cite un mainteneur three.js) et non de benchmarks reproductibles par modèle de téléphone.
