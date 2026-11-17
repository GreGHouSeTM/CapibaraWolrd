# Bible de Capyville : village thermal de montagne

Document de référence du lead open world et level design. Il s'impose à toutes les spécialités de `docs/EQUIPE.md`.
La cible visuelle est donnée par `docs/references/ref-1.webp` à `ref-7.webp` ; la grille de validation par `docs/QUALITE-CAPYVILLE.md`.

**Source de vérité chiffrée : `src/world/zones.ts`.** Toutes les coordonnées de ce document en viennent. Si un chiffre diffère
entre ce texte et `zones.ts`, c'est `zones.ts` qui fait foi. On ne recopie pas de coordonnées en dur dans le code : on importe
`zones.ts`. Pour faire bouger un élément, on le demande au lead, qui modifie `zones.ts` et ce document ensemble.

Plan coté : **`docs/plan-capyville.svg`**, généré depuis `zones.ts` (vallée à gauche, village à droite avec les identifiants).

## 0. Conventions

- Unités : mètres. **x vers l'est** (New York), **z vers le sud** (Japon, mont Fuji). Le **nord est donc -z** (Paris).
- Cap (bearing) : degrés depuis le nord, sens horaire (0 = Paris, 60 = New York, 90 = est, 120 = Désert, 180 = Japon, 240 = Pôle, 300 = Londres).
  Direction d'un cap b : `(sin b, -cos b)`.
- Altitudes monde : place = **6,0** ; plan d'eau global (mer et étang) = **0**. Le torrent est un ruban d'eau à hauteur locale (`STREAM_WATER_Y`).
- Bâtiment : `yaw` = `rotation.y` de Three.js ; la façade principale (porte) est le +z local et regarde vers `(sin yaw, cos yaw)` ;
  `w` = largeur de façade, `d` = profondeur. Aide : `facing(dx, dz)`.
- Échelle du héros : capybara 0,55 m au garrot, caméra de jeu à 4-8 m derrière lui. Tout se juge à cette hauteur d'œil (environ 1,2 m).
- Module japonais : 1 ken = 1,82 m (espacement des poteaux), 1 tatami = 0,91 × 1,82 m. Portes 1,9 m, étages 2,8 m, marches 0,18 m.

## 1. Concept et histoire du lieu

**Capyville, le village des eaux tièdes.** Une vallée de montagne fermée par sept sommets boisés, au fond de laquelle une source
chaude jaillit au pied d'une colline. Il y a très longtemps, une famille de capybaras voyageurs s'est arrêtée là pour se réchauffer
les pattes ; elle n'est jamais repartie. Les six vieux chemins qui franchissent les cols de la vallée (vers Paris, New York,
le Désert, le Japon, le Pôle et Londres) se croisent sur la place, sous un cerisier pleureur planté le jour de la fondation.
Depuis, tous les voyageurs du monde font halte ici pour prendre un bain avant de repartir.

Ce que racontent les lieux :

- **La place du Grand Cerisier** : le carrefour des six chemins. Le cerisier, très vieux, est soutenu par des béquilles de bois ; le puits
  couvert date de la fondation ; on y trempe ses pattes au bain de pieds en bavardant.
- **Le quartier des Bains** : la source est captée au **yubatake** (le champ de vapeur), où l'eau trop chaude refroidit dans des canaux de bois
  avant d'alimenter les bains publics, les ryokans et le bain extérieur au bord du torrent. La vapeur est la signature du village.
- **La Grand-Rue** : la rue marchande qui descend vers le sud. Son axe vise le mont Fuji, que l'on aperçoit à travers le Grand Torii.
- **La colline sacrée** : le sanctuaire remercie l'esprit de la source ; la pagode rouge, sur le sommet, veille sur la vallée.
- **Le torrent Yuzawa** : descend de la gorge du mont Tanuki, fait tourner le moulin à riz, traverse le quartier des bains entre deux murs de pierre,
  puis tombe dans l'étang aux koï.
