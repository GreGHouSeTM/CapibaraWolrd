# U1 étape 9 : capybara provisoire (repris de la preuve, recréé par script) et mode de jeu. Les graphes sont écrits par 10_graphes.py,
# dans un appel séparé, APRÈS la sauvegarde de ces assets : une écriture de graphe refusée est annulée (undo), et si l'asset vient d'être
# créé dans la même transaction, l'éditeur plante (assertion « Outer != nullptr », vue le 2026-11-26 à 00:05).
# PROVISOIRE, clairement signalé : corps en formes simples (le capybara final sera modélisé par le studio).
# BP_CapyProvisoire (Character) : capsule basse (r 30 cm, demi-hauteur 32 cm), caméra à hauteur de capybara (bras de 2,3 m, ~0,85 m).
# Variables : RegionNom (texte affiché par le HUD), RegionTemps (heure de la dernière téléportation).
# Idempotent : les Blueprints existants sont réutilisés (ne jamais les supprimer puis recréer dans la même session : plantage).
import json, sys, importlib
sys.path.append('C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Content/Python')
import capy_mat
importlib.reload(capy_mat)
R = 'C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Sources/'
REG = json.load(open(R + 'relief/regions.json', encoding='utf-8'))
AMB = json.load(open(R + 'ambiances.json', encoding='utf-8'))
AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
D = '/Game/Monde/Personnage/'
def bp_neuf(chemin, parent):
    if EAL.does_asset_exist(chemin):
        return unreal.load_asset(chemin), False
    d, n = chemin.rsplit('/', 1)
    f = unreal.BlueprintFactory()
    f.set_editor_property('parent_class', parent)
    return AT.create_asset(n, d, unreal.Blueprint, f), True
bp, neuf = bp_neuf(D + 'BP_CapyProvisoire', unreal.Character)
sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
SL = unreal.SubobjectDataBlueprintFunctionLibrary
def obj(h):
    return SL.get_object(SL.get_data(h))
if neuf:
    handles = sds.k2_gather_subobject_data_for_blueprint(bp)
    noms = {str(obj(h).get_name()): h for h in handles}
    def ajoute(parent_h, cls, nom):
        p = unreal.AddNewSubobjectParams(parent_handle=parent_h, new_class=cls, blueprint_context=bp)
        h, err = sds.add_new_subobject(p)
        sds.rename_subobject(h, nom)
        return h, obj(h)
    cap_h = [h for n, h in noms.items() if 'Capsule' in n or 'Collision' in n][0]
    SPH = unreal.load_asset('/Engine/BasicShapes/Sphere')
    parts = [('Corps', (0, 0, -6), (1.1, 0.52, 0.48)), ('Tete', (52, 0, 8), (0.42, 0.3, 0.32)), ('Museau', (70, 0, 2), (0.22, 0.2, 0.2)),
             ('OreilleG', (46, -11, 26), (0.07, 0.07, 0.09)), ('OreilleD', (46, 11, 26), (0.07, 0.07, 0.09))]
    for nom, loc, sc in parts:
        h, c = ajoute(cap_h, unreal.StaticMeshComponent, nom)
        c.set_editor_property('static_mesh', SPH)
        c.set_editor_property('relative_location', unreal.Vector(*loc))
        c.set_editor_property('relative_scale3d', unreal.Vector(*sc))
        c.set_collision_profile_name('NoCollision')
    bras_h, bras = ajoute(cap_h, unreal.SpringArmComponent, 'BrasCamera')
    bras.set_editor_property('target_arm_length', 230.0)
    bras.set_editor_property('relative_location', unreal.Vector(0, 0, 25))
    bras.set_editor_property('socket_offset', unreal.Vector(0, 0, 30))
    bras.set_editor_property('use_pawn_control_rotation', True)
    bras.set_editor_property('enable_camera_lag', True)
    bras.set_editor_property('camera_lag_speed', 12.0)
    cam_h, cam = ajoute(bras_h, unreal.CameraComponent, 'Camera')
    cam.set_editor_property('field_of_view', 80.0)
    unreal.BlueprintEditorLibrary.compile_blueprint(bp)
# couleur brune provisoire
CODE = r'''
float n = L.fbm(WP.xy * 0.08 + WP.z * 0.05);
rugosite = 0.85;
return lerp(float3(0.16, 0.09, 0.05), float3(0.28, 0.17, 0.09), n);
'''
mc = capy_mat.construire(D + 'M_CapyProvisoire', CODE, [('WP', 'wp', None)], ['couleur', 'rugosite'])
for h in sds.k2_gather_subobject_data_for_blueprint(bp):
    o = obj(h)
    if isinstance(o, unreal.StaticMeshComponent):
        o.set_material(0, mc)
cdo = unreal.get_default_object(bp.generated_class())
cdo.set_editor_property('use_controller_rotation_yaw', False)
cdo.get_editor_property('capsule_component').set_capsule_size(30.0, 32.0)
cm = cdo.get_editor_property('character_movement')
cm.set_editor_property('orient_rotation_to_movement', True)
cm.set_editor_property('rotation_rate', unreal.Rotator(0, 360, 0))
cm.set_editor_property('max_walk_speed', 260.0)
cm.set_editor_property('max_step_height', 30.0)
cm.set_editor_property('walkable_floor_angle', 50.0)
cm.set_editor_property('jump_z_velocity', 380.0)

hud, _ = bp_neuf(D + 'BP_HUDMonde', unreal.HUD)
# ---------------------------------------------------------------- mode de jeu
gm, _ = bp_neuf(D + 'GM_Monde', unreal.GameModeBase)
unreal.BlueprintEditorLibrary.compile_blueprint(gm)
g = unreal.get_default_object(gm.generated_class())
g.set_editor_property('default_pawn_class', bp.generated_class())
g.set_editor_property('hud_class', hud.generated_class())
unreal.BlueprintEditorLibrary.compile_blueprint(gm)
ws = unreal.EditorLevelLibrary.get_editor_world().get_world_settings()
ws.set_editor_property('default_game_mode', gm.generated_class())
B = unreal.BlueprintEditorLibrary
noms = [str(n) for n in B.list_member_variable_names(bp)] if hasattr(B, 'list_member_variable_names') else []
if 'RegionNom' not in noms:
    B.add_member_variable(bp, 'RegionNom', B.get_basic_type_by_name('string'))
if 'RegionTemps' not in noms:
    B.add_member_variable(bp, 'RegionTemps', B.get_basic_type_by_name('real'))
B.compile_blueprint(bp)
for b in (bp, hud, gm):
    EAL.save_loaded_asset(b)
{'variables': [str(n) for n in B.list_member_variable_names(bp)]}
