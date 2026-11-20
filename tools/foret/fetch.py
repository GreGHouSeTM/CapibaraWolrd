"""Téléchargement des sources CC0 de la zone « forêt » (Poly Haven, ambientCG) dans tools/foret/.cache/dl/.

Usage : python tools/foret/fetch.py            (tout le catalogue, déjà téléchargé = ignoré)
        python tools/foret/fetch.py mossy_rock   (un asset)
Fonctionne sous Windows (curl), sans verrou. Écrit aussi .cache/dl/credits.json (source, auteurs, licence) lu par
build_credits() pour public/assets/foret/CREDITS.md.
"""
import hashlib
import json
import os
import subprocess
import sys
import time
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DL = os.path.join(ROOT, 'tools', 'foret', '.cache', 'dl')
API = 'https://api.polyhaven.com'
UA = 'capy-world-assets/1.0'

# --- catalogue : (type, id, résolution, usage)
PH_TEX = [
    ('forrest_ground_03', '2k', 'sol : litière d’aiguilles d’épicéa'),
    ('forest_leaves_02', '2k', 'sol : litière moussue, brindilles'),
    ('forest_ground_04', '2k', 'sentier : terre tassée et cailloux'),
    ('mud_forest', '2k', 'sol humide, bord de flaque'),
    ('mossy_rock', '2k', 'paroi : granite moussu (base)'),
    ('lichen_rock', '2k', 'paroi et blocs : roche à lichens'),
    ('rock_01', '2k', 'escalier : dessus des marches, pierre usée'),
    ('rock_face_03', '2k', 'escalier : flancs des dalles, pierre brute'),
    ('pine_bark', '2k', 'écorce (souches, bois mort)'),
    ('knotted_pine_bark', '2k', 'écorce des épicéas'),
]
ACG = [
    ('Moss002', '2K-JPG', 'mousse courte et dense (paroi, marches, sol)'),
    ('Moss003', '2K-JPG', 'mousse épaisse en coussins'),
    ('Ground037', '2K-JPG', 'sol forestier humide et moussu'),
]
PH_HDRI = [('misty_pines', '2k', 'éclairage du ciel (IBL) : pinède brumeuse, ciel couvert')]
PH_MODELS = [
    ('fern_02', '2k'), ('shrub_sorrel_01', '2k'), ('rock_moss_set_01', '2k'), ('rock_moss_set_02', '2k'), ('boulder_01', '2k'),
    ('tree_stump_01', '2k'), ('tree_stump_02', '2k'), ('dead_tree_trunk', '2k'), ('dead_tree_trunk_02', '2k'), ('pine_roots', '2k'),
    ('root_cluster_01', '2k'), ('root_cluster_02', '2k'), ('single_root', '2k'), ('dry_branches_medium_01', '2k'), ('stone_01', '1k'),
    ('rock_07', '1k'), ('rock_09', '1k'), ('Lantern_01', '2k'), ('fir_sapling', '2k'), ('pine_sapling_small', '2k'),
    ('fir_tree_01', '2k'), ('celandine_01', '1k'), ('moss_01', '2k'), ('grass_medium_01', '1k'),
]


def log(*a):
    print(*a, flush=True)


def run_curl(args):
    for attempt in range(4):
        r = subprocess.run(['curl', '-sS', '-L', '--fail', '--retry', '3', '-A', UA] + args, capture_output=True)
        if r.returncode == 0:
            return r.stdout
        time.sleep(2 + attempt * 3)
    raise RuntimeError('curl : ' + ' '.join(args) + ' ' + r.stderr.decode(errors='replace')[-300:])


def api(path):
    return json.loads(run_curl([API + path]))


def md5(path):
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def get(url, dest, md5sum=None):
    if os.path.exists(dest) and (md5sum is None or md5(dest) == md5sum):
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    run_curl(['-o', dest + '.part', url])
    if md5sum and md5(dest + '.part') != md5sum:
        raise RuntimeError('md5 incorrect : ' + url)
    os.replace(dest + '.part', dest)
    return dest