- **La campagne** : rizières en terrasses à l'ouest, théiers à l'est, verger de yuzus au sud-est (les yuzus flottent dans les bains l'hiver).
- **Les prairies de susuki** : les hautes herbes argentées où vivent les **Grignoteurs**, petites créatures de ronces qui grignotent les récoltes.

Ton : chaleureux, paisible, jamais menaçant au village ; un soupçon d'aventure dès qu'on passe les portes.

## 2. Plan masse

### 2.1 Organisation générale

- Vallée d'environ 600 m de diamètre, ceinturée par sept sommets de 75 à 170 m (`PEAKS`) ; six **cols** (`COLS`) laissent passer les axes.
  Le col du Japon (sud, 16 m, 140 m de large) est le plus bas : c'est la fenêtre sur le mont Fuji.
- Village dans un rayon de **110 m** (`VILLAGE_RADIUS`), sur un replat à 6 m qui monte doucement vers le nord (9 m à la porte du Col).
- Place du Grand Cerisier au centre (56 × 44 m, angles coupés de 8 m, `PLAZA`).
- Six **rues dallées** prolongent les axes de la place jusqu'à six **portes** (`VILLAGE_GATES`), où commence l'asphalte.
- Le torrent entre par le nord-est, longe le quartier des bains (x ≈ 61-82), contourne le village par le sud (z ≈ 120-140) et tombe dans l'étang (-120, 90).

### 2.2 Schéma de la vallée (1 caractère = 10 m en x, 20 m en z ; nord en haut)

```
^ sommet   t forêt   | bambous   ~ torrent   O étang   " prairie à ennemis   A asphalte   = dalles   E escalier
. terre/gravier/pas japonais   # bâtiment   R ryokan   B bains   J sanctuaire   P pagode   M moulin   F ferme
V belvédère   T torii   H pont   S rotenburo   r rizières   h théiers   y verger   g potager   * fleurs   @ départ
```

```
 -350              ^^^^^^^^^^^      tttttttttAAttt^^^^^^^^^    ^^^^^^^^
 -310           ttttttttttttt^^^ tttttttttttttAtttttt^^^^~ ^^^^^^^^^^^^^^^^
 -270          ttttttttttttttt^^ tttttttttttttAtttttt  ~  ^^^^^^^^^^^^^^^^^
 -230   AAA    ttttttttttttttt    tttttttttttAAtttttt~~ttt  ^^^^^^^^^^^^^^
 -210        AAA ttttttttttt   ""   tttttttttAttttttt~ttttt  ^^^^^^^^^^^
 -190            AA ttttt     ".." tt  ttttttAt tttHHH..tt        ^^
 -170    ttttttttt  AA         "".ttttt     AA    .~tttt.  V                 AA
 -130 tttttttttttttttt   AA        tt.     AA    .~     .               AA
 -110 ttttttttttttttttt     AA       EJ    A    .~     .h         ttAAA
  -70 ttttttttttttttttt         A=     T ###..M.~   #.     AAAAttttttttttttt
  -30 tttttttttttttttrrrr      #   ####TT#=##  HHH= ..      ttttttttttttttttt^^
  -10 tttttttttttttttrr rrrr  F..    ##---#--  =~=RR  ..    ttttttttttttttttt^^
   10 ^^^ttttttttt   rrrrrrr #  g   ## #-----BBHHHRRg  ".."" ttttttttttttttt^^^
   30 ^^^^^^^^^^                 ==####g#@#####=HH=#   """""  ttttttttttttt^^^^
   70 ^^^^^^^        AAAA .HHOO##     #########SS~~A=                  ^^^^^^^^
   90           AAA      HHOOOOOOO  EEEE####     ~H.=A
  130   AA      ttttttttt         ~~~  AHH ~H~~     .yy*AAAtttttttttt
  170       ttttttttttttttttt       ...A   *       yyy t*ttttAAAtttttttt
  210      ttttttttttttttttttt"""""   A                ttttttttttttAAttt
  250       ttttttttttttttttt^^^     A              ^^^^ttttttttttttttt   AAA
  290          ttttttttttt^^^^^^     A              ^^^^^^^^^^^^
```

### 2.3 Schéma du village (1 caractère = 3 m en x, 6 m en z ; x de -125 à 130, z de -135 à 135)

```
 -120                           PPP                 AAAA               . ~~
 -114                               JJ               AA               . ~~
 -102 AAA                        E                 ==               . ~~                  .h
  -90    AAAA                     E JJJ           ==              . ~~~                 .hhh
  -84      AAAAA                  EEJJJ           ==###          .  ~~                h.hh
  -72                                 T       ###.............MMM  ~~           ## hh..
  -60                ==                E     ###== ###           . ~~              ..
  -48                 ...===            E    ## ==###            . ~~~            .   AAAAAA
  -36                    ## # == ###    EE   ##==                =  ~~    ====== ..
  -30       ##             #### == ####  T  ###==  ####          =  HHHH==         ..
  -24                         ####=== ### E### ==             ====H=~~   =           ..
  -18   FFF               ggg   #### == ----------------=======  == ~~   =             .
   -6   FFF .....           ggg ####  ------------#------  BBBB   = ~~~  = RRRRR           .
    6 #      gggg          ..         --#----------------  BBBB   HHHHHHH= RRRRR gggg
   18                  ######.  ======  ---------------- ======   =   ~~ =
   24                 ###  =====  ###      ###@==####   ### ## =====H=~~ =
   36           ====   ### ##              ### ==####        RRRR ==   ~~===
   48 AAAA   .              gg             ### ==RRRR        RRRR =     ~~~  ==
   60 ...... .                             ### == ###  ###      =#        ~~   ==
   72 OOOOOOOO#OOO                 ####     ## ==###    ###   ## SSSSSS  ~~      ==
   84 OOOOOOOOOOOOOOO        ###       EEEEEEEE==###                    ~~HHH     ==
   96 OOOOOOOOOOOOOOO     EEEE             ###===##                    ~~~    .      AAAA
  108 OOOOOOOOOOOHH       |||||||||          ===  #                ~~~          .        AAA
  120  ...        ~~~~~    |||||||          ATA               ~~~~               ..     yy
  132                    ~~~~~~            AHA       ~~H~~~                       ..yyyyyyyy
  138                         ~~~~~~~~~~~~~HH~~~~~~~~~ HH                       yyy.yyyyyyyy
```

(Les schémas complets se régénèrent depuis `zones.ts` ; le SVG est la version lisible.)

### 2.4 Quartiers (`QUARTERS`)

| Quartier | Centre | Caractère |
| --- | --- | --- |
| Place du Grand Cerisier | (0, 0) r 30 | cœur animé, cerisier, puits couvert, bain de pieds, étals |
| Grand-Rue | (0, 70) r 50 | rue marchande continue de machiya, noren, lanternes, perspective sur le mont Fuji |
| Quartier des Bains | (62, 20) r 55 | torrent canalisé entre deux murs, vapeur, ryokans, ponts de bois |
| Quartier du Col | (10, -60) r 40 | artisans, greniers, yubatake, moulin, montée vers la porte nord |
| Colline sacrée | (-35, -95) r 45 | cèdres géants, torii, escaliers moussus, pagode |
| Quartier des Cèdres | (-50, -30) r 30 | habitations, jardins, haies de bambou |
| Quartier de l'Étang | (-50, 50) r 45 | maisons à jardins, potagers, bambouseraie, descente vers l'étang |
| Ferme et rizières | (-150, -10) r 60 | ferme au toit de chaume, séchoirs à riz, rizières en miroir |

### 2.5 Bâtiments (`BUILDINGS`, 71 entrées)

Position = centre de l'emprise au sol. Yaw en degrés (la façade regarde vers `(sin yaw, cos yaw)` : 0° = sud, 90° = est, -90° = ouest, 180° = nord).

| id | Nom | Type | x, z | w × d (m) | yaw | Niveaux | Toit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| chaya | Maison de thé du Cerisier | chaya | 17, -29 | 12 × 9 | 0° | 2 | irimoya |
| sento | Bains publics de la Croisée | sento | 41, 2 | 16 × 12 | -90° | 1 (haut) | karahafu |
| ashiyu | Bain de pieds | ashiyu | 22, 2 | 7 × 3,5 | -90° | 1 | auvent |
| puits | Puits couvert | puits | 9, -7 | 3 × 3 | 0° | 1 | kirizuma |
| honjin | Grande maison de Mamie Capy | honjin | -41, -1 | 12 × 12 | 90° | 2 | irimoya |
| yatai-1 | Étal de patates douces grillées | yatai | -18, 15 | 3 × 2 | 180° | 1 | auvent |
| yatai-2 | Étal de masques et moulinets | yatai | -21, 6 | 3 × 2 | 90° | 1 | auvent |
| yatai-3 | Étal d'œufs cuits à la source | yatai | 16, 16 | 3 × 2 | 180° | 1 | auvent |
| e1 | Confiserie des manjū à la vapeur | machiya | 9,8, 26,2 | 8 × 10 | -88° | 2 | kirizuma |
| e2 | Échoppe des lanternes de papier | machiya | 10,1, 35,2 | 8 × 10 | -88° | 2 | kirizuma |
| e3 | Petit ryokan Momiji | ryokan | 11,3, 46,2 | 12 × 12 | -88° | 2 | irimoya |
| e4 | Marchand de yuzus | machiya | 10,1, 57,2 | 8 × 9 | -88° | 2 | kirizuma |
| e5 | Atelier de jouets en bois | machiya | 9,8, 73,2 | 8 × 9 | -92° | 1 | kirizuma |
| e6 | Maison aux glycines | minka | 9, 83,7 | 9 × 8 | -92° | 1 | kirizuma |
| e7 | Grenier blanc | kura | 7,8, 93,2 | 6 × 6 | -92° | 2 | kirizuma |
| e8 | Maison du potier | minka | 6,8, 103,8 | 8 × 8 | -104° | 1 | kirizuma |
| w1 | **Maison de Capy (départ)** | minka | -9,1, 27,2 | 9 × 9 | 92° | 2 | kirizuma |
| w2 | Restaurant de nouilles soba | machiya | -9,8, 37,8 | 10 × 11 | 92° | 2 | kirizuma |
| w3 | Échoppe de dango | machiya | -8,5, 47,7 | 8 × 9 | 92° | 2 | kirizuma |
| w4 | Marchand de parapluies en papier | machiya | -8,3, 56,7 | 8 × 9 | 92° | 2 | kirizuma |
| w5 | Herboristerie et thé | machiya | -8,4, 66,2 | 8 × 9 | 88° | 1 | kirizuma |
| w6 | Maison | minka | -8,2, 75,7 | 8 × 8 | 88° | 1 | kirizuma |
| w7 | Maison | minka | -8,6, 91,7 | 9 × 8 | 88° | 1 | kirizuma |
| w8 | Maison du gardien du torii | minka | -10,2, 102,3 | 7 × 7 | 77° | 1 | kirizuma |
| n1 | Chapellerie de Basile | machiya | -8,1, -27,9 | 9 × 9 | 84° | 2 | kirizuma |
| n2 | Grenier à riz | kura | -5,7, -36,7 | 6 × 6 | 84° | 2 | kirizuma |
| n3 | Maison | minka | -5,6, -46,2 | 9 × 8 | 84° | 1 | kirizuma |
| n4 | Maison | minka | -3,8, -58,7 | 9 × 8 | 80° | 1 | kirizuma |
| n9 | Maison du veilleur de la porte | minka | -1,5, -71,5 | 9 × 8 | 80° | 1 | kirizuma |
| n5 | Studio de Léo le photographe | machiya | 10,8, -41,5 | 9 × 9 | -96° | 2 | kirizuma |
| n6 | Maison | minka | 11,7, -52,3 | 10 × 8 | -100° | 1 | kirizuma |
| n7 | Atelier du charpentier | machiya | 14,2, -63,1 | 9 × 9 | -100° | 1 | kirizuma |
| n8 | Maison | minka | 17,1, -80,8 | 8 × 8 | -104° | 1 | kirizuma |
| l1 | Maison | minka | -38,6, -16 | 9 × 8 | 141° | 1 | kirizuma |
| l2 | Maison | minka | -47,1, -22,9 | 9 × 8 | 141° | 1 | kirizuma |
| l3 | Maison du forgeron | minka | -56, -30,7 | 10 × 8 | 138° | 1 | kirizuma |
| l7 | Maison | minka | -64,6, -38,4 | 9 × 8 | 138° | 1 | kirizuma |
| l4 | Maison | minka | -25,7, -25,3 | 9 × 8 | -40° | 1 | kirizuma |
| l5 | Grenier | kura | -33,7, -30,6 | 6 × 6 | -40° | 2 | kirizuma |
| l6 | Maison | minka | -40,8, -37,7 | 10 × 8 | -40° | 1 | kirizuma |
| p1 | Maison | minka | -35,6, 25,6 | 9 × 8 | -163° | 1 | kirizuma |
| p2 | Maison | minka | -46,1, 28,9 | 9 × 8 | -163° | 1 | kirizuma |
| p3 | Maison du pêcheur | minka | -57,7, 32,8 | 10 × 8 | -161° | 1 | kirizuma |
| p7 | Maison | minka | -69,5, 36,9 | 9 × 8 | -161° | 1 | kirizuma |
| p4 | Maison | minka | -46,3, 12,8 | 9 × 8 | 17° | 1 | kirizuma |
| p5 | Maison | minka | -62,2, 18,1 | 9 × 8 | 19° | 1 | kirizuma |
| p6 | Maison | minka | -72,6, 21,7 | 9 × 8 | 19° | 1 | kirizuma |
| y1 | Maison du masseur | minka | 29,6, 24,4 | 9 × 8 | 162° | 1 | kirizuma |
| y2 | Boutique de serviettes et de savons | machiya | 38,7, 27,3 | 8 × 8 | 162° | 1 | kirizuma |
| v1 | Maison de la Ruelle de la Vapeur | minka | 26, 56 | 9 × 8 | 0° | 1 | kirizuma |
| v2 | Maison du baigneur | minka | 30, 74 | 9 × 8 | 180° | 1 | kirizuma |
| k1 | Maison du gardien des sources | minka | 34, -54 | 9 × 8 | 0° | 1 | kirizuma |
| j1 | Maison | minka | -32, 74 | 9 × 8 | 0° | 1 | kirizuma |
| j2 | Maison de la tisserande | minka | -52, 81 | 9 × 8 | 17° | 1 | kirizuma |
| grand-ryokan | Grand Ryokan Yuzu-no-Yado | ryokan | 90, 4 | 26 × 14 | -90° | 3 | irimoya |
| ryokan-annexe | Pavillon du jardin du Ryokan | chashitsu | 96, 30 | 8 × 7 | -90° | 1 | irimoya |
| ryokan-torrent | Ryokan du Torrent | ryokan | 46, 44 | 16 × 10 | 90° | 2 | irimoya |
| datsuijo | Vestiaire des bains extérieurs | datsuijo | 46, 73 | 7 × 4 | 90° | 1 | kirizuma |
| rotenburo-toit | Auvent du rotenburo | azumaya | 53, 63 | 6 × 5 | 34° | 1 | auvent |
| moulin | Moulin à eau | moulin | 48, -72 | 8 × 7 | -90° | 1 | chaume |
| haiden | Oratoire du sanctuaire | haiden | -30, -88 | 10 × 8 | 0° | 1 | irimoya |
| honden | Sanctuaire principal | honden | -30, -97 | 6 × 6 | 0° | 1 | kirizuma |
| temizuya | Fontaine aux ablutions | temizuya | -21, -79 | 3 × 2 | -90° | 1 | kirizuma |
| pagode | Pagode rouge à cinq étages | pagode | -42, -119 | 8 × 8 | 20° | 5 | pagode |
| shoro | Pavillon de la cloche | shoro | -32, -113 | 4 × 4 | 20° | 1 | irimoya |
| chashitsu | Maison de thé de l'étang | chashitsu | -100, 68 | 7 × 6 | -42° | 1 | chaume |
| gassho | Ferme au toit de chaume | gassho | -114, -12 | 16 × 10 | 90° | 3 (sous toit) | chaume 60° |
| ferme-kura | Grenier de la ferme | kura | -104, -28 | 6 × 6 | 90° | 2 | kirizuma |
| ferme-grange | Remise aux outils | grange | -126, 5 | 10 × 6 | 0° | 1 | kirizuma |
| belvedere | Pavillon du Belvédère | azumaya | 176, -168 | 4 × 4 | -45° | 1 | yosemune |
| cabane-the | Abri des cueilleurs de thé | grange | 101, -72 | 5 × 4 | -45° | 1 | kirizuma |

Torii (`TORII`) : sandō (-19, -32) 6,5 m ; terrasse du sanctuaire (-27, -73) 5 m ; **Grand Torii** (-6, 120) 9 m ; îlot de l'étang (-138, 78) 2,6 m ;
belvédère (170, -160) 3 m. Escalier aux mille torii : un torii de 3,2 m tous les 1,6 m le long de `torii-mille` (≈ 14).

Règles d'implantation : les machiya de la Grand-Rue sont **mitoyennes à 0,4-1 m près** (front bâti continu, ruelles seulement aux
coupures prévues) ; recul de 1,2 m entre la façade et le bord de la rue (bande de décor) ; aucun bâtiment à moins de 2 m de l'eau
(sauf le moulin, dont la roue est dans le bief) ; plancher des maisons à +0,45 m au-dessus du sol (soubassement de pierre visible).

