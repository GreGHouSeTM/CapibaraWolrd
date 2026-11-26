# U1 : contrôle des 20 points de hauteur dans l'éditeur (lancer de rayon vertical sur le Landscape) contre heightAt du jeu.
# Écrit docs/u1/points-controle.json et docs/u1/points-controle.md.
import json
R = 'C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Sources/relief/'
DOC = 'C:/Users/greg7/Documents/CLAUDE/CapibaraWolrd/docs/u1/'
pts = json.load(open(R + 'points_controle_export.json', encoding='utf-8'))
world = unreal.EditorLevelLibrary.get_editor_world()
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
ls = [a for a in EAS.get_all_level_actors() if isinstance(a, unreal.LandscapeProxy)]
lignes = ['| Type | Point | x (m) | z (m) | Three.js heightAt (m) | Unreal (m) | Écart (m) |', '| --- | --- | --- | --- | --- | --- | --- |']
mx = 0.0
for p in pts:
    x, y = p['x'] * 100.0, p['z'] * 100.0
    # lancer de rayon sur la collision du Landscape (ce que touche le personnage)
    h = unreal.SystemLibrary.line_trace_single(world, unreal.Vector(x, y, 150000), unreal.Vector(x, y, -10000), unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, True, [], unreal.DrawDebugTrace.NONE, True)
    t = h.to_tuple() if h else None
    hz = t[4].z if t and t[0] else None
    p['h_unreal'] = round(hz / 100.0, 3) if hz is not None else None
    p['ecart'] = round(p['h_unreal'] - p['h_jeu'], 3) if hz is not None else None
    if p['ecart'] is not None:
        mx = max(mx, abs(p['ecart']))
    lignes.append('| %s | %s | %.1f | %.1f | %.2f | %s | %s |' % (p['type'], p['nom'], p['x'], p['z'], p['h_jeu'], '%.2f' % p['h_unreal'] if hz is not None else '—', '%+.3f' % p['ecart'] if hz is not None else '—'))
if any(p['h_unreal'] is None for p in pts):
    raise RuntimeError('relief non chargé : lancer charger_tout.py avant ce contrôle')
json.dump(pts, open(DOC + 'points-controle.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(DOC + 'points-controle.md', 'w', encoding='utf-8').write('# Alpha U1 : 20 points de contrôle du relief (Unreal contre Three.js)\n\nMesure dans l\'éditeur (`unreal/py/03_controle_points.py`), lancer de rayon vertical sur la collision du Landscape contre `heightAt` du jeu (`src/world/heightmap.ts`, exécuté tel quel dans Node).\n\n' + '\n'.join(lignes) + '\n\nÉcart maximal : **%.3f m** (critère : ≤ 0,5 m).\n' % mx)
{'ecart_max_m': mx, 'manquants': [p['nom'] for p in pts if p['h_unreal'] is None], 'exemple': [(p['nom'], p['h_jeu'], p['h_unreal']) for p in pts[:3]]}
