# Bible du monde : l'Île aux Sept Sources (8 × 8 km)

Document de référence du Lead open world et level design pour la phase 1 de la feuille de route (`docs/PASSATION.md` §6).
Il s'impose à toutes les spécialités de `docs/EQUIPE.md` pour tout ce qui se trouve **hors de la vallée de Capyville**
(Capyville reste décrite par `docs/BIBLE-CAPYVILLE.md` et `src/world/zones.ts`, qui ne changent pas).

**Source de vérité chiffrée : `src/world/world-map.ts`.** Toutes les coordonnées de ce document en viennent ; en cas d'écart,
c'est `world-map.ts` qui fait foi. On n'écrit pas de coordonnées en dur dans le code : on importe `world-map.ts`.
Pour faire bouger un élément, on le demande au lead, qui modifie `world-map.ts` et ce document ensemble.

Plan : **`docs/plan-monde.svg`** (et sa capture `docs/plan-monde.png`), générés par `node tools/plan-monde.mjs [--png fichier]`.
Le script imprime aussi les contrôles (temps de parcours, croisements voie × rivière sans pont, trous dans la densité des lieux).
Le relief du plan est **schématique** : il illustre les grandes formes, ce n'est pas le terrain final (qui sort de la simulation, §4.6).

Cible ressentie (décision du client) : **se promener librement**, avoir la sensation de grandeur des grands westerns open world
(inspiration d'ambiance et de rythme seulement : aucun jeu, aucune carte, aucun lieu de jeu n'est copié). On voit une maison ou
une montagne au loin et on peut y aller, sans mur invisible, en traversant des paysages qui changent lentement.

## 0. Conventions

- Mêmes conventions que `zones.ts` : mètres, **x vers l'est**, **z vers le sud**, nord = -z, **origine = place de Capyville**.
- Le monde couvre x, z ∈ [-4000, 4000]. Cap (bearing) en degrés depuis le nord, sens horaire ; direction d'un cap b : `(sin b, -cos b)`.
- Altitudes monde : **mer = 0** (plan d'eau global). Les lacs et rivières ont leur propre altitude d'eau (`RIVERS[].y`, `LAKES[].y`),
  rendue par des rubans et plans d'eau à hauteur locale, comme le torrent de Capyville. Capyville reste à 6 m (place), son étang à 0.
- Échelle du joueur : capybara 0,55 m au garrot, œil de caméra ≈ 1,2 m. Vitesses (`SPEEDS`) : marche 4,2 m/s, **à quatre pattes 8,5 m/s**,
  nage 3,2 m/s, voiture 30 m/s en pointe (moyennes de calcul : 22 m/s sur asphalte, 14 sur gravier, 10 sur piste).
  Repère mental : **1 km ≈ 4 min de marche, 2 min à quatre pattes, 45 s en voiture**.
- Les polygones sont donnés dans le sens horaire, les polylignes d'eau d'amont en aval, les voies du départ vers l'arrivée.

## 1. Concept et histoire du monde

### 1.1 L'idée

**L'Île aux Sept Sources** est une île-continent d'environ 7,4 km d'est en ouest, posée sur quatre mers (Mer du Nord, Mer du Levant,
Mer de Jade, Mer des Glaces). Au centre, dans sa cuvette fumante, **Capyville**. Autour, six pays très différents, chacun avec sa ville,
et entre eux de vastes **terres sauvages** où l'on marche des dizaines de minutes : bocages, lacs, plaines, garrigue, dunes, rizières,
jungle, alpages, pinèdes enneigées, toundra.

Pourquoi des pays si différents sur une même île ? **La légende des Six Voyageurs**, que racontent les anciens de Capyville :

> Il y a très longtemps, six voyageurs venus de six pays lointains ont fait naufrage sur l'île, chacun sur une côte différente.
> Transis, ils ont suivi la vapeur qui montait au centre de l'île et se sont retrouvés au bord de la même source chaude, chez la famille
> de capybaras qui venait d'y fonder Capyville. Ils ont pris un bain ensemble, puis chacun est reparti vers sa côte et y a bâti une ville
> à l'image de son pays : Paris au nord, New York au levant, la ville des Sables au sud-est, la ville du Lac au pied du Fuji, la station
> du Grand Froid au sud-ouest, Londres au couchant. Les six chemins qu'ils ont tracés pour revenir au bain se croisent toujours sur la place,
> sous le Grand Cerisier.

Ce qui relie les régions, concrètement, dans le paysage :

- **Les Veines Tièdes** : sous l'île court un réseau d'eau chaude qui part de la source de Capyville. Il affleure partout en petits signes :
  la Fontaine de la Seine, la Source Tiède des Ocres, l'Onsen des Neiges, les vasques fumantes, le canal tiède des Arches des Anciens.
  L'étang aux koï de Capyville se vide par une perte qui rejoint ces veines (aucune rivière ne sort de la couronne vers l'extérieur).
- **Les Pierres-Vapeur** (`POIS`, type `pierre-vapeur`, 15 bornes) : bornes de pierre que les Voyageurs ont posées sur leurs chemins, au-dessus
  des Veines. Une Pierre-Vapeur « endormie » ne fume plus ; réveillée, elle laisse monter un filet de vapeur visible de loin.
  Chaque terre sauvage en a une à moins de 1,5 km de tout point (`POI_DENSITY.relayWithin`). Elles serviront de fil rouge (et peut-être
  de voyage rapide, voir §14).
- **Les traces des Voyageurs** : l'épave du « Voyageur » sur la lande, les Arches des Anciens (aqueduc d'eau tiède), la grotte peinte du canyon
  (capybaras voyageurs dessinés sur la paroi), la fresque de la Grotte des Voiles, les lanternes du Grand Arbre, les ex-voto de la Chapelle des Neiges.

