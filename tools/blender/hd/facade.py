"""Jalon 1 du pipeline « Modélisation HD » : module de façade (deux travées) rendu dans Blender (planche PNG).

Pipeline (tools/blender/hd/, relançable, paramétré par `--seed`) :
  1. textures.py   : matières Poly Haven 2k (diffuse, normale GL, ARM) -> public/assets/models/buildings/hd/tex/*.webp
  2. lib/geo.py    : accumulateur de maillages par matière + primitives (boîte chanfreinée subdivisée, prisme, tube, grille)
  3. lib/parts.py  : soubassement de pierres sèches, poteaux, poutres à tenons et clavettes, enduit, bardage cloué,
                     shōji (kumiko en relief, papier émissif la nuit), kōshi, noren à plis, engawa à planches disjointes
  4. lib/roof.py   : versants de kawara modélisées une à une (creuses + rondes, égout à disque tomoe), faîtage noshi +
                     onigawara, chevrons, voliges, rive
  5. lib/scene.py  : objets Blender, occlusion ambiante cuite par Cycles dans une couleur de sommet, patine (usure
                     d'arêtes, salissure, humidité, coulures, mousse au nord), rendu de contrôle, export glTF + gltfpack
Reste à faire (jalons 2-5) : assembler le Ryokan du Torrent / datsuijo / auvent / pont (build.py), LOD1-2, export glb
(scene.export est prêt), branchement dans src/procgen/village/buildings.ts (bloc « MODÉLISATION HD »).

  L:\\CLAUDE\\CapyWorld\\.venv-blender\\Scripts\\python.exe tools/blender/hd/facade.py [--seed N] [--out fichier.png]
"""
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402,F401  (charge aussi mathutils)
from mathutils import Matrix  # noqa: E402
from lib.geo import Geo, V  # noqa: E402
from lib import parts, roof  # noqa: E402
from lib import scene  # noqa: E402


def facade(g, lod=0):
    """Deux travées de 1,82 m (shōji | kōshi), enduit en imposte, avant-toit couvert de kawara."""
    I = Matrix.Identity(4)
    B = 1.82
    xs = [-B, 0.0, B]
    FL, LIN, TOP = 0.57, 2.25, 3.0
    parts.stone_base(g, I, -B - 0.2, B + 0.2, -0.25, 0.42, -0.35, 0.06, lod)
    parts.hbeam(g, I, -B - 0.1, B + 0.1, 0.495, 0.15, 0.16, z=-0.02, lod=lod, tenon=0.1)          # dodai (seuil)
    for x in xs:
        parts.post(g, I, x, 0.42, TOP, s=0.16, lod=lod)
    parts.hbeam(g, I, -B - 0.1, B + 0.1, LIN + 0.06, 0.12, 0.13, z=0.0, lod=lod, tenon=0.12)       # nageshi (linteau)
    parts.hbeam(g, I, -B - 0.15, B + 0.15, TOP - 0.08, 0.18, 0.17, z=0.0, lod=lod, tenon=0.0)      # keta (sablière)
    parts.hbeam(g, I, -B, B, 2.62, 0.07, 0.1, z=-0.01, lod=lod, tenon=0.08)                         # nuki
    for a, b in ((xs[0], xs[1]), (xs[1], xs[2])):
        parts.plaster(g, I, a + 0.08, b - 0.08, LIN + 0.12, 2.585, z=-0.02, lod=lod)
        parts.plaster(g, I, a + 0.08, b - 0.08, 2.655, TOP - 0.17, z=-0.02, lod=lod)
    # travée 1 : shōji sur panneau bas ; travée 2 : kōshi devant papier, bardage cloué en allège
    parts.shoji(g, I, xs[0] + 0.08, xs[1] - 0.08, FL + 0.03, LIN, z=-0.03, panels=2, lod=lod)
    parts.boards(g, I, xs[1] + 0.08, xs[2] - 0.08, FL, 1.0, z=-0.01, lod=lod)
    parts.koshi(g, I, xs[1] + 0.08, xs[2] - 0.08, 1.0, LIN, z=0.0, lod=lod)
    parts.noren(g, I, -1.45, -0.35, LIN - 0.03, 0.75, 0.2, strips=3, lod=lod)
    parts.engawa(g, I, -B - 0.15, B + 0.15, 0.1, 0.95, FL - 0.05, lod=lod)
    # avant-toit : versant en appentis
    p = math.radians(25)
    ov = 1.15
    ye = TOP + 0.03 - ov * math.tan(p)
    S = roof.Slope((0, ye, ov), (1, 0, 0), (0, 0, 1), p, -B - 0.35, B + 0.35, lambda s: 2.3, ov / math.cos(p))
    roof.underside(g, S, lod)
    roof.tiles(g, S, lod)
    for s in (S.s0, S.s1):
        roof.verge(g, S, s, lod)
    a, b = S.P(S.s0 - 0.05, 2.3, roof.H_TILE - 0.02), S.P(S.s1 + 0.05, 2.3, roof.H_TILE - 0.02)
    roof.ridge(g, a, b, lod, layers=3)
    # chaîne de pluie (kusari-doi) et gouttière demi-ronde en cuivre
    gut = [V((x, ye - 0.08, ov + 0.06)) for x in (S.s0, S.s1)]
    roof.tube(g, 'hd_metal', gut, 0.05, seg=8, flag=4)
    # maillons ovales alternés (deux barreaux verticaux + deux traverses), un tous les 6 cm
    from lib.geo import cbox, T, RY
    cx, cz = B + 0.2, ov + 0.06
    y = ye - 0.14
    k = 0
    while y > 0.05:
        M = T(cx, y, cz) @ RY(math.pi / 2 * (k % 2))
        for sx in (-1, 1):
            cbox(g, 'hd_metal', M @ T(sx * 0.016, 0, 0), 0.008, 0.07, 0.008, c=0.002, grain=1, flag=4)
        for sy in (-1, 1):
            cbox(g, 'hd_metal', M @ T(0, sy * 0.035, 0), 0.04, 0.008, 0.008, c=0.002, grain=0, flag=4)
        y -= 0.06
        k += 1


def main():
    seed = int(sys.argv[sys.argv.index('--seed') + 1]) if '--seed' in sys.argv else 7
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(scene.ROOT, 'test-shots/hd-modelisation/j1-facade.png')
    t0 = time.time()
    scene.reset()
    g = Geo(seed)
    facade(g, 0)
    print('triangles LOD0 :', g.tris(), f'({time.time() - t0:.1f} s)')
    root = scene.bpy.data.objects.new('facade', None)
    scene.bpy.context.scene.collection.objects.link(root)
    ob = scene.make_object('facade_lod0', g, root)
    scene.ground(30, -0.02)
    dev = scene.cycles(32)
    print('cuisson sur', dev)
    scene.bake_ao(ob, samples=48, distance=1.0)
    scene.weather(ob, yaw=math.pi, ground_y=0.0, eave_y=3.0, seed=seed)
    print(f'cuisson + patine ({time.time() - t0:.1f} s)')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    scene.setup_render(target=(0.1, 1.6, 0.0), cam=(3.6, 1.7, 5.6), res=(1280, 720), samples=96, lens=30, sun_elev=22, sun_az=-130)
    scene.render(out)
    print('planche :', out, f'({time.time() - t0:.1f} s)')


if __name__ == '__main__':
    main()
