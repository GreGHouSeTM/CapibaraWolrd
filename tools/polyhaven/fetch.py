#!/usr/bin/env python3
"""Téléchargement et conversion des modèles photoscannés Poly Haven (CC0) pour Capyville.

Usage (depuis la racine du dépôt) :
    python3 tools/polyhaven/fetch.py                 # tout le catalogue (sauf les modèles « lourds »)
    python3 tools/polyhaven/fetch.py rock_07 fern_02 # quelques modèles seulement
    python3 tools/polyhaven/fetch.py --heavy         # inclut les modèles très lourds (falaises côtières…)
    python3 tools/polyhaven/fetch.py --check         # vérifie que les ids existent sur l'API (et propose des remplaçants)
    python3 tools/polyhaven/fetch.py --manifest      # régénère seulement le manifeste
    Options : --force (reconvertit même si le .glb existe), --redownload, --no-compress (pas de gltfpack).

Étapes pour chaque modèle du catalogue CATALOG :
 1. `https://api.polyhaven.com/files/<id>` -> glTF 1k (+ textures) téléchargé avec curl dans tools/polyhaven/.cache/ (md5 vérifié) ;
 2. conversion Blender (`convert.py`, un processus `bpy` à la fois sous `flock /tmp/capy-blender.lock`) : textures réduites (1k / 512 / 256)
    et teintées vers la palette (pierre grise chaude #8f8a80, mousse #5f7a3a), découpage des ensembles, origine au sol, échelle réelle (m),
    décimation en 2 ou 3 LOD (`_lod0/_lod1/_lod2` dans le même .glb), textures WebP ;
    puis compression de la géométrie avec gltfpack (EXT_meshopt_compression + KHR_mesh_quantization ; `npm install --prefix tools/polyhaven`) ;
 3. écriture de `public/assets/models/<nature|props>/<id>.glb` et du manifeste `public/assets/models/manifest.json`.

Le catalogue suit la bible (§8.2, §11, §13). Budget : < 45 Mo pour l'ensemble des modèles Poly Haven.
"""
import hashlib
import json
import os
import subprocess
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'models')
CACHE = os.environ.get('CAPY_PH_CACHE', os.path.join(ROOT, 'tools', 'polyhaven', '.cache'))
CONVERT = os.path.join(ROOT, 'tools', 'polyhaven', 'convert.py')
MANIFEST = os.path.join(OUT, 'manifest.json')
API = 'https://api.polyhaven.com'
BUDGET = 45 * 1024 * 1024

# Distances de LOD (m) d'après la bible §11 : la dernière distance cache l'objet.
D_ROCK = [30, 90, 300]
D_CLIFF = [60, 180, 600]
D_WOOD = [30, 90, 200]  # souches, troncs, racines
D_PLANT = [20, 50]  # fougères, mousse, arbustes bas
D_SHRUB = [25, 70, 140]
D_PROP = [25, 60]
D_SMALL = [15, 35]  # fruits, vaisselle


def M(id, dest, cat, usage, tex=1024, lods=(8000, 0.25, 0.06), dist=D_ROCK, tint='none', split=False, foliage=False,
      hard=False, shadow=True, sink=0.0, src=None, heavy=False, keep=None, maxparts=None, quality=80, only=None):
    """Entrée de catalogue. lods = (max triangles LOD0, ratio LOD1, [ratio LOD2]) ; dist = distances de bascule/masquage."""
    return dict(id=id, src=src or id, dest=dest, cat=cat, usage=usage, tex=tex, lods=list(lods), dist=list(dist), tint=tint,
                split=split, foliage=foliage, hard=hard, shadow=shadow, sink=sink, heavy=heavy, keep=keep, maxparts=maxparts,
                quality=quality, only=only)


