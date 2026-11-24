# Plan de production de Capy World (décidé par le chef de projet le 2026-11-24)

## Le diagnostic
Le problème n'était pas l'ordre « gris puis beau ». Le vrai problème : **plus rien n'arrivait dans `main`**.
- Les agents travaillaient des heures sur des branches longues (terrain, lumière, montagne, HD…) et sur trop de fronts à la fois.
- Il n'y avait pas de version à tester. Le client ne pouvait ni jouer, ni réagir, ni voir ses idées prendre vie.
- Les retours sont donc arrivés tard, et on a refait du travail : le massif de l'Aurore en est l'exemple.

Les studios, même petits, fonctionnent par **versions jouables régulières** (« builds »), découpées en jalons courts. Chaque jalon livre une
version qu'on teste, et les retours décident du jalon suivant. On fait aussi une **tranche verticale** : un lieu complet, au niveau final, sert
de modèle pour le reste du jeu.

Le blockout gris (des blocs avant l'habillage) est un **outil** que l'on utilise **pour chaque nouveau lieu**, avant de l'habiller. Ce n'est pas
une étape géante qui reprendrait toute l'île : l'île existe déjà et se joue, et on ne repart pas en arrière.

## La règle d'or : une version jouable à chaque session
- **Une session de travail** (une fenêtre de quota de 5 h) = **une Alpha publiée** sur `main` / GitHub Pages, avec ses notes dans
  `docs/VERSIONS.md` : ce qui est nouveau, quoi tester, limites connues, FPS.
- **Les chantiers sont taillés pour finir dans la session** : 2 à 3 h de travail d'agent au plus. Un chantier plus gros est découpé en plusieurs Alphas.
- **Deux agents au maximum en même temps**, sur des fichiers différents.
- **Vers 75 % du quota**, le chef de projet arrête d'ouvrir des chantiers. Il vérifie, fusionne, publie, puis met à jour LIAISON et la mémoire.
  Un chantier non fini reste sur sa branche, et il est la première tâche de la session suivante.
- **Vérification avant chaque publication** :
  - tsc, vitest, build ;
  - tests de jeu (village, combat, accès, montagne, forêt) ;
  - captures, et FPS mesurés côte à côte avec la version précédente ;
  - aucune régression.
- **Le client et sa fille testent chaque Alpha.** Leurs retours vont dans `docs/RETOURS-CLIENT.md` et choisissent l'Alpha suivante.
- **Les idées nouvelles vont dans `docs/BACKLOG.md`**, avec l'Alpha visée. On ne lance pas un chantier hors plan, sauf pour un bug qui bloque.

## La feuille de route des Alphas
Le fil conducteur : **faire du massif de l'Aurore la première expérience complète** (tranche verticale), parce que c'est là que se rejoignent les
idées du client (vraie montagne, froid, manteau, escalade, Pierre-Vapeur, roches, forêt, lac, grotte). Ensuite, on étend lieu par lieu.

| Alpha | Contenu | Le client peut… |
| --- | --- | --- |
| **0.1** (publiée) | Routes en lacets au sol, relief corrigé, rochers, déplacement en montagne (pente, endurance, escalade, chutes, froid sans dégâts), bouton Démo forêt | monter, glisser, grimper, tomber ; voir la démo forêt |
| **0.2 « Village vivant »** (décision du 2026-11-24, après la revue cloud) | Gain visible en une session, avec peu de risque : **pose du Décor** de `wip/decor` (149 objets déjà faits : place ≥ 60 objets, bandes de façade, lanternes) ; **pièces d'or** réduites, posées au sol et moins nombreuses, avec une clé stable par position ; vérification du nom de zone dans le HUD ; **outils de test** : FPS et nom de la carte graphique dans les Réglages, menu « Aller à » vers les nouveautés ; torrent de `wip/eau-2` si l'erreur 1282 est réglée (même cause que la démo : boucle de rétroaction) ; **montée en Three.js r187** de `wip/lumiere-v2` (J1 seulement, sans TSL) si elle est sans régression, pour ne pas laisser la branche vieillir | voir Capyville plus vivant, et diagnostiquer la carte graphique |
| **0.3** | **Massif de l'Aurore remodelé à 1 250 m**, **avec la méthode de la démo forêt** : d'abord le modelé du sol (ravines, éperons, cônes d'éboulis, congères, affleurements dans la carte de roche), puis les pierriers et les rochers posés selon la pente (couchés dans le sens de la ligne de plus grande pente, enterrés de 20 à 40 %, plus denses au pied des parois), enfin les matières (neige soufflée, transitions neige / terre / roche). Talus des lacets en terre végétalisée avec enrochements ponctuels. (dossier `MONTAGNE-AURORE.md`) : voie normale en lacets avec panneaux, étages lisibles, **blocs** pour le refuge et les chalets, marqueurs du lac, de la grotte et de la crevasse, **Pierre-Vapeur au sommet** qui se réveille et sert de voyage rapide | faire une vraie ascension de 20 à 30 min et voir l'île du sommet |
| **0.4** | **Première quête : « Le manteau d'hiver »**. Système de quêtes et journal, un PNJ des Clarines, des objectifs, le manteau en récompense (le froid disparaît). Premier Squishy (après les questions au client). Correction de « Nouvelle partie » sans rechargement | jouer une vraie quête du début à la fin |
| **0.5** | **Habillage du massif, partie 1** : flore AAA par étage (méthode RETOURS §12 bis), forêt de vallée, alpages, eau (torrent, lac d'altitude, cascade) | se promener dans une montagne vivante |
| **0.6** | **Habillage du massif, partie 2** : roches et parois de qualité (style de la démo forêt), grotte explorable, faune (marmottes, bouquetins, aigles), sons, lumière WebGPU si elle est validée | juger la **tranche verticale** : « est-ce le niveau du jeu ? » |
| **0.7 et suivantes** | Une région ou un système par Alpha, dans l'ordre de l'histoire. Pour chaque région : blockout (blocs), test, puis habillage. Autres sujets : physique de la voiture et vue conducteur, villes organiques, Squishy et album, PNJ, etc. | tester chaque nouveauté au fil de l'eau |
| **Finitions** | Effets du backlog : lens flare, boue et pluie sur la caméra, secousses, post-traitements, météo, traces. Les plus simples peuvent arriver plus tôt, à côté d'une Alpha, s'ils ne coûtent presque rien. | — |

**Règles ajoutées après la revue cloud (2026-11-24)** :
- dans `VERSIONS.md`, « Ce qu'il faut tester » ne contient que ce qui est prêt à être jugé ; le reste va dans « Limites connues » ;
- chaque Alpha donne des captures **avant / après** des vues concernées, le **poids publié** (`dist/`) et le **volume téléchargé au démarrage**, en plus des FPS ;
- **les outils de la démo forêt** (atlas, imposteurs, matières de pierre et de mousse, méthode de valeurs) servent de boîte à outils à **chaque** Alpha d'habillage. Ce n'est pas une vitrine à part.

Le chef de projet tient ce tableau à jour à chaque Alpha. Il peut changer l'ordre selon les retours du client, et il l'écrit ici.
