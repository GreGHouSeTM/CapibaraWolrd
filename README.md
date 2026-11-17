# 🦫 Capy World

Un jeu d'aventure en **monde ouvert**, jouable directement dans le navigateur, dont le héros est un capybara.
On se promène, on conduit, on nage et on accomplit des missions à travers sept régions :

| Région | Ce qu'on y trouve |
| --- | --- |
| **Capyville** | Le village de départ, sa source chaude, son moulin et la boutique de chapeaux |
| **Paris** | Immeubles haussmanniens, toits en zinc, la Seine, la tour Eiffel (qui scintille la nuit !), l'Arc de Triomphe, des cafés |
| **New York** | Gratte-ciels, Times Square et ses écrans, Central Park, une tour Art déco, la statue de la Liberté sur son île |
| **Londres** | Maisons de briques, la Tamise, Big Ben, le Parlement, la grande roue, Tower Bridge, les cabines rouges |
| **Le Japon** | Le lac et son torii, une pagode, le mont Fuji, des cerisiers et des lanternes |
| **Le Désert des Dunes** | Une oasis, un village d'adobe, les pyramides et le Sphinx-Capybara |
| **Le Pôle Nord** | Des igloos, l'atelier des cadeaux, un grand sapin, la banquise et des aurores boréales |

## Jouer

- **En ligne** : une fois GitHub Pages activé (voir plus bas), le jeu est jouable sur `https://greghousetm.github.io/CapibaraWolrd/`.
- Il faut un navigateur récent (Chrome, Edge ou Firefox) avec WebGL 2. Rien à installer.

### Commandes

| Touche | Action |
| --- | --- |
| `Z Q S D` / flèches | Se déplacer, conduire |
| Souris | Tourner la caméra (cliquer dans le jeu d'abord) |
| `Maj` | Courir |
| `Espace` | Sauter / frein à main |
| `E` | Parler, monter ou descendre d'un véhicule |
| `F` | Prendre une photo (pour l'album) |
| `V` | Appeler un véhicule |
| `M` | Carte du monde (téléportation vers les régions visitées) |
| `R` | Revenir sur la terre ferme |
| `Échap` | Pause et réglages |

La manette est aussi gérée (stick gauche, A pour sauter, gâchettes pour accélérer et freiner).

### Contenu

- **12 missions** : livrer des croissants à Paris, conduire le taxi de New York, retrouver l'étoile de la statue de la Liberté,
  faire la tournée du bus rouge à Londres, la fête des lanternes en barque au Japon, le trésor du Sphinx, les cadeaux et le rallye du Pôle Nord…
- **Album photo** : photographie les monuments avec `F`.
- **6 bébés capybaras** cachés, un par région : une fois retrouvés, ils t'attendent dans la source chaude de Capyville.
- **Des centaines de pièces** le long des routes, à dépenser chez Basile le chapelier (béret, haut-de-forme, couronne…).
- **Véhicules** : cabriolet, taxi, bus à impériale, scooter, jeep, motoneige et bateau.
- **Cycle jour/nuit**, musique générée pour chaque région, sauvegarde automatique dans le navigateur.

## Technique

- [Three.js](https://threejs.org) (WebGL 2), [postprocessing](https://github.com/pmndrs/postprocessing) et [N8AO](https://github.com/N8python/n8ao) pour l'occlusion ambiante, le bloom, le tone mapping AgX et un étalonnage différent dans chaque région.
- **Tout est généré par le code** : relief, villes, façades peintes (avec cartes de relief et fenêtres qui s'allument la nuit), monuments, capybara, véhicules et végétation.
- Textures PBR libres de droits (licence CC0) de [Poly Haven](https://polyhaven.com) : asphalte, pavés, trottoirs, briques, sable, neige, roche, herbe.
- Musique et bruitages entièrement synthétisés avec WebAudio.
- Code organisé pour accueillir plus tard un **mode deux joueurs en écran partagé** : chaque joueur a son propre contrôleur et sa propre caméra.

### Développement

```bash
npm install
npm run dev      # serveur local : http://localhost:5173
npm test         # tests de la logique (missions, physique…)
npm run build    # version publiable dans dist/
```

Options d'URL utiles : `?q=low|medium|high` force la qualité graphique, `?manual` désactive la boucle automatique (captures de test).

### Publication sur GitHub Pages

Le workflow `.github/workflows/pages.yml` compile et publie le jeu à chaque envoi sur la branche `main`.
Il faut l'activer une seule fois : **Settings → Pages → Source : GitHub Actions**.
