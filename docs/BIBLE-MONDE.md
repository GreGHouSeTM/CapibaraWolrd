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

## 6. Hydrographie

### 6.1 Principe

L'eau dessine l'île : chaque grande vallée a sa rivière, chaque cuvette son lac, chaque rebord sa cascade. Les rivières principales sont **tracées à la main**
(`RIVERS`, polylignes d'amont en aval avec altitude d'eau `y` et largeur `w` à chaque point) ; les **affluents secondaires naissent de la simulation**
(accumulation d'écoulement sur la carte de hauteur érodée), avec un ruisseau visible tous les 400 à 800 m dans les pays humides
(bocages, lacs, forêt des Mousses, jungle) et des lits secs dans la garrigue. Une rivière ne remonte jamais une pente : `y` décroît toujours
vers l'aval (le script le contrôle). Aucune rivière ne sort de la couronne de Capyville : l'étang se vide par une perte vers les Veines Tièdes.

### 6.2 Rivières

| Rivière | De → à | Eau (y) | Largeur | Caractère |
| --- | --- | --- | --- | --- |
| **La Seine** | Fontaine de la Seine (-250, -620) → estuaire (-1160, -3490) | 14 → 0 | 3 → 80 m | rivière calme à méandres, peupliers, traverse Paris (34 m, quais 5 m au-dessus) |
| **La Tamise** | sous la Brèche du Loup (-1600, -200) → estuaire (-2900, -1420) | 150 → 0 | 3 → 70 | torrent, cascade de la Tamise (22 m), puis boucles de bocage et estuaire à vasières |
| Ruisseau du Grand Arbre | (-1350, -1450) → Tamise | 95 → 17 | 1,5 → 4 | gué de pierres |
| Haute Yuzawa | Lac du Tanuki (430, -640) → gorge de Capyville (160, -330) | 120 → 46 | 3 → 4 | cascade du Tanuki ; prolonge `STREAM` de `zones.ts` |
| **Rivière des Érables** | déversoir du Grand Lac (1650, -1750) → baie de New York | 45 → 0 | 18 → 55 | rapides, **Chutes du Huard** en fer à cheval (12 m) |
| Ruisseau des Fauves | Mont Fauve → Grand Lac | 150 → 45 | 2 → 5 | suite de petites chutes |
| **Rivière Rouge** | flanc est du Dormeur (1650, -150) → mer (3640, 330) | 150 → 0 | 3 → 25 | creuse le **Canyon Rouge** (60 à 90 m), Chute Rouge et sa vasque |
| Oued des Ocres | garrigue (900, 400) → oasis | 80 → 36 | 6 → 18 | **lit à sec** de galets blancs et lauriers-roses |
| **Rivière de Jade** | Plateau de Jade (1550, 1850) → mangrove (1100, 3700) | 300 → 0 | 5 → 60 | **Chute des Mille Voiles** (82 m), Escalier de Jade, eau turquoise |
| Ruisseau Clair | flanc est du Fuji → Rivière de Jade | 130 → 62 | 3 → 6 | eau limpide sur rochers moussus (ref-18) |
| **Rivière des Rizières (Kawa)** | Crêtes Blanches (-1250, 1750) → Lac du Torii | 200 → 5 | 3 → 20 | torrent puis rivière lente entre les diguettes |
| Ruisseau des Lucioles | pied de la Crête des Lucioles → Kawa | 9 → 6,6 | 2 → 6 | lucioles la nuit |
| Exutoire du Lac du Torii | lac → mer | 4,6 → 0 | 22 → 40 | traverse le port de la ville du Japon |
| **Torrent des Clarines** | Lac de Cristal → Kawa | 262 → 12 | 4 → 12 | cascade des Clarines (50 m), traverse le village, scierie |
| Ruisseau des Aurores | Col des Aurores → Lac de l'Aurore | 325 → 46 | 2 → 4 | gelé en surface |
| Rivière Gelée | Lac de l'Aurore → Baie Gelée | 45 → 0 | 8 → 20 | **Cascade Gelée** (20 m) |
| Émissaire du glacier | front du glacier → fjord | 12 → 0 | 10 → 20 | eau laiteuse, Pont de la Moraine |
| Ruisseau du Cap | lande → falaises | 70 → 0 | 2 → 4 | **cascade du Cap** (55 m) sur la plage |

Lits : 0,4 à 0,8 m d'eau dans les torrents et les gués, 1,5 à 3 m dans les rivières de plaine (nage), vasques de 2 à 4 m au pied des cascades.
Berges : galets et rochers dans les torrents, prés et saules dans les plaines, quais de pierre en ville, roseaux dans les estuaires.

### 6.3 Lacs (`LAKES`)

| Lac | Centre | Taille (demi-axes) | Eau | Caractère |
| --- | --- | --- | --- | --- |
| **Grand Lac** | (1300, -1900) | 480 × 260, rot. 20° | 45 | plus grand lac, île au château, plages de galets, huards, canoës |
| **Lac du Torii** | (-400, 2420) | 260 × 170 | 5 | torii dans l'eau (-560, 2390), reflet du Fuji depuis la rive ouest |
| **Lac de Cristal** | (-1760, 820) | 120 × 80 | 262 | lac alpin turquoise au-dessus du verrou des Clarines |
| **Lac de l'Aurore** | (-2350, 1930) | 220 × 140 | 45 | gelé, patinage, aurores (ref-15) |
| Lac du Tanuki | (450, -660) | 70 × 55 | 120 | petit lac de montagne, source de la Yuzawa |
| Lac du Huard | (1750, -2500) | 160 × 110 | 70 | barrage de castors |
| Lac Miroir | (950, -2750) | 110 × 80 | 85 | reflète le Mont Fauve |
| Bassin de l'oasis | (2330, 1320) | 38 × 30 | 35 | eau turquoise sous les palmiers |
| Chott Blanc | (2850, 1550) | 350 × 200 | 30 (sec) | croûte de sel, mirages |

Les berges sont **douces et praticables** sur au moins les trois quarts du tour (plages, prés, roselières) ; les rives raides sont lisibles (granite, falaise).

### 6.4 Cascades (`WATERFALLS`) et glaciers (`GLACIERS`)

Onze cascades, du ruban de 4 m à la **Chute des Mille Voiles** (82 m, 40 m de large, rideaux sur une falaise moussue, colonne de brume de 150 m
visible à 3,5 km, **grotte derrière le rideau**). Les autres : Chutes du Huard (12 m en fer à cheval), cascade des Clarines (50 m),
cascade du Cap (55 m sur la plage), Voile du Fjord (110 m en brume), Chute Rouge (8 m, vasque de baignade), cascade de la Tamise (22 m, grotte derrière),
cascade du Tanuki, Escalier de Jade (marches et vasques), cascatelle du Ruisseau Clair, **Cascade Gelée** (orgues de glace, on passe derrière).
Règle : **toute cascade de plus de 10 m a quelque chose derrière ou au pied** (grotte, vasque, passage, belvédère).

Glaciers : **Glacier de l'Aurore** (langue crevassée du Pic jusqu'au fond du fjord, front de 40 m qui vêle des icebergs) ; névé du Mont des Neiges.