### 1.2 Fil rouge compatible avec la suite (gameplay)

Je reste au niveau du lieu ; la bible gameplay viendra après. Le monde offre trois prises :

1. **Une vraie histoire** : la vapeur faiblit. Les Pierres-Vapeur se sont endormies une à une, la source de Capyville tiédit. Il faut parcourir
   l'île, retrouver les traces des Six Voyageurs dans chaque pays et réveiller les bornes. Chaque pays a son lieu de mémoire du Voyageur
   (épave, phare, château de l'île, grotte peinte, temple du Gardien, chapelle des Neiges) : ce sont les fins de chapitre naturelles.
2. **Les Squishy dumplings** (collectionnables du client, `docs/PASSATION.md` §6) : dans la légende, ce sont de petits esprits de vapeur
   nés dans les paniers de manjū de Capyville, qui ont suivi les Voyageurs et se cachent dans les terres sauvages. Leur matière dit leur
   rareté et leur pays d'origine (pastel des prés, nacré des lacs, pailleté des neiges, arc-en-ciel des Mille Voiles, doré de la Citadelle…).
   Le monde leur réserve des cachettes par règles (§8.3) : creux des grands arbres, derrière les cascades, au fond des grottes, sous les ponts.
3. **Les balades** (`BALADES`) : treize promenades composées qui suivent le rythme **découverte → point de vue → récompense** (§8.4).

### 1.3 Ton

Doux et merveilleux, jamais menaçant ; aventure et dépaysement à chaque col. Chaque pays a son ambiance sonore et lumineuse (§5),
et chaque passage d'un pays à l'autre est une **révélation progressive** : on monte, on passe un col ou une crête, le pays suivant s'ouvre.

## 2. Plan coté

### 2.1 L'île

- Trait de côte : `COASTLINE` (≈ 70 points, bruit de 20 à 40 m ajouté par le Terrain sauf sur les falaises). La mer occupe la marge :
  au moins 250 m au nord, 300 à 500 m ailleurs, plus les coins du carré.
- Natures du rivage : `COAST_SEGMENTS` (falaises blanches au nord, quais de New York, falaises de grès à l'est, falaise des dunes, mangrove
  de la jungle, falaises noires du Fuji, Côte des Embruns, Baie Gelée, fjord, estuaire de la Tamise). Ailleurs : plage de sable ou de galets.
- Îles (`ISLANDS`) : Île de la Statue (baie de New York), Île aux Tortues (au large de la jungle), Rocher du Torii (Japon), Écueil du Phare,
  Iceberg de l'Arche. Toutes atteignables à la nage (≤ 400 m) ou en barque.
- **Limite du monde** : la mer. Au-delà de 400 m du rivage, la houle grossit et un courant ramène doucement le nageur vers la plage la plus
  proche (le capybara se fatigue, un message l'explique) ; les bateaux font demi-tour au bord du brouillard marin. Aucun mur invisible
  à terre : tout ce qui se voit s'atteint, seules les falaises désignées (§4.3) ne se gravissent pas.

### 2.2 Les sept régions (`WORLD_REGIONS`)

Les caps restent ceux des cols de Capyville (`COLS` de `zones.ts`) : la porte de chaque région est bien la sortie du col correspondant.

| Région | Centre (x, z) | Cap | Distance | Cœur bâti | Influence | Sol | Site |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Capyville | (0, 0) | — | — | 110 | 520 | 6 | vallée en cuvette, couronne de sept sommets (zones.ts) |
| Paris | (-150, -2650) | 357° | 2,65 km | 520 | 950 | 11 | méandre de la Seine, île de la Cité, butte aux moulins au nord, coteaux au sud |
| New York | (2350, -1450) | 58° | 2,76 km | 560 | 950 | 8 | presqu'île rocheuse entre la Rivière des Érables et la baie, quais, grand parc sur un affleurement de granit |
| Le Désert des Dunes | (2300, 1350) | 120° | 2,67 km | 220 | 1150 | 38 | oasis dans une cuvette de l'erg, ksar, palmeraie ; pyramides au bord du chott |
| Le Japon | (-800, 2380) | 199° | 2,51 km | 430 | 950 | 8 | ville au bord du Lac du Torii, au pied nord-ouest du mont Fuji |
| Le Pôle Nord | (-2650, 2150) | 231° | 3,41 km | 220 | 950 | 4 | station polaire au fond de la Baie Gelée, toundra et Lac de l'Aurore au-dessus |
| Londres | (-2400, -1350) | 299° | 2,75 km | 520 | 950 | 12 | boucles de la Tamise avant l'estuaire, docks à l'ouest |

Le **Pays du Givre** (zone du Pôle) commence bien avant la station : son entrée est le **village alpin des Clarines** (-1450, 900), à 1,7 km de
Capyville, à 170 m d'altitude. La **jungle** fait partie du **Pays du Levant** (zone Asie) : elle occupe les vallées au sud-est du Fuji,
entre la ville du Japon et le Désert.

### 2.3 Macro-zones (`MACRO_ZONES`)

| Zone | Régions | Biomes | Ambiance |
| --- | --- | --- | --- |
| Pays de la Couronne | Capyville | couronne | vapeur, cèdres, cloches de temple |
| Vallée de la Seine | Paris | bocage de la Seine, lande et falaises | peupliers, clochers, moulins, brume sur l'eau |
| Pays d'Albion | Londres | bocage d'Albion, côte des fjords | murets, moutons, pluie fine et arcs-en-ciel |
| Pays des Lacs et des Plaines | New York | érables et lacs, grandes plaines | érables flamboyants, lacs, granges rouges, canyon |
| Pays des Ocres | Désert | garrigue, savane, dunes | cigales, ocres, lumière blanche, ciel immense |
| Pays du Levant | Japon | rizières, forêts du Levant, Fuji, jungle | rizières miroir, bambous, jungle de brume |
| Pays du Givre | Pôle Nord | forêt des Mousses, alpages, haute montagne, pinèdes enneigées, toundra, banquise | clarines, chalets, neige dorée, silence, aurores |

Pourquoi les climats sont là où ils sont (l'enfant n'a pas besoin de le savoir, mais tout doit rester cohérent pour les spécialités) :
le **froid** vient de l'altitude du Massif du Givre et de la Mer des Glaces au sud-ouest ; la **jungle** reçoit les nuages chauds de la
Mer de Jade, arrêtés par les Monts de Jade ; derrière ces monts, à l'abri de la pluie, la **garrigue puis les dunes** ; au nord et à
l'ouest, le climat océanique doux des **bocages** ; au nord-est, les **lacs** laissés par d'anciens glaciers.

### 2.4 Villages et hameaux (`SETTLEMENTS`)

| id | Nom | Type | (x, z) | y | Style | Maisons |
| --- | --- | --- | --- | --- | --- | --- |
| clarines | **Les Clarines** | village | (-1450, 900) | 170 | chalets alpins (ref-9 à ref-11) | 34 |
| gue-aux-saules | Le Gué-aux-Saules | hameau | (-450, -1500) | 14 | colombages | 9 |
| hameau-du-cap | Hameau du Cap | hameau | (-1550, -3330) | 48 | pierre et chaume | 7 |
| hameau-chaumes | Hameau des Chaumes | hameau | (-1750, -1150) | 34 | pierre et chaume | 10 |
| port-aux-huards | Port-aux-Huards | port | (860, -2050) | 47 | planches peintes | 8 |
| ferme-erables | Ferme des Érables | ferme | (1050, -1050) | 42 | grange rouge | 4 |
| ranch-dormeur | Ranch du Dormeur | ferme | (2100, -520) | 150 | ranch | 5 |
| bastide-cigales | Bastide des Cigales | hameau | (760, 620) | 58 | mas provençal | 8 |
| caravanserail | Caravansérail des Ocres | hameau | (1900, 950) | 46 | ksar | 6 |
| hameau-rizieres | Hameau des Rizières | hameau | (-300, 1250) | 7 | minka | 9 |
| village-pilotis | Village sur pilotis | village | (1250, 3150) | 35 | pilotis de bambou | 16 |
| onsen-neiges | Onsen des Neiges | hameau | (-1700, 2420) | 60 | minka | 3 |
| campement-rennes | Campement des Rennes | campement | (-2250, 1750) | 150 | yourtes | 5 |
| port-aux-phoques | Port-aux-Phoques | port | (-3480, 440) | 6 | maisons de pêcheurs | 9 |

### 2.5 Les terres sauvages, secteur par secteur

Les distances sont comptées depuis la sortie du col de Capyville (fin de `COL_ROUTES` dans `valley.ts`).

- **Nord — Vallée de la Seine** (x -1100 à 450, z -500 à -3450). La Seine naît à la Fontaine de la Seine (-250, -620), une résurgence au pied
  du Pic du Corbeau, et descend paresseusement vers Paris entre haies, pommiers, peupliers et champs de blé. Les Monts Fauves la bordent à l'est.
  Au nord de Paris : la lande et les Falaises Blanches, le Phare du Cap Blanc.
- **Nord-ouest — Pays d'Albion** (x -1000 à -3550, z -400 à -2950). Collines rondes à murets et moutons, la Tamise qui descend du Massif du Givre,
  le Grand Arbre sur sa butte, le Hameau des Chaumes, le Manoir aux Roses. À l'ouest : la Côte des Fjords.
- **Nord-est — Pays des Lacs** (x 150 à 3400, z -300 à -3700). Forêt d'érables flamboyants et de bouleaux sur granit poli, le Grand Lac
  et son château en ruine, le Dôme du Guetteur, le Lac du Huard, la Rivière des Érables et ses chutes, la baie de New York.
- **Est — Grandes Plaines** (x 500 à 3650, z -1050 à 650). Le Dormeur (colline-capybara), puis le Plateau des Hautes Plaines (110-170 m)
  entaillé par le Canyon Rouge, ranchs, viaduc, cheminées de fée, falaises de grès sur la mer.
- **Sud-est — Pays des Ocres** (x 330 à 3700, z 80 à 2400). Garrigue et badlands ocre avec mesas (la Citadelle des Ocres), puis l'erg :
  dunes linéaires, oasis, chott blanc, pyramides, falaise des dunes sur la mer.
- **Sud-sud-est — Monts de Jade et jungle** (x 850 à 3350, z 1500 à 3750). La crête des Monts de Jade (240-420 m) sépare la savane sèche
  au nord de la jungle de brume au sud : Chute des Mille Voiles, arbres géants, temple du Gardien, village sur pilotis, mangrove.
- **Sud — Pays du Levant** (x -1350 à 800, z 400 à 3750). La plaine des Rizières (5-12 m) entre Capyville et la ville du Japon, le Lac du Torii,
  puis le mont Fuji (620 m) qui plonge dans la Mer de Jade par les Falaises Noires. Forêts de cèdres, de cyprès et de bambous sur les pentes.
- **Sud-ouest — Pays du Givre** (x -400 à -3600, z -300 à 3250). Forêt des Mousses, vallée des Clarines, Massif du Givre (Pic de l'Aurore 950 m,
  Mont des Neiges, Dent du Loup, glacier jusqu'au fjord), Crêtes Blanches, Col des Aurores, toundra, Lac de l'Aurore gelé, Baie Gelée.

## 3. Grands repères et lignes de vue

### 3.1 Repères (`WORLD_LANDMARKS`)

Un grand repère est une forme qu'on reconnaît **de loin et sans hésiter** (silhouette, couleur, mouvement ou lumière), qui dit où l'on est
et donne envie d'y aller. Règle : depuis tout point dégagé des terres sauvages, **au moins deux grands repères** sont visibles.

| Repère | (x, z) | Sommet | Vu à | Rôle |
| --- | --- | --- | --- | --- |
| **Pic de l'Aurore** | (-2300, 450) | 950 | 8 km | point culminant, pyramide neigeuse à glacier ; pointe au-dessus du Mont Kuma depuis la place (cap ≈ 260°) |
| **Mont Fuji** | (305, 2899) | 620 | 7 km | volcan endormi enneigé, axe de la Grand-Rue de Capyville (cap 174°) |
| **Chute des Mille Voiles** | (1615, 2225) | 380 (brume) | 3,5 km | cascade géante de 82 m, colonne de brume blanche sur la jungle |
| **Le Grand Arbre** | (-1300, -1550) | 200 | 4 km | camphrier de 70 m sur une butte de 130 m, lanternes des Voyageurs la nuit |
| **Phare du Cap Blanc** | (-1700, -3550) | 95 | 5 km | tour blanche et rouge, faisceau tournant la nuit |
| **Le Dormeur** | (1300, 100) | 330 | 5 km | colline en forme de capybara endormi (tête au nord, deux rochers-oreilles) |
| **Citadelle des Ocres** | (1400, 750) | 235 | 4 km | remparts et tour en ruine sur une mesa |
| **Viaduc du Canyon Rouge** | (2520, -230) | 160 | 3 km | chevalets de bois et d'acier sur le ciel du plateau |
| **Château de l'Île** | (1200, -1980) | 85 | 3 km | donjon en ruine sur l'île du Grand Lac |
| **Dôme du Guetteur** | (1450, -1200) | 300 | 4 km | dôme de granit clair au-dessus des érables |
| **Dent du Loup** | (-2050, 200) | 680 | 6 km | aiguille sombre à côté du Pic |
| **Clocher des Clarines** | (-1450, 900) | 205 | 2,5 km | clocher à bulbe, vu du col du Pôle |
| **Vapeur de l'Onsen des Neiges** | (-1700, 2420) | 110 | 2 km | colonne de vapeur dans la neige |
| Tour Eiffel, gratte-ciel de New York, Tour de l'Horloge, pyramides, torii du lac, station polaire | dans les villes | 16 à 140 | 1,5 à 5 km | silhouettes des villes (maillages de silhouette toujours chargés, §11) |

Altitudes : les sommets sont des cibles à ±5 % ; la forme compte plus que le chiffre (le Dormeur doit se **lire** comme un capybara de profil,
la Dent du Loup comme une dent, le Fuji comme un cône concave parfait).

### 3.2 Lignes de vue à garantir (`SIGHT_LINES`)

Le Terrain et la Végétation vérifient (par lancer de rayons sur la carte de hauteur, avec la canopée) qu'aucun relief ni arbre ne les bouche :

1. **Place de Capyville → mont Fuji**, cap 174°, sommet à ≈ 12° au-dessus de l'horizon, rien entre le Grand Torii et le cône (déjà exigé par la bible de Capyville).
2. **Place → Pic de l'Aurore**, cap ≈ 260° : la pointe enneigée dépasse l'épaule du Mont Kuma de 3 à 6° (une promesse lointaine dès le départ).
   Si le relief ne le permet pas, on abaisse l'épaule de Kuma côté sud de 10 m au plus, jamais la couronne entière.
3. **Belvédère de Capyville (176, -168) → le Dormeur**, cap ≈ 96° : profil complet au-dessus des érables.
4. **Col du Pôle → clocher des Clarines** (cap 238°) avec le Pic de l'Aurore 24° plus à droite.
5. **Col de Paris → tour Eiffel** au bout de la vallée de la Seine, dans la brume.
6. **Grand Arbre → phare** : faisceau visible la nuit au-dessus de la lande.
7. **Citadelle → pyramides**, au-delà des dunes. 8. **Dôme du Guetteur → gratte-ciel de New York.**
9. **Promontoire des Lucioles → Fuji** : composition de ref-8 (ville et lac au tiers, Fuji au centre, plaine au premier plan).
10. **Toute la Route des Rizières → Fuji** : le Fuji ne sort jamais du champ en conduisant vers le sud.

Règle des cols : **chaque col est une révélation**. On monte sans voir, on passe le seuil, le pays suivant s'ouvre d'un coup sous les pieds
(vallée de la Seine, Grand Lac, Baie Gelée, jungle, glacier). La couronne de Capyville garde son rôle : depuis le village, aucune ville n'est visible.

### 3.3 Vues composées (`WORLD_VIEWPOINTS`)

Dix-neuf vues, chacune avec position, cap, heure et référence ; ce sont à la fois des cibles de composition (le terrain, la végétation et
la lumière sont réglés pour elles) et les captures de revue (§13). La plus importante :

**Promontoire des Lucioles** (300, 520), y 70, cap 195°, 7 h 30 — **cible ref-8** : premier plan de rochers, d'herbes et de fleurs ;
la plaine des Rizières qui brille ; les méandres du Kawa ; la ville du Japon et son lac au tiers gauche (cap 211°) ; le mont Fuji enneigé
au centre (cap 180°) ; derrière, les plans de collines bleuies par la brume. Un pin solitaire, un banc et une longue-vue marquent le lieu.

Les autres : révélation de la Seine (col de Paris), col du Pôle (ref-10), fontaine des Clarines (ref-9), pinède dorée (ref-12), aurore sur le lac
(ref-15, 23 h), forêt des Mousses (ref-13, 7 h 15), pied des Mille Voiles (ref-16), vallée de Jade (ref-17), Ruisseau Clair (ref-18),
temple du Gardien sous la pluie (ref-14), nuit sous le Grand Arbre, remparts de la Citadelle au couchant, Dôme du Guetteur, viaduc du canyon,
sommet du Pic de l'Aurore et cratère du Fuji (panoramas totaux de l'île), galerie du phare, volant sur la digue des rizières à l'aube (ref-5).

## 4. Relief à grande échelle

### 4.1 Principe

Le client a jugé les montagnes actuelles **trop abruptes et trop lisses** (`docs/RETOURS-CLIENT.md` §2). La règle devient :
**grandes formes posées à la main, modelé simulé, pentes praticables partout sauf aux falaises désignées**.
L'île a trois étages :

1. **Basses terres** (0 à 60 m) : plaines de la Seine, des Rizières, bocages, littoral, oasis. On y voit loin, on y roule.
2. **Collines et plateaux** (40 à 250 m) : Pays des Lacs, garrigue, Hautes Plaines, Monts Fauves, Collines du Couchant, piémont, toundra.
3. **Montagnes** (250 à 950 m) : Massif du Givre et Crêtes Blanches, Monts de Jade, mont Fuji, plus les buttes et dômes isolés.

### 4.2 Chaînes, sommets et cols

Chaînes (`CHAINS`, crête en (x, z, altitude) et demi-largeur de base) :

| Chaîne | Crête (de → à) | Altitudes | Demi-base | Profil | Versant raide |
| --- | --- | --- | --- | --- | --- |
| Massif du Givre | (-1500, -300) → (-2300, 450) → (-2550, 1550) | 220 → **950** → 420 | 800 | alpin | ouest (glacier, fjord) |
| Crêtes Blanches | (-2550, 1550) → (-1200, 1800) | 420 → 520 → 260 | 450 | alpin | nord |
| Monts de Jade | (900, 1500) → (1500, 1700) → (3150, 2800) | 240 → 420 → 200 | 600 | arrondi | sud |
| Monts Fauves | (450, -900) → (650, -1450) → (500, -3150) | 170 → 260 → 130 | 520 | arrondi | — |
| Collines du Couchant | (-900, -1100) → (-1300, -1550) → (-2300, -2700) | 90 → 130 → 100 | 450 | colline | — |

Sommets (`WORLD_PEAKS`) : Pic de l'Aurore 950 (alpin, neige au-dessus de 600), Mont des Neiges 820 (dôme neigeux), Dent du Loup 680 (aiguille),
**mont Fuji 620** (volcan, base 1 200 m, cône concave : 8-15° en bas, 30-34° en haut, cratère de 120 m, neige au-dessus de 430), Crêtes Blanches 520,
Pic de Jade 420, **le Dormeur 330** (forme imposée : corps elliptique 660 × 1 040 m à 280 m, tête au nord à 330 m, deux rochers-oreilles de 8 m,
museau arrondi vers le nord-nord-est), Dôme du Guetteur 300 (granit poli, 25-32°), Mont Fauve 260, Mesa de la Citadelle 210 (table de 120 m de rayon,
falaises de 30 m, une rampe), Mesa Ocre 190, Mesa Rouge 170, Butte du Grand Arbre 130.

Cols (`WORLD_COLS`) : Col des Aurores (-2350, 1450) 330 m ; Brèche du Loup (-1900, 30) 400 m (sentier) ; Col de Jade (1850, 1880) 290 m ;
Col des Fauves (700, -2300) 95 m ; Seuil du Grand Arbre (-1550, -1930) 80 m ; Seuil des Cèdres (-1250, -680) 38 m.
Chaque col a un fond praticable de la largeur indiquée, une pente d'approche ≤ 12 % pour les sentiers et ≤ 8 % pour les routes (lacets),
un cairn ou une Pierre-Vapeur, et un point de vue vers le pays suivant.

### 4.3 Règles de pente (`TERRAIN_RULES.slope`)

| Pente | Ce que fait le capybara | Où | Part maximale |
| --- | --- | --- | --- |
| 0 à 15° | marche et court normalement | basses terres, plateaux, fonds de vallée, routes | — |
| 15 à 33° | marche plus lentement (−20 à −40 %), sprint possible | collines, versants boisés, flancs du Fuji, dunes | la majorité des versants |
| 33 à 42° | **grimpe** lentement à quatre pattes | éboulis, hauts de versants, cônes | ≤ 4 % de chaque tuile hors falaises (`steepShareMax`) |
| > 42° | glisse et redescend | rare, toujours en roche | — |
| > 55° | falaise : ne se gravit pas | **seulement** dans `CLIFF_ZONES` et les `COAST_SEGMENTS` falaise | — |

- Une falaise est toujours **lisible** : roche franche, plus de 8 m de haut, couleur et texture différentes du versant, éboulis au pied,
  et un **contournement visible** à moins de 300 m (ravine, vire, rampe, sentier en lacets).
- Falaises intérieures voulues : parois du Canyon Rouge (80 m, deux descentes balisées et des vires), face nord de la Dent du Loup (120 m),
  rebord des Mille Voiles (80 m), couronne de la Citadelle (30 m, rampe au sud-ouest), verrou des Clarines (50 m), Rebord des Hautes Plaines
  (30-50 m, ravines praticables tous les 300 à 500 m).
- Routes ≤ 8 %, sentiers ≤ 18 % (marches de pierre ou de rondins au-delà), sentiers de bêtes ≤ 30° (lacets automatiques au-delà de 18 %).

### 4.4 Modelé (ce qui manquait)

On doit voir le relief **à toutes les échelles** (du kilomètre au demi-mètre) :

- **Érosion hydraulique** : ravines rayonnantes sur les versants, éperons entre elles, vallons qui s'élargissent vers l'aval,
  **cônes de déjection** au débouché des ravines, plaines alluviales à terrasses le long des rivières (3 à 6 m au-dessus de l'eau).
- **Érosion thermique** : talus d'éboulis au pied des parois (34° en roche, 30° en terre), sommets arrondis sur les vieilles montagnes (Fauves, Couchant).
- **Replats naturels** (`benches`) : un replat de 6 à 20 m de large tous les 25 à 45 m de dénivelé sur les versants de plus de 15° :
  ce sont les haltes, les emplacements de cabanes, de belvédères et de sentiers. Ils cassent l'impression de pente uniforme.
- **Formes glaciaires** au Givre et au Pays des Lacs : vallées en U (Clarines), verrous et gradins, roches moutonnées, lacs dans les cuvettes,
  moraines boisées, blocs erratiques, eskers.
- **Formes propres à chaque pays** : badlands ravinés et mesas (garrigue), dunes linéaires à crête vive côté est (erg, longueur d'onde 150 m,
  amplitude jusqu'à 70 m) et barkhanes en bordure, karst à tours (pitons de 40 à 80 m) et vasques (jungle), barrancos et coulées de lave (Fuji),
  palses et mares en chapelet (toundra), valleuses suspendues qui descendent à la plage (lande).
- **Microrelief** (0,3 à 1,5 m, longueurs d'onde 3 à 12 m) : bosses, rigoles, racines, affleurements, visibles à hauteur de capybara.
- **Rochers** : affleurements sur toute pente > 28°, rochers photoscannés (Poly Haven) posés en grappes dans les éboulis, les lits et les crêtes.

### 4.5 Fonds de relief (`RELIEF_ZONES`)

Chaque zone donne une altitude de base (du bord vers le cœur), une amplitude, une rugosité et ses motifs : Plaine de la Seine (10-30 m),
Collines d'Albion (8-80), Lande des Falaises (45-75, plateau incliné coupé net par la mer), Pays des Lacs (35-110, glaciaire),
Plateau des Hautes Plaines (110-170, table), Basses terres du Dormeur (20-70), Collines des Ocres (35-110, badlands),
Erg des Dunes (35-70 + dunes), Plateau de Jade (215-250, suspendu), Vallées de Jade (0-160, vallées en V et karst), mont Fuji,
Plaine des Rizières (5-12, très plate avec buttes de 15 à 40 m), Piémont du Givre (20-260), Vallée des Clarines (120-260, en U),
Toundra de l'Aurore (10-160), Côte des Fjords (10-140). Les bords des zones se fondent sur 500 m.

Raccord avec Capyville : la couronne (`PEAKS`, `COLS` de `zones.ts`) n'est pas modifiée. À l'extérieur de la couronne, le terrain descend
vers 8 à 15 m aux sorties des cols (altitudes de fin des `COL_ROUTES`), puis rejoint les fonds de relief ci-dessus.

### 4.6 Production du relief (procédural dirigé, précalculé hors ligne)

1. **Formes dirigées** (ce fichier) : côte, fonds de relief, chaînes, sommets aux formes imposées, cols, plats des villes et villages,
   rubans des routes, lits des rivières principales tracés à la main.
2. **Simulation hors ligne** par notre propre script (Python/numpy ou Node, relançable, documenté) : bruit par zone, puis
   **érosion hydraulique par gouttes** (`TERRAIN_RULES.hydraulic` : 2,4 millions de gouttes sur la grille de 4 m, puis passe à 2 m près des chemins)
   et **érosion thermique** (`thermal`), replats, microrelief. Les rivières principales restent sur leur tracé (lit imposé), les **affluents
   naissent de la simulation** (accumulation d'écoulement), les lacs se forment dans les cuvettes fermées.
3. **Exports** : tuiles de hauteur **16 bits** de 256 m au pas de 2 m (`bakeCell`, `tileSize`), et **cartes dérivées** par tuile :
   pente, écoulement accumulé, humidité, dépôts (sédiments, éboulis), exposition au soleil, limite des neiges. Ce sont elles qui pilotent
   les biomes au mètre près, la végétation, les rochers, les matières du sol et les affluents (§5.4).
4. **Aplanissements** imposés après la simulation : villes (raccord 120 m), villages (40 m), routes (bande + 6 m de talus), parvis des points d'intérêt (8 m).
5. **Contrôles automatiques** : pente par tuile (part > 35° ≤ 4 %), lignes de vue (§3.2), altitudes de contrôle (sommets, cols, villes, sorties de cols),
   continuité des routes (pente ≤ 8 %), absence de cuvette fermée non voulue.

## 5. Biomes et transitions progressives

### 5.1 Biomes (`BIOMES`)

Les polygones de `BIOMES` sont empilés dans l'ordre de la liste et **fondus sur leur largeur de transition** (300 à 600 m, centrée sur le bord).
À l'intérieur, le biome est affiné par les cartes dérivées (pente, altitude, humidité, exposition) : un biome n'est jamais une tache uniforme.

| Biome | Sol | Essences et plantes | Hameaux | Brume | Sons |
| --- | --- | --- | --- | --- | --- |
| Prés et bosquets (fond) | herbe moyenne, trèfle | chênes, châtaigniers, bosquets | — | légère | alouettes |
| Bocage de la Seine | prés, blé, colza, chemins blancs | haies (aubépine, noisetier), peupliers, saules têtards, pommiers | colombages, ardoise, clochers pointus, lavoirs, moulins | matins sur l'eau | cloches, coqs, moulin |
| Bocage d'Albion | prés pâturés, murets, chemins creux | haies sur talus, chênes, frênes, digitales, fougère aigle | cottages de pierre à chaume, ponts à dos d'âne | moyenne | moutons, merles, pluie fine |
| Lande et falaises | bruyère, ajoncs, craie | aubépines couchées | maisons de pêcheurs, phare, pierres levées | vent | goélands, ressac |
| Érables et lacs | feuilles rouges et or, granit moussu | érables à sucre, bouleaux, pins blancs, sapins | planches peintes, granges rouges, cabanes à sucre, ponts couverts | lacs au matin | huards, pics |
| Grandes Plaines | herbe blonde, armoise, terre rouge | prairie, peupliers deltoïdes, armoise | ranchs, corrals, éoliennes | faible | vent, sauterelles |
| Garrigue des Ocres | cailloux blancs, terre ocre, thym | chênes verts, pins d'Alep, oliviers, cyprès, lavande | mas aux volets bleus, bories, fontaines | faible | **cigales** |
| Savane sèche | herbe jaune, latérite | acacias en parasol, baobabs | greniers ronds | brume de chaleur | tisserands |
| Erg des Dunes | sable doré à rides, reg, sel | tamaris, palmiers à l'oasis | ksar, tentes, caravansérail | très faible | vent sur les crêtes, grelots |
| Forêts du Levant | mousse, aiguilles, pas japonais | sugi, hinoki, bambous, érables momiji, pins rouges | minka, sanctuaires, jizō | pentes | bambous, cloche |
| Plaine des Rizières | eau miroir, diguettes | riz, lotus, saules, bambous sur les buttes | minka sur buttes, séchoirs, moulins | basse à l'aube | grenouilles, hérons |
| Pentes du mont Fuji | cendre, scories, lave, neige | pins rouges, mélèzes, buissons nains | refuges, torii de bois brut | chapeau de nuage | clochettes |
| Jungle de Jade | humus, racines, mousse, eau claire | arbres géants à contreforts (60 m), figuiers étrangleurs, lianes et mousses pendantes, fougères arborescentes, bananiers | pilotis de bambou, temples moussus | **permanente** | oiseaux, gouttes, cascades |
| Forêt des Mousses | **tapis de mousse** (ref-13), blocs | épicéas et sapins élancés, hêtres, myrtilles | scieries, chapelles de bois | rayons | torrents, pics |
| Côte des Fjords | bruyère sur granite, tourbières | pins tordus, bouleaux nains | maisons de bois rouges | basse | mouettes, glacier |
| Alpages des Clarines | prés fleuris, pierres claires | mélèzes, arolles | chalets fleuris, greniers sur pilotis | faible | **clarines**, marmottes |
| Haute montagne | éboulis, névés, glacier | coussins de fleurs | refuge | faible | vent |
| Pinèdes enneigées | neige poudreuse, herbes rousses (ref-12) | pins à troncs orangés, épicéas chargés, bouleaux | cabanes de rondins | dorée | neige qui tombe des branches |
| Toundra de l'Aurore | neige par plaques, lichens, mares gelées | bouleaux nains, linaigrettes | yourtes, observatoire | sèche | rennes, glace |
| Banquise | glace blanche et bleue, crêtes de pression | — | station polaire | poudrerie | glace qui chante, phoques |
| Forêts de la Couronne | voir bible de Capyville §6 | cèdres, érables, pins, bambous | Capyville | vallée | torrent, cloche |

Neige : limite de base 650 m, abaissée dans le Pays du Givre (`snow.base - snow.drop × influence arctique`) : vers 540 m aux Clarines
(le village reste vert et fleuri), 260 m au Col des Aurores, sous 100 m dans la toundra, partout au Pôle. Sommets enneigés à part (Fuji 430 m).

### 5.2 Règles de transition

Le client trouve les passages trop brutaux (`RETOURS-CLIENT.md` §3). Règles :

1. **Bandes de 300 à 800 m** (`TRANSITIONS`) : chaque passage d'une région à sa voisine traverse 3 à 6 bandes successives.
2. **Tout change, mais pas au même endroit** : le relief change d'abord (on monte, une crête), puis les essences (mélange en proportions
   qui glissent sur 300 m, jamais une ligne d'arbres nets), puis le sol (deux matières mélangées par hauteur et par bruit), puis l'architecture
   (hameau de transition qui mélange deux styles), puis la brume et l'étalonnage (fondu sur 500 m), puis les sons (fondu sur 300 m).
   Ainsi aucune frontière n'est visible.
3. **Un seuil naturel** porte le changement le plus fort : col, crête, rivière, lisière, rebord de plateau. Le joueur sent qu'il entre ailleurs.
4. **Des avant-postes** : quelques éléments du pays suivant apparaissent 300 à 500 m avant lui (un premier palmier, un premier sapin enneigé,
   un premier érable rouge, une première maison à colombages), et quelques éléments du pays précédent persistent après.
5. Les ambiances (brume, couleur, musique) se pondèrent par la distance aux biomes, jamais par « région la plus proche » (à remplacer dans
   `layout.ts` : `nearestRegion` ne sert plus qu'à l'affichage du nom).

### 5.3 Les transitions, paire par paire

Les largeurs sont celles de `TRANSITIONS` (de la première région vers la seconde).

**Capyville → Paris** (2,1 km) : cèdres puis chênes (300 m) ; **col de Paris : révélation de la vallée de la Seine** ; Fontaine de la Seine, haies,
pommiers, Gué-aux-Saules et ses premières maisons à colombages (700 m) ; champs de blé, peupliers, moulin à eau, clochers pointus (600 m) ;
faubourgs de pierre blonde et de zinc, guinguette au bord de l'eau (500 m). Brume de rivière le matin, cloches, coqs.

**Capyville → New York** (2 km) : les érables japonais rouges de la couronne annoncent les érables à sucre (300 m) ; forêt mixte hêtres-érables,
Lac du Tanuki, Ferme des Érables (600 m) ; érables flamboyants, bouleaux, roches moutonnées, Dôme du Guetteur (700 m) ; banlieue de planches
peintes, puis brique, puis premiers gratte-ciel (400 m). Le sol passe de la mousse aux feuilles rouges puis au granit.

**Capyville → Désert** (garrigue puis dunes, imposé ; 2,1 km) : pins noirs puis pins d'Alep, sol qui blanchit (300 m) ; garrigue de chênes verts,
thym, lavande, **cigales**, Bastide des Cigales (700 m) ; badlands ocre, mesas, Citadelle, oliviers qui se raréfient (600 m) ; reg caillouteux,
premières dunes, caravansérail, palmeraie (500 m). La brume disparaît, la lumière blanchit, l'air tremble.

**Capyville → Japon** (rizières, imposé ; 2 km) : col sud, cèdres, le Fuji dans l'axe (300 m) ; **rizières miroir**, Hameau des Rizières,
buttes en terrasses (800 m) ; rizières puis vergers de kakis, bosquets de bambous, jizō (600 m) ; faubourg de machiya au bord du lac (300 m).

**Capyville → Pôle** (village alpin, pinèdes enneigées, toundra et aurores, imposé ; 4,3 km) : col du Pôle avec la vue sur les Clarines et le Pic (300 m) ;
**forêt des Mousses** (épicéas, tapis de mousse, rayons ref-13), scierie, lacets (700 m) ; **alpages fleuris et village des Clarines**, cascade (400 m) ;
**pinèdes enneigées dorées** (ref-12), la neige épaissit, Chapelle des Neiges, Col des Aurores (700 m) ; **toundra**, rennes, Lac de l'Aurore gelé,
**aurores** la nuit (ref-15) (600 m) ; station polaire et banquise (300 m). C'est le plus long voyage : il raconte le passage de l'été à l'hiver.

**Capyville → Londres** (bocage, imposé ; 2 km) : cèdres puis chênes et houx (300 m) ; Seuil des Cèdres boisé (500 m) ; murets, moutons,
Hameau des Chaumes, Vieux Pont (700 m) ; faubourgs de briques et de terrasses victoriennes, parcs (500 m). Pluie fine et arcs-en-ciel.

**Paris → New York** (2,4 km) : champs ouverts, coteaux de vignes (600 m) ; Monts Fauves, hêtres puis érables, Col des Fauves (500 m) ;
rive nord du Grand Lac, château de l'île, Port-aux-Huards (800 m) ; pont couvert, Chutes du Huard, faubourg (500 m).

**New York → Désert** (2,4 km) : derniers érables, la piste monte sur le plateau (400 m) ; Grandes Plaines, ranch, éoliennes (800 m) ;
Canyon Rouge, viaduc, cheminées de fée (600 m) ; Rebord des Plaines, reg, dunes, chott blanc (600 m). C'est la traversée « western ».

**Désert → Japon** (2,9 km, à pied ou en pirogue dans la jungle) : dunes qui s'abaissent (400 m) ; savane sèche, acacias, baobabs, montée au Col de Jade (500 m) ;
**basculement au col** : brume, Chute des Mille Voiles, arbres géants, temple du Gardien (800 m) ; Ruisseau Clair, village sur pilotis (600 m) ;
**bambouseraie au pied du Fuji, puis rizières** et la ville (600 m). Exemple imposé « rizières puis jungle » parcouru dans l'autre sens.

**Japon → Pôle** (2,2 km) : rizières en terrasses qui montent (300 m) ; cèdres et cyprès, Côte des Embruns, pins tordus (600 m) ;
première neige, **Onsen des Neiges** fumant (500 m) ; toundra côtière (500 m) ; station polaire (300 m).

**Pôle → Londres** (3 km) : toundra (500 m) ; pinèdes enneigées côtières (500 m) ; fjord, front du glacier, Port-aux-Phoques, landes (800 m) ;
landes et tourbières, Tour de l'Estuaire (700 m) ; murets, moutons, docks (500 m).

**Londres → Paris** (bocage, imposé ; 2,2 km) : haies sur talus, Manoir aux Roses et son labyrinthe (600 m) ; Seuil du Grand Arbre, vue sur la lande
et le phare (500 m) ; Abbaye du Couchant, champs de blé, colombages (700 m) ; faubourgs rive gauche (400 m).

### 5.4 Végétation écologique (règles pour la Végétation)

À l'intérieur d'un biome, chaque essence a une **niche** lue sur les cartes dérivées : altitude, pente, humidité (écoulement accumulé et distance à l'eau),
exposition (versant nord plus humide et plus sombre, versant sud plus sec), sol (dépôts, roche). Exemples : saules et peupliers à moins de 30 m de l'eau ;
pins sur les crêtes sèches ; hêtres et fougères dans les versants nord ; épicéas au-dessus de 200 m dans le Givre ; mélèzes isolés à la limite des arbres ;
arbres géants de la jungle dans les fonds humides ; oliviers sur les versants sud de la garrigue ; aucun arbre sur les pentes > 38° ni sur les éboulis frais.
Densités : forêts 140 à 260 arbres/ha, bocage 1 haie tous les 60 à 120 m, lisières de 6 à 12 m d'arbustes, clairières tous les 300 à 500 m en forêt
(on doit toujours pouvoir y voir le ciel et un repère). Rochers et bois mort dispersés sur les mêmes cartes (éboulis, lits, crêtes).
