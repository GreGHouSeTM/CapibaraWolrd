# U1 étape 1 : carte World Partition vide /Game/Monde/Cartes/Monde (le Landscape et le reste viennent ensuite).
les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
EAL = unreal.EditorAssetLibrary
if EAL.does_asset_exist('/Game/Monde/Cartes/Monde'):
    ok = les.load_level('/Game/Monde/Cartes/Monde')
else:
    ok = les.new_level('/Game/Monde/Cartes/Monde', True)
w = unreal.EditorLevelLibrary.get_editor_world()
{'ok': ok, 'monde': w.get_path_name(), 'world_partition': bool(unreal.WorldPartitionBlueprintLibrary.get_editor_world_bounds() is not None)}
