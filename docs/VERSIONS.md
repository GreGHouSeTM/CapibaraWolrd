# Versions jouables de Capy World

Chaque version est publiée sur https://greghousetm.github.io/CapibaraWolrd/. Comptez quelques minutes de mise à jour après la publication. Si l'ancienne version s'affiche encore, faites Ctrl+F5.

## Alpha 0.1 (2026-11-24)
**Ce qui est nouveau :**
- **Routes refaites.** Elles sont tracées comme de vraies routes de montagne, avec 349 virages en épingle, et posées au sol : il n'y a plus de route qui flotte, ni de tranchée géante. Les ponts franchissent l'eau aux passages prévus.
- **Relief corrigé.** Il n'y a plus de marches sur les versants, et beaucoup moins de pentes absurdes. Le sol a du relief de près (environ 40 cm).
- **Rochers.** 13 modèles de rochers faits dans Blender (barres, blocs, éboulis, roches polies), posés surtout sur le massif de l'Aurore.
- **Déplacement en montagne.**
  - Le capybara ralentit dans les pentes. Au-delà d'environ 40°, il ne passe plus et glisse.
  - Il a une endurance : la course et l'escalade la consomment. C'est l'anneau près du capybara.
  - Il peut grimper sur les parois rocheuses.
  - Après une chute, il roule et perd quelques demi-cœurs, avec une secousse de caméra. Une très grosse chute le ramène au dernier endroit sûr.
- **Le froid.** En altitude et la nuit, une jauge de chaleur baisse : givre au bord de l'écran, souffle visible. Le froid ne fait **aucun dégât**. On se réchauffe près des feux et des lanternes. Pour tester le manteau d'hiver, ajouter `?manteau` à l'adresse.
- **Menu.** Nouveau bouton « Démo forêt (qualité Max) ». Dans la démo, le bouton « Retour au monde de Capy World » ramène au jeu.

**Ce qu'il faut tester (seulement ce qui est prêt à être jugé) :**
- la démo forêt depuis le menu (de jour, puis de nuit avec N), sur une machine qui gère WebGL 2 et avec la carte graphique dédiée ;
- les routes de montagne : elles sont maintenant posées au sol, en lacets ;
- le déplacement dans les pentes, sans juger le décor : ralentissement, glissade, endurance, chute.

**Limites connues :**
- **Le massif de l'Aurore n'est pas présentable** : neige lisse, rochers plantés au hasard, limite neige/terre trop nette, talus des lacets en blocs. **Il ne faut pas le faire tester** : il sera remodelé avec la méthode de la démo forêt (Alpha 0.3).
- Les nouveautés sont loin du village, et il n'y a pas encore de moyen rapide d'y aller (prévu en 0.2).
- Le nom de zone du HUD reste peut-être « Capyville » hors du village : c'est à vérifier.
- Poids publié : 215 Mo, dont 97 Mo pour la démo forêt (elle n'est téléchargée que si on la lance).
- **Le monde reste vide hors de Capyville** : pas de végétation, et rivières et lacs sans eau.
- **La voiture grimpe encore des pentes trop fortes**, car sa physique n'est pas encore faite.

**Mesures (GTX 1080 Ti, qualité Moyenne, 1600×900) :**
- vue de la place : 35 FPS ;
- départ à l'aube : 36 FPS ;
- vue lointaine : 20,8 FPS, contre 16 avant cette version.

Tous les tests automatiques passent : village, combat, accès (0 blocage), montagne, forêt et 58 tests unitaires.

### Mesures de référence de l'Alpha 0.1 sur le PC du client (2026-11-25, étape 0)
Portable RTX 5060 Laptop GPU, sur secteur, Google Chrome réglé en « Hautes performances ».
Rendu vérifié : `ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Laptop GPU, Direct3D11)`. Mesures prises avec `tools/perf.cjs`, en 1600×900, sur 120 images par vue.
**Ce sont les chiffres de référence pour juger les Alphas suivantes.** Les mesures de la GTX 1080 Ti ci-dessus ne servent plus de comparaison.

| Qualité | Vue | FPS | p95 ms | Appels de dessin | Triangles |
| --- | --- | --- | --- | --- | --- |
| Basse | place | 98,2 | 14,0 | 799 | 3,83 M |
| Basse | rue | 105,5 | 10,8 | 836 | 4,09 M |
| Basse | départ aube | 101,2 | 11,6 | 901 | 4,01 M |
| Basse | nuit | 103,2 | 10,9 | 834 | 3,92 M |
| Basse | lointain | 51,4 | 23,6 | 4 274 | 9,24 M |
| **Moyenne** | **place** | **48,8** | 29,8 | **877** | **4,27 M** |
| **Moyenne** | **rue** | **50,8** | 23,1 | **903** | **4,95 M** |
| **Moyenne** | **départ aube** | **51,5** | 22,1 | **902** | **4,39 M** |
| **Moyenne** | **nuit** | **50,0** | 24,8 | **914** | **4,36 M** |
| **Moyenne** | **lointain** | **36,0** | 31,2 | **4 355** | **12,73 M** |
| Haute | place | 53,5 | 24,0 | 932 | 4,94 M |
| Haute | rue | 52,6 | 21,7 | 990 | 6,40 M |
| Haute | départ aube | 49,4 | 28,2 | 950 | 5,06 M |
| Haute | nuit | 53,7 | 24,4 | 972 | 5,03 M |
| Haute | lointain | 32,5 | 49,7 | 4 434 | 16,27 M |

**Poids et chargement** (build de production, profil vierge, cache du navigateur actif) :
- poids de `dist/` : 223 Mo, dont 101 Mo pour la démo forêt ;
- **téléchargé au démarrage du monde : 114 Mo**, tout avant le menu. Le chargement compte 1 443 requêtes pour 625 fichiers : les textures des bâtiments sont redemandées jusqu'à 87 fois (BUG-09).

**Écart aux budgets du PLAN-STUDIO §6 (qualité Moyenne)** :

| Mesure | Budget | Mesuré | Verdict |
| --- | --- | --- | --- |
| FPS au sol | ≥ 50 | 48,8 à 51,5 | à la limite |
| FPS en vue lointaine | ≥ 35 | 36,0 | tenu, de justesse |
| Appels de dessin au sol | ≤ 700 | 877 à 914 | **dépassé de 25 à 30 %** |
| Appels de dessin en vue lointaine | ≤ 1 500 | 4 355 | **dépassé presque 3 fois** |
| Triangles au sol | ≤ 3 M | 4,3 à 5,0 M | **dépassé** |
| Triangles en vue lointaine | ≤ 8 M | 12,7 M | **dépassé** |
| Téléchargé au démarrage | ≤ 60 Mo | 114 Mo | **dépassé presque 2 fois** |

La marge de FPS au sol est déjà nulle en Moyenne, avant les 149 objets de décor de l'Alpha 0.2. La Haute n'est pas plus lente que la Moyenne sur ce PC ; ce point est à comprendre (`moteur-performance`).
