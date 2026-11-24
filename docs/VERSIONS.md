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