CREDITS = {}


def credit(kind, aid, url, authors, usage, files):
    CREDITS[aid] = dict(kind=kind, id=aid, url=url, license='CC0 1.0 (domaine public)', authors=authors, usage=usage, files=files)


def ph_info(aid):
    try:
        return api('/info/' + aid)
    except Exception:
        return {}


def ph_tex(aid, res, usage):
    f = api('/files/' + aid)
    d = os.path.join(DL, 'ph', aid)
    out = {}
    for key, name in (('Diffuse', 'diff'), ('nor_gl', 'nor'), ('arm', 'arm'), ('Displacement', 'disp')):
        if key not in f:
            continue
        ext = 'png' if key == 'Displacement' else 'jpg'
        e = f[key][res][ext]
        out[name] = get(e['url'], os.path.join(d, f'{aid}_{name}_{res}.{ext}'), e.get('md5'))
    info = ph_info(aid)
    credit('texture Poly Haven', aid, 'https://polyhaven.com/a/' + aid, sorted((info.get('authors') or {}).keys()), usage, list(out))
    return out


def ph_hdri(aid, res, usage):
    f = api('/files/' + aid)
    e = f['hdri'][res]['hdr']
    p = get(e['url'], os.path.join(DL, 'ph', aid, f'{aid}_{res}.hdr'), e.get('md5'))
    info = ph_info(aid)
    credit('HDRI Poly Haven', aid, 'https://polyhaven.com/a/' + aid, sorted((info.get('authors') or {}).keys()), usage, [os.path.basename(p)])
    return p


def ph_model(aid, res):
    f = api('/files/' + aid)
    g = f['gltf'].get(res) or f['gltf'][sorted(f['gltf'])[0]]
    g = g['gltf']
    d = os.path.join(DL, 'ph', aid, res)
    main = get(g['url'], os.path.join(d, os.path.basename(g['url'])), g.get('md5'))
    for rel, inc in g.get('include', {}).items():
        get(inc['url'], os.path.join(d, rel), inc.get('md5'))
    info = ph_info(aid)
    credit('modèle Poly Haven', aid, 'https://polyhaven.com/a/' + aid, sorted((info.get('authors') or {}).keys()), 'voir CREDITS.md', [os.path.basename(main)])
    return main


def acg(aid, res, usage):
    d = os.path.join(DL, 'acg', aid)
    z = os.path.join(d, f'{aid}_{res}.zip')
    if not os.path.isdir(d) or not any(n.endswith('.jpg') for n in os.listdir(d)):
        get(f'https://ambientcg.com/get?file={aid}_{res}.zip', z)
        with zipfile.ZipFile(z) as zf:
            zf.extractall(d)
        os.remove(z)
    credit('matériau ambientCG', aid, 'https://ambientcg.com/view?id=' + aid, ['ambientCG (Lennart Demes)'], usage, sorted(os.listdir(d)))
    return d


def main():
    want = set(a for a in sys.argv[1:] if not a.startswith('--'))
    os.makedirs(DL, exist_ok=True)
    cp = os.path.join(DL, 'credits.json')
    if os.path.exists(cp):
        CREDITS.update(json.load(open(cp, encoding='utf-8')))
    sel = lambda i: not want or i in want  # noqa: E731
    for aid, res, usage in PH_TEX:
        if sel(aid):
            log('texture', aid); ph_tex(aid, res, usage)
    for aid, res, usage in ACG:
        if sel(aid):
            log('ambientCG', aid); acg(aid, res, usage)
    for aid, res, usage in PH_HDRI:
        if sel(aid):
            log('hdri', aid); ph_hdri(aid, res, usage)
    for aid, res in PH_MODELS:
        if sel(aid):
            log('modèle', aid); ph_model(aid, res)
    json.dump(CREDITS, open(cp, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    log('crédits :', len(CREDITS), 'assets')


if __name__ == '__main__':
    main()
