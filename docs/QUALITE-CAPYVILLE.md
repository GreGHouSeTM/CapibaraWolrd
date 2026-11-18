# Capyville : niveau de qualité visé et suivi des passages

Ce document sert de référence à chaque passage de la boucle d'amélioration.
Un critère n'est coché que s'il est **visible sur les captures** du passage (pas seulement « codé »).
La boucle s'arrête quand toutes les cases sont cochées.

## Direction artistique (décidée avec le client)

**Capyville est un village thermal japonais de montagne (onsen)** : les capybaras adorent les bains chauds.
Images de référence du rendu attendu dans `docs/references/` (ref-1 à ref-4 : onsen, pagode, place au cerisier,
torrent et ponts de bois dans la brume ; ref-5 : vue de conduite à l'aube, ref-6 et ref-7 : lac turquoise et rochers ; ref-8 : vue panoramique depuis un promontoire — cible de composition et
d'atmosphère pour les belvédères et le monde de 8 km : plans successifs de collines bleuies par la brume jusqu'à un sommet enneigé,
rivières et lacs qui serpentent, ville au loin, premier plan riche en rochers, herbes et fleurs, ciel lumineux à nuages volumétriques ;
image d'un jeu existant : inspiration d'ambiance seulement, ne rien en reproduire).
La région « Japon » garde la ville moderne, le lac au torii et le mont Fuji ; Capyville en est la version montagnarde et thermale.

## Charte visuelle commune (à respecter par tous les agents)

- **Ambiance** : aube ou fin d'après-midi dorée, brume dans les vallées, vapeur des bassins, lumière chaude des lanternes,
  rendu **le plus réaliste possible** (matières photoscannées, relief, usure, mousse, humidité).