### 2.6 Eau

**Torrent Yuzawa** (`STREAM`, `STREAM_WATER_Y`, `STREAM_WIDTHS`, `CASCADES`) : 27 points d'amont en aval.

| Tronçon | De → à | Eau (y) | Largeur | Caractère |
| --- | --- | --- | --- | --- |
| Gorge haute | (160, -330) → (118, -222) | 46 → 30 | 4-5 m | rapides blancs, parois 10-25 m, Cascade du Dragon (6 m) et des Trois Marches (3 m) |
| Gorge basse | (118, -222) → (70, -102) | 27 → 10 | 5-6 m | gros blocs moussus, Cascade des Érables (2,5 m), Passerelle des Brumes |
| Moulin | (70, -102) → (61, -72) | 10 → 5,5 | 6 m | rapides puis **seuil du moulin** (1,5 m), bief en bois vers la roue |
| Village | (61, -72) → (82, 62) | 5,5 → 4,4 | 6-7 m | canalisé entre deux murs de pierres sèches de 1,6 m, eau claire sur galets, petits seuils de 0,2 m |
| Sud | (82, 62) → (-80, 122) | 4,4 → 3,4 | 7-7,5 m | berges naturelles, galets, roseaux, gué de pierres |
| Chute | (-93, 112) → étang | 3,3 → 0 | 7,5-10 m | **Cascade aux Koï** (3,3 m) qui tombe sur des rochers dans l'étang |

Profondeur du lit sous l'eau : 0,45 m dans les rapides, 0,8 m au village, 1,2 m dans les vasques au pied des cascades.

**Étang aux koï** (`POND`) : ellipse centrée (-120, 90), demi-axes 40 × 28 m, surface y = 0, fond -2. Îlot (-138, 78) r 5.
Berge est abrupte (escarpement rocheux de 4 à 6 m qui porte la cascade) ; berges nord, ouest et sud douces (roseaux, iris, plage de galets).
Exutoire : un seuil de pierres au sud-ouest (-158, 104) vers une roselière.

**Rotenburo** (`HOT_SPRING_POOL`) : centre (60, 70), rayon 9 m, eau à 5,4, plancher à 6,0. Bord de gros rochers plats, à 20 m du torrent.
**Yubatake** (`YUBATAKE`) : (38, -36), 18 × 8 m, canaux de bois en escalier, eau turquoise laiteuse, dépôts jaunes et blancs, vapeur permanente.

### 2.7 Ponts (`BRIDGES`)

| id | Nom | Type | Rive A → rive B | Largeur | Flèche |
| --- | --- | --- | --- | --- | --- |
| levant | Pont du Levant | pont-route en bois sur culées de pierre | (56, -25,5) → (70, -30,5) | 6,5 | 0,4 |
| vapeur | Pont de la Vapeur | pont-route en bois | (63, 26) → (77, 30) | 6,5 | 0,4 |
| fuji | Pont de Fuji | pont-route en bois | (-9, 131) → (-15, 147) | 7,5 | 0,5 |
| lanternes | Pont des Lanternes | arche de bois (ref-1, ref-4) | (58, 6) → (75, 6) | 2,4 | 1,5 |
| bain | Pont du Bain | arche de bois | (69, 79) → (87, 83) | 2,2 | 1,3 |
| vermillon | Pont Vermillon | taikobashi laqué rouge (ref-2) | (-138, 62) → (-138, 74) | 2,2 | 2,0 |
| zigzag | Planches aux iris | planches en zigzag | (-143, 80) → (-159, 85) | 1,2 | 0 |
| saut | Dalle du Saut | dalle de pierre au-dessus de la cascade | (-99, 115) → (-89, 108) | 1,6 | 0 |
| gue | Gué de pierres | pas japonais dans l'eau | (24, 133) → (27, 146) | 1,2 | 0 |
| brumes | Passerelle des Brumes | passerelle de cordes et planches | (97, -184) → (110, -191) | 1,4 | -0,6 (creux) |

### 2.8 Champs, verger, jardins (`FIELDS`, `ORCHARD`)

- **Rizières en terrasses** : 8 gradins de 9 m de large, 42 à 58 m de long, de x = -142 à -208, altitudes 7 à 14 (1 m par gradin) ; eau miroir à y + 0,15 ; diguettes de terre de 0,5 m.
- **Théiers** : 6 terrasses de 42 × 4,5 m sur le coteau du thé (116 à 141, -82 à -105), altitudes 9 à 19.
- **Verger des Yuzus** : rectangle 54 × 40 m centré (114, 150), yaw 0,6 rad, arbres en quinconce tous les 6 m (≈ 60 arbres), sol à ≈ 11.
- **Yuzus de la mission** (`YUZU_SPOTS`) : (100, 140), (110, 144), (120, 150), (106, 158), (118, 160).
- Potagers : maison de Capy (-24, 30), Étang (-58, 52), Cèdres (-60, -18), ferme (-98, 8). Jardin sec de Mamie (-54, -3). Jardin de mousse du Grand Ryokan (106, 8).
- Prés fleuris : Gué (5, 185) et lisière du verger (140, 150).

## 3. Relief

### 3.1 Principe

Une **vallée de montagne en cuvette** : le village sur un replat, la colline sacrée au nord-ouest, la gorge du torrent au nord-est,
l'étang en contrebas au sud-ouest, puis une couronne de sommets boisés qui **cache totalement les villes voisines** (aujourd'hui, la tour Eiffel
et les gratte-ciel de New York se voient depuis la place : c'est le premier défaut à corriger).

### 3.2 Altitudes cibles (`ALTITUDES`, tolérance ±0,3 m)

| Lieu | (x, z) | y |
| --- | --- | --- |
| Place (strictement plate dans `PLAZA`) | (0, 0) | 6,0 |
| Porte sud / Grand Torii | (-6, 120) | 6,5 |
| Porte du Col (nord) | (14, -102) | 9,0 |
| Porte du Levant | (100, -40) | 7,5 |
| Porte des Yuzus | (106, 86) | 7,0 |
| Porte de l'Étang | (-100, 40) | 6,0 |
| Porte des Cèdres | (-84, -67) | 8,5 |
| Terrasse du sanctuaire | (-30, -84) | 12 |
| Sommet de la pagode | (-42, -116) | 24 |
| Sol du moulin | (48, -72) | 7,5 |
| Plancher du rotenburo | (60, 70) | 6,0 |
| Grand Ryokan | (90, 4) | 6,5 |
| Belvédère | (176, -168) | 60 |
| Ferme | (-114, -12) | 7 |
| Maison de thé de l'étang (sur pilotis) | (-100, 68) | 3,5 |

### 3.3 Formes (`RELIEF`, `PEAKS`, `COLS`)

- **Replat du village** : plat à 6 sur 45 m de rayon, puis pentes de 2 à 5 % ; monte vers le nord (9 à la porte du Col), descend à 5,5 vers le sud.
  Les rues suivent le terrain ; dans la Grand-Rue, une marche de 0,18 m tous les 10-15 m si la pente dépasse 4 % (comme dans les villages en pente).
- **Colline de la Pagode** : sommet plat r 12 à y 24, base r 60, pentes de 30 à 40 % couvertes de cèdres ; **falaise de 8 m** au nord-ouest (-46, -134).
- **Terrasse du sanctuaire** : 26 × 20 m à y 12, tenue au sud par un **mur ishigaki** (pierres sèches inclinées) de 3 m.
- **Gorge de la Yuzawa** : vallée en V de 60 à 80 m de large ; parois rocheuses de 10 à 25 m (roche apparente quand la pente dépasse 45°).
- **Éperon du Belvédère** : replat r 7 à y 60, **falaise de 15 m** côté ouest au-dessus de la gorge.
- **Coteau du thé** : pente 25 % vers le sud-ouest, terrasses en courbes de niveau. **Coteau des Yuzus** : pente 8 % vers l'ouest.
- **Prairie du Levant** : pente douce de 10 à 18 vers l'est. **Prés du Gué** : fond plat 5-6. **Plateau des Susuki** : alpage à 30-33.
- **Cuvette de l'étang** : berges douces à l'ouest, escarpement de 4-6 m à l'est.
- **Rive des bains** : quai haut à 6,5, le torrent 1,6 à 2 m plus bas entre deux murs.
- **Sommets** : Kitsune 150, Tanuki 170, Brumes 140, Crête des Lucioles 75, Hibou 95, Kuma 150, Corbeau 140 (base 140 à 190 m de rayon).
  Profil en dôme avec bruit ridgé, roche au-dessus de 45° de pente, pins rares sur les crêtes.
- **Cols** (r ≈ 300) : Paris 22, New York 24, Désert 20, Japon 16 (140 m de large), Pôle 22, Londres 24. Pente des routes ≤ 8 %.
  **Fenêtre sur le mont Fuji** : vu de la place (œil à 7 m), le secteur des caps 165° à 190° doit rester sous 2° au-dessus de l'horizon (col sud, flancs de la Crête des Lucioles et du mont Hibou) ; le col reste assez haut (16 m) pour masquer la ville moderne du Japon, et des cèdres en garnissent les flancs.
  Au-delà des cols, le terrain redescend vers le sol des régions (6 m) avant leur zone aplatie (r ≈ 420-440 sur les axes).
- Terrain toujours ≥ 0,5 m hors de l'étang (pas d'eau parasite du plan global). Pas de pente > 35 % là où le joueur doit marcher (sauf escaliers).

## 4. Hiérarchie des voies

### 4.1 Règle générale

| Niveau | Où | Revêtement | Largeur | Bordures | Éclairage |
| --- | --- | --- | --- | --- | --- |
| 1. Axes | au-delà des portes, vers les 6 régions | **asphalte** gris un peu usé, ligne axiale blanche discontinue, pas de lignes de rive | 7-9 m | bas-côtés de gravier 1 m, fossé, glissières en bois dans les cols, bornes | aucun (sauf lanternes de pierre aux portes) |
| 2. Rues du village | des portes à la place | **dalles de pierre** irrégulières 60-90 cm (ishidatami), joints moussus | 5-7 m | caniveau de pierre de 30 cm avec eau qui coule, petites dalles-ponts devant les portes | chōchin sous les avant-toits tous les 8-10 m, tōrō aux carrefours |
| 3. Ruelles et promenades | entre les îlots, le long du torrent | dalles plus petites, ou escalier | 2,8-3,5 m | barrière de bambou, garde-corps en bois côté eau, mousse | andon (lanternes de bois sur pied) tous les 6-7 m |
| 4. Sandō | vers le sanctuaire et la pagode | escaliers de pierre (marche 0,18 / giron 0,35), paliers tous les 12 marches | 2,6-3,5 m | mousse, lanternes de pierre en rangée | tōrō tous les 6 m, chōchin sous les mille torii |
| 5. Sentiers | campagne, forêt, montagne | terre tassée (ornières sur les chemins de charrette), gravier, pas japonais | 1,6-3 m | herbe haute, talus, racines, pierres | aucun (lucioles la nuit) |

