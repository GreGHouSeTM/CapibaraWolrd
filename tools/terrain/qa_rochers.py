"""Contrôle des modèles de rochers exportés (passage obligatoire « blender-asset-qa ») : chaque LOD de chaque .glb est
vérifié seul (normales, pièces flottantes, arêtes non variétés, faces dégénérées, UV), puis une planche multi-angles
des LOD0 (mode « random » : une couleur par pièce, et « wire ») est rendue.

Usage : L:\\CLAUDE\\CapyWorld\\.venv-blender\\Scripts\\python.exe -I tools/terrain/qa_rochers.py
Sorties : test-shots/terrain/rochers-qa.json, rochers-qa-random.png, rochers-qa-wire.png
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SK = os.path.join(os.path.expanduser('~'), '.claude', 'skills', 'blender-asset-qa', 'scripts')
sys.path.insert(0, SK)
import bpy  # noqa: E402

DIR = os.path.join(ROOT, 'public', 'assets', 'terrain', 'rochers')
CACHE = os.path.join(HERE, 'cache', 'rochers')
OUT = os.path.join(ROOT, 'test-shots', 'terrain')


def main():
    import qa_check
    import review_shots
    models = json.load(open(os.path.join(DIR, 'rochers.json'), encoding='utf-8'))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    report = {}
    lod0 = []
    x = 0.0
    for rid in sorted(models):
        # glb brut (avant gltfpack : la quantification met une échelle de déquantification sur les nœuds)
        bpy.ops.import_scene.gltf(filepath=os.path.join(CACHE, rid + '_raw.glb'))
        obs = sorted([o for o in bpy.context.selected_objects if o.type == 'MESH'], key=lambda o: -len(o.data.polygons))
        mat = bpy.data.materials.get('roche') or bpy.data.materials.new('roche')
        for k, o in enumerate(obs):
            o.name = f'{rid}_lod{k}'
            o.data.materials.clear()
            o.data.materials.append(mat)
        res = {}
        for o in obs:
            r = qa_check.run(objects=[o.name], profile='game', eps=0.002, tol=0.01)
            res[o.name] = {'pass': r['pass'], 'errors': r['errors'], 'warnings': r['warnings'],
                           'tris': r['objects'].get(o.name, {}).get('tris')}
        report[rid] = res
        for o in obs:
            if o.name.endswith('_lod0'):
                w = o.dimensions.x
                o.location.x += x + w / 2
                x += w + 1.0
                lod0.append(o.name)
            else:
                o.location.z -= 1000  # hors champ de la planche
    ok = all(v['pass'] for r in report.values() for v in r.values())
    json.dump({'pass': ok, 'models': report}, open(os.path.join(OUT, 'rochers-qa.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    for mode in ('random', 'wire'):
        s = review_shots.run(objects=lod0, out=os.path.join(OUT, f'rochers-qa-{mode}.png'), views=['front', 'three_quarter', 'top'], mode=mode, res=900)
        print('planche', mode, s.get('sheet'))
    print('QA rochers :', 'OK' if ok else 'ÉCHEC')
    for rid, r in report.items():
        for k, v in r.items():
            if not v['pass'] or v['warnings']:
                print(k, 'erreurs', v['errors'][:3], 'avertissements', [str(w)[:90] for w in v['warnings'][:3]])


if __name__ == '__main__':
    main()
