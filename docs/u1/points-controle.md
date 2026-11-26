# Alpha U1 : 20 points de contrôle du relief (Unreal contre Three.js)

Mesure dans l'éditeur (`unreal/py/03_controle_points.py`), lancer de rayon vertical sur la collision du Landscape contre `heightAt` du jeu (`src/world/heightmap.ts`, exécuté tel quel dans Node).

| Type | Point | x (m) | z (m) | Three.js heightAt (m) | Unreal (m) | Écart (m) |
| --- | --- | --- | --- | --- | --- | --- |
| ville | Capyville | 3.3 | 1.7 | 6.00 | 6.00 | -0.001 |
| ville | Paris | -146.7 | -2648.3 | 6.57 | 6.57 | -0.004 |
| ville | New York | 2353.3 | -1448.3 | 8.00 | 8.00 | -0.001 |
| ville | Londres | -2396.7 | -1348.3 | 5.59 | 5.58 | -0.002 |
| ville | Le Désert des Dunes | 2303.3 | 1351.7 | 37.92 | 37.97 | +0.042 |
| ville | Le Japon | -796.7 | 2381.7 | 8.00 | 8.00 | +0.000 |
| ville | Le Pôle Nord | -2646.7 | 2151.7 | 4.00 | 4.00 | -0.001 |
| col | Col des Aurores | -2349.1 | 1451.3 | 351.52 | 351.51 | -0.005 |
| col | Brèche du Loup | -1899.1 | 31.3 | 580.37 | 580.50 | +0.128 |
| col | Col de Jade | 1850.9 | 1881.3 | 290.72 | 290.71 | -0.004 |
| col | Col des Fauves | 700.9 | -2298.7 | 95.65 | 95.66 | +0.004 |
| sommet | Pic de l’Aurore | -2300.0 | 454.0 | 941.60 | 941.60 | +0.000 |
| sommet | Mont des Neiges | -2552.0 | 794.0 | 811.46 | 811.46 | +0.000 |
| sommet | Dent du Loup | -2110.0 | 260.0 | 775.17 | 775.21 | +0.041 |
| sommet | Mont Fuji | 255.0 | 2861.0 | 629.43 | 629.38 | -0.057 |
| sommet | Pic de Jade | 1510.0 | 1716.0 | 416.91 | 416.91 | +0.000 |
| rive | Rive du Grand Lac | 1052.9 | -1797.6 | 45.30 | 45.31 | +0.002 |
| rive | Rive du Lac du Torii | -400.0 | 2273.2 | 5.31 | 5.30 | -0.001 |
| rive | Rive du Lac de Cristal | -1731.0 | 849.0 | 262.31 | 262.27 | -0.037 |
| rive | Plage de la Seine (mer) | -700.4 | -3694.5 | 0.30 | 0.30 | -0.005 |

Écart maximal : **0.128 m** (critère : ≤ 0,5 m).
