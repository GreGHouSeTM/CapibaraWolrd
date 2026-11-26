# U1 étape 7 : lumière du monde, jour et nuit dans la même carte.
# ARGS = ['jour'] ou ['nuit'] : ambiance montrée dans l'éditeur (+ réglages clé=valeur de cette ambiance pour les essais, ex. 'ev=1.5').
# Les deux étalonnages sont deux volumes de post-traitement (Etalonnage_Jour, Etalonnage_Nuit) ; la lumière, la brume et l'étalonnage
# de chaque ambiance sont écrits dans Sources/ambiances.json, que 09_personnage.py reprend pour la bascule en jeu (touche N, option -nuit).
# Références (docs/u1/REFERENCES.md) :
#  - jour : ciel clair d'été, soleil de milieu de journée chaud, lointains bleutés par l'atmosphère, ombres franches ;
#  - nuit : nuit « lisible » : lune froide et haute qui diffuse un ciel bleu nuit plus clair que le sol à l'horizon, sol dans les gris
#    très bas mais jamais noir, neige gris-bleu moyen, aucune lumière locale.
# Exposition FIXE (min = max) : pas de pompage d'une région à l'autre.
# Performance : pas de brouillard volumétrique (piste des pointes de la preuve) ; brume de hauteur simple pour les lointains.
import json
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
mode = ARGS[0] if ARGS else 'jour'
P = dict(a.split('=') for a in ARGS[1:]) if len(ARGS) > 1 else {}
AMB = {
    'jour': {'haut': -42.0, 'cap': 135.0, 'lumiere': 10.0, 'couleur': [255, 243, 228], 'angle': 0.55,
             'brume': 0.002, 'chute': 0.02, 'brume_couleur': [0.38, 0.47, 0.62], 'brume_dir': [0.4, 0.34, 0.26],
             'ev': 1.5, 'sat': 0.92, 'gain_ombres': [0.96, 0.99, 1.04], 'gamma_ombres': 1.0, 'contraste_ombres': 0.85, 'bas_ciel': [0.04, 0.045, 0.04]},
    'nuit': {'haut': -38.0, 'cap': 230.0, 'lumiere': 0.6, 'couleur': [150, 178, 255], 'angle': 0.6,
             'brume': 0.0025, 'chute': 0.02, 'brume_couleur': [0.012, 0.018, 0.034], 'brume_dir': [0.01, 0.012, 0.02],
             'ev': -1.0, 'sat': 0.75, 'gain_ombres': [0.86, 0.95, 1.18], 'gamma_ombres': 1.12, 'contraste_ombres': 0.7, 'bas_ciel': [0.01, 0.014, 0.024]},
}
A = AMB[mode]
for k, v in P.items():
    A[k] = [float(x) for x in v.split(',')] if ',' in v else float(v)
def trouve(label):
    for a in EAS.get_all_level_actors():
        if a.get_actor_label() == label:
            return a
    return None
def lin(c):
    return unreal.LinearColor(c[0], c[1], c[2], 1)
sun = trouve('Soleil')
sun.set_editor_property('tags', ['Soleil'])
lc = sun.get_component_by_class(unreal.DirectionalLightComponent)
sun.set_actor_rotation(unreal.Rotator(0, A['haut'], A['cap']), False)
lc.set_editor_property('intensity', A['lumiere'])
lc.set_editor_property('light_color', unreal.Color(r=int(A['couleur'][0]), g=int(A['couleur'][1]), b=int(A['couleur'][2]), a=255))
lc.set_editor_property('light_source_angle', A['angle'])
lc.set_editor_property('cast_shadows', True)
lc.set_editor_property('enable_light_shaft_bloom', False)
lc.set_editor_property('dynamic_shadow_distance_movable_light', 20000.0)
ciel = trouve('Ciel')
ciel.set_editor_property('tags', ['Ciel'])
sky = ciel.get_component_by_class(unreal.SkyLightComponent)
sky.set_editor_property('intensity', 1.0)
sky.set_editor_property('lower_hemisphere_is_black', False)
sky.set_editor_property('lower_hemisphere_color', lin(A['bas_ciel']))
at = trouve('Atmosphere').get_component_by_class(unreal.SkyAtmosphereComponent)
at.set_editor_property('aerial_pespective_view_distance_scale', 1.6)
brume = trouve('Brume')
brume.set_editor_property('tags', ['Brume'])
fc = brume.get_component_by_class(unreal.ExponentialHeightFogComponent)
fc.set_editor_property('enable_volumetric_fog', False)
fc.set_editor_property('fog_density', A['brume'])
fc.set_editor_property('fog_height_falloff', A['chute'])
fc.set_editor_property('start_distance', 1500.0)
fc.set_editor_property('fog_max_opacity', 0.85)
fc.set_editor_property('fog_inscattering_luminance', lin(A['brume_couleur']))
fc.set_editor_property('directional_inscattering_luminance', lin(A['brume_dir']))
# ---- deux étalonnages (volumes de post-traitement sans limites) ; l'ancien « Etalonnage » devient Etalonnage_Jour
vieux = trouve('Etalonnage')
if vieux:
    vieux.set_actor_label('Etalonnage_Jour')
ERR = []
for nom in ('jour', 'nuit'):
    lab = 'Etalonnage_' + nom.capitalize()
    pp = trouve(lab)
    if pp is None:
        pp = EAS.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0))
        pp.set_actor_label(lab)
        pp.set_folder_path('Monde/Lumiere')
    pp.set_editor_property('is_spatially_loaded', False)
    pp.set_editor_property('tags', [lab])
    pp.set_editor_property('unbound', True)
    pp.set_editor_property('priority', 1.0 if nom == 'nuit' else 0.0)
    pp.set_editor_property('enabled', nom == mode)
    B = A if nom == mode else AMB[nom]
    s = pp.get_editor_property('settings')
    def ov(n, val):
        try:
            s.set_editor_property('override_' + n, True)
            s.set_editor_property(n, val)
        except Exception:
            ERR.append(n)
    ov('auto_exposure_method', unreal.AutoExposureMethod.AEM_HISTOGRAM)
    ov('auto_exposure_min_brightness', B['ev'])
    ov('auto_exposure_max_brightness', B['ev'])
    ov('auto_exposure_bias', 0.0)
    ov('color_saturation', unreal.Vector4(B['sat'], B['sat'], B['sat'], 1))
    ov('color_contrast', unreal.Vector4(1.05, 1.05, 1.05, 1))
    g = B['gain_ombres']
    ov('color_gain_shadows', unreal.Vector4(g[0], g[1], g[2], 1))
    ov('color_gamma_shadows', unreal.Vector4(1.0, 1.0, 1.0, B['gamma_ombres']))
    ov('vignette_intensity', 0.25)
    ov('bloom_intensity', 0.25)
    ov('film_grain_intensity', 0.0)
    ov('local_exposure_shadow_contrast_scale', B['contraste_ombres'])
    ov('local_exposure_highlight_contrast_scale', 0.8)
    ov('lumen_final_gather_quality', 1.0)
    ov('lumen_scene_detail', 1.0)
    ov('lumen_max_trace_distance', 20000.0)
    pp.set_editor_property('settings', s)
AMB[mode] = A
json.dump(AMB, open('C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Sources/ambiances.json', 'w'), indent=1)
mode + ' appliqué ; ignorés : ' + ','.join(sorted(set(ERR)))