### 6.5 Ponts et gués (`CROSSINGS`)

Trente points de franchissement, tous typés : ponts de pierre (Gué-aux-Saules, Vieux Pont, pont à dos d'âne), ponts de bois (Lucioles, Kawa aux
garde-corps vermillon, Fontaine des Clarines, Scierie, Moraine), **pont couvert des Érables** (rouge, vue sur les chutes), **viaduc du Canyon Rouge**
(160 m de long, 85 m au-dessus de la rivière), passerelle suspendue du canyon, **pont de lianes** de la jungle, passerelles du village sur pilotis,
deux radiers dans l'oued, une barque sur le Grand Lac et dix gués (pierres plates, pas japonais, glace). Le script vérifie qu'**aucune voie ne croise une
rivière sans franchissement déclaré** (aujourd'hui : aucun manque). On peut aussi toujours traverser à la nage : aucune rivière n'est une barrière.

## 7. Réseau de déplacement

### 7.1 Hiérarchie des voies (`WAYS`)

| Niveau | Revêtement | Largeur | Véhicules | Où | Bordures |
| --- | --- | --- | --- | --- | --- |
| Route | **asphalte** usé, ligne axiale discontinue | 7-8 m | oui | **seulement entre grandes villes** : Capyville → Paris, New York, Londres, Japon ; Paris → Londres ; Paris → New York | bas-côtés de gravier, fossés, haies ou murets selon le pays, bornes kilométriques |
| Route de gravier | gravier, glissières de bois en montagne | 6 m | oui | Route du Givre (Capyville → Clarines → Pôle), Route des Embruns, Route des Fjords | talus, perches à neige dans le Givre |
| Piste | terre rouge, gravier blanc ou sable balisé de cairns | 5-6 m | oui (lent) | Piste des Ocres, Piste des Ranchs, Piste du Col de Jade, Route du Bambou | rien, ornières |
| Chemin de terre | terre, ornières | 2,5-4 m | parfois | entre hameaux, fermes, lacs, tours de lac | herbe haute, haies, murets |
| Sentier | terre, pierre, neige | 1,2-2 m | non | montées aux belvédères, sommets, canyon, jungle, crêtes | marches de pierre ou de rondins au-delà de 18 % |
| Sentier de bêtes | trace | 0,6-1 m | non | partout, semés par `ANIMAL_TRAIL_RULES` (un tous les 250 à 400 m hors route) | rien |
| Raccourci de promenade | trace | 1,2-1,4 m | non | traverses directes à travers champs, avec échaliers dans les haies | rien |

Règles de tracé : les voies suivent les **vallées et les courbes de niveau** ; aucune ligne droite de plus de 400 m sans raison (digue des rizières,
plateau des Plaines) ; lacets réguliers au-delà de 8 % (routes) ; chaque route offre un point de vue au moins tous les 1,5 km (col, pont, belvédère
de bord de route avec aire d'arrêt) ; les six routes de Capyville commencent à la fin des couloirs de cols (`COL_ROUTES` de `valley.ts`).

### 7.2 Principales voies

| id | Nom | Revêtement | Tracé | Particularités |
| --- | --- | --- | --- | --- |
| route-paris | Route de la Seine | asphalte | col de Paris → Paris | rive droite de la Seine, platanes à l'approche |
| route-ny | Route des Érables | asphalte | col de New York → New York | pied du Dôme du Guetteur, lacs |
| route-londres | Route de la Tamise | asphalte | col de Londres → Londres | Seuil des Cèdres, Vieux Pont |
| route-japon | Route des Rizières | asphalte | col sud → Japon | **digue au-dessus des rizières miroir**, vue de conduite à l'aube (ref-5) |
| route-paris-londres | Route du Grand Arbre | asphalte | Paris → Londres | haies sur talus, Seuil du Grand Arbre |
| route-paris-ny | Route des Lacs | asphalte | Paris → New York | Col des Fauves, rive nord du Grand Lac, pont couvert |
| route-pole | Route du Givre | gravier puis neige | col du Pôle → Clarines → Col des Aurores → Pôle | lacets à glissières de bois, perches à neige ; motoneige conseillée après le col |
| piste-desert | Piste des Ocres | gravier puis sable | col du Désert → oasis | contourne la Citadelle, deux radiers |
| piste-ranchs | Piste des Ranchs | terre rouge | New York → oasis | viaduc, descente du Rebord en lacets |
| route-embruns | Route des Embruns | gravier | Japon → Pôle | corniche côtière |
| route-fjords | Route des Fjords | gravier | Pôle → Londres | fond du fjord, Pont de la Moraine |
| route-bambou | Route du Bambou | terre | Japon → lisière de la jungle | tunnels de bambou, parking des pirogues |
| piste-jade | Piste du Col de Jade | sable | oasis → Col de Jade | la jungle se traverse à pied ou en pirogue |

Plus dix chemins de terre (Saules, Grand Arbre, Chaumes, Phare, Tour du Grand Lac, Cabane à sucre, Dormeur, Bastide, Rizières, Rampe de la Citadelle),
dix sentiers (dont le **Sentier des Sept Sommets**, boucle de crête d'environ 2,6 km autour de Capyville, le Chemin du Pèlerin du Fuji, le Sentier des Crêtes
du Pic de l'Aurore, le Sentier des Douaniers sur les falaises, le Sentier du Canyon, le Sentier de la Jungle), trois sentiers de bêtes et trois raccourcis
donnés en exemples.

### 7.3 Temps de parcours

Calculés par `tools/plan-monde.mjs` (longueur des tracés + 6 % pour le relief ; marche 4,2 m/s, à quatre pattes 8,5 m/s ; voiture 22 / 14 / 10 m/s
selon le revêtement), de la place de Capyville au centre de la région (couloir du col et traversée de la ville compris) :

| Trajet | Distance | À pied | À quatre pattes | En voiture |
| --- | --- | --- | --- | --- |
| Capyville → Paris | 2,8 km | 11 min | 5 min 30 | 2 min 30 |
| Capyville → New York | 3,0 km | 12 min | 6 min | 2 min 30 |
| Capyville → Londres | 2,9 km | 11 min 30 | 5 min 45 | 2 min 30 |
| Capyville → Japon | 2,6 km | 10 min 30 | 5 min | 2 min |
| Capyville → Désert | 2,8 km | 11 min | 5 min 30 | 3 min 30 |
| Capyville → Les Clarines | 1,8 km | 7 min | 3 min 30 | 2 min |
| Capyville → Pôle | 4,3 km | 17 min | 8 min 30 | 5 min 30 |
| Paris → New York | 3,3 km | 13 min | 6 min 30 | 2 min 30 |
| Paris → Londres | 2,8 km | 11 min | 5 min 30 | 2 min |
| New York → Désert | 3,0 km | 12 min | 6 min | 4 min 30 |
| Désert → Japon (par la jungle) | 4,6 km | 20 min (sentier) | 10 min | pistes jusqu'au col et depuis la lisière |
| Japon → Pôle | 2,0 km | 8 min | 4 min | 2 min |
| Pôle → Londres | 4,6 km | 18 min | 9 min | 5 min 30 |
| Tour de l'île par les routes | ≈ 25 km | 1 h 40 | 50 min | ≈ 25 min |
| Traversée Pôle → New York à vol d'oiseau | 7,1 km | 28 min | 14 min | — |

C'est la bonne échelle pour une enfant de 9 à 12 ans : une région voisine en **un quart d'heure de balade** (on a le temps de vivre la transition)
ou en **deux minutes de voiture** (pour les missions), et un monde qu'on ne finit pas de visiter en un après-midi.

## 8. Points d'intérêt

### 8.1 Types

Hameaux et fermes, sanctuaires et chapelles, grottes (derrière les cascades, marines, peintes, de glace, tunnel de lave), cabanes et refuges,
ruines (abbaye, château, citadelle, tours, ksar, cercle de pierres, aqueduc), belvédères, sources chaudes sauvages, campements, moulins, phare,
arbres remarquables, curiosités naturelles (arches, cheminées de fée, chott, mangrove, vasques), ports, et les **15 Pierres-Vapeur**.

### 8.2 Les lieux posés à la main (`POIS`, 93 lieux + 14 villages et hameaux)

Chaque lieu a un **signal** (ce qui le fait voir de loin : silhouette, fumée, vapeur, son, lumière, couleur) et une **récompense de lieu**
(ce qu'on y trouve ; le gameplay viendra s'y accrocher). Résumé par pays :

- **Couronne** : Promontoire des Lucioles (vue ref-8), Fontaine de la Seine (résurgence bleue sous une voûte), Cabane du Lac du Tanuki.
- **Seine** : Moulin de la Seine, Chapelle des Coquelicots (cloche qu'on sonne), Ferme du Pigeonnier, Guinguette des Peupliers (bal le soir),
  Abbaye du Couchant, Cabane des Oyats.
- **Lande et falaises** : **Phare du Cap Blanc** (140 marches, galerie), Cercle des Pierres Levées (aligné sur le couchant), Grotte marine,
  **Épave du « Voyageur »**, cascade du Cap, Grotte des Contrebandiers.
- **Albion** : **Grand Arbre** (escalier autour du tronc, cabane à 30 m, lanternes), Manoir aux Roses et son labyrinthe de haies,
  Grotte des Sources (derrière la cascade de la Tamise), Tour de l'Estuaire.
- **Fjords** : Belvédère du Glacier (on l'entend vêler), Cabane du Berger, Port-aux-Phoques.
- **Givre** : Lac de Cristal, Chalet d'alpage (fromagerie), Refuge et **sommet du Pic de l'Aurore**, Grotte de glace, Chapelle des Neiges,
  Scierie, **Sanctuaire Moussu** (statue de capybara gardien sous la mousse), Campement des Rennes, **Observatoire des Aurores**,
  Cascade Gelée, Navire pris dans les glaces, Cabane du Guetteur des Glaces, Rochers aux Phoques, **Onsen des Neiges**.
- **Levant** : Terrasses du Ciel, Jizō du Carrefour, Moulin des Rizières, Tunnel de bambous, Refuge du Pèlerin, **Cratère du Fuji**, Tunnel de lave,
  Plage noire, Plage du Torii, Torii des Embruns.
- **Jungle** : **Chute des Mille Voiles** et **Grotte des Voiles** (fresque des Voyageurs), **Les Colosses** (arbres de 60 m, passerelles),
  **Temple du Gardien de Jade** (statue originale de capybara gardien, ref-14), Plate-forme de la Canopée, Vasques du Ruisseau Clair, Mangrove,
  Crique des Cocotiers.
- **Ocres** : **Citadelle des Ocres**, **Arches des Anciens** (aqueduc d'eau tiède qui fume encore), Source Tiède, Champs de lavande,
  Baobab des Voyageurs, Arche de Pierre, Chott Blanc (flamants), Campement nomade (conteur), Ksar oublié, Belvédère des Dunes (glissade), Épave des Sables.
- **Plaines** : Oreilles du Dormeur (vue sur Capyville), **Grotte peinte** (capybaras voyageurs), Cheminées de fée, Campement des Plaines, Arche marine Rouge.
- **Lacs** : **Château de l'Île**, Dôme du Guetteur, Tour du Mont Fauve, Cabane du Lac du Huard (castors), Chutes du Huard (sentier derrière),
  Crique aux Loutres, Pointe des Fous, Cabane du Pêcheur de Homards, Érablière aux Lanternes.

### 8.3 Semis par règles (`POI_RULES`) et densité (`POI_DENSITY`)

Entre les lieux nommés, un script sème les « petites choses » (rochers et arbres remarquables, abris, petits sanctuaires, calvaires et cairns,
points d'eau, ruines mineures, panoramas, traces de vie, faune), chacune avec son espacement minimal, ses biomes et son emplacement type
(crêtes, replats, carrefours, creux humides…). Les **cachettes** (futurs Squishy dumplings) sont des emplacements semés par les mêmes règles :
creux d'arbre, dessous de pont, derrière cascade, fond de grotte, sommet de rocher, nid dans une ruine.

Cibles contrôlées :
- un « quelque chose d'intéressant » **visible tous les 200 à 400 m** depuis n'importe quel point des terres sauvages ;
- un **lieu nommé** tous les 500 à 800 m le long des routes et chemins (contrôle actuel : distance moyenne au lieu nommé le plus proche
  **244 m**, pire trou 680 m, que le semis par règles comble) ;
- un **belvédère** ou point haut atteignable à moins de 1 km partout ;
- une **Pierre-Vapeur** à moins de 1,5 km partout.

### 8.4 Rythme : découverte → point de vue → récompense (`BALADES`)

La boucle de base de la promenade, à répéter à toutes les échelles (2 minutes, 10 minutes, une heure) :

1. **Découverte** : un signal attire l'œil (colonne de vapeur, silhouette sur une crête, bruit de cascade, lumière la nuit) ;
2. **Chemin** : on y va par un sentier visible ou à travers champs ; le relief cache puis révèle ;
3. **Point de vue** : on arrive en hauteur et on découvre plus loin (deux ou trois nouveaux signaux) ;
4. **Récompense** : un lieu à explorer (grotte, cabane, ruine, bain), un personnage, une cachette, une histoire des Voyageurs.

Treize balades composées à la main : De la Fontaine au Moulin, La nuit du Grand Arbre, Sentier des Douaniers, Tour du Grand Lac,
Sur la tête du Dormeur, Au fond du Canyon Rouge, La Citadelle des Ocres, **Les Mille Voiles**, Chemin du Pèlerin, Les Terrasses du Ciel,
Le Lac de Cristal, **La nuit des Aurores**, Le Glacier (3 à 5 km chacune).

## 9. Villes moins carrées

### 9.1 Principes communs (pour la spécialité Villes)

Le client trouve les villes « trop carrées » (`RETOURS-CLIENT.md` §4). Une ville crédible raconte son histoire par son plan :

1. **Le site d'abord** : la ville épouse son relief et son eau (méandre, colline, baie, lac). Les rues principales suivent les courbes de niveau
   ou montent en lacets ; les rues droites ne sont que les grandes percées volontaires (une ou deux par ville), qui visent un monument.
2. **Un noyau ancien serré** (ruelles courbes de 4 à 8 m, impasses, petites places irrégulières, passages sous voûte), puis des **faubourgs**
   le long des routes d'arrivée, puis des **quartiers plus récents** plus réguliers ; la ville se défait en jardins, potagers et maisons isolées
   sur 200 m avant la campagne (jamais de bord net).
3. **Des îlots variés** : parcelles de 6 à 25 m de façade, hauteurs mélangées (± 1 à 3 niveaux entre voisins), styles d'époques différentes,
   angles coupés, cours intérieures, un îlot sur cinq percé d'un passage.
4. **Des places** à chaque carrefour d'importance (formes triangulaires, en trapèze ou en demi-lune, jamais un carré parfait), **des quais**
   en bord d'eau, **des parcs** dans les creux du relief, **des escaliers** dans les pentes.
5. **Des rez-de-chaussée vivants** (vitrines, terrasses, étals, auvents), des fenêtres en trompe-l'œil (interior mapping, `RETOURS-CLIENT.md` §5).
6. **Lisibilité** : chaque ville a un monument visible de partout (et de loin, §3.1), une rue principale qui y mène, et une sortie vers chaque route.
7. Taille : **quartiers emblématiques denses** de 430 à 560 m de rayon (voir §14), pas des métropoles entières.

### 9.2 Ville par ville

- **Paris** (-150, -2650) : la Seine fait un **méandre** dans la ville, avec une **île** au milieu (île de la Cité : cathédrale, parvis, quais bas
  plantés de peupliers) reliée par cinq ponts de pierre différents. Rive droite : grands boulevards **courbes en arc** qui suivent l'ancien rempart,
  places en étoile à cinq branches (une seule grande percée rectiligne qui vise la tour Eiffel), immeubles de pierre blonde à toits de zinc
  de 5 à 7 niveaux, cours, passages couverts. Au nord, une **butte** de 40 m (moulins, escaliers, ruelles en lacets, vue sur toute la ville).
  Rive gauche : quartier ancien de ruelles, jardin à la française dans un creux, **tour Eiffel** (-290, -2475) sur un champ en pente douce vers l'eau.
  Faubourgs : guinguettes, jardins ouvriers, péniches.
- **New York** (2350, -1450) : la seule ville où la grille est légitime, mais **cassée** : un vieux quartier sud aux rues courbes et étroites
  (le port d'origine), une grande avenue diagonale qui coupe la grille en biais en créant des places triangulaires, une grille qui se tord
  pour suivre la presqu'île, un **grand parc** sur un affleurement de granit (lacs, ponts de pierre, rochers où l'on grimpe), des quais et des jetées
  de bois sur la baie, un pont suspendu vers la rive nord de la Rivière des Érables. Hauteurs très variées : brownstones de 4 niveaux contre tours de 40 ;
  silhouette groupée en deux pics (le vieux centre et le nouveau), toujours visible depuis le Dôme du Guetteur.
- **Londres** (-2400, -1350) : la Tamise fait **deux boucles** ; la ville ancienne est sur la rive nord, dans la boucle, autour d'une colline
  avec la cathédrale ; rues sinueuses médiévales, **crescents** (rangées de maisons en demi-lune) et squares fermés plantés de platanes ;
  Tour de l'Horloge (-2300, -1300) au bord de l'eau ; docks de brique à l'ouest vers l'estuaire, avec bassins et grues ; marchés couverts ;
  terrasses victoriennes en brique sur les pentes ; parcs à l'anglaise dans les creux.
- **Ville du Japon** (-800, 2380) : ville au bord du **Lac du Torii** et au pied du Fuji. **Vieille ville au nord** : rues étroites de machiya qui
  montent vers un sanctuaire sur une butte, escaliers, canaux ; **quartier du lac** : promenade courbe sur la rive, onsen, ryokans, torii dans l'eau ;
  **quartier moderne au sud-ouest** autour de la gare et du port, plus régulier mais avec une grande rue commerçante couverte qui serpente ;
  rizières et vergers qui entrent dans la ville par les creux. Pas de grille : les rues suivent les anciens chemins de digue.
- **Les Clarines** (-1450, 900) : village alpin en pente (10 à 20 %) dans la vallée en U ; **rue principale en S** qui suit le torrent, place de
  l'église avec la **fontaine-abreuvoir**, chalets étagés en courbes de niveau avec leurs balcons fleuris vers la vallée, greniers sur pilotis de pierre,
  ruelles en escaliers, pont de bois couvert, prés qui entrent jusqu'aux maisons ; la cascade dans l'axe de la rue (ref-9, ref-10 ; variante enneigée ref-11).
- **Oasis du Désert** et **station polaire** : petites ; ksar de terre crue groupé autour de la source, ruelles couvertes en baïonnette, palmeraie
  en jardins clos ; station polaire en arc au fond de la baie, radôme, igloos, quai sur la banquise.

### 9.3 Raccord de Capyville

Capyville ne change pas. À l'extérieur : les six couloirs de cols de `valley.ts` débouchent sur les voies de ce document ; le Sentier des Sept Sommets
relie les sommets de la couronne ; les Pierres-Vapeur les plus proches sont à 1,2-1,4 km ; la lumière d'aube et la brume de vallée de Capyville
restent la référence de l'ambiance du monde.

## 10. Lumière et atmosphère à l'échelle du monde

- **Perspective aérienne** : les plans successifs bleuissent et pâlissent avec la distance (cible ref-8) ; brouillard exponentiel faible
  (`WORLD_STREAMING.fog`) plus **brume de hauteur** dans les fonds de vallée sous 25 m le matin.
- **Ambiance par biome** (`BIOMES[].fog`, `weather`) pondérée par distance, fondue sur 500 m : brume permanente de la jungle, air sec et blanc de l'erg,
  ciel changeant d'Albion avec averses et arcs-en-ciel, automne doré des Lacs, lumière dorée rasante des pinèdes, nuit à aurores dans la toundra.
- **Lumière volumétrique** (commune à toutes les références du monde) : rayons à travers les troncs et la brume, contre-jour sur la vapeur et les cascades.
- **Repères la nuit** : faisceau du phare, lanternes du Grand Arbre, fenêtres des villes, Pierres-Vapeur réveillées qui luisent, aurores.
- Le soleil se lève au cap ≈ 110° (bible de Capyville §9) : le matin, le Fuji est éclairé de côté depuis le promontoire, le Pic de l'Aurore
  rosit en premier.

## 11. Budget et contraintes techniques (navigateur)

Rappel du diagnostic (`RETOURS-CLIENT.md` §6) : ≈ 25-30 ms par image en qualité Moyenne, limite côté processeur (≈ 950 appels de dessin au sol).
Un monde de 8 km ne tient qu'à ces conditions :

1. **Terrain en clipmaps géométriques sur GPU** (remplace les morceaux CPU actuels de 200 m) : un maillage fixe centré sur la caméra, dense aux pieds
   (pas de 1 m sur 160 m), de plus en plus grossier vers l'horizon (2, 4, 8 m, puis 32 m sur toute l'île, `terrainLods`), **déformé dans le vertex shader**
   par une texture de hauteur 16 bits **streamée par tuiles** de 256 m. Quelques appels de dessin pour tout le terrain, aucun recalcul CPU.
2. **Relief précalculé hors ligne** (§4.6) : simulation d'érosion hydraulique et thermique par notre script, exportée en tuiles de hauteur 16 bits
   + cartes dérivées (pente, écoulement, humidité, dépôts) ; téléchargement estimé 25 à 40 Mo pour l'île au pas de 2 m (compressé).
   Le détail sous 2 m vient du microrelief procédural sur GPU ; Capyville garde sa grille fine de 0,5 m.
3. **Matières du sol** : **triplanar mapping** pour la roche sur les pentes fortes (pas d'étirement de texture sur les falaises), et **mélange par hauteur**
   des matières PBR (herbe, terre, sable, galets, mousse, neige, roche…) piloté par la pente, l'altitude, l'humidité et la neige.
   Textures photoscannées **Poly Haven (CC0) en priorité**, en atlas ou tableaux de textures (KTX2).
4. **Dispersion** de la végétation, des rochers et des petits objets lue sur ces mêmes cartes, par tuile, en instanciation (une instance par modèle et par tuile).
5. **Streaming** (`WORLD_STREAMING`) : tuiles de 256 m ; contenu complet (objets, herbe, collisions) dans un rayon de 700 m, déchargé au-delà de 900 m ;
   préchargement 6 s devant le joueur dans le sens du mouvement (≈ 180 m en voiture) ; décodage dans des workers ; au plus 2 ms de transfert GPU par image.
6. **Distances de vue** : herbe 60 m, objets 120 m, arbres complets 45 m, arbres simplifiés 140 m, **imposteurs d'arbres jusqu'à 1 km**,
   puis canopée en maillage très simple jusqu'à 3,5 km et teinte de forêt peinte dans la texture du terrain au-delà ; bâtiments complets 140 m,
   **HLOD par îlot** jusqu'à 400 m, puis **un maillage de silhouette par ville** (≤ 30 k triangles) toujours chargé ; les grands repères ont
   des LOD dédiés et restent visibles sur toute l'île.
7. **Occlusion** : le relief cache beaucoup (couronne de Capyville, cols, chaînes) : profils d'horizon précalculés par tuile pour ne pas dessiner
   ce qui est derrière une montagne ; boîtes des bâtiments comme occulteurs en ville ; requêtes d'occlusion WebGL2 sur l'image précédente ensuite.
8. **Ombres** : cascades à fréquences différentes (la plus lointaine une image sur 4), ombres lointaines du relief cuites dans les cartes dérivées.
9. **Brume** : sert la profondeur **et** le budget (elle fond ce qui est simplifié), jamais un mur gris : les grands repères la percent.
10. Budgets (qualité Moyenne) : **< 700 appels de dessin, < 3 M triangles, 16,6 ms** par image, mémoire GPU < 1,5 Go, téléchargement total < 120 Mo ;
    les mesures de `tools/perf.cjs` se font sur les vues de §13 en plus de celles de Capyville.
11. Plus tard : **WebGPU** (dessin indirect, culling sur GPU) quand le moteur de Three.js sera mûr.

## 12. Liste de production par spécialité (dans l'ordre)

### Terrain & relief (`heightmap.ts`, `terrain.ts`, `tools/terrain/**` à créer)
1. Passer le monde à 8 × 8 km dans `layout.ts` (`WORLD_SIZE` 8000, régions lues depuis `WORLD_REGIONS`), sans toucher à la vallée de Capyville.
2. Script hors ligne de génération : formes dirigées de `world-map.ts` (côte, `RELIEF_ZONES`, `CHAINS`, `WORLD_PEAKS` aux formes imposées, `WORLD_COLS`,
   lits des `RIVERS`, `LAKES`, plats des villes et villages), bruit par zone.
3. Érosion hydraulique et thermique (`TERRAIN_RULES`), replats, microrelief ; affluents et lacs issus de l'écoulement ; aplanissements des routes.
4. Export en tuiles 16 bits de 256 m + cartes dérivées (pente, écoulement, humidité, dépôts, exposition, neige).
5. Rendu en **clipmaps géométriques GPU** avec streaming des tuiles, collisions par tuile autour du joueur.
6. Matières : triplanar pour la roche, mélange par hauteur des matières PBR (Poly Haven) selon pente, altitude, humidité, neige.
7. Contrôles : pentes (§4.3), lignes de vue (§3.2), altitudes de contrôle, raccord exact avec la vallée de Capyville et les `COL_ROUTES`.

### Végétation (`vegetation.ts`, `grass.ts`, `src/procgen/flora/**`)
1. Essences par biome (§5.1) : priorité aux forêts qui couvrent le plus de surface (érables, épicéas et pins de la forêt des Mousses et des pinèdes,
   cèdres et bambous du Levant, chênes et haies des bocages), puis jungle (arbres géants, lianes, fougères arborescentes), garrigue, savane, alpages.
2. Placement écologique par les cartes dérivées (§5.4), fondus de transition (§5.2), avant-postes.
3. Imposteurs jusqu'à 1 km, canopée lointaine, teinte de forêt dans le terrain.
4. Herbes et fleurs par biome (prés fleuris, herbe blonde, bruyère, herbes rousses enneigées, riz, lavande).

### Routes & chemins (`roads.ts`, `layout.ts` routes)
1. Remplacer l'anneau et les rayons actuels par `WAYS` : rubans par revêtement, talus et fossés, bordures par pays, lacets.
2. Ponts et gués de `CROSSINGS` (avec la Modélisation : pont couvert, viaduc, pont de lianes, ponts de pierre).
3. Sentiers de bêtes semés (`ANIMAL_TRAIL_RULES`), raccourcis avec échaliers, panneaux indicateurs à chaque carrefour.

### Eau (`water.ts`)
1. Rubans de rivière à hauteur locale pour toutes les `RIVERS` (écoulement, écume aux rapides, eau laiteuse du glacier, oued sec, rivières gelées).
2. Lacs à niveau propre (`LAKES`), gelés, sec (chott) ; mer avec houle et ressac, banquise.
3. Cascades de `WATERFALLS` (rideaux, brume, colonne de la Mille Voiles visible de loin, cascade gelée), glaciers.

### Villes (`src/regions/**`, après la tranche HD)
1. Plans organiques de §9 pour Paris, New York, Londres, la ville du Japon ; Clarines ; oasis et station.
2. Silhouettes lointaines et HLOD par îlot ; transitions de faubourgs.
3. Hameaux de `SETTLEMENTS` dans leurs styles.

### Points d'intérêt (`src/world/pois/**` à créer)
1. Pose des `POIS` et des 15 Pierres-Vapeur avec leur signal (fumée, vapeur, lumière, son).
2. Semis par `POI_RULES` et contrôle de `POI_DENSITY` ; emplacements de cachettes.
3. Les treize `BALADES` vérifiées à pied (temps, signaux visibles, récompense).

### Lumière & atmosphère (`sky.ts`, `postfx.ts`)
1. Perspective aérienne et brume de hauteur à l'échelle de 8 km ; ambiances par biome pondérées par distance.
2. Météo locale (pluie d'Albion et de la jungle, neige du Givre, brume de chaleur), aurores.
3. Repères de nuit (phare, lanternes, Pierres-Vapeur) ; réglage de chaque vue de `WORLD_VIEWPOINTS` à son heure.

### Autres spécialités (pour mémoire)
Audio : ambiances par biome (§5.1, fondues sur 300 m). Faune : par biome (huards, rennes, dromadaires, singes, phoques, moutons, flamants).
Optimisation : budgets du §11, mesures sur les vues du §13.

## 13. Critères de revue (vues du monde à capturer)

On juge chaque passage sur les 19 vues de `WORLD_VIEWPOINTS` (à leur heure), plus une vue aérienne de chaque pays et un trajet filmé
Capyville → Pôle. Un critère n'est validé que s'il se voit.

**Grandeur et liberté**
1. Vue `promontoire-lucioles` : composition ref-8 réussie (premier plan riche, plaine, rivières, ville, Fuji enneigé, plans bleuis).
2. Depuis chaque col, le pays suivant se révèle ; depuis Capyville, aucune ville n'est visible ; les lignes de vue du §3.2 sont dégagées.
3. Depuis tout point dégagé : au moins deux grands repères et un « quelque chose d'intéressant » à moins de 400 m.
4. On peut aller à pied vers tout ce qu'on voit : aucun blocage hors falaises désignées ; essai automatique de marche vers les repères.

**Relief**
5. Pentes praticables (part > 35° ≤ 4 % par tuile), falaises lisibles et contournables, modelé visible (ravines, éboulis, replats) sur chaque vue.
6. Silhouettes justes : le Dormeur se lit comme un capybara, la Dent du Loup comme une dent, le Fuji comme un cône concave.

**Transitions et biomes**
7. Sur chaque trajet du §5.3, aucune frontière nette : essences, sol, architecture, brume et sons changent progressivement.
8. Chaque biome se reconnaît au premier regard (couleur dominante, essence signature, son).

**Eau et voies**
9. Rivières qui coulent vers l'aval, lacs à niveau, cascades animées ; ponts et gués conformes à `CROSSINGS`.
10. Asphalte seulement entre grandes villes ; routes en courbes de niveau, pentes ≤ 8 %.

**Villes**
11. Plans organiques (aucune grille régulière sauf New York, cassée), places, quais, impasses, faubourgs progressifs.

**Technique**
12. Budget du §11 respecté sur chaque vue et en voiture (pas d'à-coup au streaming à 30 m/s), aucune erreur console.

## 14. Décisions à valider par le client

1. **Mer et îles** : l'île-continent entourée de quatre mers, avec cinq petites îles et une limite douce en mer (houle et courant qui ramènent).
   *Recommandation : oui.* C'est la seule limite naturelle sans mur invisible, et la mer donne les plus belles vues (phare, falaises, plages).
   Autre choix possible : un continent fermé par de hautes montagnes (plus fermé, moins de variété).
2. **Taille des villes** : quartiers emblématiques denses (430 à 560 m de rayon, un monument, une rue principale, un quai) ou grandes villes (1 km et plus).
   *Recommandation : quartiers emblématiques.* On garde le niveau de détail PS5 voulu, le budget du navigateur et des terres sauvages vastes ;
   les villes paraîtront plus grandes grâce aux faubourgs et aux silhouettes.
3. **Climat et saisons** : un climat fixe par pays (automne doré aux Lacs, été aux Clarines, hiver au Pôle…) avec météo locale, ou un cycle de saisons
   pour toute l'île. *Recommandation : climat fixe par pays d'abord* (le voyage fait changer de saison, c'est plus fort), et plus tard une option
   « hiver » pour les Clarines enneigées (ref-11) et Capyville sous la neige.
4. **Ordre des régions sur la carte** : on garde le cycle actuel (Paris au nord, New York au nord-est, Désert au sud-est, Japon au sud,
   Pôle au sud-ouest, Londres au nord-ouest), sur lequel Capyville est construite (cols, fenêtre sur le Fuji). *Recommandation : le garder*,
   le froid du Pôle s'explique par la montagne et la Mer des Glaces. Si le client tient à un « Pôle Nord » au nord, il faut échanger Paris et le Pôle :
   c'est faisable (les cols de Capyville ne changent pas de forme, seulement de destination) mais la vallée de la Seine et le Givre seraient à redessiner.
5. **Voyage rapide** : faut-il pouvoir se téléporter entre Pierres-Vapeur réveillées ? *Recommandation : oui, mais seulement vers des bornes déjà
   réveillées à pied*, pour garder le plaisir de la promenade tout en évitant les longs retours.
6. **Histoire du lieu** : valider la légende des Six Voyageurs, les Veines Tièdes et les Pierres-Vapeur comme base du lore (la bible gameplay en fera
   les quêtes et l'histoire des Squishy dumplings). *Recommandation : oui* ; elle explique pourquoi Paris, New York et Londres sont sur la même île
   et relie tous les lieux à Capyville et à sa source.

## Annexe — Changements pour le code existant (à signaler aux autres spécialités)

- `layout.ts` : `WORLD_SIZE` 3 200 → **8 000** ; `COAST_RADIUS` remplacé par `COASTLINE` ; positions des régions lues dans `WORLD_REGIONS`
  (les caps sont conservés, les distances passent de 800 m à 2,5-3,4 km) ; `ROADS` (anneau + rayons) remplacé par `WAYS` ;
  `regionWeights` / `nearestRegion` remplacés par une pondération par biome (§5.2).
- `heightmap.ts` : `RIVERS` (Seine, Tamise), `LIBERTY_POS`, `FUJI_POS`, `JP_LAKE`, `OASIS_POS`, `PYRAMIDS` dérivés de `world-map.ts`
  (`FUJI_POS` = (305, 2899) : cap 174° conservé depuis la place).
- Capyville (`zones.ts`, `valley.ts`) : **aucun changement**. Les six `COL_ROUTES` deviennent le début des voies de `WAYS`.
- Missions existantes : la mission de conduite « Premier volant » reste sur l'axe de Paris au-delà de la porte du Col ; les autres missions des régions
  suivent leur région à sa nouvelle position.
