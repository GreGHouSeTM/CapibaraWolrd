"""Génère les bâtiments de Capyville (.glb à 3 LOD + manifest.json) depuis src/world/zones.ts.

Usage (un seul Blender lourd à la fois pour l'équipe) :
  flock /tmp/capy-blender.lock python3 tools/blender/buildings/build.py            # tout
  flock /tmp/capy-blender.lock python3 tools/blender/buildings/build.py e1 w1      # quelques ids
  ... build.py --type machiya,minka                                                # par typologie
  ... build.py e1 --render                                                          # + rendu Cycles doré de contrôle
  ... build.py e1 --render-only --night                                             # rendu de nuit (shōji allumés)
Rendus : tools/blender/buildings/.cache/renders/<id>[_nuit].png
"""
import json
import math
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lib import export as ex          # noqa: E402
from lib import town                  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '../..', '..'))
ZJSON = os.path.join(HERE, '.cache', 'zones.json')
MANIFEST = os.path.join(ex.OUT_DIR, 'manifest.json')
RENDERS = os.path.join(HERE, '.cache', 'renders')


def zones():
    subprocess.run(['node', os.path.join(HERE, 'dump_zones.mjs'), ZJSON], check=True, cwd=ROOT, capture_output=True)
    return json.load(open(ZJSON))


def seed_of(s):
    h = 7
    for ch in s:
        h = (h * 131 + ord(ch)) % 1000003
    return h


def variants(blds):
    """Variante a/b/c de chaque machiya et minka : alternée le long de chaque rue pour que deux voisines diffèrent."""
    out = {}
    for typ in ('machiya', 'minka'):
        lst = [b for b in blds if b['type'] == typ]
        # ordre de voisinage : par préfixe de rue puis par numéro
        lst.sort(key=lambda b: (b['id'].rstrip('0123456789'), int(''.join(c for c in b['id'] if c.isdigit()) or 0)))
        for i, b in enumerate(lst):
            out[b['id']] = 'abc'[(i + (seed_of(b['id'][0]) % 3)) % 3]
    out['w1'] = 'a'  # maison de Capy : engawa en façade, 2 niveaux
    return out


BUILDERS = {
    'machiya': lambda b, v: town.machiya(b['w'], b['d'], b['floors'], v, seed_of(b['id'])),
    'minka': lambda b, v: town.minka(b['w'], b['d'], b['floors'], v, seed_of(b['id'])),
}


def tri_count(bl):
    return bl.tris()


def build_one(bdef, variant, do_render=False, night=False, render_only=False):
    t0 = time.time()
    ex.reset()
    lods, meta = BUILDERS[bdef['type']](bdef, variant)
    anchors = lods[0].anchors
    bid = bdef['id']
    ex.build_scene(bid, lods, anchors)
    info = None
    if not render_only:
        path = ex.export(bid)
        info = dict(
            id=bid, type=bdef['type'], name=bdef['name'], variant=variant, file=os.path.basename(path),
            w=bdef['w'], d=bdef['d'], floors=bdef['floors'], height=meta['height'],
            lod=[f'{bid}_lod0', f'{bid}_lod1', f'{bid}_lod2'],
            triangles=[tri_count(l) for l in lods], bytes=os.path.getsize(path),
            anchors=[dict(name=f'{n}_{i}', pos=[round(p.x, 3), round(p.y, 3), round(p.z, 3)], yaw=round(y, 4), **e)
                     for i, (n, p, y, e) in _numbered(anchors)],
            colliders=meta['colliders'],
        )
        print(f"  {bid:14s} {bdef['type']:8s} {variant}  tris {info['triangles']}  {info['bytes'] // 1024} Ko  {time.time() - t0:.1f}s")
    if do_render or render_only:
        os.makedirs(RENDERS, exist_ok=True)
        W, D, H = bdef['w'], bdef['d'], meta['height']
        dist = max(W, D) * 1.45 + 4
        ex.setup_render(target=(0, H * 0.42, 0), cam=(dist * 0.55, 2.2 + H * 0.25, dist * 0.95), night=night)
        ex.render(os.path.join(RENDERS, f"{bid}{'_nuit' if night else ''}.png"))
        ex.setup_render  # noqa
    return info


def _numbered(anchors):
    cnt = {}
    for n, p, y, e in anchors:
        k = cnt.get(n, 0)
        cnt[n] = k + 1
        yield k, (n, p, y, e)


def main():
    args = sys.argv[1:]
    do_render = '--render' in args
    render_only = '--render-only' in args
    night = '--night' in args
    types = None
    for a in args:
        if a.startswith('--type'):
            types = args[args.index(a) + 1].split(',') if a == '--type' else a.split('=')[1].split(',')
    ids = [a for a in args if not a.startswith('--') and (types is None or a not in ','.join(types))]
    z = zones()
    blds = z['BUILDINGS']
    var = variants(blds)
    todo = [b for b in blds if b['type'] in BUILDERS and (not ids or b['id'] in ids) and (types is None or b['type'] in types)]
    man = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {'buildings': {}}
    for b in todo:
        info = build_one(b, var.get(b['id'], 'a'), do_render, night, render_only)
        if info:
            man['buildings'][b['id']] = info
    if not render_only:
        man['conventions'] = CONVENTIONS
        json.dump(man, open(MANIFEST, 'w'), indent=1, ensure_ascii=False)
        print('manifest ->', MANIFEST, len(man['buildings']), 'entrées')


CONVENTIONS = {
    'repere': "Origine au sol (y = 0) au centre de l'emprise w × d de zones.ts ; façade principale vers +Z local ; "
              "poser avec position = (x, heightAt, z) et rotation.y = yaw de BUILDINGS. Plancher à +0,45 m ; "
              "le soubassement descend à −0,9 m pour absorber les pentes.",
    'lod': "Nœuds <id>_lod0 (< 45 m), <id>_lod1 (45-140 m), <id>_lod2 (140-400 m) sous le nœud racine <id> ; "
           "utiliser THREE.LOD avec LOD_DISTANCES.building.",
    'compression': "EXT_meshopt_compression + KHR_mesh_quantization (gltfpack) : GLTFLoader.setMeshoptDecoder(MeshoptDecoder) "
                   "depuis three/examples/jsm/libs/meshopt_decoder.module.js.",
    'textures': "Images externes (non embarquées) : tex/*.jpg dans ce dossier et ../../tex/*_nor.jpg (public/assets/tex). "
                "Mêmes noms de matières dans tous les .glb : fusionner par matière (Batch) entre bâtiments.",
    'couleurs': "COLOR_0 linéaire = teinte réelle (textures neutres grises) : garder vertexColors = true.",
    'nuit': "Matière 'paper_shoji' (userData.night = true, emissiveBoost) : l'ajouter à nightMaterials ; "
            "emissiveIntensity = 0 le jour.",
    'accroches': "Nœuds vides : anchor_noren_* (haut de l'ouverture, userData.w/h), anchor_lantern_* (userData.kind), "
                 "anchor_kanban_* (enseigne, userData.w/h/kind), anchor_nameplate_*, light_* (userData.color/intensity -> addLightSpot), "
                 "smoke_* (-> addSmokeSpot). Rotation y du nœud = orientation de la face.",
    'collisions': "colliders : boîtes locales (x, z centre ; w, d ; y0, y1) à tourner avec le bâtiment ; walk = dessus marchable.",
}

if __name__ == '__main__':
    main()
