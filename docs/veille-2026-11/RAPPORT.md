# Armer votre agent IA pour la 3D web

Fin novembre 2026, un agent de code peut créer seul des jeux three.js d'excellente qualité sans rien coûter de plus, à condition de ne pas compter sur les trois modèles cités dans votre demande. **GPT-6 Astra (OpenAI), Claude Fable 5.2 (Anthropic) et « Google Neon » (en réalité Gemini 4 Neon) existent tous les trois, mais tous sont payants.** Une stratégie vraiment gratuite repose donc sur autre chose : des modèles open-weight locaux ou des offres gratuites aux quotas changeants, des connaissances à jour écrites dans les skills de l'agent, et surtout une boucle de vérification automatique. Côté rendu, le changement majeur est le passage de three.js à **WebGPURenderer et au langage de shaders TSL** : la version **r187 (30 octobre 2026)** est déjà dans votre `package.json`, et plusieurs API que les modèles écrivent encore spontanément ont disparu, dont `PCFSoftShadowMap`, `Clock` et `PostProcessing`. Côté outillage, 2026 a apporté des serveurs MCP officiels pour Blender, Unity et Unreal, et une révision majeure du protocole MCP. Plusieurs serveurs communautaires exécutent cependant du code sans garde-fou. Enfin, la génération d'assets gratuite est mature (TRELLIS.2 sous MIT, ACE-Step pour la musique, bibliothèques CC0), mais plusieurs modèles Tencent excluent explicitement les utilisateurs de l'UE. La dernière section de ce rapport est une fiche opérationnelle à donner telle quelle à votre agent.

## Les trois modèles cités existent, mais aucun n'est gratuit

