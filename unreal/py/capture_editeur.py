# ARGS = [etiquette_camera, largeur, hauteur, fichier_png, delai_s] : capture depuis une caméra de la carte, dans l éditeur (vérifications intermédiaires).
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
cam = [a for a in EAS.get_all_level_actors() if a.get_actor_label() == ARGS[0]][0]
t = unreal.AutomationLibrary.take_high_res_screenshot(int(ARGS[1]), int(ARGS[2]), ARGS[3], cam, False, False, unreal.ComparisonTolerance.LOW, '', float(ARGS[4]) if len(ARGS) > 4 else 2.0, True)
'capture demandee : ' + ARGS[3]
