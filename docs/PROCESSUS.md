# Processus de production de Capy World (révisé le 2026-11-22)

## Pourquoi on change
Jusqu'ici, on a avancé « par la beauté » : des tranches HD, un terrain de 8 km, des rochers et de la lumière, avant d'avoir validé la forme
du monde et le jeu. Résultat : on refait des choses déjà belles parce que le fond était faux. Le Pic de l'Aurore, par exemple, est à
remodeler entièrement alors qu'on lui posait déjà des rochers. Le client le dit : « on s'éparpille ».

Les studios font l'inverse. On construit d'abord un monde **vide et gris mais jouable**, on y joue, on corrige, on gèle sa forme, et
**seulement ensuite** on habille, zone par zone. Une **tranche verticale** (un petit morceau au niveau final) sert à fixer la cible
visuelle et à valider les outils. C'est fait : c'est la démo forêt.

## Les étapes (dans l'ordre, une seule étape active à la fois)
| Étape | Contenu | Fini quand… | État |
| --- | --- | --- | --- |
| **0. Pré-production** | Bible du monde, intentions, lore, choix techniques, cible visuelle (tranche verticale) | décisions validées par le client | **fait** : bible, Three.js, démo forêt |
| **1. Blockout du monde** (« greybox ») | L'île entière jouable **en gris** : grandes formes du relief, montagnes à leur vraie taille, routes et chemins, **blocs** pour les villes et les bâtiments, **marqueurs** pour les lieux (grottes, lacs, refuges, Pierres-Vapeur). Aucun habillage. | le client et sa fille ont **joué** le tour de l'île : distances, temps de trajet, lignes de vue, montées, routes. La forme est **gelée**. | à faire |
| **2. Déplacement et caméra** (en même temps que l'étape 1) | Marche et course selon la pente, endurance, escalade, chute, nage, conduite de base, caméra, froid | on se déplace avec plaisir partout dans le blockout | en cours (agent Montagne) |
| **3. Premier jouable** (« first playable ») | Boucle de jeu complète en gris : quêtes, Squishy, récompenses, tenues et objets (manteau d'hiver), voyage rapide par Pierres-Vapeur, sauvegarde, menu (« Nouvelle partie » sans recharger) | une quête complète de Capyville au sommet de l'Aurore est jouable du début à la fin | à faire |
| **4. Tranche verticale jouable** | Le massif de l'Aurore et les Clarines **au niveau final** : relief, roches, flore, eau, lumière, sons, avec la boucle de jeu | le client valide : « c'est le niveau du jeu entier » | après 3 |
| **5. Production** | Habillage zone par zone avec les outils validés en 4 (flore, roches, bâtiments, eau), dans l'ordre de l'histoire | chaque zone passe la grille qualité | après 4 |
| **6. Finitions** (« polish ») | Effets et sensations : liste du backlog (lens flare, boue et pluie sur la caméra, secousses, post-traitements, météo, traces) | — | après 5 |
| **Continu** | Optimisation (FPS mesurés à chaque fusion), tests automatiques, sauvegarde | — | toujours |

## Les règles
1. **Une étape active à la fois.** Les agents ne travaillent que sur l'étape en cours, plus le continu.
2. **Les idées nouvelles vont dans le backlog** (`docs/BACKLOG.md`), avec l'étape où elles seront faites. Elles ne partent pas en chantier tout de suite, sauf un bug qui bloque le jeu.
3. **Le blockout passe avant la beauté.** Pas d'habillage d'une zone dont la forme n'est pas gelée.
4. **Tests de jeu à chaque étape**, si possible par la fille du client (c'est elle, le public). Ses retours priment.
5. **Chaque étape a sa définition de « fini »** (colonne ci-dessus). Le chef de projet la vérifie sur captures et chiffres avant de passer à la suivante.
6. **Les branches HD en pause** (`wip/hd-modelisation`, `wip/hd-rendu`, `wip/eau-2`, `wip/decor`, `wip/conduite`) restent sauvegardées. On y puisera à l'étape 4 ou 5.
