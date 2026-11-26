# U1 étape 2 : Landscape de l'île entière depuis Sources/relief/hauteur.r16 (export_relief.mjs).
# 4065 × 4065 sommets au pas de 2 m (16 × 16 composants de 2 × 2 sections de 127 quads), centré sur Capyville.
# Scale.Z = 204,8 et centre Z = 46 428,8 cm : la valeur stockée v donne h = v × 0,016 − 60 m (codage des tuiles du jeu).
import json
R = 'C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Sources/relief/'
info = json.load(open(R + 'relief_info.json', encoding='utf-8'))
LES = unreal.get_editor_subsystem(unreal.LandscapeEditorSubsystem)
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
deja = [a for a in EAS.get_all_level_actors() if isinstance(a, unreal.Landscape)]
if deja:
    ls = deja[0]
else:
    c = info['centre_cm']; s = info['echelle_cm']
    ls = LES.create_landscape(unreal.Vector(c[0], c[1], c[2]), unreal.Rotator(0, 0, 0), unreal.Vector(s[0], s[1], s[2]),
                              unreal.IntPoint(info['composants'], info['composants']), info['sections'], info['quads_par_section'], None, info['grille_wp'])
    ls.set_actor_label('Relief_Ile')
LES.import_heightmap_from_file(ls, 'Layer', R + 'hauteur.r16', False, False)
{'landscape': ls.get_name(), 'loc': str(ls.get_actor_location()), 'echelle': str(ls.get_actor_scale3d()),
 'proxys': len([a for a in EAS.get_all_level_actors() if isinstance(a, unreal.LandscapeStreamingProxy)])}