P2 = (6000, 0.3)  # objets : 2 LOD
CATALOG = [
    # --- 1. Rochers moussus (berges, jardins, rotenburo, forêt) : LOD0 ≤ 8 k, LOD1 ≤ 2 k
    M('rock_moss_set_01', 'nature', 'rocher', 'rochers moussus plats et ronds (berges, rotenburo, jardins)', split='objects', tint='rock', sink=0.06),
    M('rock_moss_set_02', 'nature', 'rocher', 'rochers moussus allongés (berges, forêt)', split='objects', tint='rock', sink=0.06),
    M('boulder_01', 'nature', 'rocher', 'gros bloc erratique (forêt, prairies, gorge)', tint='rock', sink=0.1),
    M('rock_07', 'nature', 'rocher', 'petite pierre (bords de chemin, lit du torrent)', tex=512, lods=(3000, 0.25, 0.08), tint='rock', sink=0.02, shadow=False),
    M('rock_09', 'nature', 'rocher', 'pierre plate (pas japonais, lit du torrent)', tex=512, lods=(2000, 0.25, 0.08), tint='rock', sink=0.01, shadow=False),
    M('stone_01', 'nature', 'rocher', 'galet (lit du torrent, jardins secs)', tex=512, lods=(1500, 0.25, 0.08), tint='rock', sink=0.01, shadow=False),
    # --- Parois et falaises (gorge, pagode, belvédère) : ≤ 30 k
    M('rock_face_01', 'nature', 'paroi', 'paroi rocheuse (falaises de la pagode et du belvédère)', lods=(20000, 0.25, 0.06), dist=D_CLIFF, tint='rock', sink=0.3),
    M('rock_face_02', 'nature', 'paroi', 'paroi rocheuse (gorge, bords du torrent)', lods=(20000, 0.25, 0.06), dist=D_CLIFF, tint='rock', sink=0.3),
    M('mountainside', 'nature', 'paroi', 'pan de montagne (falaises de la gorge, crêtes)', lods=(30000, 0.25, 0.05), dist=D_CLIFF, tint='rock', sink=0.4),
    M('coast_rocks_05', 'nature', 'paroi', 'amas de rochers (cascades, berges)', lods=(20000, 0.25, 0.06), dist=D_CLIFF, tint='rock', sink=0.2, heavy=True),
    # --- 2. Sol de forêt et sous-bois
    # moss_01 écarté : le glTF 1k ne contient que des miettes de 6 à 24 triangles (quelques cm) ; la mousse est dans les textures
    M('fern_02', 'nature', 'fougere', 'fougère (sous-bois, berges ombragées)', split='objects', lods=(3000, 0.35), dist=D_PLANT, tint='plant', foliage=True, shadow=True),
    M('pine_roots', 'nature', 'racine', 'racines de pin affleurantes (pieds des cèdres, sentiers)', split='objects', lods=(5000, 0.25, 0.06), dist=D_WOOD, tint='moss', sink=0.03),
    M('root_cluster_01', 'nature', 'racine', 'souche à racines (berges, talus)', lods=(8000, 0.25, 0.06), dist=D_WOOD, tint='moss', sink=0.05),
    M('root_cluster_02', 'nature', 'racine', 'racines au sol (sous-bois)', split='objects', maxparts=4, lods=(3000, 0.25, 0.06), dist=D_WOOD, tint='moss', sink=0.03, shadow=False),
    M('single_root', 'nature', 'racine', 'racine isolée (sentiers de forêt)', tex=512, lods=(2500, 0.25), dist=D_PLANT, tint='moss', sink=0.02, shadow=False),
    M('dry_branches_medium_01', 'nature', 'bois_mort', 'branches sèches (sous-bois, ferme)', split='objects', tex=512, lods=(3000, 0.3), dist=D_PLANT, tint='wood', shadow=True),
    # --- 3. Seaux, baquets, tonneaux, caisses, paniers
    M('wooden_bucket_01', 'props', 'seau', 'seau de bois à anse (puits, bains, place)', tex=512, lods=P2, dist=D_PROP, tint='wood', hard=True),
    M('wooden_bucket_02', 'props', 'seau', 'baquet de bois bas (bains, pyramide de seaux)', tex=512, lods=P2, dist=D_PROP, tint='wood', hard=True),
    M('wooden_barrels_01', 'props', 'tonneau', 'tonneaux de bois (sauce, saké ; place, ferme)', split='objects', only='barrel0', lods=P2, dist=D_PROP, tint='wood', hard=True),
    M('wine_barrel_01', 'props', 'tonneau', 'tonneau de miso (place, Grand-Rue)', tex=512, lods=P2, dist=D_PROP, tint='miso', hard=True),
    M('wooden_crate_01', 'props', 'caisse', 'cageot de bois (légumes, yuzus)', tex=512, lods=P2, dist=D_PROP, tint='wood', hard=True),
    M('wooden_crate_02', 'props', 'caisse', 'grande caisse de bois (Grand-Rue, moulin)', tex=512, lods=P2, dist=D_PROP, tint='wood', hard=True),
    M('wicker_basket_01', 'props', 'panier', 'panier plat en osier (étals, œufs, cueillette)', tex=512, lods=P2, dist=D_PROP, tint='wood'),
    M('wicker_basket_02', 'props', 'panier', 'panier en osier à anses (serviettes, thé)', tex=512, lods=P2, dist=D_PROP, tint='wood'),
    # --- 4. Souches et bois mort
    M('tree_stump_01', 'nature', 'souche', 'souche (forêt, prairies à ennemis)', lods=(8000, 0.25, 0.06), dist=D_WOOD, tint='moss', sink=0.05),
    M('tree_stump_02', 'nature', 'souche', 'souche moussue (forêt, sentiers)', lods=(8000, 0.25, 0.06), dist=D_WOOD, tint='moss', sink=0.05),
    M('dead_tree_trunk', 'nature', 'tronc', 'tronc couché fin (sous-bois)', lods=(5000, 0.25, 0.06), dist=D_WOOD, tint='moss', sink=0.05),
    M('dead_tree_trunk_02', 'nature', 'tronc', 'gros tronc couché (forêt, berges)', lods=(9000, 0.25, 0.06), dist=D_WOOD, tint='moss', sink=0.08),
    # --- 5. Arbustes (haies, lisières)
    M('shrub_01', 'nature', 'arbuste', 'touffes fleuries basses (lisières, jardins)', split='objects', lods=(5000, 0.3, 0.08), dist=D_SHRUB, tint='plant', foliage=True),
    M('shrub_02', 'nature', 'arbuste', 'arbustes ronds (haies, lisières)', split='objects', lods=(9000, 0.3, 0.08), dist=D_SHRUB, tint='plant', foliage=True),
    M('shrub_03', 'nature', 'arbuste', 'petits arbustes (bords de chemin)', split='objects', lods=(4000, 0.3, 0.08), dist=D_SHRUB, tint='plant', foliage=True),
    M('shrub_04', 'nature', 'arbuste', 'jeunes pousses (sous-bois, talus)', split='objects', tex=512, lods=(4000, 0.3), dist=D_PLANT, tint='plant', foliage=True),
    M('shrub_sorrel_01', 'nature', 'arbuste', 'touffe d’oseille (berges, potagers)', tex=512, lods=(3400, 0.35), dist=D_PLANT, tint='plant', foliage=True, shadow=False),
    # --- 6. Poteries
    M('ceramic_pot', 'props', 'poterie', 'jarre de céramique (ferme, potier, jardins)', tex=512, lods=P2, dist=D_PROP),
    M('ceramic_vase_01', 'props', 'poterie', 'vase (potier, maison de thé)', tex=512, lods=P2, dist=D_PROP, shadow=False),
    M('ceramic_vase_02', 'props', 'poterie', 'vase (potier)', tex=512, lods=P2, dist=D_PROP, shadow=False),
    M('ceramic_vase_03', 'props', 'poterie', 'vase haut (potier)', tex=512, lods=P2, dist=D_PROP, shadow=False),
    M('ceramic_vase_04', 'props', 'poterie', 'vase (potier)', tex=512, lods=P2, dist=D_PROP, shadow=False),
    M('planter_pot_clay', 'props', 'poterie', 'pot de terre cuite (façades, bonsaïs)', tex=512, lods=P2, dist=D_PROP, shadow=False),
    M('jug_01', 'props', 'poterie', 'cruche (étals, cuisine)', tex=512, lods=P2, dist=D_PROP, shadow=False),
    M('brass_pot_01', 'props', 'poterie', 'pot de laiton (bouilloire, cuisine des bains)', tex=512, lods=P2, dist=D_PROP, shadow=False),
    # --- 7. Fruits et légumes (yatai, marché, verger)
    M('yuzu', 'props', 'fruit', 'yuzu (citron vert teinté jaune : mission, verger, rotenburo)', src='food_lime_01', tex=256, lods=(1500, 0.25), dist=D_SMALL, tint='yuzu', shadow=False),
    M('lemon', 'props', 'fruit', 'citron (étals)', tex=256, lods=(1500, 0.25), dist=D_SMALL, shadow=False),
    M('food_pears_asian_01', 'props', 'fruit', 'poires nashi (étals, verger)', split='objects', tex=512, lods=(1500, 0.25), dist=D_SMALL, shadow=False),
    M('sweet_potato', 'props', 'fruit', 'patate douce (yatai de patates douces)', tex=256, lods=(1500, 0.25), dist=D_SMALL, shadow=False),
    M('food_ginger_01', 'props', 'fruit', 'gingembre (marché)', tex=256, lods=(1500, 0.25), dist=D_SMALL, shadow=False),
    M('yellow_onion', 'props', 'fruit', 'oignon (potager, marché)', tex=256, lods=(1500, 0.25), dist=D_SMALL, shadow=False),
    # --- 8. Compléments du §8.2 (mobilier, outils, vaisselle, éclairage, plantes en pot)
    M('wooden_lantern_01', 'props', 'eclairage', 'lanterne suspendue de bois (ryokan, ponton)', tex=512, lods=P2, dist=D_PROP, tint='wood', hard=True),
    M('stone_fire_pit', 'props', 'eclairage', 'foyer de pierres (ferme, belvédère)', lods=P2, dist=D_PROP, tint='rock', sink=0.02),
    M('wooden_stool_01', 'props', 'mobilier', 'tabouret de bois (ateliers, yatai)', tex=512, lods=P2, dist=D_PROP, tint='wood', hard=True),
    M('chinese_stool', 'props', 'mobilier', 'tabouret laqué (maison de thé)', tex=512, lods=P2, dist=D_PROP, hard=True),
    M('chinese_tea_table', 'props', 'mobilier', 'table basse à thé (maison de thé, engawa)', tex=512, lods=P2, dist=D_PROP, hard=True),
    M('wooden_ladder', 'props', 'outil', 'échelle de bois (verger, moulin)', tex=512, lods=P2, dist=D_PROP, tint='wood', hard=True),
    M('wooden_broom', 'props', 'outil', 'balai (sanctuaire, ferme)', tex=512, lods=P2, dist=D_PROP, tint='wood', shadow=False),
    M('wooden_axe', 'props', 'outil', 'hache (bois empilé, ferme)', tex=256, lods=P2, dist=D_SMALL, tint='wood', hard=True, shadow=False),
    M('tea_set_01', 'props', 'vaisselle', 'service à thé (maison de thé)', tex=512, lods=(6000, 0.25), dist=D_SMALL, hard=True, shadow=False),
    M('wooden_bowl_01', 'props', 'vaisselle', 'bol de bois (soba, étals)', tex=256, lods=(3000, 0.3), dist=D_SMALL, tint='wood', shadow=False),
    M('wooden_bowl_02', 'props', 'vaisselle', 'petit bol de bois (étals)', tex=256, lods=(3000, 0.3), dist=D_SMALL, tint='wood', shadow=False),
    M('planter_box_01', 'props', 'plante_pot', 'jardinière (façades)', tex=512, lods=P2, dist=D_PROP, tint='wood', hard=True),
    M('potted_plant_02', 'props', 'plante_pot', 'plante en pot (engawa, façades)', tex=512, lods=(8000, 0.3), dist=D_PROP, tint='plant', foliage=True),
    M('modular_wooden_pier', 'props', 'ponton', 'éléments de ponton (étang)', split='objects', lods=(6000, 0.3, 0.1), dist=D_WOOD, tint='wood', hard=True),
]


