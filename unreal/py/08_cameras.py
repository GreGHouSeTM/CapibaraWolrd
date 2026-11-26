# U1 étape 8 : caméras des vues (étiquette et tag Vue_*), pour les captures et les mesures en jeu autonome (-vue=Vue_xxx).
# - Vue_Ile : vue aérienne de toute l'île ;
# - Vue_<région> (8) : au point d'arrivée du menu, à hauteur de regard (1,6 m), tournée vers une vue dégagée (> 600 m) sur le relief le plus haut ;
# - Vue_Mesure_<région> : même chose, utilisée par la campagne de mesures (mêmes cadrages de jour et de nuit).
import json, math
R = 'C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Sources/relief/'
REG = json.load(open(R + 'regions.json', encoding='utf-8'))
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
world = unreal.EditorLevelLibrary.get_editor_world()
def trouve(label):
    for a in EAS.get_all_level_actors():
        if a.get_actor_label() == label:
            return a
    return None
def sol(x, y):
    h = unreal.SystemLibrary.line_trace_single(world, unreal.Vector(x, y, 150000), unreal.Vector(x, y, -10000), unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, True, [], unreal.DrawDebugTrace.NONE, True)
    t = h.to_tuple() if h else None
    return t[4].z if t and t[0] else 0.0
def camera(label, loc, rot, fov=80.0):
    a = trouve(label)
    if a is None:
        a = EAS.spawn_actor_from_class(unreal.CameraActor, loc, rot)
        a.set_actor_label(label)
    a.set_actor_location(loc, False, False)
    a.set_actor_rotation(rot, False)
    a.set_folder_path('Monde/Vues')
    a.set_editor_property('tags', [label])
    a.set_editor_property('is_spatially_loaded', False)
    cc = a.get_component_by_class(unreal.CameraComponent)
    cc.set_editor_property('field_of_view', fov)
    cc.set_editor_property('aspect_ratio', 16.0 / 9.0)
    cc.set_editor_property('constrain_aspect_ratio', False)
    return a
camera('Vue_Ile', unreal.Vector(-60000, 520000, 420000), unreal.Rotator(0, -38, -90), 70.0)
def trace(a, b):
    h = unreal.SystemLibrary.line_trace_single(world, a, b, unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, True, [], unreal.DrawDebugTrace.NONE, True)
    t = h.to_tuple() if h else None
    return t[4] if t and t[0] else None
out = {}
for d in REG:
    x, y = d['ue'][0], d['ue'][1]
    oz = sol(x, y) + 160
    # direction : vue dégagée (premier obstacle à plus de 600 m, regard horizontal) vers le relief le plus haut
    best = (-1e9, 0.0)
    for k in range(36):
        a = k * math.pi / 18
        dx, dy = math.cos(a), math.sin(a)
        p = trace(unreal.Vector(x, y, oz), unreal.Vector(x + dx * 500000, y + dy * 500000, oz + 500000 * math.tan(math.radians(3))))
        libre = 500000 if p is None else math.hypot(p.x - x, p.y - y)
        if libre < 60000:
            continue
        haut = max(sol(x + dx * r, y + dy * r) for r in (100000, 160000, 230000, 300000))
        sc = haut + min(libre, 300000) * 0.05
        if sc > best[0]:
            best = (sc, a)
    a = best[1]
    yaw = math.degrees(a)
    camera('Vue_' + d['id'], unreal.Vector(x, y, oz), unreal.Rotator(0, 1.0, yaw))
    out[d['id']] = [round(x / 100), round(y / 100), round(oz / 100), round(yaw), round(best[0] / 100)]
out
