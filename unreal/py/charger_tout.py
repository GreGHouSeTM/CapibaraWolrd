# Charge dans l'éditeur tous les acteurs de la carte World Partition (parcelles du Landscape comprises).
# À lancer après chaque ouverture de l'éditeur, avant les scripts qui lisent ou modifient le relief (03, 06, 08…).
WPL = unreal.WorldPartitionBlueprintLibrary
descs = WPL.get_actor_descs()
WPL.load_actors([d.guid for d in descs])
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
acts = EAS.get_all_level_actors()
{'descripteurs': len(descs), 'acteurs_charges': len(acts), 'parcelles': len([a for a in acts if isinstance(a, unreal.LandscapeStreamingProxy)])}
