# Capyville : niveau de qualité visé et suivi des passages

Ce document sert de référence à chaque passage de la boucle d'amélioration.
Un critère n'est coché que s'il est **visible sur les captures** du passage (pas seulement « codé »).
La boucle s'arrête quand toutes les cases sont cochées.

## Charte visuelle commune (à respecter par tous les agents)

- **Ambiance** : village de conte, chaleureux, ensoleillé, inspiré des villages alsaciens/normands à colombages,
  rendu « stylisé-réaliste » : volumes simples mais **matières riches** (relief, usure, variations de teinte).
- **Palette** : enduits crème/beige/rose pâle, bois brun chaud `#6b4428`, tuiles terre cuite `#b0603a`,
  volets vert sauge `#3f7a5a` ou bleu `#3a6a9a`, pierre grise chaude `#a8a094`, herbe vert-jaune lumineux.
- **Échelle** : le capybara mesure ~0,55 m au garrot. Portes 2,1 m, étages 3,2 m, marches 0,18 m.
- **Lumière** : soleil chaud doré, ombres douces bleutées, nuit bleu nuit lisible avec flaques de lumière orangée sous chaque lanterne.
- **Interdits** : grandes surfaces de couleur unie sans texture, objets qui flottent ou s'enfoncent, textes en miroir,
  copier un jeu existant (personnages, logos, musiques).
- **Technique** : Three.js r170, WebGL2. Budget en qualité « Moyenne » : < 700 appels de dessin et < 3 M triangles dans le village.
  Fusionner les géométries statiques (`Batch` dans `src/procgen/kit.ts`) et instancier les objets répétés.
- **Textures** : PNG ou JPG dans `public/assets/tex/` (Poly Haven CC0 ou générées par script), avec carte de normales.
  Textures peintes au canvas acceptées si elles ont relief et rugosité.

## Grille de qualité

### Terrain et level design
- [ ] Relief marqué autour du village : collines, vallon, talus, petite falaise ou butte avec point de vue
- [ ] Routes cohérentes avec le terrain : pavés dans le village, chemin de terre ou de gravier en campagne et en forêt,
      asphalte seulement sur les grands axes entre les villes ; bas-côtés, ornières, bordures d'herbe
- [ ] Ruisseau (voir `src/world/zones.ts`) avec ponts là où les routes le croisent
- [ ] Diversité des paysages autour de Capyville : prairie, bois, champs cultivés, verger, rochers
- [ ] Carte cohérente : rien ne bloque une route, chaque chemin mène quelque part, repères visibles de loin

### Architecture et décor
- [ ] Au moins 5 types de bâtiments distincts (chaumière, boulangerie, auberge, grange, maison à tourelle, moulin…)
- [ ] Fenêtres en vrai relief : encadrement, appui, volets 3D, vitres réfléchissantes, rideaux éclairés la nuit
- [ ] Portes avec encadrement, marche, heurtoir ou lanterne ; soubassement en pierre
- [ ] Toits avec épaisseur, faîtage, débord avec chevrons visibles, cheminées qui fument
- [ ] Rues pavées et chemins de terre reliant toutes les maisons ; place centrale détaillée
- [ ] Au moins 300 objets de décor : barrières, puits, charrettes, tonneaux, caisses, étals de marché garnis,
      bottes de foin, cordes à linge, boîtes aux lettres, jardinières, potagers, bancs, panneaux
- [ ] Aucune grande surface plate sans détail visible depuis la caméra de jeu

### Nature
- [ ] Arbres avec feuillage en cartes de feuilles (alpha), troncs texturés, plusieurs espèces
- [ ] Buissons, haies, massifs de fleurs, champs de fleurs sauvages
- [ ] Zones de hautes herbes bien visibles (terrain des ennemis)
- [ ] Ruisseau avec ponts de pierre ou de bois ; étang avec nénuphars et roseaux
- [ ] Rochers moussus, souches, champignons
- [ ] Vie : papillons, oiseaux, lucioles la nuit, poissons ou grenouilles

### Lumière, rendu et effets
- [ ] La nuit : vraies lumières dynamiques autour des lanternes et fenêtres proches du joueur, scène lisible
- [ ] Fumée de cheminée, vapeur de la source chaude, poussière, pétales ou feuilles portés par le vent
- [ ] Brume matinale / rayons de soleil (god rays ou équivalent), ciel avec nuages crédibles
- [ ] Eau avec reflets, rides et écume sur les berges
- [ ] Effets de combat : impact, éclat, feuilles qui volent, petit tremblement de caméra

### Gameplay : ennemis et combat (adapté 9-12 ans, sans violence)
- [ ] Ennemis cachés dans les hautes herbes (ex. « Grignoteurs », petites créatures de ronces ou insectes grincheux) qui surgissent quand on approche
- [ ] Attaque (clic gauche) avec animation du capybara et zone d'impact ; combo de 2-3 coups
- [ ] Esquive (clic droit ou C) : roulade avec courte invulnérabilité
- [ ] Ennemis avec signal d'attaque lisible (télégraphe), recul quand ils sont touchés, et qui disparaissent en « pouf » de feuilles en laissant des pièces
- [ ] Cœurs de vie dans le HUD ; à zéro, le capybara se réveille à la source chaude, sans perte
- [ ] Une mini-mission de combat à Capyville

### Validation
- [ ] Captures du passage : place de jour, rue, gros plan d'une maison, prairie, nuit, combat (6 vues, qualité Moyenne)
- [ ] Aucun message d'erreur dans la console ; `npm test` et `npm run build` passent
- [ ] Mini-missions existantes toujours réussies par le test automatique

## Journal des passages

| Passage | Date | Ce qui a été fait | Critères cochés |
| --- | --- | --- | --- |
