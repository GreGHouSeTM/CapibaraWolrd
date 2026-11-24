# Bugs de Capy World (tenu par `qa-testeur`, PLAN-STUDIO §3 et §4)

Gravité : **bloquant** (empêche de jouer, plante, corrompt la sauvegarde) · **majeur** · **mineur** · **cosmétique**.
Un bug bloquant ou majeur empêche l'intégration d'une livraison.

| Id | Gravité | Poste | Statut | Reproduction | Alpha visée |
| --- | --- | --- | --- | --- | --- |
| BUG-01 | bloquant (pour les mesures) | outils-build + client | ouvert | Portable RTX 5060 du client, Chrome : 2 FPS dans la démo forêt, 5 FPS dans le jeu. Cause probable : Chrome sur la puce graphique intégrée ou en rendu logiciel. Vérifier `chrome://gpu` (WebGL2 « Hardware accelerated », GL_RENDERER = RTX 5060). | étape 0 |
| BUG-02 | majeur | water-artist | ouvert | Erreur GL 1282 intermittente (0 appel de dessin) sur `wip/hd-rendu` et `wip/eau-2`. Cause identifiée par la démo forêt : boucle de rétroaction (une passe lit la profondeur ou la couleur de la cible qu'elle écrit). Correctif : cibles de rendu privées (`src/demo/foret/taa.ts`). | 0.2 (torrent) |
| BUG-03 | mineur (à confirmer) | ui-ux-designer | à vérifier | Le HUD affiche « Capyville » sur l'Aurore et près du désert dans les captures (`?manual` + `step()`). Peut-être seulement le mode test (`game.ts`, `ui.setRegion`). À vérifier en vrai jeu. | 0.2 |
| BUG-04 | majeur | integrateur-decor + systemes-programmer | ouvert | Pièces d'or énormes, trop nombreuses et flottantes (vue `place`). La clé des pièces ramassées doit être la position (stable), pas l'index, sinon les anciennes sauvegardes se décalent. | 0.2 |
| BUG-05 | mineur | systemes-programmer | ouvert | « Nouvelle partie » relance tout le chargement du monde au lieu de remettre seulement la sauvegarde et le joueur à zéro (RETOURS §8). | 0.5 |
| BUG-06 | majeur | gameplay-programmer | ouvert | La voiture grimpe n'importe quelle pente à pleine vitesse : sa vitesse horizontale ne dépend pas de la pente, et sa hauteur colle au sol (`src/vehicles/vehicle.ts`). | étape 7+ (conduite), ou plus tôt si le client le juge urgent |
| BUG-07 | mineur | lighting-rendu | connu | Vieux PC du client sans WebGL 2 : la démo forêt ne se lance pas. Attendu pour une vitrine haut de gamme ; prévoir un message clair à la place d'un écran vide. | 0.2 (message) |
| BUG-08 | corrigé | outils-build | fermé | Verrou vide de `tools/browser.cjs` → attente infinie. Corrigé le 2026-11-24 : un verrou vide ou illisible de plus de 5 s est considéré comme libre. | — |