### 4.2 Tronçons (`PATHS`)

| id | Nom | Revêtement | Largeur | Bordure | Lumière | Particularités |
| --- | --- | --- | --- | --- | --- | --- |
| grand-rue | Grand-Rue | dalles | 7 | caniveau | chōchin / 8 m | front bâti continu, perspective sur le Grand Torii et le mont Fuji |
| rue-col | Rue du Col | dalles | 6 | caniveau | chōchin / 10 m | monte de 6 à 9 m ; marches basses dans la partie haute |
| rue-levant | Rue du Levant | dalles | 6 | caniveau | tōrō / 12 m | longe le yubatake, franchit le Pont du Levant |
| rue-yuzus | Rue des Yuzus | dalles | 6 | caniveau | tōrō / 12 m | longe les bains publics, Pont de la Vapeur |
| rue-etang | Rue de l'Étang | dalles | 5 | bordure de pierre | tōrō / 12 m | descend doucement vers l'étang |
| rue-cedres | Rue des Cèdres | dalles | 5 | bordure de pierre | tōrō / 12 m | longe le pied de la colline sacrée |
| raccord-sud | Pont de Fuji et raccord | asphalte | 7 | talus | — | relie le Grand Torii à l'axe du Japon actuel (-24, 156) |
| sando | Allée du sanctuaire | escalier | 3,5 | mousse | tōrō / 6 m | 6 → 12 m ; torii au pied ; mur ishigaki en haut |
| torii-mille | Escalier aux mille torii | escalier | 2,6 | mousse | chōchin / 4 m | 12 → 24 m, ≈ 14 torii vermillon serrés |
| rue-bains | Promenade des Bains | dalles | 3,5 | garde-corps bois | chōchin / 6 m | rive ouest, saules et érables, bancs |
| quai-ryokan | Quai du Grand Ryokan | dalles | 3 | mur ishigaki | chōchin / 6 m | rive est, terrasse du ryokan |
| ruelle-vapeur | Ruelle de la Vapeur | dalles | 2,8 | barrière de bambou | andon / 7 m | de la Grand-Rue au rotenburo |
| ruelle-lanternes | Ruelle des Lanternes | escalier | 2,8 | mousse | tōrō / 7 m | descend de la Grand-Rue à la Dalle du Saut (vue sur la cascade) |
| chemin-moulin | Chemin du Moulin | gravier | 3 | herbe | tōrō / 14 m | de la Rue du Col à la porte du moulin |
| rive-moulin | Sentier de la rive | pas japonais | 1,8 | mousse | — | du yubatake au moulin par la berge |
| sentier-gorge | Sentier de la Gorge | terre | 2 | talus | — | rive ouest de la gorge, racines, marches de rondins, jusqu'à la Passerelle des Brumes |
| sentier-belvedere | Sentier du Belvédère | terre | 2 | talus | — | lacets dans la forêt jusqu'au belvédère |
| sentier-the | Sentier des Théiers | terre | 2,2 | herbe | — | monte au milieu des terrasses de thé par des marches de pierre ; forme une **boucle** avec la gorge |
| chemin-verger | Chemin du Verger | terre (ornières) | 2,5 | herbe | — | du Pont du Bain au verger |
| chemin-levant | Chemin des Susuki du Levant | terre | 2,2 | herbe | — | de la porte du Levant à la prairie du Levant |
| chemin-ferme | Chemin de la Ferme | terre (ornières) | 3 | herbe | — | de la Rue de l'Étang à la ferme |
| chemin-ferme-nord | Chemin des Rizières | terre (ornières) | 2,5 | herbe | — | longe le haut des rizières (z ≈ -43) |
| tour-etang | Tour de l'étang | pas japonais | 1,8 | mousse | tōrō / 10 m | boucle complète, Pont Vermillon, planches aux iris, Dalle du Saut |
| chemin-gue | Chemin du Gué | terre | 2,2 | herbe | — | de l'axe du Japon aux Prés du Gué |
| chemin-susuki-nord | Chemin du Plateau | terre | 2 | talus | — | de la pagode au Plateau des Susuki par le bois sacré |
| gue-pierres | Gué de pierres | pas japonais | 1,6 | mousse | — | traverse le torrent au sud |

### 4.3 Transitions

- **Aux portes** (`VILLAGE_GATES`) : 6 m de dalles qui se mêlent à des pavés de granit, puis une bordure de pierre franche, puis l'asphalte
  (point `asphaltFrom`). Porte : portail de bois couvert (Col, Étang, Cèdres), deux grandes lanternes de pierre (Levant, Yuzus), Grand Torii (sud).
  Une borne de pierre gravée et un poteau indicateur à chaque porte.
- **Rue → ruelle** : la ruelle démarre par une marche et un seuil de pierre ; la dalle devient plus petite et plus moussue.
- **Village → sentier** : les dalles se disjoignent sur 5 m (herbe entre elles), puis gravier, puis terre.
- **Terre en forêt** : racines apparentes, feuilles mortes, marches de rondins dans les pentes > 15 %.
- Les **véhicules** circulent sur les axes et les six rues dallées (à basse vitesse) ; les ruelles, escaliers et sentiers sont fermés aux
  véhicules par des marches, bornes de pierre ou barrières de bambou.
- **Point important pour les Routes** : la partie des axes actuels (`ROADS` de `layout.ts`) située **à l'intérieur des portes** doit disparaître
  (aujourd'hui l'axe du Désert traverse le rotenburo et l'axe du Japon passe à côté du Grand Torii) : les axes commencent à `asphaltFrom`.

## 5. Points de repère et lignes de vue

### 5.1 Repères (`LANDMARKS`)

1. **Pagode rouge** (-42, -119), sommet à y ≈ 51 : visible de toute la vallée, toujours en silhouette sur la forêt sombre.
2. **Grand Cerisier** (-9, -7), 13 m : rose vif, visible du bout de chaque rue.
3. **Colonnes de vapeur** : yubatake (38, -36), cheminée des bains publics (46, 7), rotenburo (60, 70) ; 15 à 25 m de haut, éclairées en contre-jour à l'aube.
4. **Grand Ryokan** (90, 4) : la plus grande masse bâtie, 3 niveaux de shōji lumineux sur le torrent.
5. **Roue du moulin** (57, -72) : mouvement lent visible depuis la Rue du Col.
6. **Grand Torii** (-6, 120), 9 m : ferme la Grand-Rue.
7. **Cascade aux Koï** (-94, 111) : bruit et brume, on l'entend avant de la voir.
8. **Pavillon du Belvédère** (176, -168) : petite silhouette sur l'éperon, promesse d'exploration.
9. **Toit de chaume de la ferme** (-114, -12) : grand triangle doré à l'ouest.
10. **Mont Fuji** (région Japon, cap ≈ 174° depuis la place, juste à gauche du Grand Torii) dans la fenêtre du col sud, et le **mont Tanuki** au nord-est avec la gorge dans la brume.

### 5.2 Vues composées (`VIEWPOINTS`, aussi utilisées pour les captures de revue)

| id | Position | Cap | Ce qu'on doit voir |
| --- | --- | --- | --- |
| depart | (-3, 26) | 0° | **Sortie de la maison** : la place, le Grand Cerisier au centre-gauche, le puits, Mamie Capy avec son « ! » ; au fond, le torii du sandō, l'escalier et la pagode sur la colline (cap -15°) ; à droite, la vapeur du yubatake |
| place-sud | (0, 10) | 180° | la Grand-Rue entre deux fronts de machiya, lanternes, le Grand Torii (cap 183°), le mont Fuji juste à sa gauche (cap 174°) |
| pont-lanternes | (66, 6) | 5° | le torrent entre ses murs, la roue du moulin, la gorge et le mont Tanuki dans la brume (ref-4) ; le Grand Ryokan en bord de cadre à droite |
| rotenburo | (58, 72) | 120° | le bain fumant, le Pont du Bain, l'érable rouge, le verger de yuzus (ref-1) |
| pagode | (-38, -108) | 165° | **carte postale** : toits du village, colonnes de vapeur, Grand-Rue jusqu'au torii, mont Fuji au fond (ref-3 inversée) |
| etang | (-138, 68) | 110° | l'étang, la maison de thé à gauche, la cascade aux Koï, cerisiers ; l'îlot à droite (ref-2) |
| belvedere | (174, -166) | 220° | toute la vallée, le village (cap 226°), la pagode, l'étang ; le mont Fuji au sud, en bord gauche du cadre (ref-7 pour l'esprit, sans rien copier) |

### 5.3 Guidage du regard

- **En sortant de la maison**, le joueur regarde le nord : la composition en trois plans (cerisier et PNJ / torii et escalier / pagode sur le ciel, cap -15°)
  l'invite à explorer la place puis à monter. Mamie Capy est à 30 m, dans l'axe, sous le cerisier : c'est la première mission.
- **Mission de la source chaude** : la vapeur du rotenburo se voit depuis la place par-dessus les toits (sud-est) ; la Ruelle de la Vapeur s'ouvre
  dans la Grand-Rue à 40 m de la maison avec une enseigne 温泉 et des andon allumés.
- **Verger** : visible depuis le rotenburo à travers le Pont du Bain (jaune des fruits sur le vert sombre).
- **Moulin** : la Rue du Col monte vers le nord ; la roue apparaît à droite entre deux maisons, au bout du Chemin du Moulin bordé de lanternes.
- **Étang** : on l'entend depuis la Grand-Rue (cascade) ; la Ruelle des Lanternes descend vers la Dalle du Saut avec vue plongeante.
- **Sorties** : chaque rue est cadrée par une porte et, au-delà, par un col entre deux sommets ; un poteau indicateur à chaque porte et un
  grand panneau à six flèches sur la place (au pied du cerisier).
- Règles : chaque carrefour montre au moins un repère ; aucune rue ne se termine sur un mur aveugle ; les fins de rue montrent un torii,
  une lanterne, un arbre remarquable ou un col.

