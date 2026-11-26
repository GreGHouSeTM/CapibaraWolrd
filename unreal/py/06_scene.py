# U1 étape 6 : scène du monde (idempotent, acteurs retrouvés par leur étiquette).
# - matériau M_Sol_Ile sur le Landscape ; parcelles du Landscape toujours chargées (tout le relief reste visible jusqu'à l'horizon,
#   en attendant les HLOD : voir ETAT-U1) ;
# - eau : import de Sources/relief/eau.glb (lacs, rivières, glace), mer = plan de 40 km au niveau 0 ;
# - repères des 8 régions : borne de 24 m avec bandeau lumineux et nom ;
# - acteurs de lumière (réglés par 07_lumiere.py), PlayerStart à Capyville.
import json
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
EAL = unreal.EditorAssetLibrary
R = 'C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Sources/relief/'
REG = json.load(open(R + 'regions.json', encoding='utf-8'))
tous = EAS.get_all_level_actors()
def trouve(label):
    for a in EAS.get_all_level_actors():
        if a.get_actor_label() == label:
            return a
    return None
def acteur(cls, label, loc=unreal.Vector(0, 0, 0), rot=unreal.Rotator(0, 0, 0), dossier='Monde', global_=True):
    a = trouve(label)
    if a is None:
        a = EAS.spawn_actor_from_class(cls, loc, rot)
        a.set_actor_label(label)
    a.set_actor_location(loc, False, False)
    a.set_actor_rotation(rot, False)
    a.set_folder_path(dossier)
    if global_:
        try:
            a.set_editor_property('is_spatially_loaded', False)
        except Exception:
            pass
    return a
res = {}
# ---- Landscape
sol = unreal.load_asset('/Game/Monde/Materiaux/MI_Sol_Ile')
n = 0
for a in tous:
    if isinstance(a, unreal.LandscapeProxy):
        a.set_editor_property('landscape_material', sol)
        try:
            a.set_editor_property('is_spatially_loaded', False)
        except Exception:
            pass
        n += 1
res['landscape'] = n
# ---- eau
if not EAL.does_asset_exist('/Game/Monde/Eau/eau/StaticMeshes/eau'):
    t = unreal.AssetImportTask()
    t.filename = R + 'eau.glb'; t.destination_path = '/Game/Monde/Eau'; t.automated = True; t.replace_existing = True; t.save = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([t])
    res['import_eau'] = [str(p) for p in t.imported_object_paths]
sm = None
for p in EAL.list_assets('/Game/Monde/Eau', recursive=True):
    o = unreal.load_asset(p)
    if isinstance(o, unreal.StaticMesh):
        sm = o
M_EAU = unreal.load_asset('/Game/Monde/Materiaux/M_Eau')
M_GLACE = unreal.load_asset('/Game/Monde/Materiaux/M_Glace')
mats = sm.get_editor_property('static_materials')
for i, m in enumerate(mats):
    nom = str(m.get_editor_property('material_slot_name'))
    sm.set_material(i, M_GLACE if 'Glace' in nom else M_EAU)
sm.set_editor_property('body_setup', sm.get_editor_property('body_setup'))
eau = acteur(unreal.StaticMeshActor, 'Eau_Lacs_Rivieres', dossier='Monde/Eau')
c = eau.static_mesh_component
c.set_static_mesh(sm)
c.set_collision_profile_name('NoCollision')
c.set_editor_property('cast_shadow', False)
b = eau.get_actor_bounds(False)
res['eau_bornes_m'] = [round(b[0].x / 100), round(b[0].y / 100), round(b[0].z / 100), round(b[1].x / 100), round(b[1].y / 100)]
mer = acteur(unreal.StaticMeshActor, 'Mer', loc=unreal.Vector(0, 0, 0), dossier='Monde/Eau')
mer.static_mesh_component.set_static_mesh(unreal.load_asset('/Engine/BasicShapes/Plane'))
mer.set_actor_scale3d(unreal.Vector(40000, 40000, 1))  # plan de 1 m → 40 km
mer.static_mesh_component.set_material(0, M_EAU)
mer.static_mesh_component.set_collision_profile_name('NoCollision')
mer.static_mesh_component.set_editor_property('cast_shadow', False)
# ---- repères des régions
CYL = unreal.load_asset('/Engine/BasicShapes/Cylinder')
M_REP = unreal.load_asset('/Game/Monde/Materiaux/M_Repere')
for d in REG:
    x, y, z = d['ue']
    a = acteur(unreal.StaticMeshActor, 'Repere_' + d['id'], loc=unreal.Vector(x + 1500, y, z - 200), dossier='Monde/Reperes')
    a.static_mesh_component.set_static_mesh(CYL)
    a.set_actor_scale3d(unreal.Vector(2.4, 2.4, 26))
    a.static_mesh_component.set_material(0, M_REP)
    t = acteur(unreal.TextRenderActor, 'Nom_' + d['id'], loc=unreal.Vector(x + 1500, y, z + 2700), dossier='Monde/Reperes')
    tc = t.get_component_by_class(unreal.TextRenderComponent)
    tc.set_editor_property('text', d['nom'])
    tc.set_editor_property('world_size', 260.0)
    tc.set_editor_property('horizontal_alignment', unreal.HorizTextAligment.EHTA_CENTER)
    tc.set_editor_property('text_render_color', unreal.Color(r=255, g=236, b=200, a=255))
res['reperes'] = len(REG)
# ---- lumière (valeurs réglées par 07_lumiere.py)
sun = acteur(unreal.DirectionalLight, 'Soleil', rot=unreal.Rotator(0, -40, 130), dossier='Monde/Lumiere')
sun.get_component_by_class(unreal.DirectionalLightComponent).set_editor_property('atmosphere_sun_light', True)
sun.get_component_by_class(unreal.DirectionalLightComponent).set_editor_property('mobility', unreal.ComponentMobility.MOVABLE)
acteur(unreal.SkyAtmosphere, 'Atmosphere', dossier='Monde/Lumiere')
sky = acteur(unreal.SkyLight, 'Ciel', dossier='Monde/Lumiere')
sc = sky.get_component_by_class(unreal.SkyLightComponent)
sc.set_editor_property('mobility', unreal.ComponentMobility.MOVABLE)
sc.set_editor_property('real_time_capture', True)
acteur(unreal.ExponentialHeightFog, 'Brume', dossier='Monde/Lumiere')
acteur(unreal.VolumetricCloud, 'Nuages', dossier='Monde/Lumiere')
acteur(unreal.PostProcessVolume, 'Etalonnage', dossier='Monde/Lumiere').set_editor_property('unbound', True)
# ---- départ à Capyville
hub = REG[0]
acteur(unreal.PlayerStart, 'Depart', loc=unreal.Vector(hub['ue'][0], hub['ue'][1], hub['ue'][2] + 100), dossier='Monde')
res