def log(*a):
    print(*a, flush=True)


def api(path):
    """Appel de l'API Poly Haven avec curl (urllib est refusé par certains proxys et par l'API sans User-Agent)."""
    for attempt in range(4):
        r = subprocess.run(['curl', '-sS', '-L', '--fail', '--retry', '3', '-A', 'capy-world-assets/1.0', API + path],
                           capture_output=True)
        if r.returncode == 0:
            return json.loads(r.stdout)
        time.sleep(2 + attempt * 3)
    raise RuntimeError('API Poly Haven injoignable : ' + path)


def md5(path):
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def curl(url, dest, md5sum=None):
    if os.path.exists(dest) and (md5sum is None or md5(dest) == md5sum):
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for attempt in range(4):
        r = subprocess.run(['curl', '-sS', '-L', '--fail', '--retry', '3', '-o', dest + '.part', url])
        if r.returncode == 0 and (md5sum is None or md5(dest + '.part') == md5sum):
            os.replace(dest + '.part', dest)
            return
        log('  nouvel essai', url)
        time.sleep(2 + attempt * 3)
    raise RuntimeError('téléchargement impossible : ' + url)


def download(src, res='1k', redownload=False):
    """Télécharge le glTF <res> de l'asset (fichier principal + inclusions). Renvoie le chemin du .gltf."""
    files = api('/files/' + src)
    g = files['gltf'].get(res) or files['gltf'][sorted(files['gltf'])[0]]
    g = g['gltf']
    d = os.path.join(CACHE, 'src', src)
    main = os.path.join(d, os.path.basename(g['url']))
    if redownload and os.path.isdir(d):
        import shutil
        shutil.rmtree(d)
    curl(g['url'], main, g.get('md5'))
    for rel, inc in g.get('include', {}).items():
        curl(inc['url'], os.path.join(d, rel), inc.get('md5'))
    return main