## 6. Biomes, transitions et densités

| Biome | Où | Essences et sol | Densité cible |
| --- | --- | --- | --- |
| Village | r < 110 | dalles, mousse aux joints, pots et bacs, arbres isolés (`FEATURE_TREES`), haies de bambou | 1 objet de décor par 1,5 m de façade ; place ≥ 60 objets ; 1 arbre isolé par 400 m² d'espace libre |
| Jardins | autour des maisons | mousse, gravier ratissé, pins taillés, érables, azalées, pierres | 1 arbuste / 4 m², 1 rocher / 10 m², 1 lanterne par jardin |
| Berges du torrent | le long de `STREAM` | gros blocs moussus, galets, fougères, érables penchés | 10 à 20 rochers par 100 m de berge et par rive, fougères 2 / m² sur 2 m de bande |
| Bois sacré | (-62, -160) r 32 | cèdres japonais (sugi) géants, sous-bois de fougères et mousse | 260 arbres / ha, fougères 0,5 / m², 1 souche / 100 m² |
| Forêts de montagne | `FOREST_BELTS` | cèdres (Col, Hibou, Kuma), mixte cèdres-érables-pins (Brumes, Lucioles), pins (Corbeau) | 140 à 220 arbres / ha ; lisières 4 m d'arbustes ; rochers 1 / 100 m² |
| Érablière de la gorge | (112, -215) r 55 | érables rouges et orangés, pins, rochers, fougères | 220 arbres / ha, rochers 4-6 / 100 m² |
| Bambouseraie | (-52, 112) r 14 | bambous serrés, sol de feuilles | 2 500 chaumes / ha (en touffes) |
| Prairies de susuki | `TALL_GRASS_ZONES` | grandes graminées argentées de 1,2-1,6 m, fleurs sauvages, rochers épars | 1,5 touffe / m², fleurs 0,5 / m², 1 rocher / 200 m² |
| Prés et bords de chemins | campagne ouverte | herbe 0,2-0,5 m, trèfle, pissenlits, fleurs | herbe pleine, fleurs 0,3 / m² |
| Rizières | `FIELDS` riziere | eau miroir, touffes de riz, diguettes en herbe | 16 touffes / m² (instanciées, LOD) |
| Théiers | `FIELDS` the | haies de théiers arrondies de 0,9 × 1,2 m en lignes continues | 1 haie par terrasse, allée de 1 m |
| Verger | `ORCHARD` | yuzus de 3-4 m, herbe rase, fruits tombés | 1 arbre / 36 m² |
| Étang | `POND` | nénuphars, iris, roseaux, galets, cerisiers et érables | roseaux 4 / m² sur 3 m de bande (berges douces), 30 nénuphars |
| Crêtes | au-dessus de 80 m | roche, pins noirs tordus, herbe rase | 30 arbres / ha |

Transitions : jamais de bord net. Village → campagne : jardins, puis haies de bambou, puis pré. Pré → forêt : lisière de 4-8 m d'arbustes, fougères
et jeunes arbres. Pré → prairie de susuki : 6 m de touffes de plus en plus hautes (la limite reste lisible pour le joueur : couleur argentée
et hauteur). Berge : galets → rochers → fougères → herbe. Les arbres respectent un retrait de 3 m autour des chemins et de 5 m autour des bâtiments.

## 7. Architecture

Règle commune : **bois sombre patiné** (`#5a3a24` à `#7a5236`), **enduit clair** (papier `#f4e6c8`, argile), **tuiles kawara anthracite** (`#3e4247`),
soubassement de pierres, tout avec usure, salissures en pied de mur, coulures sous les avant-toits, mousse côté nord.
Tout bâtiment est un modèle Blender (`tools/blender/buildings/`) exporté en `.glb` avec 3 LOD.

### 7.1 Éléments communs (chaque façade doit les avoir)

- Soubassement en pierres sèches ou bois brûlé noir (yakisugi) de 0,45 m ; marches de pierre (0,18 m) devant chaque entrée ; galets en pied de mur (zone de pluie).
- Poteaux carrés de 15 cm tous les 1,82 m, poutre sablière visible, panneaux d'enduit entre les poteaux.
- Ouvertures en **vrai relief** : cloisons shōji (quadrillage de 25 × 30 cm, papier translucide éclairé la nuit), grilles koshi (lattes de 3 cm), volets coulissants amado.
- Avant-toit (hisashi) de 0,9 m au-dessus du rez-de-chaussée, tuiles modélisées, chevrons visibles en sous-face.
- Toit : épaisseur réelle, faîtage avec tuiles d'about (onigawara) aux extrémités, débord de 0,9 à 1,2 m, rives légèrement relevées, gouttière et **chaîne de pluie** (kusari-doi).
- Entrée : **noren** (rideau à 2-3 pans, tissu qui bouge au vent), lanterne de papier ou de bois, enseigne (kanban) peinte non inversée.
- Détails : barrière courbe de bambou au pied des murs (inu-yarai), bois empilé, pots, seaux, balai, vélo ou charrette à bras, plaque de nom.

### 7.2 Typologies