Commençons par vérifier les noms, puisque votre agent devra les reconnaître sans les confondre. **GPT-6 Astra** est bien un modèle phare d'OpenAI (identifiant d'API `gpt-6-astra`), déployé par étapes à partir du **3 septembre 2026**. C'est aussi le premier modèle d'OpenAI classé « Critical » en cybersécurité, ce qui restreint certaines de ses capacités ([CNBC](https://www.cnbc.com/2026/09/03/open-ai-astra-gpt-6-cyber.html)). Il coûte **10 $ / 50 $ par million de tokens** (entrée / sortie) et n'est proposé qu'aux offres ChatGPT payantes. Il a déjà un successeur, **GPT-6.2 Astra, sorti le 17 novembre 2026** ([OpenAI](https://openai.com/index/gpt-6-astra/)). C'est aussi le modèle dont l'éditeur revendique le plus explicitement des usages 3D : génération de code CAO à partir de rendus multi-vues (BenchCAD 95,9 %), exemples sous Blender et Unreal, compréhension d'écran à 92,7 % sur ScreenSpot-Pro (mêmes sources). Son score de 99,9 % sur ARC-AGI-3 n'a, à notre connaissance, aucune confirmation indépendante. **Claude Fable 5.2** (`claude-fable-5-2`) est sorti le **9 novembre 2026**. Anthropic le présente comme son modèle grand public le plus capable dans les domaines techniques. Il coûte **8 $ / 40 $**, a un contexte d'un million de tokens et cite explicitement la 3D et la simulation ([Anthropic](https://www.anthropic.com/claude/fable) ; [MacRumors](https://www.macrumors.com/2026/11/09/anthropic-launches-claude-fable-5-2/)). Anthropic recommande pourtant lui-même **Opus 5.5** pour le code courant et réserve Fable aux tâches longues et ambiguës.

« **Google Neon** » n'est pas un nom officiel. Il s'agit presque certainement de **Gemini 4 Neon**, annoncé le **18 novembre 2026** (certaines sources disent le 19). Dans la famille Gemini 4, Neon se place entre Hydrogen (rapide) et Carbon (raisonnement maximal) ; la famille compte aussi Argon. Il coûte **3 $ / 15 $**, offre un contexte d'un million de tokens et revendique la **première place à l'Artificial Analysis Coding Agent Index (58,6)**. Il est réservé aux abonnés AI Pro et Ultra ([9to5Google](https://9to5google.com/2026/11/18/gemini-4-neon-announcement/)). Il n'a aucun lien avec le Project Astra de Google. Attention à une collision de noms propre à votre projet : le skill `.grok/skills/neon` de votre workspace concerne la base de données **Neon Postgres**, pas Google. Un agent qui entend « Neon » ne doit pas charger ce skill.

| Nom cité | Nom exact | Éditeur, date | Vérification | Prix API (entrée / sortie, par M tokens) | Accès gratuit ? |
|---|---|---|---|---|---|
| GPT-6 Astra | GPT-6 Astra (`gpt-6-astra`), successeur GPT-6.2 Astra (17/11) | OpenAI, 3 sept. 2026 | **Confirmé** par la page officielle et la presse | 10 $ / 50 $ | **Non**. ChatGPT Free reçoit GPT-6 Luna, plus petit, mais les rapports se contredisent ([Notebookcheck](https://www.notebookcheck.net/ChatGPT-Free-and-Go-users-start-getting-GPT-6-Luna-in-Chat.1419032.0.html) vs [choosely.ai](https://choosely.ai/ai-radar/is-gpt-6-free-in-chatgpt)) |
| Fable 5.2 | Claude Fable 5.2 (`claude-fable-5-2`) | Anthropic, 9 nov. 2026 | **Confirmé** par la page officielle | 8 $ / 40 $ | **Non** selon Anthropic, qui ne liste que des offres payantes. Une source secondaire affirme le contraire ([online-tech-tips](https://www.online-tech-tips.com/anthropic-claude-fable-5-2-mythos-5-2/)) |
| « Google Neon » | Gemini 4 Neon | Google, 18 nov. 2026 | **Confirmé par la presse** ; aucune page Google primaire consultée | 3 $ / 15 $ | **Non** dans l'app Gemini ; disponibilité dans l'offre gratuite d'AI Studio inconnue |

Les classements doivent être lus avec prudence. Chaque éditeur choisit ses propres benchmarks et ses propres harnais d'évaluation : Fable 5.2 mène FrontierSWE v2 (69,9 % contre 65,5 % pour GPT-6 Astra) selon Anthropic, Astra revendique Terminal-Bench 4.0 et Neon revendique l'indice d'Artificial Analysis. Une revue académique rappelle que des harnais différents rendent ces scores non comparables ([arXiv 2610.38977](https://arxiv.org/pdf/2610.38977)). Pour votre projet Grok Build, notez aussi que **Grok 4.7** de xAI coûte 2 $ / 6 $ mais obtient 46 à l'indice d'Artificial Analysis, contre 53 pour la génération précédente de Fable et GPT-6 ([The Decoder](https://the-decoder.com/xai-launches-grok-4-7-at-bargain-prices-but-benchmarks-reveal-a-wide-gap-to-claude-and-gpt-6/)). La clé `XAI_API_KEY` de votre workspace dépense par ailleurs le quota du propriétaire de l'application.

La voie vraiment gratuite passe par les modèles open-weight et les offres gratuites, chacun avec ses limites. Sur du matériel grand public, les candidats réalistes sont **Qwen3.8-27B** (Apache-2.0, un seul GPU, 61,7 % sur SWE-bench Pro selon l'éditeur), **Gemma 4** (Apache-2.0, de E2B à 31B, multimodal donc capable de juger une capture d'écran) et **gpt-oss-120b** (Apache-2.0) ([morphllm](https://www.morphllm.com/best-open-source-llm)). On peut y ajouter **Devstral Small 2** (24B, Apache 2.0, environ 12 Go en Q4) et **Qwen3-Coder-30B-A3B** (environ 15 Go en Q4) ([digitalapplied](https://www.digitalapplied.com/blog/best-open-weight-coding-models-self-host-hardware-match-2026)). Les modèles open-weight de pointe (Kimi K3, DeepSeek-V4, GLM-5.3) pèsent de 0,5 à 2,8 billions de paramètres : ils exigent un serveur multi-GPU, et plusieurs ont des licences restrictives (Kimi K3 sous licence propre, MiniMax M3 non commercial par défaut). Côté API gratuites, OpenRouter limite ses modèles `:free` à **20 requêtes par minute et 50 par jour**, ou 1 000 par jour après un achat unique de 10 $ ([OpenRouter](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/)). Groq offre **1 000 requêtes et 200 000 tokens par jour** sur gpt-oss et Qwen3.8-27B ([plugsky](https://plugsky.com/free-llm-api)). L'offre gratuite de Google AI Studio n'affiche plus ses limites que par projet, et les contenus envoyés peuvent servir à améliorer les produits Google ([tokenmix](https://tokenmix.ai/blog/free-llm-apis-2026-every-provider-free-tier-tested)). Ces offres sont volatiles : l'offre gratuite de Cerebras aurait disparu à l'été 2026 ([gravity.fast](https://gravity.fast/data/free-llm-api-tiers/)).

À notre avis, « autonome » et « gratuit » restent en tension. Les petits modèles locaux décrochent sur les projets multi-fichiers de longue haleine, et un modèle cloud, gratuit ou bon marché, reste en pratique nécessaire pour la planification et le jugement visuel. Le meilleur investissement gratuit est donc de mettre la connaissance dans les skills, plutôt que d'espérer qu'un petit modèle la possède déjà.

## three.js r187 bascule vers WebGPU et casse les vieux réflexes

La série r180 à r187 marque un changement de centre de gravité : **environ 80 % des lignes du cœur modifiées en r187 concernent WebGPURenderer**, et TSL devient le langage de shaders d'avenir pour les deux moteurs de rendu ([sirocco18](https://sirocco18.jp/journal/en/threejs-r187.html)). Depuis r184, les matériaux TSL tournent aussi sur WebGLRenderer grâce à une couche de compatibilité, et `compileAsync()` ne bloque plus le rendu ; depuis r187, il compile les pipelines en parallèle ([utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed) ; [GitHub releases](https://github.com/mrdoob/three.js/releases)). Cette bascule casse plusieurs habitudes que les modèles reproduisent à partir de leurs données d'entraînement :

- **`PCFSoftShadowMap` est supprimé en r186.** `PCFShadowMap` est déjà doux depuis r182.
- **`Clock` est déprécié en r183** au profit de `Timer`, qui se met en pause quand l'onglet est caché.
- **`PostProcessing` devient `RenderPipeline` (r183).**
- **`rangeFog` et `viewportResolution` sont retirés de TSL (r186)**, remplacés par `fog()` et `screenSize`.
- **`CubeUVReflectionMapping` disparaît en r187**, avec la reconstruction de PMREM sur des cube render targets.
- **Depuis r187, `setViewport()` et `setScissor()` ne multiplient plus par le pixel ratio** quand un render target est lié ([utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed)).
- Les polices `examples/fonts` ne sont plus publiées sur npm depuis r185, et les builds minifiés sont supprimés depuis r186 (même source).

Les bibliothèques `postprocessing` de pmndrs et `EffectComposer` ne fonctionnent pas sous WebGPURenderer ([utsubo, guide de migration](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)). Les mélanger est l'erreur « moderne » la plus fréquente.

Le support navigateur rend WebGPU utilisable en production, avec un repli automatique sur WebGL 2. WebGPU est activé par défaut dans Chrome et Edge (y compris Android 12 et plus), dans Safari 26 (macOS et iOS, marqué « partiel » par caniuse) et dans Firefox sur Windows (141+) et Mac Apple Silicon (145+). Firefox Linux et Android ne l'ont toujours pas par défaut ([caniuse](https://caniuse.com/webgpu)). La couverture mondiale tourne autour de **87 %** ([utsubo, 100 conseils](https://www.utsubo.com/blog/threejs-best-practices-100-tips)). Les sources recommandent WebGPURenderer pour les nouveaux projets, tout en prévenant que certaines scènes y tournent plus lentement qu'en WebGL ; il faut donc profiler avant de migrer pour la seule vitesse (même source). Le skill `threejs` de votre workspace recommande au contraire WebGLRenderer par défaut. Nous jugeons cette position défendable pour vos jeux simples, pour une autre raison : la QA headless du sandbox tourne en rendu logiciel, et des utilisateurs rapportent des canvas vides avec Puppeteer et WebGPU ([forum three.js](https://discourse.threejs.org/t/what-is-the-current-state-of-headless-rendering-with-webgpu/82600)). La règle raisonnable est donc d'utiliser WebGLRenderer par défaut, et `three/webgpu` dès que le projet a besoin de compute, de TSL avancé, de la nouvelle chaîne de post-traitement ou de l'éclairage clustered. Dans ce second cas, il faut toujours tester le repli avec l'option `forceWebGL` de l'Inspector. Nous avons aussi constaté que le skill dit « three n'est pas préinstallé », alors que `three ^0.187.0` figure déjà dans le `package.json`. Sa référence `llms-full.txt` a été récupérée le **8 juillet 2026**, avant r186 et r187 : elle ne connaît ni `SunLight`, ni la suppression de `CubeUVReflectionMapping`. Il faut la remplacer par une version récente.

Pour un rendu de haut niveau, three.js couvre désormais nativement l'essentiel de la panoplie AAA en espace écran :

- SSR, SSGI et TRAA réécrit ;
- upscaling **FSR 1 et TAAU** (r184) et une grille de sondes d'irradiance `LightProbeGrid` (r184) ;
- éclairage **clustered Forward+** (r185, étendu aux spots en r187) ;
- addon **`SunLight` avec ombres en cascade** (r186) ;
- PBR à conservation d'énergie multi-diffusion (r186) et diffus rugueux EON (r187) ;
- addons **meshlet et visibility buffer** (r187), premières briques d'une géométrie virtuelle à la Nanite, encore expérimentales.

Source : [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed) et [GitHub releases](https://github.com/mrdoob/three.js/releases). Les démos qui marquent 2026 sur Codrops combinent compute TSL (tissu, particules), bloom sélectif par MRT, verre réfractif et dissolutions au bruit ([Codrops, tag WebGPU](https://tympanus.net/codrops/tag/webgpu/) ; [grille de verre liquide](https://tympanus.net/codrops/2026/09/08/building-an-infinite-liquid-glass-grid-with-three-js-webgpu-and-tsl/)). Pour les environnements photoréalistes, **Spark 2.0** de World Labs annonce le streaming de mondes de plus de 100 millions de splats gaussiens sur mobile, en WebGL2, grâce à des niveaux de détail continus ([World Labs](https://worldlabs.ai/blog/spark-2.0)). Sa documentation porte toutefois encore la mention « 2.0.0-preview » ([Spark](https://sparkjs.dev/2.0.0-preview/docs/new-spark-renderer/)).

Si vous ajoutez React Three Fiber, notez que **R3F v9 reste la version stable**. La v10 « WebGPU first » n'est qu'en alpha.6, exige three ≥ 0.185 et React 19.0 à 19.3, et drei ne la supporte pas encore ([notes de migration R3F v10](https://r3f.docs.pmnd.rs/next/migration/v10)). Votre `package.json` ne contient d'ailleurs aucun paquet `@react-three` à ce jour.

## Cent draw calls et KTX2 suffisent à tenir 60 FPS sur mobile

Les budgets de praticiens convergent pour un mobile milieu de gamme en 2026 : **environ 100 draw calls, moins de 100 000 vertices, au plus 3 lumières dynamiques, des shadow maps de 512 à 1 024 px sur 2 cascades, des textures de 2 048 px maximum et un DPR plafonné à 2** ([utsubo, 100 conseils](https://www.utsubo.com/blog/threejs-best-practices-100-tips)). La mémoire est le facteur le plus sous-estimé. Une texture PNG de 2 048² avec mipmaps occupe environ **21 Mio de VRAM**, et une 4 096² en RGBA environ 85 Mio ; KTX2 divise typiquement l'empreinte GPU par 4 à 8 (même source). Sur iOS, il faut s'attendre à un crash complet de l'onglet sans événement `device.lost`, et Safari ne documente aucun seuil mémoire ([issue o2.services](https://github.com/o2alexanderfedin/o2.services/issues/50)). Aucun budget officiel n'existe chez Apple ou Google : rester sous 100 à 150 Mo de textures sur iPhone est une marge de prudence, pas une norme. Le throttling thermique apparaît après une à deux minutes de charge soutenue, donc les tests de performance doivent durer plusieurs minutes ([arvucore](https://arvucore.com/en/blog/webgl-and-three-js-3d-web-application-development/)).

Le pipeline d'assets par défaut a changé de favori : **meshopt a remplacé Draco** pour le mobile, l'animation et les petits modèles. Son décodeur pèse environ 8 Ko gzippé, contre 100 Ko pour Draco. Il décode à environ 1 Go/s en WASM SIMD et compresse aussi les morph targets, les animations et les données d'instancing. Draco reste pertinent pour une géométrie statique lourde servie sans compression gzip ou Brotli ([compress-glb](https://compress-glb.com/blog/draco-vs-meshopt/)). `gltf-transform optimize` utilise meshopt par défaut depuis la v4.0 et plafonne les textures à 2 048 px ([CHANGELOG glTF-Transform](https://github.com/donmccurdy/glTF-Transform/blob/main/CHANGELOG.md)). Il faut toutefois continuer à produire `EXT_meshopt_compression` : son équivalent `KHR_meshopt_compression` n'est qu'en « release candidate » chez Khronos, même si three.js le lit depuis r183 ([PR Khronos #2517](https://github.com/KhronosGroup/glTF/pull/2517)). Pour les textures, la règle est **UASTC pour les normal maps et les cartes ORM, ETC1S pour le reste**. Les nouveaux formats XUASTC de Basis Universal sont encore « non standardisés » ([Basis Universal](https://github.com/BinomialLLC/basis_universal/wiki/Release-Notes)). Une contrainte concrète s'ajoute dans votre sandbox : les commandes KTX2 de glTF-Transform exigent le binaire `ktx` de KTX-Software 4.4 ou plus ([cinevva](https://app.cinevva.com/guides/optimize-glb-for-web)), et `apt` n'y fonctionne pas. La compression KTX2 se fait donc sur votre machine ; dans le sandbox, l'option `--texture-compress webp` documentée par la CLI sert de repli ([gltf-transform.dev](https://gltf-transform.dev/cli)).

Côté CPU, les leviers restent classiques et classés par rendement :

1. `InstancedMesh` peut ramener 1 000 draw calls à 1.
2. `BatchedMesh` regroupe des géométries différentes qui partagent un matériau.
3. `mergeGeometries` fusionne la géométrie statique au chargement.
4. Sur les objets statiques, `matrixAutoUpdate=false`.
5. Les LOD par simplification hors ligne s'appuient sur meshoptimizer 1.0, qui a stabilisé la simplification et ajouté `clusterlod.h` ([zeux.io](https://zeux.io/2025/12/09/meshoptimizer-v1/)).

Côté GPU, quatre réglages s'appliquent :

- le post-traitement en demi-résolution peut à peu près doubler le FPS d'une scène limitée par le fill rate ;
- dès qu'il y a du post-traitement, le MSAA natif doit céder la place à SMAA ou FXAA ;
- chaque PointLight qui projette des ombres rend 6 faces, ce qui coûte vite des centaines de draw calls ;
- `compileAsync()` doit tourner derrière l'écran de chargement pour éviter les saccades de compilation.

Source : [utsubo, 100 conseils](https://www.utsubo.com/blog/threejs-best-practices-100-tips). Pour la physique, Rapier (WASM) reste le choix par défaut. Les seules mesures navigateur disponibles le donnent légèrement plus rapide que JoltPhysics.js (25,6 ms contre 28,9 ms pour 200 rigs), mais les sources se contredisent sur la taille des bundles ([NexusMMOEngine PR #543](https://github.com/SirHertzAlot/NexusMMOEngine/pull/543) ; [cinevva](https://app.cinevva.com/tutorials/game-physics-libraries)).

Pour mesurer, l'**Inspector** intégré à three.js s'installe avec `renderer.inspector = new Inspector()`. Il fonctionne aussi sur le repli WebGL 2 et offre des panneaux performance, mémoire et timeline ([guide Makio64](https://github.com/Makio64/advanced-threejs-tsl-webgpu-rendering/blob/main/threejs-inspector-guide.md)). Le nombre de draw calls se lit dans `renderer.info.render.drawCalls` sous WebGPU et dans `render.calls` sous WebGL. En revanche, **aucun FPS mesuré en CI headless n'a de valeur** : SwiftShader est un rasteriseur CPU qui fait tomber les scènes lourdes à un chiffre ([paprika3d](https://paprika3d.com/docs/guides/run-threejs-headless-chrome-without-gpu)). Mesa llvmpipe (`--use-angle=gl`) réduit une capture de 24 s à 6 s environ ([Microlink](https://microlink.io/blog/webgl-without-a-gpu)). En CI, l'agent doit donc vérifier des métriques indépendantes du GPU : draw calls, triangles, taille des assets, erreurs console et captures d'écran.

## MCP 2026-07-28 et serveurs officiels redessinent l'outillage agentique

La révision **2026-07-28** est la plus importante depuis le lancement du protocole MCP. Elle rend le protocole **sans état** : plus de session, plus de handshake `initialize`, et un nouveau RPC obligatoire `server/discover`. Les requêtes initiées par le serveur (elicitation, sampling, roots) sont remplacées par un schéma de requêtes en plusieurs allers-retours (MRTR). Les **Tasks**, utiles pour les rendus et les builds longs, sortent du cœur et deviennent une extension officielle. Roots, Sampling, Logging et l'enregistrement dynamique de clients sont dépréciés ([changelog MCP](https://modelcontextprotocol.io/specification/2026-07-28/changelog)). Les serveurs 3D locaux (stdio ou localhost) sont peu touchés, mais les SDK sont en retard : le SDK Python 2.2.0 n'implémenterait pas encore l'extension Tasks ([TrueFoundry](https://www.truefoundry.com/blog/mcp-2026-07-28-spec-apps-tasks-governance-revisited)). Le **registre MCP officiel est toujours en « preview »** depuis septembre 2025 et compte environ 60 000 entrées. Il n'enregistre ni méthode d'authentification, ni revue de sécurité, ni disponibilité ([DEV](https://dev.to/amareswer/the-mcp-registry-by-the-numbers-38nc)). MCP, AGENTS.md et, depuis le 22 octobre 2026, les **Agent Skills (SKILL.md)** relèvent désormais de l'Agentic AI Foundation de la Linux Foundation ([Anthropic](https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation) ; [sharkly.ai](https://sharkly.ai/blog/agent-skills-agentic-ai-foundation/)). Le format de vos `.grok/skills/` est donc un standard ouvert et portable.

Trois éditeurs ont publié des serveurs **officiels** en 2026 :

- **Blender** : le **Blender Lab MCP server** (v1.0.0 en avril, GPL-3.0, Blender 5.1+, 26 outils). Sa propre documentation avertit qu'il exécute le code généré « sans aucune garde » et recommande une VM ([StraySpark](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026)).
- **Unity** : l'ancien MCP intégré à l'AI Assistant est déprécié au profit du **CLI `unity mcp`** (1.0.0 le 12 novembre 2026), gratuit et sans limite de concurrence. L'assistant intégré à l'éditeur reste payant en Personal, autour de 10 $ par mois après l'essai ([Voyager](https://voyager.so/blog/unity-mcp)).
- **Unreal** : Epic livre un plugin **Unreal MCP expérimental** dans UE 5.8, au jeu d'outils « délibérément minimal » ([3daistudio](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/unreal-mcp)).

Les serveurs communautaires restent plus riches, mais plus risqués. **mcp-for-blender** (ex-blender-mcp, MIT, environ 29 000 étoiles) exécute du Python par défaut, expose un socket sans authentification, envoie de la télémétrie par défaut et a reçu quatre CVE en 2026 ; il faut l'utiliser avec `BLENDER_MCP_SAFE_MODE=1` et `DISABLE_TELEMETRY=true` ([StraySpark](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026)). Pour Godot, Coding-Solo/godot-mcp (MIT) sert de point de départ et le toolkit NPGameDev ajoute captures d'écran et simulation d'entrées ([godotlearning](https://godotlearning.com/blog/godot-mcp-servers-compared)). Il n'existe pas de MCP dédié à three.js ; l'écosystème web se résume à des **MCP de recherche d'assets** comme threenative-asset-mcp, qui interroge Poly Haven, ambientCG et Sketchfab ([GitHub](https://github.com/ThreeNativeHQ/threenative-asset-mcp)).

Côté harnais d'agents gratuits, **OpenCode** (MIT, environ 200 000 étoiles), **Codex CLI** (Apache-2.0, sandboxé par défaut, mode `--oss` pour Ollama et LM Studio), Cline, Kilo, Goose, OpenHands et le **Grok Build CLI** (Apache-2.0, v1.0 le 7 août 2026, `base_url` configurable pour des modèles locaux) se partagent le terrain ([pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/)). Deux changements de 2026 comptent pour le gratuit. **Gemini CLI n'est plus servi aux comptes gratuits depuis le 18 juin 2026**, et Qwen Code en est le fork ouvert. **Roo Code est archivé et Aider stagne** (même source, secondaire).

Pour la vérification visuelle, Playwright MCP et Chrome DevTools MCP lisent par défaut l'arbre d'accessibilité, ce qui n'apprend rien sur un `<canvas>`. Les applications WebGL doivent donc s'appuyer sur des captures d'écran et sur la console ([mcp.directory](https://mcp.directory/blog/playwright-browser-mcp-guide-2026)). Les outils en ligne de commande comme `agent-browser` consomment moins de contexte que les schémas d'outils MCP ([huuhka.net](https://www.huuhka.net/browser-verification-for-coding-agents-chrome-devtools-mcp-vs-agent-browser/)). C'est exactement l'approche de votre workspace, avec `scripts/browser-smoke.mjs` et `agent-browser`. Unity recommande de même les appels shell plutôt que MCP quand l'agent dispose d'un terminal ([Voyager](https://voyager.so/blog/unity-mcp)).

## Les assets gratuits sont matures, mais les licences piègent l'UE

Pour transformer une image en modèle 3D, **TRELLIS.2-4B de Microsoft (MIT, GLB avec matériaux PBR, sorti en décembre 2025)** reste la meilleure option gratuite et commercialement propre. Il demande environ 24 Go de VRAM et dispose d'un Space Hugging Face gratuit ([carte du modèle](https://huggingface.co/microsoft/TRELLIS.2-4B/blob/main/README.md) ; [Vi3W](https://vi3w.in/guides/best-open-source-3d-ai-2027)). Avec moins de VRAM, TripoSG (MIT, environ 8 Go) et TripoSR (MIT, environ 6 Go) prennent le relais (même source). Le piège principal se trouve chez Tencent : **Hunyuan3D 2.1 est sous une licence communautaire qui exclut l'UE, le Royaume-Uni et la Corée du Sud** (même source). HY-World 2.0, qui exporte des mondes en mesh ou en splats ([GitHub](https://github.com/Tencent-Hunyuan/HY-World-2.0)), et HY-Motion pour l'animation relèvent de licences Tencent similaires, à vérifier une par une ([southwardtech](https://southwardtech.com/chinese-open-source-world-models/) ; [issue QtMeshEditor](https://github.com/fernandotonon/QtMeshEditor/issues/818)). Les modèles ouverts plafonnent depuis TRELLIS.2, tandis que les offres hébergées (Meshy 7, Tripo P2.0, Hunyuan 3.x) avancent mais sont payantes ou freemium ([Cinevva, chronologie](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026)).

Pour les textures, ComfyUI produit des matériaux PBR tuilables avec CHORD (Ubisoft, open source) ou StableMaterials (OpenRAIL) ([ComfyUI.org](https://comfyui.org/en/ubisoft-open-sources-the-chord-model) ; [GitHub](https://github.com/P5ina/comfyui-stable-materials)). La licence de CHORD n'a cependant pas été vérifiée. Côté modèles d'image, **Z-Image-Turbo et FLUX.2 [klein] 4B sont sous Apache 2.0**, alors que FLUX.2 [dev] et Qwen-Image-2.1 sont non commerciaux ([matrice de licences Invideo](https://invideo.io/blog/open-source-image-models-licenses/)). Pour l'audio :

- musique : **ACE-Step 1.5** (MIT, sorties utilisables commercialement) ([GitHub](https://github.com/ace-step/ACE-Step-1.5)) ;
- bruitages : Stable Audio Open, gratuit sous 1 M$ de revenus ;
- voix : **Kokoro** et **Qwen3-TTS** (Apache 2.0).

F5-TTS et XTTS-v2 sont non commerciaux, et Chatterbox a été abandonné en août 2026 ([Cekura](https://www.cekura.ai/blogs/open-source-tts) ; [Boppy](https://boppy.me/blog/best-open-source-ai-music-models)). Les bibliothèques **CC0 Poly Haven, ambientCG et Kenney** restent la base sans risque, et souvent plus fiable que la génération pour les HDRI et les matériaux réalistes ([Poly Haven](https://polyhaven.com/corporate) ; [Cinevva](https://app.cinevva.com/guides/game-assets-guide)).

Blender complète la chaîne. **Blender 5.3 est sorti le 10 novembre 2026 et 5.2 LTS est maintenu jusqu'en juillet 2028** ([Blender Developer Docs](https://developer.blender.org/docs/release_notes/)). Depuis 5.2, l'exporteur glTF écrit nativement la compression meshopt, et ses hooks peuvent interrompre un export pour valider un asset ; en revanche, rien n'a été ajouté pour KTX2 ([notes Pipeline & I/O 5.2](https://developer.blender.org/docs/release_notes/5.2/pipeline_io/)). La version 5.2 a aussi changé l'API Python des modificateurs Geometry Nodes : un agent doit cibler une seule version épinglée de Blender. Le pipeline robuste enchaîne donc quatre étapes : génération (TRELLIS.2 ou CC0), nettoyage headless dans Blender 5.2 (décimation, UV, bake), export GLB meshopt, puis gltf-transform pour KTX2. Toutes ces étapes GPU et Blender tournent **sur votre machine ou sur des Spaces Hugging Face, pas dans le sandbox Grok Build**. Pour les jeux abstraits ou géométriques, le procédural en code reste le meilleur choix, comme l'impose déjà votre `AGENTS.md`.

## Fiche opérationnelle pour l'agent

*Cette section est destinée à être copiée dans un skill (par exemple `.grok/skills/threejs/SKILL.md` ou un nouveau `.grok/skills/web3d-2026/SKILL.md`). Elle s'aligne sur le contrat du workspace (`AGENTS.md`) et ne le remplace pas.*

### A. Choix par défaut

| Sujet | Défaut | Quand dévier |
|---|---|---|
| three.js | Version épinglée **0.187.x (r187)**, ESM uniquement, imports `three` et `three/addons/...` | Ne jamais utiliser de CDN ni de build UMD ou minifié (supprimés en r186) |
| Moteur de rendu | `WebGLRenderer`, DPR = `Math.min(devicePixelRatio, 2)` | `WebGPURenderer` via `three/webgpu` (+ `three/tsl`) pour le compute, TSL avancé, `RenderPipeline`, l'éclairage clustered ou les meshlets. Alors : `await renderer.init()`, et test du repli avec `forceWebGL` |
| React | Canvas vanilla dans un composant, ou R3F **v9** + drei | R3F v10 alpha seulement pour du WebGPU-first assumé, sans drei |
| Post-traitement | WebGL : pmndrs `postprocessing`. WebGPU : `RenderPipeline` + nœuds TSL | Ne jamais mélanger pmndrs et WebGPU |
| Ombres | Une lumière directionnelle, `PCFShadowMap`, map 1 024, `shadow.autoUpdate=false` si statique | `SunLight` (CSM, 2 cascades) pour un grand extérieur |
| Assets | GLB + `EXT_meshopt_compression` + KTX2 (UASTC pour normal/ORM, ETC1S ailleurs), 1 024 px sur mobile | Draco seulement pour de la géométrie statique lourde. Procédural pour les jeux abstraits |
| Physique | Rapier (WASM), pas fixe de 1/60 s, colliders primitifs | Jolt si besoin de soft bodies |
| Splats | Spark (preview 2.0), budget d'environ 500 000 splats sur mobile | — |
| Temps | `const timer = new Timer(); timer.connect(document);` puis `timer.update()` à chaque frame | — |

### B. API three.js retirées ou renommées (ne jamais les générer)

| Ancien | Nouveau | Release |
|---|---|---|
| `PCFSoftShadowMap` | `PCFShadowMap` (déjà doux depuis r182) ou VSM ; réajuster `shadow.bias` | Supprimé en r186 |
| `new Clock()` | `new Timer()` | Déprécié en r183 |
| `PostProcessing` | `RenderPipeline` | r183 |
| TSL `rangeFog`, `viewportResolution` | `fog(...)`, `screenSize` | Supprimés en r186 |
| `CubeUVReflectionMapping` | PMREM sur cube render targets (automatique) | Supprimé en r187 |
| `WebGLCubeRenderTarget` sous WebGPU | `CubeRenderTarget` | r183 |
| `positionLocal` dans `positionNode` pour le pré-skinning | `positionGeometry` | r185 |
| `renderAsync()`, `computeAsync()` | `render()`, `compute()`, ou `setAnimationLoop` | Dépréciés en r181 |
| `Source` | `TextureSource` | r186 |
| `iridescenceThicknessRange` | `iridescenceThicknessMinimum` / `iridescenceThicknessMaximum` | Déprécié en r187 |
| `colorBufferType`, `shadowMap.color` | `outputBufferType`, `shadowMap.transmitted` | r182 / r183 |
| Viewport ou scissor multiplié à la main par le pixel ratio sur un render target | Passer des pixels réels | Changement de comportement en r187 |
| `examples/fonts` via npm | Embarquer la police dans `public/` | Retiré du paquet npm en r185 |

Deux autres changements à connaître :

- Une sous-classe d'`Object3D` qui surcharge `dispose()` doit appeler `super.dispose()` (r186).
- Le compteur de draw calls est `renderer.info.render.drawCalls` sous WebGPU et `renderer.info.render.calls` sous WebGL.

### C. Budgets mobile (milieu de gamme, 60 FPS visés, 30 FPS stables au minimum)

| Poste | Budget |
|---|---|
| Draw calls | ≤ 100 |
| Vertices | ≤ 100 000 |
| Lumières dynamiques | ≤ 3, aucune PointLight qui projette des ombres |
| Shadow maps | 512 à 1 024 px, 2 cascades maximum |
| Textures | 1 024 px par défaut, 2 048 px pour les assets hero, KTX2 ; mémoire texture totale sous environ 150 Mo sur iPhone (marge de prudence) |
| Post-traitement | Une passe (bloom en demi-résolution), SMAA ou FXAA, pas de MSAA ; tone mapping en dernier |
| DPR | ≤ 2, baisse dynamique si la frame dépasse 16,6 ms |
| Premier rendu | Scène « low » sous 1 Mo, `compileAsync()` derrière l'écran de chargement, puis streaming des assets hero |
| Robustesse | Gérer `webglcontextlost` et `device.lost`, appeler `dispose()` sur géométries, matériaux, textures et render targets |

### D. Chaîne d'outils à coût zéro (avec statut réel)

| Rôle | Outil | Coût | Licence / mise en garde |
|---|---|---|---|
| Rendu | three.js r187, Rapier, Spark | Gratuit | MIT / Apache ; Spark 2.0 en preview |
| Optimisation glTF | gltf-transform (npm), gltfpack/meshoptimizer | Gratuit | KTX2 exige le binaire `ktx` ≥ 4.4 : à lancer sur la machine locale, ou `--texture-compress webp` dans le sandbox |
| DCC | Blender 5.2 LTS (headless : `blender -b -P script.py`) | Gratuit | GPL ; épingler une version |
| Image → 3D | TRELLIS.2 (local, 24 Go, ou Space HF), TripoSG/TripoSR | Gratuit | MIT. **Hunyuan3D 2.1 et HY-World : licence Tencent qui exclut l'UE** |
| Textures | Poly Haven, ambientCG, Kenney ; Z-Image-Turbo ou FLUX.2 klein 4B + CHORD/StableMaterials | Gratuit | CC0 / Apache 2.0. FLUX.2 dev et Qwen-Image-2.1 sont non commerciaux |
| Audio | ACE-Step 1.5, Kokoro, Qwen3-TTS, Stable Audio Open | Gratuit | MIT / Apache ; Stable Audio Open sous 1 M$ de revenus ; F5-TTS et XTTS-v2 non commerciaux |
| LLM local | Qwen3.8-27B, Gemma 4 (vision), Devstral Small 2, gpt-oss | Gratuit (votre matériel) | Apache 2.0 ; GPU de 16 à 24 Go |
| LLM API gratuites | OpenRouter `:free`, Groq, Google AI Studio | Gratuit, quotas changeants | Données AI Studio réutilisables par Google ; Cerebras supprimé |
| Modèles de pointe | GPT-6 / 6.2 Astra, Claude Fable 5.2, Gemini 4 Neon, Grok 4.7 | **Payants** | Réserver la planification difficile et le jugement visuel aux cas qui le méritent |
| Harnais d'agent | OpenCode, Codex CLI `--oss`, Goose, Grok Build CLI | Gratuits (OSS) | La connexion Grok Build demande SuperGrok / X Premium+, ou une clé API |

### E. Serveurs MCP recommandés (n'activer que ceux du moment)

| Besoin | Serveur | Coût | Précautions |
|---|---|---|---|
| Vérification navigateur | Playwright MCP ou Chrome DevTools MCP. Dans ce workspace : `agent-browser` + `browser-smoke.mjs` | Gratuit | Exiger des captures d'écran : l'arbre d'accessibilité ne voit pas le canvas |
| Blender | Blender Lab MCP (5.1+) ou mcp-for-blender (3.0+) | Gratuit | Faire tourner dans une VM ; `BLENDER_MCP_SAFE_MODE=1`, `DISABLE_TELEMETRY=true` ; socket non authentifié |
| Assets CC0 | threenative-asset-mcp, vuena-assets-mcp | Gratuit | Licence par modèle sur Sketchfab ; préférer Poly Haven et ambientCG |
| Godot | Coding-Solo/godot-mcp, NPGameDev toolkit | Gratuit | Export web en WebGL 2 uniquement, et pas de C# vers le web |
| Unity 6 | `unity mcp` (CLI) | Gratuit | Préférer les commandes shell `unity ...` ; l'assistant intégré est payant |
| Unreal 5.8 | Plugin Epic expérimental | Gratuit | Pas d'export web praticable |

Règles générales : vérifier chaque serveur à la main (le registre ne fait aucune revue de sécurité), ne garder actifs que les outils nécessaires pour économiser le contexte, et ne jamais confier de secrets à un serveur.

### F. Boucle de vérification (une tâche n'est finie que si tout passe)

1. Mettre à jour `/workspace/startup.sh`, puis lancer `sh /workspace/startup.sh` (`npm run dev` sur `0.0.0.0:8080`).
2. Lancer en parallèle et en arrière-plan `npm run build` et `npm run typecheck`.
3. Lancer `node scripts/browser-smoke.mjs` et regarder les deux captures (desktop et mobile) dans une seule lecture. Le canvas ne doit être ni vide ni d'une couleur unique.
4. La console ne doit contenir aucune erreur : compilation de shader, contexte perdu, échec de module ou de MIME, hydratation.
5. Pour l'interactif, utiliser `agent-browser`. En mouvement, A doit tourner à gauche et D à droite (skill `controls`).
6. Lire les métriques indépendantes du GPU via `renderer.info` (draw calls, triangles, textures) et les comparer au tableau C. **Ne jamais conclure sur un FPS mesuré en headless** (SwiftShader).
7. Si le projet utilise WebGPURenderer, refaire un rendu avec `forceWebGL`, car le headless WebGPU peut afficher un canvas vide.
8. Lancer `npm run preview:restart`, puis refaire le smoke avec `--baseline`.
9. Faire juger la capture par un modèle multimodal en dernier recours : il repère les erreurs grossières (texture manquante, orientation fausse), pas les nuances d'éclairage.

### G. Interdits

- Ne pas confondre « Neon » (Gemini 4 Neon, Google) avec le skill `neon` (Postgres).
- Ne pas présenter Fable 5.2, Astra ou Neon comme gratuits.
- Ne pas générer d'API supprimées (tableau B), ni de CDN r128, ni d'`EffectComposer` sous WebGPU.
- Ne pas intégrer d'assets ou de modèles sous licence Tencent, non commerciale ou de « recherche » sans vérifier la licence et le territoire.
- Ne pas installer de serveur MCP non vérifié, ni exécuter de code Blender ou de moteur hors bac à sable.
- Ne pas installer de dépendance en `-D` (ignorée au déploiement Vercel), ni de module natif sans `GROK_ALLOW_INSTALL_SCRIPTS=1`.

## Conclusion

Fin 2026, la qualité d'un jeu three.js produit par une IA dépend moins du modèle choisi que de trois éléments que le modèle ne possède pas d'office : des connaissances d'API datées au release près, une boucle de preuve visuelle exécutée par l'agent lui-même, et un tri des licences avant d'importer un asset. Les modèles de pointe ont progressé ; leurs prix et leurs quotas aussi, et ils changent d'un trimestre à l'autre, comme le montrent la fin de l'offre gratuite de Gemini CLI, celle de Cerebras et le revirement de Unity sur la gratuité de son MCP. Une stratégie à coût nul doit donc rendre le modèle interchangeable et placer la valeur dans les skills versionnés, désormais un standard ouvert, et dans les scripts de vérification du workspace.

Deux actions concrètes en découlent. D'abord, remplacer la référence `llms-full.txt` du skill `threejs`, datée du 8 juillet 2026, par une version r187, et y intégrer la fiche ci-dessus. Ensuite, refaire cette veille à chaque release de three.js, environ toutes les six à huit semaines : au rythme habituel, r188 pourrait sortir d'ici fin 2026, et l'histoire récente montre que chaque release supprime au moins une API que les modèles continuent d'écrire.
