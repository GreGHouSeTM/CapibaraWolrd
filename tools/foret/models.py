"""Conversion des modèles Poly Haven (CC0) de la zone « forêt » : textures 2K (1K pour les petits), LOD, meshopt.

Usage : .venv-blender/Scripts/python.exe -I tools/foret/models.py [id…] [--force]
Réutilise tools/polyhaven/convert.py (un processus Blender par modèle, sans teinte : la retouche est faite dans les
shaders de la démo) puis gltfpack. Sortie : public/assets/foret/models/<id>.glb et models.json (pièces, LOD, tailles).
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import CACHE, DL, OUT, gltfpack_cli, log  # noqa: E402

CONVERT = os.path.join(HERE, '..', 'polyhaven', 'convert.py')
PY = sys.executable
MOUT = os.path.join(OUT, 'models')


def M(id, res='2k', tex=2048, lods=(12000, 0.25, 0.06), split=False, foliage=False, hard=False, maxparts=None, only=None, quality=82):
    return dict(id=id, res=res, tex=tex, lods=list(lods), split=split, foliage=foliage, hard=hard, maxparts=maxparts, only=only, quality=quality)


CATALOG = [
    M('fern_02', split='objects', lods=(6000, 0.35), foliage=True),
    M('shrub_sorrel_01', lods=(3400, 0.35), foliage=True),
    M('rock_moss_set_01', split='objects', lods=(12000, 0.25, 0.06)),
    M('rock_moss_set_02', split='objects', lods=(12000, 0.25, 0.06)),
    M('boulder_01', lods=(24000, 0.25, 0.06)),
    M('tree_stump_01', lods=(16000, 0.25, 0.06)),
    M('tree_stump_02', lods=(16000, 0.25, 0.06)),
    M('dead_tree_trunk', lods=(14000, 0.25, 0.06)),
    M('dead_tree_trunk_02', lods=(16000, 0.25, 0.06)),
    M('pine_roots', split='objects', lods=(8000, 0.25)),
    M('root_cluster_01', lods=(18000, 0.25)),
    M('root_cluster_02', split='objects', maxparts=4, lods=(6000, 0.25)),
    M('single_root', tex=1024, lods=(4000, 0.3)),
    M('dry_branches_medium_01', res='2k', tex=1024, split='objects', lods=(3000, 0.3)),
    M('stone_01', res='1k', tex=1024, lods=(2500, 0.25)),
    M('rock_07', res='1k', tex=1024, lods=(3000, 0.25)),
    M('rock_09', res='1k', tex=1024, lods=(2500, 0.25)),
    M('Lantern_01', tex=1024, lods=(16000, 0.3), hard=True),
    M('fir_sapling', tex=2048, lods=(60000, 0.3, 0.1), foliage=True),
    M('pine_sapling_small', tex=2048, lods=(50000, 0.3, 0.1), foliage=True),
]


def gltf_of(aid, res):
    d = os.path.join(DL, 'ph', aid, res)
    for f in os.listdir(d):
        if f.endswith('.gltf'):
            return os.path.join(d, f)
    raise FileNotFoundError(d)


def convert(e, force):
    out = os.path.join(MOUT, e['id'] + '.glb')
    stats = os.path.join(CACHE, 'models', e['id'] + '.json')
    if os.path.exists(out) and os.path.exists(stats) and not force:
        return json.load(open(stats))
    raw = os.path.join(CACHE, 'models', e['id'] + '_raw.glb')
    job = dict(src=gltf_of(e['id'], e['res']), work=os.path.join(CACHE, 'models', 'work', e['id']), out=raw, stats=stats,
               name=e['id'].lower(), tex=e['tex'], tint='none', lods=e['lods'], split=e['split'], foliage=e['foliage'],
               hard=e['hard'], keep=None, maxparts=e['maxparts'], quality=e['quality'], only=e['only'])
    os.makedirs(os.path.dirname(raw), exist_ok=True)
    jp = os.path.join(CACHE, 'models', e['id'] + '_job.json')
    json.dump(job, open(jp, 'w'), indent=1)
    r = subprocess.run([PY, '-I', CONVERT, jp], capture_output=True, text=True, encoding='utf-8', errors='replace')
    ok = [l for l in r.stdout.splitlines() if l.startswith('OK')]
    if r.returncode != 0 or not ok:
        log('ÉCHEC', e['id'], (r.stderr or r.stdout)[-800:])
        return None
    os.makedirs(MOUT, exist_ok=True)
    p = subprocess.run(['node', gltfpack_cli(), '-i', raw, '-o', out, '-cc', '-kn', '-km', '-vn', '10', '-vt', '12', '-vp', '14'],
                       capture_output=True, text=True)
    if p.returncode != 0:
        log('gltfpack', e['id'], p.stderr[-300:])
        return None
    st = json.load(open(stats))
    st['bytes'] = os.path.getsize(out)
    json.dump(st, open(stats, 'w'), indent=1)
    log(f"{e['id']:24s} {st['bytes'] / 1e6:5.1f} Mo  pièces {len(st['parts'])}  LOD0 {[pp['lods'][0]['triangles'] for pp in st['parts']][:6]}")
    return st


def main():
    args = sys.argv[1:]
    force = '--force' in args
    ids = [a for a in args if not a.startswith('--')]
    man = {}
    mp = os.path.join(OUT, 'models.json')
    if os.path.exists(mp):
        man = json.load(open(mp, encoding='utf-8'))
    for e in CATALOG:
        if ids and e['id'] not in ids:
            if e['id'] in man:
                continue
        st = convert(e, force or e['id'] in ids)
        if not st:
            continue
        man[e['id']] = {'file': f"models/{e['id']}.glb", 'bytes': st['bytes'], 'parts': [
            {'name': pp['name'], 'dims': pp['dimensions'], 'radius': pp['radius'], 'lods': [l['node'] for l in pp['lods']],
             'tris': [l['triangles'] for l in pp['lods']]} for pp in st['parts']]}
    json.dump(man, open(mp, 'w', encoding='utf-8'), indent=1)
    log('modèles :', len(man), f"{sum(v['bytes'] for v in man.values()) / 1e6:.1f} Mo")


if __name__ == '__main__':
    main()