GLTFPACK = os.path.join(ROOT, 'tools', 'polyhaven', 'node_modules', '.bin', 'gltfpack')


def pack(raw, out, compress=True):
    """Compression de la géométrie avec gltfpack (meshopt + quantification). Les textures WebP sont gardées telles quelles.
    -kn/-km : garde les nœuds nommés (_lod0…) et les matériaux ; -vn 10 : normales sur 10 bits (rochers lisses)."""
    if not compress:
        import shutil
        shutil.copyfile(raw, out)
        return
    if not os.path.exists(GLTFPACK):
        log('  installation de gltfpack (npm install --prefix tools/polyhaven)')
        subprocess.run(['npm', 'install', '--prefix', os.path.dirname(os.path.dirname(os.path.dirname(GLTFPACK)))], check=True)
    r = subprocess.run([GLTFPACK, '-i', raw, '-o', out, '-cc', '-kn', '-km', '-vn', '10', '-vt', '12', '-vp', '14'],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError('gltfpack : ' + (r.stderr or r.stdout)[-400:])


def convert(entry, gltf, compress=True):
    work = os.path.join(CACHE, 'work', entry['id'])
    raw = os.path.join(CACHE, 'raw', entry['id'] + '.glb')
    out = os.path.join(OUT, entry['dest'], entry['id'] + '.glb')
    job = dict(
        src=gltf, work=work, out=raw,
        stats=os.path.join(CACHE, 'stats', entry['id'] + '.json'), name=entry['id'], tex=entry['tex'],
        tint=entry['tint'], lods=entry['lods'], split=entry['split'], foliage=entry['foliage'], hard=entry['hard'],
        keep=entry['keep'], maxparts=entry['maxparts'], quality=entry['quality'], only=entry['only'],
    )
    for p in (job['stats'], raw, out):
        os.makedirs(os.path.dirname(p), exist_ok=True)
    jp = os.path.join(CACHE, 'jobs', entry['id'] + '.json')
    os.makedirs(os.path.dirname(jp), exist_ok=True)
    json.dump(job, open(jp, 'w'), indent=1)
    t = time.time()
    r = subprocess.run(['flock', '/tmp/capy-blender.lock', sys.executable, '-I', CONVERT, jp], capture_output=True, text=True)
    lines = [l for l in (r.stdout + r.stderr).splitlines() if l.startswith(('OK', 'Traceback', '  File')) or 'Error' in l]
    for l in lines[-12:]:
        log('  ' + l)
    if r.returncode != 0:
        raise RuntimeError('conversion échouée : ' + entry['id'])
    pack(raw, out, compress)
    st = json.load(open(job['stats']))
    st['rawBytes'] = st['bytes']
    st['bytes'] = os.path.getsize(out)
    st['meshopt'] = compress
    json.dump(st, open(job['stats'], 'w'), indent=1)
    log(f'  converti en {time.time() - t:.0f} s')
    return st


def write_manifest(assets_info):
    """Manifeste : une entrée par modèle (pièce), avec fichier, nœuds par LOD, triangles, dimensions, licence et source."""
    old = {}
    if os.path.exists(MANIFEST):
        old = json.load(open(MANIFEST)).get('models', {})
    models = {}
    files = {}
    for e in CATALOG:
        sp = os.path.join(CACHE, 'stats', e['id'] + '.json')
        rel = f"{e['dest']}/{e['id']}.glb"
        glb = os.path.join(OUT, rel)
        if not os.path.exists(glb):
            continue
        if not os.path.exists(sp):
            # stats absentes (cache vidé) : on garde les entrées existantes du manifeste
            for k, v in old.items():
                if v.get('file') == rel:
                    models[k] = v
            if any(v.get('file') == rel for v in old.values()):
                files[rel] = {'bytes': os.path.getsize(glb), 'source': e['src']}
            continue
        st = json.load(open(sp))
        info = assets_info.get(e['src'], {})
        authors = sorted((info.get('authors') or {}).keys())
        files[rel] = {'bytes': os.path.getsize(glb), 'source': e['src'], 'meshopt': st.get('meshopt', False),
                      'materials': st.get('materials', 0), 'sourceTriangles': st.get('sourceTriangles', 0)}
        for p in st['parts']:
            models[p['name']] = {
                'file': rel,
                'source': e['src'],
                'url': 'https://polyhaven.com/a/' + e['src'],
                'license': 'CC0',
                'authors': authors,
                'category': e['cat'],
                'usage': e['usage'],
                'lods': [{'file': rel, 'node': l['node'], 'triangles': l['triangles']} for l in p['lods']],
                'lodDistances': e['dist'][: len(p['lods'])] if len(e['dist']) >= len(p['lods']) else e['dist'],
                'dimensions': p['dimensions'],
                'radius': p['radius'],
                'castShadow': e['shadow'],
                'sink': e['sink'],
                'alpha': bool(st.get('alpha')),
                'texture': e['tex'],
                'tint': e['tint'],
            }
    total = sum(f['bytes'] for f in files.values())
    man = {
        'version': 1,
        'generator': 'tools/polyhaven/fetch.py',
        'source': 'Poly Haven (https://polyhaven.com), modèles photoscannés sous licence CC0 (domaine public)',
        'license': 'CC0',
        'units': 'mètres, Y vers le haut, origine au centre du bas de la boîte englobante',
        'lodNote': 'toutes les LOD d’un modèle sont dans le même .glb (nœuds <id>_lod0, _lod1, _lod2) pour partager les textures ; '
                   'lodDistances : bascule LOD0->LOD1, LOD1->LOD2, la dernière distance masque l’objet',
        'totalBytes': total,
        'files': dict(sorted(files.items())),
        'models': dict(sorted(models.items())),
    }
    os.makedirs(OUT, exist_ok=True)
    with open(MANIFEST, 'w') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    log(f'manifeste : {len(models)} modèles, {len(files)} fichiers, {total / 1048576:.1f} Mo (budget {BUDGET / 1048576:.0f} Mo)')
    if total > BUDGET:
        log('ATTENTION : budget Poly Haven dépassé !')


def check(assets):
    ok = True
    for e in CATALOG:
        if e['src'] in assets:
            continue
        ok = False
        words = e['src'].split('_')
        alt = [k for k in assets if words[0] in k][:6]
        log(f"ABSENT {e['src']} ; remplaçants possibles : {', '.join(alt) or 'aucun'}")
    log('tous les ids existent' if ok else 'ids manquants (voir ci-dessus)')
    return ok


def main():
    args = sys.argv[1:]
    flags = {a for a in args if a.startswith('--')}
    ids = [a for a in args if not a.startswith('--')]
    assets = api('/assets?type=models')
    if '--check' in flags:
        sys.exit(0 if check(assets) else 1)
    if '--manifest' in flags:
        write_manifest(assets)
        return
    todo = [e for e in CATALOG if (e['id'] in ids or e['src'] in ids) or (not ids and (not e['heavy'] or '--heavy' in flags))]
    unknown = [i for i in ids if not any(i in (e['id'], e['src']) for e in CATALOG)]
    if unknown:
        log('ids hors catalogue (ajoute-les à CATALOG) :', ', '.join(unknown))
    failed = []
    for i, e in enumerate(todo):
        out = os.path.join(OUT, e['dest'], e['id'] + '.glb')
        log(f"[{i + 1}/{len(todo)}] {e['id']} ({e['src']}, {assets.get(e['src'], {}).get('polycount', '?')} triangles à la source)")
        if e['src'] not in assets:
            log('  absent de Poly Haven, ignoré')
            failed.append(e['id'])
            continue
        if os.path.exists(out) and '--force' not in flags and os.path.exists(os.path.join(CACHE, 'stats', e['id'] + '.json')):
            log('  déjà converti (--force pour refaire)')
            continue
        try:
            gltf = download(e['src'], redownload='--redownload' in flags)
            st = convert(e, gltf, compress='--no-compress' not in flags)
            log(f"  {st['bytes'] / 1024:.0f} Ko, pièces : {len(st['parts'])}")
        except Exception as ex:  # on continue avec les autres modèles
            log('  ÉCHEC :', ex)
            failed.append(e['id'])
    write_manifest(assets)
    if failed:
        log('échecs :', ', '.join(failed))
        sys.exit(1)


if __name__ == '__main__':
    main()
