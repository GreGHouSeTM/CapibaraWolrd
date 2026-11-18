"""Exporte le kit commun sous forme de pièces détachées (kit.glb), pour les ouvrages faits à la main par d'autres spécialités
(clôtures, annexes, décors). Chaque pièce est un nœud nommé `kit_<pièce>` posé à l'origine, au sol, face vers +Z.

Usage : flock /tmp/capy-blender.lock python3 tools/blender/buildings/build_kit.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402,F401
from lib import export as ex, kit  # noqa: E402
from lib.geom import Builder, affine  # noqa: E402
from lib.kit import Pal  # noqa: E402
from lib.roof import gable_roof, pent_roof, onigawara, ridge  # noqa: E402
from mathutils import Vector as V  # noqa: E402

PIECES = {}


def piece(name):
    def deco(f):
        PIECES[name] = f
        return f
    return deco


pal = Pal()


@piece('poteau')
def _(b): kit.post(b, 'wood', 0, 0, 0, 2.8, 0.15, col=pal.wood)


@piece('panneau_enduit')
def _(b): kit.plaster(b, pal, -0.85, 0.85, 0, 2.6)


@piece('shoji_1820')
def _(b): kit.shoji(b, pal, -0.91, 0.91, 0, 1.8, 0)


@piece('koshi_1820')
def _(b):
    kit.tracks(b, pal, -0.91, 0.91, 0.05, 1.8)
    kit.koshi(b, pal, -0.91, 0.91, 0.05, 1.8, 0)


@piece('amado_1820')
def _(b): kit.amado(b, pal, -0.91, 0.91, 0, 1.8, 0)


@piece('porte_koshido')
def _(b): kit.door(b, pal, -0.91, 0.91, 0, 1.85, 0)


@piece('mushiko')
def _(b): kit.mushiko(b, pal, -0.91, 0.91, 0, 1.4, 0)


@piece('garde_corps_1820')
def _(b): kit.railing(b, pal, -0.91, 0.91, 0, z=0)


@piece('soubassement_2x2')
def _(b): kit.plinth(b, -1, -1, 1, 1, y1=0.33, y0=-0.5)


@piece('marches_3')
def _(b): kit.steps(b, 0, 0, 1.2, 3, out=1)


@piece('engawa_1820')
def _(b): kit.engawa(b, pal, -0.91, 0.91, -0.9, 0, 0.45, 0)


@piece('chaine_de_pluie')
def _(b): kit.rain_chain(b, 0, 0, 3.0, 0.1)


@piece('auvent_hisashi_3m')
def _(b): pent_roof(b, -1.5, 1.5, 2.6, 0.9, z_wall=0)


@piece('toit_kirizuma_4x3')
def _(b): gable_roof(b, 4, 3, 0.0, oni=0.5)


@piece('onigawara')
def _(b): onigawara(b, V((0, 0, 0)), V((0, 0, 1)), 0.6)


def main():
    ex.reset()
    root = bpy.data.objects.new('kit', None)
    bpy.context.scene.collection.objects.link(root)
    info = {}
    for i, (name, f) in enumerate(PIECES.items()):
        b = Builder(i + 1)
        f(b)
        b.weather()
        ob = ex.make_object('kit_' + name, b, root)
        ob.location = ((i % 5) * 4.0, -(i // 5) * 4.0, 0)   # disposition en grille (Blender : y = −z Three.js)
        info['kit_' + name] = b.tris()
    path = ex.export('kit')
    man_p = os.path.join(ex.OUT_DIR, 'manifest.json')
    man = json.load(open(man_p)) if os.path.exists(man_p) else {'buildings': {}}
    man['kit'] = dict(file=os.path.basename(path), bytes=os.path.getsize(path), pieces=info,
                      note="Pièces en grille de 4 m : remettre la position du nœud à 0 pour l'utiliser.")
    json.dump(man, open(man_p, 'w'), indent=1, ensure_ascii=False)
    print('kit ->', path, sum(info.values()), 'triangles')


if __name__ == '__main__':
    main()