| Type | Proportions | Éléments spécifiques | Variations |
| --- | --- | --- | --- |
| **Machiya** (échoppe) | 1-2 niveaux (RDC 3 m, étage bas 2,2 m), 8-10 × 9-11 m, pignon sur le côté | façade boutique ouverte avec estrade de vente (shōgi), étals garnis, grilles koshi, fenêtres d'étage à barreaux enduits (mushiko-mado), double enseigne (verticale + au-dessus de l'auvent) | 4 couleurs de noren, 3 états d'usure, commerce indiqué par les produits (voir §8) |
| **Minka** (maison) | 1 niveau + combles, 8-10 × 7-9 m | engawa (coursive de bois) côté jardin, amado, mur d'argile, clôture de bambou, jardinet | toit kirizuma ou irimoya, 1 sur 4 avec étage partiel |
| **Ryokan** | 2-3 niveaux, 12-26 m de façade | entrée genkan sous pignon courbe (karahafu), grands noren, rangée de lanternes rouges, balcons à balustres sur le torrent, rangées de shōji lumineux, pins taillés à l'entrée | Grand Ryokan : 3 niveaux en retrait progressif, deux ailes ; petit ryokan Momiji : érable devant |
| **Sentō** (bains publics) | volume haut de 7 m, 16 × 12 m | toit irimoya + entrée karahafu, **grand noren 温泉**, cheminée de briques de 14 m qui fume, claire-voie haute qui laisse sortir la vapeur, pyramide de seaux en bois | — |
| **Chaya** (maison de thé) | 2 niveaux, 12 × 9 m | banquettes recouvertes de tissu rouge, grande ombrelle rouge, lanterne 茶, bannière verticale, auvent profond | — |
| **Kura** (grenier) | 2 niveaux, 6 × 6 m | murs blancs épais, soubassement en carreaux noirs à joints blancs en losange (namako), petites fenêtres à volets épais, porte massive | blanc ou noir |
| **Honjin** (maison de Mamie) | 2 niveaux, 12 × 12 m | portail couvert, mur de clôture coiffé de tuiles, jardin sec ratissé, grande engawa | — |
| **Gasshō** (ferme) | toit de chaume à 60°, 16 × 10 m, 3 niveaux sous toit | chaume épais de 0,8 m, petites fenêtres dans le pignon, structure de bois visible, fumée du foyer à travers le chaume | — |
| **Sanctuaire** (haiden, honden, temizuya, shōrō) | haiden 10 × 8, honden 6 × 6 surélevé | laque vermillon et blanc, toit en cuivre vert-de-gris, poutres croisées au faîtage (chigi, katsuogi), cloche et corde, boîte à offrandes, corde de paille tressée avec papiers en zigzag, deux **capybaras de pierre gardiens** | — |
| **Pagode** | 5 étages, base 8 m, retrait de 0,8 m par étage, 27 m avec la flèche | consoles de bois peintes sous chaque toit, débords de 2,2 m aux coins relevés, clochettes aux angles, balcon au 1er étage, flèche de bronze à 9 anneaux (7 m), socle de pierre 10 × 10 × 1 m | — |
| **Moulin à eau** | 8 × 7 m, chaume | roue à augets de 5,5 m, bief en bois sur tréteaux qui fuit, engrenages visibles par la porte, meules, sacs | — |
| **Chashitsu** (maison de thé de l'étang) | 7 × 6 m, chaume | engawa sur pilotis au-dessus de l'eau, petite porte basse, fenêtre ronde, bambou | annexe du Grand Ryokan : toit de tuiles |
| **Azumaya** (pavillon) | 4 × 4 m | 4 poteaux, toit pyramidal, banc périphérique | belvédère, auvent du rotenburo |
| **Torii** | myōjin : piliers vermillon ⌀ 0,5 m, socles noirs, linteau supérieur noir courbe ; shinmei : bois brut, linteau droit | — | 2,6 à 9 m |
| **Petits ouvrages** | puits couvert (margelle ronde, toit à deux pans, poulie, seau), ashiyu (bassin de pierre fumant, banc, toit léger), yatai (chariot-échoppe, auvent de tissu, lanterne rouge), datsuijo (cabane et étagères à paniers) | — | — |

Enseignes autorisées (peintes, jamais en miroir, avec petite plaque en français) : 温泉 bains, 湯 eau chaude, 茶 thé, 宿 auberge, 甘味 douceurs,
蕎麦 nouilles, 団子 dango, 傘 parapluies, 提灯 lanternes, 薬草 herbes, 玩具 jouets, 柚子 yuzus. Pas d'alcool, pas de logos réels.

## 8. Décor et récit par le lieu (environmental storytelling)

### 8.1 Listes par lieu

- **Place du Grand Cerisier** : cerisier pleureur soutenu par 4 béquilles de bois et ceint d'une corde ; tapis de pétales ; puits couvert avec seau et louche ;
  bain de pieds avec 3 capybaras PNJ qui trempent leurs pattes ; 3 yatai (patates douces, masques et moulinets, œufs cuits à la source dans un panier) ;
  panneau à six flèches ; tableau d'affichage des missions (kōsatsu) ; 6 bancs ; 8 lanternes de pierre ; guirlandes de chōchin tendues entre les façades ;
  pots de fleurs, tonneaux de sauce et de miso, cageots de légumes, seaux d'arrosage (on mouille le dallage le matin : **reflets** comme sur ref-3).
- **Grand-Rue** : devant chaque échoppe, ses produits (manjū fumants dans des paniers vapeur, lanternes suspendues, poteries alignées, yuzus en cagettes,
  jouets de bois, parapluies ouverts qui sèchent, bocaux d'herbes) ; caniveau d'eau claire avec dalles-ponts ; banquettes ; pots de bonsaï ;
  vélos et charrettes à bras ; bannières verticales colorées ; chat endormi.
- **Quartier des Bains** : yubatake (canaux de bois, dépôts jaunes, barrière de pierre, panneau explicatif) ; promenade avec saules et lanternes sur
  poteaux ; sandales de bois alignées devant les bains ; paniers de serviettes ; fontaine d'eau chaude ; bancs ; pyramide de seaux ; bouilloire géante.
- **Rotenburo** : bassin de rochers moussus, bec de bambou (kakehi) qui verse l'eau chaude, **yuzus qui flottent**, petites serviettes pliées sur la tête
  des capybaras, auvent avec lanterne et enseigne 温泉, palissade de bambou côté chemin, seau de bois flottant, érable rouge au-dessus.
- **Moulin** : roue, bief qui goutte, sacs de riz, meules, tas de son, charrette à bras, échelle, chat du meunier.
- **Colline sacrée** : rangées de lanternes de pierre moussues, temizuya avec louches de bambou, plaques votives (ema) dessinées par les enfants,
  boîtes à offrandes, corde tressée autour du **cèdre géant**, mille torii, capybaras gardiens, cloche de bronze, feuilles balayées en tas, balai de bambou.
- **Sommet de la pagode** : pin noir tordu, banc, table d'orientation (vers le mont Fuji et les six régions), longue-vue à pièce.
- **Étang** : carpes koï, nénuphars, iris, roseaux, lanterne à pieds sur l'îlot, ponton et barque, filets du pêcheur qui sèchent, cascade et brume, cerisiers et érables.
- **Ferme** : séchoirs à riz avec bottes suspendues, bois empilé sous l'avant-toit, outils, charrette, poules, épouvantail, potager, jarres, bambous coupés.
- **Rizières** : diguettes, petits canaux et vannes en bois, épouvantails, hérons, libellules.
- **Théiers** : paniers de cueillette, abri des cueilleurs, petites statues de pierre (jizō) au bonnet rouge.
- **Verger** : échelles, paniers et caisses de yuzus, fruits tombés (certains grignotés : indice des Grignoteurs), cabane à outils.
- **Sentiers et forêt** : jizō au bord des chemins, petits autels de bois, poteaux indicateurs, souches, troncs couchés, champignons, fougères, rochers moussus.
- **Prairies à ennemis** : ronces violettes (signature des Grignoteurs), panneau de bois « Attention aux Grignoteurs ! », panier renversé, rochers épars, souches.
- **Belvédère** : pavillon, banc, petit torii, cairn, longue-vue.

### 8.2 Modèles Poly Haven à utiliser (ids exacts de `api.polyhaven.com/assets?type=models`)

Les essences japonaises (cèdre sugi, érable momiji, cerisier, bambou, yuzu, pin noir) **n'existent pas** sur Poly Haven : elles se font dans Blender
(géométrie + cartes de feuilles) avec les écorces Poly Haven ci-dessous. Les modèles marqués ⚠ sont très lourds : décimer dans Blender (cible indiquée)
ou s'en servir uniquement pour cuire des imposteurs.

| Usage | ids | Remarques |
| --- | --- | --- |
| Rochers moussus (berges, jardins, rotenburo, forêt) | `rock_moss_set_01`, `rock_moss_set_02`, `boulder_01`, `rock_07`, `rock_09`, `stone_01` | 20-120 k triangles : LOD0 ≤ 8 k, LOD1 ≤ 2 k |
| Parois et falaises (gorge, pagode, belvédère) | `rock_face_01`, `rock_face_02`, `mountainside`, ⚠ `coastal_cliff_04`, ⚠ `coast_rocks_05` | décimer à ≤ 30 k ; teinter vers la pierre grise `#8f8a80` |
| Sol de forêt et sous-bois | `moss_01`, `fern_02`, `pine_roots`, `root_cluster_01`, `root_cluster_02`, `single_root`, `dry_branches_medium_01`, ⚠ `bark_debris_01` | fougères instanciées |
| Herbes et fleurs | `grass_medium_01`, `grass_medium_02`, `nettle_plant`, `weed_plant_02`, `dandelion_01`, `periwinkle_plant`, ⚠ `celandine_01` | servent de modèles pour les cartes d'herbe |
| Arbustes | `shrub_01`, `shrub_02`, `shrub_03`, `shrub_04`, `shrub_sorrel_01` | haies et lisières |
| Souches et bois mort | `tree_stump_01`, `tree_stump_02`, `dead_tree_trunk`, `dead_tree_trunk_02` | forêts et prairies |
| Conifères (base des pins et sapins de crête) | `pine_sapling_small`, `fir_sapling`, ⚠ `fir_sapling_medium`, ⚠ `fir_tree_01`, ⚠ `pine_tree_01`, ⚠ `pine_sapling_medium` | les ⚠ uniquement pour cuire des imposteurs |
| Seaux, baquets, tonneaux | `wooden_bucket_01`, `wooden_bucket_02`, `wooden_barrels_01`, `wine_barrel_01` (re-texturé en tonneau de miso), `Barrel_02`, `barrel_03` | bains, place, ferme |
| Caisses, paniers, poteries | `wooden_crate_01`, `wooden_crate_02`, `wicker_basket_01`, `wicker_basket_02`, `ceramic_pot`, `ceramic_vase_01` à `ceramic_vase_04`, `planter_pot_clay`, `jug_01`, `brass_pot_01` | étals, potier, jardins |
| Vaisselle et étals | `tea_set_01`, `wooden_bowl_01`, `wooden_bowl_02`, `wooden_cutting_board`, `carved_wooden_plate`, `chinese_tea_table`, `chinese_stool` | maison de thé, soba |
| Fruits et légumes | `food_lime_01` (teinté jaune = yuzu), `lemon`, `food_pears_asian_01`, `sweet_potato`, `food_ginger_01`, `yellow_onion` | yuzus de la mission, yatai, marché |
| Mobilier et outils | `wooden_stool_01`, `wooden_stool_02`, `folding_wooden_stool`, `wooden_broom`, `wooden_ladder`, `wooden_ladder_02`, `wooden_axe`, `handsaw_wood`, `wooden_hammer_01` | ateliers, verger, ferme |
| Éclairage et feu | `wooden_lantern_01` (lanterne suspendue de ryokan), `stone_fire_pit` | les tōrō et chōchin se font dans Blender |
| Pontons, plantes en pot | `modular_wooden_pier`, `potted_plant_01`, `potted_plant_02`, `planter_box_01` à `planter_box_03` | étang, façades |

Textures Poly Haven conseillées (ids de `type=textures`) : écorces `japanese_cedar_bark`, `sakura_bark`, `trident_maple_bark`, `japanese_zelkova_bark`,
`pine_bark` ; bois `japanese_cedar_planks`, `hinoki_planks`, `weathered_planks`, `dark_wooden_planks`, `lacquered_cherry_wood`, `bamboo_wall`, `bamboo_wall_02`,
`tatami_mat` ; toits `grey_roof_tiles`, `grey_roof_tiles_02`, `thatch_roof_angled`, `reed_roof_04` ; murs `white_plaster_rough_01`, `clay_plaster`,
`worn_mossy_plasterwall`, `japanese_stone_wall`, `stacked_stone_wall`, `mossy_stone_wall` ; sols `stone_pathway`, `stone_pathway_02`, `grey_stone_path`,
`wood_stone_pathway`, `mossy_cobblestone`, `gravel_ground_01`, `raked_dirt`, `stony_dirt_path`, `muddy_tracks`, `forest_ground_04`, `leaves_forest_ground`,
`forest_leaves_02`, `river_small_rocks`, `clean_pebbles`, `mossy_rock`, `rock_pitted_mossy`, `lichen_rock`, `rocky_trail`, `sparse_grass`, `leafy_grass` ;
asphalte `asphalt_02`, `worn_asphalt`.

### 8.3 Objets à modéliser dans Blender (absents de Poly Haven)

Lanterne de pierre tōrō (3 modèles : kasuga, yukimi à pieds, oki-dōrō bas), lanterne de papier chōchin (rouge, blanche, avec texte), andon de bois,
noren (tissu animé), enseignes, ombrelle rouge, banquette de thé, yatai, paniers vapeur, clôtures de bambou (kenninji, yotsume), inu-yarai, bec de bambou kakehi,
shishi-odoshi (bascule de bambou qui toque), torii (2 types), capybaras de pierre gardiens, jizō, ema, corde tressée, séchoir à riz, épouvantail,
roue de moulin, parapluies de papier, sandales de bois, serviettes pliées, lanterne d'îlot, nénuphars, iris, touffes de susuki, touffes de riz, théier.

## 9. Lumière et ambiance

L'heure de départ par défaut est **6 h 45 (aube dorée)** : c'est la lumière des références. Le cycle reste complet.

**Course du soleil demandée** : lever au cap ≈ 110° (est-sud-est, direction monde `(0,94 ; 0,34)` en x, z), midi plein sud (cap 180°, élévation ≈ 60°),
coucher au cap ≈ 250°. Ainsi, à l'aube, la pagode et la Grand-Rue reçoivent une lumière rasante de côté, et depuis la pagode on voit le soleil se lever
à gauche du mont Fuji (ref-1). (Aujourd'hui le soleil se lève côté -x : à corriger dans `sky.ts`.)

| Moment | Heures | Soleil | Ciel et brouillard | Ombres | Particularités |
| --- | --- | --- | --- | --- | --- |
| Aube | 5 h 30-8 h | `#ffb070`, intensité 2,2, élévation 3-15° | horizon `#f6b26b` → `#f8d0a0`, zénith `#8fa8c8` ; **brume au sol** dense sous y = 20 dans la vallée et la gorge, éclaircie au-dessus | longues, bleutées `#6a7aa0` | rayons à travers la brume et les arbres (god rays), vapeur rétro-éclairée, rosée brillante, lanternes encore allumées jusqu'à 7 h |
| Jour | 9 h-16 h | `#fff4e0`, intensité 3 | `#9cc4e8`, voile léger `#d8e4ec`, nuages cumulus | nettes, bleu doux | couleurs saturées des érables et cerisiers, eau turquoise, reflets |
| Crépuscule | 17 h-19 h 30 | `#ff8a40`, intensité 1,8 | orange-rose-violet, brume qui remonte des berges | longues, violettes | **lanternes allumées à 18 h**, shōji qui s'éclairent progressivement, oiseaux qui rentrent |
| Nuit | 20 h-5 h | lune `#8aa0d0`, intensité 0,25 | bleu nuit `#1a2440` lisible, étoiles | douces | flaques de lumière orange `#ffb060` (2700 K) sous chaque lanterne, shōji `#ffd8a0`, vapeur éclairée par en dessous, lucioles au-dessus de l'eau et des rizières, reflets des lanternes dans le torrent |

Palette : bois `#5a3a24`-`#7a5236`, tuiles `#3e4247`, laque `#b8342a`, papier `#f4e6c8`, mousse `#5f7a3a`, pierre `#8f8a80`, cerisier `#f4b8cc`,
érable `#c8402a`, susuki `#d8d0b0`, eau du torrent `#5a8a7a` (claire sur galets), eau du rotenburo `#9adcd4` laiteuse.
Lumières dynamiques : au plus 8 lumières ponctuelles actives (les plus proches du joueur), les autres en émissif + tache de lumière peinte au sol.

## 10. Gameplay dans l'espace

### 10.1 Prairies à ennemis (`TALL_GRASS_ZONES`, `ENEMY_NESTS`, `ENEMY_RULES`)

| id | Nom | Centre | Rayon | Altitude | Ennemis | Difficulté | Accès |
| --- | --- | --- | --- | --- | --- | --- | --- |
| levant | Prairie des Susuki du Levant | (158, 18) | 26 m | ≈ 14 | 5 | 1 | porte du Levant puis Chemin des Susuki (60 m) |
| gue | Prés du Gué | (-92, 200) | 26 m | ≈ 5,5 | 5 | 2 | Pont de Fuji puis Chemin du Gué |
| plateau | Plateau des Susuki | (-100, -190) | 24 m | ≈ 31 | 6 | 3 | sommet de la pagode puis Chemin du Plateau par le bois sacré |

- Chaque prairie a 3 nids (cachettes d'où surgissent les Grignoteurs) ; patrouille en boucle à 0,55 × rayon autour du centre ;
  ils repèrent le joueur à 8 m, ne s'éloignent jamais de plus de 6 m de leur prairie, réapparaissent après 90 s.
- Le joueur voit la limite : herbes argentées plus hautes que lui, ronces violettes, panneau d'avertissement à l'entrée du chemin.
- **Zones sûres** (`SAFE_ZONES`) : tout le village (r 110), le rotenburo, l'étang, le belvédère, la ferme. Aucun ennemi n'y entre.
- Réveil après défaite (cœurs à zéro) : au bord du rotenburo, (52, 66), sans perte.
- **Mini-mission de combat** : « Les Grignoteurs du Levant », donnée par la Gardienne Sora à la porte du Levant ; chasser les 5 Grignoteurs de la prairie du Levant.

### 10.2 PNJ et objectifs (`NPC_SPOTS`, `VEHICLE_SPOTS`, `MILL_POS`, `YUZU_SPOTS`, `SPAWN`)

| Mission | Donneur et position | Objectif |
| --- | --- | --- |
| Bienvenue à Capyville | Mamie Capy (5, -3) sous le cerisier | bain au rotenburo (60, 70) **inchangé** ; 5 yuzus du verger (`YUZU_SPOTS`) ; retour à Mamie |
| Premier volant | Coach Capy (20, -108), cabriolet (25, -112) juste après la porte du Col | anneaux sur l'axe de Paris **au-delà de la porte** |
| Plouf ! | Nina (-110, 60), ponton de la rive nord | 3 étoiles autour du centre de l'étang (-120, 90) **inchangé** |
| Clic-clac | Léo (2, -43) devant son studio, Rue du Col | photo du **moulin à eau (48, -72)** ; chapeau chez Basile (-6, -20,5) ; retour à Léo |
| Les Grignoteurs du Levant (nouvelle) | Gardienne Sora (96, -33) | prairie du Levant |

Autres PNJ : meunier (44, -66), hôtesse de la maison de thé (17, -22,5), 2 capybaras zen dans le rotenburo (63, 68) et (57, 73),
promeneurs sur la place, la Grand-Rue et la Promenade des Bains. Apparition du joueur : (-3, 26), regard vers le nord (yaw π). Scooter garé au Grand Torii (2, 126).

## 11. Budget performance et LOD

Budget global en qualité « Moyenne » : **< 700 appels de dessin, < 3 M triangles** dans le village (aujourd'hui : 2 052 appels et 3,2 M triangles
sur la vue aérienne). Assets du village < 80 Mo.

| Zone (caméra dedans) | Appels | Triangles | Lumières dynamiques |
| --- | --- | --- | --- |
| Place + Grand-Rue | 650 | 2,8 M | 8 |
| Quartier des bains | 600 | 2,6 M | 8 |
| Colline sacrée | 450 | 2,0 M | 6 |
| Étang | 450 | 2,0 M | 6 |
| Prairies et forêts | 400 | 2,5 M | 2 |

Stratégie :
- **Bâtiments** : un `.glb` par typologie avec variantes de matériaux ; LOD0 < 45 m (≤ 40 k triangles pour une machiya, ≤ 120 k pour le Grand Ryokan,
  ≤ 90 k pour la pagode), LOD1 45-140 m (25 %), LOD2 140-400 m (boîte texturée cuite), au-delà caché sauf pagode et Grand Ryokan (toujours en LOD2).
- **Objets** : instanciés par modèle (`InstancedMesh`), LOD0 < 25 m, LOD1 < 60 m, cachés au-delà. Un atlas de matériaux par famille (bois, pierre, céramique, tissu).
- **Arbres** : LOD0 < 40 m (cartes de feuilles), LOD1 < 120 m (moins de cartes), imposteurs à 8 vues jusqu'à 600 m, puis forêt peinte dans la texture du terrain.
- **Rochers** : LOD0 < 30 m, LOD1 < 90 m, LOD2 < 300 m.
- **Herbe** : uniquement dans un rayon de 60 m (densité dégressive), relais par la texture du terrain.
- Ombres en cascade : seulement les objets à moins de 80 m projettent une ombre ; objets < 0,5 m sans ombre.
- Regroupement spatial par cellules de 50 m pour le tri et le frustum culling ; décor statique fusionné par cellule et par matériau.

## 12. Critères de revue (captures de chaque passage)

Je juge chaque passage sur les 7 vues de `VIEWPOINTS` plus les 6 vues de la grille (place, rue, maison, prairie, nuit, combat), en qualité Moyenne.
Un critère n'est validé que s'il se voit.

**Composition et lisibilité**
1. Vue `depart` : cerisier, torii du sandō, escalier et pagode sur le ciel sont tous dans le cadre, la pagode se détache.
2. Vue `place-sud` : front bâti continu des deux côtés, Grand Torii au bout, mont Fuji visible.
3. Aucune ville voisine visible depuis le village ou la pagode (tour Eiffel, gratte-ciel, Big Ben).
4. Au moins un repère visible depuis chaque carrefour ; aucune rue qui finit sur un vide.
5. Hiérarchie des voies lisible : asphalte uniquement au-delà des portes, dalles au village, terre en campagne.

**Relief et nature**
6. On voit des pentes partout hors du village (pas de plaine) ; falaises de la pagode et du belvédère visibles.
7. Le torrent coule (mouvement, écume, cascades), entre ses murs au village, sur ses galets ailleurs ; ponts conformes à `BRIDGES`.
8. Lisières progressives, pas d'arbre au milieu d'un chemin ni collé à un mur ; densités du §6 respectées à vue d'œil.
9. Les prairies à ennemis se distinguent instantanément du reste.

**Architecture et décor**
10. Chaque bâtiment a les éléments du §7.1 (soubassement, poteaux, shōji en relief, avant-toit, toit épais avec chevrons, noren, lanterne).
11. Pas deux façades identiques côte à côte (noren, usure, enseigne, produits différents).
12. Bande de décor de 1,2 m devant chaque façade remplie (1 objet / 1,5 m) ; place ≥ 60 objets ; aucune surface plate vide dans le champ.
13. Objets posés : rien ne flotte, rien ne s'enfonce, rien ne traverse un mur ; échelle juste par rapport au capybara (porte 1,9 m).

**Lumière et rendu**
14. Aube : soleil rasant, brume au sol, rayons, vapeur rétro-éclairée, ombres bleutées ; nuit : flaques orange sous les lanternes, shōji lumineux, scène lisible.
15. Matières crédibles de près (bois veiné, pierre moussue, tuiles en relief, eau qui reflète) ; aucune grande surface unie.

**Technique et jeu**
16. Budget respecté (appels, triangles) sur chaque vue, aucune erreur console.
17. Les PNJ et objectifs sont aux positions de `NPC_SPOTS` / `YUZU_SPOTS` / `MILL_POS` ; les 4 mini-missions passent au test automatique.
18. Collisions : on peut marcher partout où il y a un chemin, monter les escaliers, traverser les ponts ; on ne traverse ni murs ni rochers.

## 13. Liste de production par spécialité (par ordre de priorité)

### Terrain & relief (`heightmap.ts`, `terrain.ts`)
1. Remplacer l'aplatissement de Capyville (`cityRadius` 150 + 80 m) par le relief de §3 : replat, `RELIEF`, `PEAKS`, `COLS`, `ALTITUDES` (importer `zones.ts`).
2. Creuser le lit du torrent sous `streamAt()` (profondeur `STREAM_BED_DEPTH`), murs verticaux au village, berges naturelles ailleurs, vasques sous `CASCADES`.
3. Cuvette de l'étang avec escarpement est (garder `HUB_POND` = (-120, 90), lire `POND`) ; garder la source à (60, 70) (`HOT_SPRING_POOL`).
4. Plats exacts : place, terrasse du sanctuaire, sommet de la pagode, belvédère, gradins des rizières et des théiers (`FIELDS.y`), emprises des bâtiments (plancher).
5. Couches de surface (splat) : roche au-dessus de 45°, galets en bord d'eau, terre des chemins, mousse sous les forêts, herbe rase au village.
6. Couronne de montagnes qui masque les régions voisines (vérifier depuis la place et la pagode), raccord propre vers les régions au-delà des cols.

### Végétation (`vegetation.ts`, `grass.ts`, `src/procgen/flora/**`)
1. Arbres Blender à cartes de feuilles : cerisier pleureur, cerisier, érable rouge, cèdre sugi (dont géant 34 m), pin noir, bambou, yuzu (fruits).
2. Placement par `FOREST_BELTS` (densités/ha), `FEATURE_TREES`, `ORCHARD` ; retraits autour des chemins et bâtiments ; lisières.
3. Susuki pour `TALL_GRASS_ZONES` (cartes argentées 1,2-1,6 m, vent) ; herbe et fleurs des prés ; riz, théiers.
4. Sous-bois : fougères, mousse, racines, arbustes (Poly Haven), plantes de berge (roseaux, iris, nénuphars avec l'Eau).
5. Pétales de cerisier et feuilles d'érable au sol ; imposteurs d'arbres pour les montagnes.

### Modélisation Blender (bâtiments) (`tools/blender/buildings/**`)
1. Kit commun : poteaux, panneaux d'enduit, shōji, koshi, amado, avant-toits, toits kawara (tuiles, faîtage, onigawara), soubassements, marches.
2. Machiya (3 variantes) et minka (3 variantes) : ce sont 55 des 71 bâtiments.
3. Pagode à cinq étages, sanctuaire (haiden, honden, temizuya, shōrō), torii (myōjin, shinmei), capybaras gardiens.
4. Grand Ryokan, ryokan du Torrent, petit ryokan Momiji, bains publics (cheminée), maison de thé du Cerisier.
5. Moulin à eau (roue animable séparée), gasshō, kura, honjin, chashitsu, azumaya, puits, ashiyu, yatai, datsuijo, portes du village.
6. Ponts (pont-route, arche de bois, taikobashi vermillon, zigzag, dalle, passerelle de cordes) à la géométrie exacte de `BRIDGES`.
7. Pour chacun : 3 LOD, collisions simplifiées, points d'accroche des lanternes et noren, emplacements des lumières.

### Intégration village (`src/regions/hub.ts`, `src/procgen/village/**`)
1. Nouveau `buildHub` lisant `BUILDINGS`, `TORII`, `BRIDGES`, `VILLAGE_GATES` : charge les `.glb`, pose au sol (`heightAt`), collisions, retrait de l'herbe.
2. Positions de jeu : `SPAWN` (spots.start + yaw), `NPC_SPOTS`, `VEHICLE_SPOTS`, `spots.windmill` = `MILL_POS`, `spots.spring` = (60, 70), `yuzuList` = `YUZU_SPOTS`,
   `spots.pond` = centre de `POND`, `spots.shop` = Basile ; photo « windmill » visant la roue du moulin.
3. Escaliers et rampes physiques (sandō, mille torii, ruelle des Lanternes), ponts franchissables, bornes anti-véhicules.
4. Points de marche des promeneurs sur les rues et promenades ; panneaux indicateurs aux portes.

### Assets photoscannés Poly Haven (`tools/polyhaven/**`, `public/assets/models/nature|props/**`, `src/core/models.ts`)
1. Script de téléchargement par l'API (1k ou 2k) des ids du §8.2, conversion en `.glb` compacts, décimation des ⚠, génération des LOD.
2. `models.ts` : chargement GLTF (+ Draco/KTX2), cache, instanciation, LOD.
3. Priorité : rochers moussus et parois, fougères/mousse/racines, seaux/tonneaux/caisses/paniers, souches/troncs, arbustes, poteries, fruits.
4. Teintes harmonisées à la palette (pierre grise chaude, mousse `#5f7a3a`).

### Textures & matériaux (`public/assets/tex/**`, `tools/textures/**`, `materials.ts`, `assets.ts`)
1. Terrain : herbe, terre, galets, roche, mousse, feuilles mortes (ids §8.2) avec normales et rugosité, mélange par pente et par splat.
2. Dalles ishidatami, escaliers de pierre, gravier ratissé, terre à ornières, asphalte usé.
3. Matériaux de bâtiment : bois sombre patiné (3 usures), enduit, tuiles, laque vermillon, cuivre vert-de-gris, chaume, papier shōji (translucide, émissif la nuit), tissus de noren.
4. Effet de dallage humide (reflets) le matin sur la place et la Grand-Rue.

### Lumière & atmosphère (`sky.ts`, `postfx.ts`, `quality.ts`, `fx/lights.ts`)
1. Course du soleil du §9 (lever au cap 110°) et heure de départ 6 h 45.
2. Brume au sol en couche (dense sous y = 20), rayons volumétriques ou équivalent, brouillard de distance qui fond les montagnes.
3. Gestion des 8 lumières dynamiques les plus proches + émissifs + taches de lumière au sol ; allumage des lanternes à 18 h.
4. Palettes par moment (§9), étalonnage chaud, bloom léger sur lanternes et shōji ; budget par `PERF_BUDGET` et LOD par `LOD_DISTANCES`.

### Combat (joueur) (`combat.ts`, `hearts.ts`, blocs COMBAT de `game.ts`)
1. Attaque et combo de 3 coups, esquive avec roulade et invulnérabilité courte, cœurs.
2. Réveil au rotenburo (52, 66) quand les cœurs tombent à zéro.
3. Mission « Les Grignoteurs du Levant » avec la Gardienne Sora (`NPC_SPOTS.guardian`).

### Routes & chemins (`roads.ts`, `layout.ts` routes)
1. Faire commencer les six axes à `VILLAGE_GATES[].asphaltFrom` (supprimer la partie intérieure) ; garder l'indice 3 et suivants de l'axe de Paris sur l'asphalte pour la mission de conduite.
2. Axes : asphalte usé, ligne axiale discontinue seule, bas-côtés de gravier, fossés, glissières de bois dans les cols, tracé en S dans les cols (masquer les villes).
3. Rues et chemins de `PATHS` : rubans par revêtement (dalles, escaliers, pas japonais, gravier, terre à ornières), caniveaux, bordures, transitions du §4.3.
4. Ponts-route avec l'équipe Blender ; raccord sud (`raccord-sud`).

### Décor & accessoires (`src/procgen/village/props*.ts`)
1. Bandes de décor devant les façades (1 objet / 1,5 m) selon le commerce ; place (≥ 60 objets) ; listes du §8.1.
2. Lanternes : chōchin sous les avant-toits, tōrō aux carrefours et le long du sandō, andon dans les ruelles (espacements de `PATHS.lightSpacing`).
3. Clôtures de bambou, jardins (pierres, lanternes, mousse), potagers, séchoirs à riz, épouvantails, jizō, panneaux.
4. Objectif total : ≥ 300 objets visibles dans le village (en pratique 800 à 1 200 instances).

### Effets visuels (`src/fx/**` sauf `lights.ts`)
1. Vapeur : yubatake, rotenburo, bains publics (cheminée), ashiyu, paniers de manjū, canaux du village (légère).
2. Pétales de cerisier et feuilles d'érable portés par le vent, brume des cascades, poussière dans les rayons.
3. Lucioles la nuit au-dessus de l'eau et des rizières ; effets de combat (feuilles, éclats, « pouf »).

### Eau (`water.ts`, `src/procgen/flora/aquatic.ts`)
1. Ruban d'eau du torrent à hauteur locale (`STREAM`, `STREAM_WATER_Y`, `STREAM_WIDTHS`) : écoulement animé, écume sur les rochers, transparence sur galets.
2. Cascades (`CASCADES`) : nappes d'eau, écume et brume au pied.
3. Étang (plan global) : reflets, nénuphars, iris, roseaux, koï ; rotenburo et ashiyu laiteux fumants ; yubatake turquoise ; eau miroir des rizières.

### Ennemis & faune (`enemies.ts`, `fauna.ts`)
1. Grignoteurs : apparition depuis `ENEMY_NESTS`, patrouille et poursuite selon `ENEMY_RULES`, télégraphe, recul, « pouf » de feuilles et pièces.
2. Faune : koï, grenouilles, hérons dans les rizières, libellules, papillons, oiseaux, poules de la ferme, chat endormi, lucioles.

### Rig & animation Blender (capybara) (`tools/blender/capybara/**`)
1. Capybara réaliste rigué : marche, course, nage, saut, attaque (3 coups), roulade, assis, bain (immergé, serviette sur la tête).
2. Variantes de PNJ (pelage, taille, accessoires) ; animation « trempe les pattes » pour l'ashiyu.

### Audio (`audio.ts`)
1. Ambiances spatialisées : torrent (fort au village), cascades, vent dans les cèdres, cloche du sanctuaire, shishi-odoshi, roue du moulin, marché.
2. Ambiances par heure (oiseaux à l'aube, cigales le jour, grenouilles et grillons la nuit) ; musique calme et chaleureuse (originale).

## 14. Changements par rapport à l'existant (à signaler aux autres spécialités)

- **Source chaude : inchangée** à (60, 70) (`HOT_SPRING` de `heightmap.ts` et la mission continuent de fonctionner).
- **Étang : inchangé** à (-120, 90) (`HUB_POND`). La mission Plouf ! continue de fonctionner ; Nina passe sur la rive nord.
- **Moulin : déplacé de (-75, -70) à (48, -72)** et devient un **moulin à eau**. Justification : un moulin de village japonais de montagne est entraîné par le torrent ;
  l'ancien emplacement était à 8 m de l'axe de Londres. Conséquence : `spots.windmill` doit pointer sur `MILL_POS` (code de `buildHub`, pas des missions).
- **Yuzus** : regroupés dans le verger (`YUZU_SPOTS`) au lieu d'être semés en cercle autour du village.
- **Voiture et coach** : déplacés à la porte du Col (aire des véhicules) ; la place devient piétonne.
- **Axes** : ils commencent aux portes ; à l'intérieur, les rues de `PATHS` les remplacent.

## Annexe : diagnostic de l'état actuel (passage 0)

Captures : `test-shots/etat-0/` (place, rue, maison, prairie, nuit, vueaerienne, ruisseau, depart, lointain, plan), qualité Moyenne.

1. **Aucun relief** : terrain plat à 6 m sur 230 m de rayon ; pas de silhouette, pas de point haut.
2. **Villes voisines visibles** depuis le village (tour Eiffel, gratte-ciel de New York) : l'échelle et l'isolement sont détruits.
3. **Plan simpliste** : un disque pavé de 26 m et 14 maisons isolées en anneau, sans rues ni fronts bâtis ni jardins.
4. **Asphalte au cœur du village** : les six routes à lignes blanches et jaunes démarrent au centre de la place.
5. **Architecture hors sujet et pauvre** : boîtes européennes identiques, sans débord de toit, sans relief de façade.
6. **Vide** : herbe uniforme partout, presque aucun objet de décor, aucune clôture ni potager.
7. **Végétation** : arbres « boules » et cônes, posés au hasard, sans lisières ni sous-bois.
8. **Eau absente ou pauvre** : pas de torrent dans le monde, étang à berges verticales et nues.
9. **Lieux de mission indigents** : source chaude = disque turquoise dans un cercle de cailloux ; moulin à vent posé contre une route.
10. **Lumière plate et performance** : brume grise uniforme sans soleil rasant ; nuit sans flaques de lumière lisibles ; 2 052 appels de dessin (budget 700).