- **Architecture** : maisons et ryokan en bois sombre patiné, enduit clair, cloisons shōji éclairées de l'intérieur,
  toits de tuiles kawara gris anthracite aux bords relevés, engawa (coursives), noren (rideaux d'entrée), lanternes de papier,
  enseignes peintes (温泉 pour la source chaude), pagode rouge à plusieurs étages sur la colline, torii, sanctuaire, puits couvert.
- **Paysage** : vallée de montagne boisée (cèdres, pins, érables rouges, cerisiers en fleurs), torrent rocheux avec petites cascades,
  ponts de bois arqués, chemins de dalles de pierre irrégulières, lanternes de pierre moussues, bambous, gros rochers couverts de mousse.
- **Palette** : bois `#5a3a24` à `#7a5236`, tuiles `#3e4247`, laque rouge `#b8342a`, papier `#f4e6c8`, mousse `#5f7a3a`,
  pierre `#8f8a80`, ciel d'aube orange-rose, ombres bleutées.
- **Échelle** : le capybara mesure ~0,55 m au garrot. Portes 1,9 m, étages 2,8 m, marches 0,18 m.
- **Lumière** : soleil rasant doré, rayons à travers la brume et les arbres, ombres douces ; nuit bleu nuit lisible
  avec flaques de lumière orangée sous chaque lanterne et fenêtres shōji lumineuses.
- **Interdits** : grandes surfaces de couleur unie sans texture, objets qui flottent ou s'enfoncent, textes en miroir,
  copier un jeu existant (personnages, logos, cartes, musiques).

## Chaîne de production des assets

- **Blender par scripts** (module Python `bpy` 5.3 installé dans le conteneur ; scripts dans `tools/blender/`) :
  bâtiments détaillés, objets sur mesure, capybara avec squelette et animations. Export glTF binaire (`.glb`) dans
  `public/assets/models/`, textures cuites (normales, occlusion) si utile. Chaque script doit être relançable et documenté.
- **Poly Haven (CC0)** : modèles photoscannés (rochers moussus, fougères, arbustes, pins, souches, herbes, fleurs, lanternes,
  tonneaux, caisses, seaux, foyer…) et textures, téléchargés via l'API (`https://api.polyhaven.com/files/<id>`), en 1k ou 2k,
  convertis en `.glb` compacts si besoin (Blender peut importer/réexporter).
- Chargement dans le jeu avec `GLTFLoader` (+ `DRACOLoader`/`KTX2Loader` si compression), instanciation des objets répétés.
- **Budget** en qualité « Moyenne » : < 700 appels de dessin et < 3 M triangles dans le village ; LOD pour les objets lourds ;
  poids total des assets du village < 80 Mo.


## Principes de production (demandés par le client)

- **Ne jamais réduire la qualité pour économiser le quota** : on économise sur la méthode (moins de tours, captures ciblées), jamais sur le résultat.
- **Diversité par générateurs** : chaque famille d'assets (bâtiments, arbres, rochers, lanternes, objets) est produite par un script
  paramétré (Blender ou code) capable de sortir de nombreuses variantes (proportions, usure, teintes, mousse, casse).
  Pas deux objets voisins identiques ; mélanger assets photoscannés et générés.
- **Minutie** : chaque zone doit être regardée de près (caméra de jeu à hauteur de capybara) et de loin ; détails aux pieds des murs,
  jonctions sol/objet, transitions de matières, usure, humidité, mousse.
- **Lumière et ombres primordiales** : une passe Lumière & ombres dédiée après l'intégration du village et de la végétation
  (ombres sur toute la vallée et des montagnes, occlusion ambiante cuite dans Blender, ombres de contact, reflets sur les dalles mouillées
  et l'eau, lumière filtrée par les feuillages), comparée aux références.

## Grille de qualité

### Terrain et level design
- [ ] Relief marqué autour du village : collines, vallon, talus, petite falaise ou butte avec point de vue
- [ ] Routes cohérentes avec le terrain : pavés dans le village, chemin de terre ou de gravier en campagne et en forêt,
      asphalte seulement sur les grands axes entre les villes ; bas-côtés, ornières, bordures d'herbe
- [ ] Ruisseau (voir `src/world/zones.ts`) avec ponts là où les routes le croisent
- [ ] Diversité des paysages autour de Capyville : prairie, bois, champs cultivés, verger, rochers
- [ ] Carte cohérente : rien ne bloque une route, chaque chemin mène quelque part, repères visibles de loin

### Architecture et décor
- [x] Au moins 5 types de bâtiments japonais distincts (ryokan à étage, bains publics, maison de thé, échoppes, sanctuaire, pagode, moulin à eau…) modélisés dans Blender
- [x] Façades en vrai relief : poteaux et poutres, cloisons shōji et grilles koshi, engawa, noren, lanternes ; shōji lumineux la nuit
- [ ] Entrées avec marches de pierre, soubassement de pierres sèches, galets ; enseignes peintes
- [ ] Toits de tuiles kawara modélisées (épaisseur, faîtage, bords relevés, chevrons visibles) ; fumée et vapeur
- [ ] Chemins de dalles irrégulières et ruelles en escaliers reliant les maisons ; place centrale avec cerisier et puits couvert
- [ ] Au moins 300 objets de décor (dont modèles Poly Haven) : lanternes de pierre et de papier, barrières de bambou, seaux et baquets en bois,
      tonneaux, caisses, étals garnis, bancs, pots de fleurs, bannières, bambous coupés, bois empilé, sandales, parapluies en papier
- [ ] Aucune grande surface plate sans détail visible depuis la caméra de jeu

### Nature
- [ ] Arbres crédibles (cèdres, pins, érables rouges, cerisiers en fleurs) : modèles Poly Haven/Blender, feuillage détaillé, pétales qui tombent
- [ ] Buissons, haies, massifs de fleurs, champs de fleurs sauvages
- [ ] Zones de hautes herbes bien visibles (terrain des ennemis)
- [ ] Torrent rocheux avec petites cascades et ponts de bois arqués ; étang avec nénuphars, roseaux et carpes koï
- [ ] Rochers moussus, souches, champignons
- [ ] Vie : papillons, oiseaux, lucioles la nuit, poissons ou grenouilles

### Lumière, rendu et effets
- [ ] La nuit : vraies lumières dynamiques autour des lanternes et fenêtres proches du joueur, scène lisible
- [ ] Fumée de cheminée, vapeur de la source chaude, poussière, pétales ou feuilles portés par le vent
- [ ] Brume matinale / rayons de soleil (god rays ou équivalent), ciel avec nuages crédibles
- [ ] Eau avec reflets, rides et écume sur les berges
- [ ] Effets de combat : impact, éclat, feuilles qui volent, petit tremblement de caméra

### Gameplay : ennemis et combat (adapté 9-12 ans, sans violence)
- [x] Ennemis cachés dans les hautes herbes (ex. « Grignoteurs », petites créatures de ronces ou insectes grincheux) qui surgissent quand on approche
- [x] Attaque (clic gauche) avec animation du capybara et zone d'impact ; combo de 2-3 coups
- [x] Esquive (clic droit ou C) : roulade avec courte invulnérabilité
- [x] Ennemis avec signal d'attaque lisible (télégraphe), recul quand ils sont touchés, et qui disparaissent en « pouf » de feuilles en laissant des pièces
- [x] Cœurs de vie dans le HUD ; à zéro, le capybara se réveille à la source chaude, sans perte
- [x] Une mini-mission de combat à Capyville

### Validation
- [ ] Captures du passage : place de jour, rue, gros plan d'une maison, prairie, nuit, combat (6 vues, qualité Moyenne)
- [ ] Aucun message d'erreur dans la console ; `npm test` et `npm run build` passent
- [ ] Mini-missions existantes toujours réussies par le test automatique

## Journal des passages

| Passage | Date | Ce qui a été fait | Critères cochés |
| --- | --- | --- | --- |
| 1 | 2026-11-18 | Bible du lead (village onsen, plan coté, zones.ts) ; combat intégré (combo, roulade, cœurs, Grignoteurs, mission de Sora). Terrain, bâtiments Blender (kit, pagode, sanctuaire, torii), Poly Haven et lumière commencés puis interrompus par la limite hebdomadaire : sauvegardés sur `wip/terrain`, `wip/batiments-blender`, `wip/polyhaven`, `wip/lumiere`. | Ennemis cachés dans les hautes herbes ; attaque et combo ; esquive ; télégraphe, recul et « pouf » ; cœurs et réveil ; mini-mission de combat |
| 2 | 2026-11-18 | Terrain de vallée (grille 0,5 m, torrent, étang, plateformes), lumière (aube dorée, brume, nuit lisible, lumières dynamiques), 88 bâtiments Blender, 97 assets Poly Haven, village onsen intégré (rues dallées, escaliers, ponts, torii, premier décor, < 1 000 appels). Restent : arbres provisoires, trop de pièces dans les rues, pas encore d'eau dans le torrent ni de fumée. | 5 types de bâtiments ; façades en relief |
