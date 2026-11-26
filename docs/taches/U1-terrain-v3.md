# Fiche — U1 bis « Terrain v3 » : refonte cohérente de l'île, en une seule passe (décidée par le client le 2026-11-26)

## Objectif (une phrase)
En une session, et une seule, refaire le relief de l'île dans Unreal : garder l'ampleur générale des hauteurs, mais rendre chaque zone cohérente, avec une vraie chaîne de montagnes, des plaines autour des grandes villes et des fleuves dessinés d'après les vrais. Ensuite, on ne retouche plus au terrain, sauf bug bloquant.

## Ce que veut le client (ses mots, résumés)
- **Gardé :** la hauteur générale, « très bien ». Le pic de l'Aurore impressionne.
- **Les montagnes :** aujourd'hui, elles sont posées « une à droite, une à gauche, une au milieu ». Le client veut à la place une **mini-chaîne de montagnes**, une vraie zone montagneuse continue avec crêtes, cols, vallées et contreforts. Le pic de l'Aurore en est le point culminant.
- **Les villes :** moins de montagnes aux abords de Paris, New York, Londres et du Japon (Tokyo). Ces villes sont en plaine ou en vallée large. Londres au pied d'une montagne, « c'est bof ».
- **Les fleuves**, tracés à peu près comme les vrais, puis creusés dans le terrain par le plugin Water d'Unreal :
  - **la Seine à Paris**, avec ses méandres et ses îles au cœur de la ville ;
  - **la Tamise à Londres**, avec sa boucle et son estuaire vers la mer ;
  - **l'Hudson à New York**, avec une baie et une pointe d'île à l'embouchure.
- **L'Hudson remonte vers le nord jusqu'au Pôle Nord**, comme l'Amérique du Nord qui borde le Groenland : New York au sud, puis des terres de plus en plus froides, et enfin la côte glacée du Pôle de l'autre côté d'un bras de mer.
- **Supprimés :** les défauts de l'ancien relief, c'est-à-dire les marches, les dents le long des rivières, les plans d'eau coupés, les transitions brutales et les formes sans logique.

## Comment (pour l'agent)
1. **Le plan d'abord**, sans attendre de validation car la passe est « one shot ».
   - Dessine en 2D le plan de l'île : régions, chaîne de montagnes, plaines, fleuves, côtes.
   - Pars de `docs/BIBLE-MONDE.md` et de `src/world/layout.ts` / `world-map.ts` pour la place des régions.
   - Une région peut bouger si la cohérence l'exige ; note chaque déplacement.
   - Livrable : `docs/u1/plan-terrain-v3.png`.
2. **Les références réelles avant de générer** : vues aériennes et cartes du relief des Alpes (une chaîne avec ses cols), de la Seine à Paris, de la Tamise, de l'Hudson et de son estuaire, des côtes du Groenland et du Grand Nord canadien.
   - Elles servent à regarder, pas à recopier, et vont dans `docs/references/prive/u1-terrain/`.
3. **Un générateur de relief neuf** (Node ou Python dans `unreal/relief/`), sans recopier l'ancien :
   - grandes formes posées à la main d'après le plan ;
   - bruit fractal et érosion hydraulique simulée ;
   - vallées creusées le long des fleuves ;
   - plaines lissées autour des villes ;
   - pente plafonnée à l'endroit des chemins.
   - Sorties : la carte de hauteur 16 bits, les masques de surfaces (herbe, roche selon la pente, sable, neige selon l'altitude, terre des berges) et les splines des fleuves.
4. **Import dans Unreal** : Landscape au pas de 2 m, puis fleuves et lacs avec le plugin Water (rivières sur splines qui creusent le Landscape), mer de l'Océan.
   - **Le plugin Water est à activer : c'est un plugin Epic, accord donné par le producteur dans cette fiche.**
5. **Repères** : villes à leur nouvel emplacement, touches 1 à 8 mises à jour, chemin praticable jusqu'au sommet de l'Aurore.

## Critères d'acceptation
- [ ] Le plan 2D est livré, et chaque écart à l'ancienne carte est expliqué.
- [ ] Une vraie chaîne de montagnes, d'au moins 3 sommets reliés par des crêtes et des cols, coupée par des vallées. Les villes sont en plaine : relief ≤ 30 m dans un rayon de 400 m autour de chaque centre.
- [ ] La Seine, la Tamise et l'Hudson se reconnaissent sur une vue aérienne. L'Hudson mène au nord, vers le Pôle.
- [ ] Aucune marche ni dent, aucun plan d'eau coupé : vérifié sur 12 captures au sol le long des fleuves et des côtes, en jeu autonome.
- [ ] Le sommet de l'Aurore est accessible à pied.
- [ ] ≥ 45 images/s en 1920×1080, et `Jouer-U1.bat` à jour.
- [ ] Le relief se reconstruit de zéro depuis `unreal/relief/`.

## Hors-périmètre
- Végétation, villes construites, gameplay : ce sont les Alphas suivantes.
- Toute retouche du terrain après cette passe, sauf bug bloquant (décision du client).
