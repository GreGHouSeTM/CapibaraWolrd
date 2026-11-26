# Réglage rapide de l'instance MI_Sol_Ile sans recompiler. ARGS = ['Parametre=valeur', ...] (scalaires) ou 'Teinte=r,g,b'.
MEL = unreal.MaterialEditingLibrary
mi = unreal.load_asset('/Game/Monde/Materiaux/MI_Sol_Ile')
for a in ARGS:
    k, v = a.split('=')
    if ',' in v:
        c = [float(x) for x in v.split(',')]
        MEL.set_material_instance_vector_parameter_value(mi, k, unreal.LinearColor(c[0], c[1], c[2], 1.0))
    else:
        MEL.set_material_instance_scalar_parameter_value(mi, k, float(v))
MEL.update_material_instance(mi)
'ok ' + ' '.join(ARGS)
