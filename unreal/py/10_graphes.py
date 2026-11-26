# U1 étape 10 : graphes du capybara provisoire et du HUD (après 09_personnage.py et une sauvegarde : voir l'en-tête de 09).
# - ZQSD/WASD + souris, Maj pour courir (11 m/s : l'île fait 8 km), Espace pour sauter.
# - Menu « Aller à » : touches 1 à 8 → téléportation vers les 8 destinations ; chaque point d'arrivée est posé sur le sol par un lancer
#   de rayon fait ici, dans l'éditeur (+1 m) ; le nom de la région s'affiche 4 s à l'écran (PrintString : à remplacer par le HUD
#   avant l'empaquetage Shipping), Tab affiche la liste (BP_HUDMonde).
# - Filet de sécurité : sous -60 m (sous le fond de la mer), « CHUTE » dans le journal et retour à Capyville.
# - Ligne de commande (jeu autonome) : -aller=<id>, -vue=<Vue_xxx>, -marche, -duree=<s> (profil CSV, capture, fermeture).
import json
R = 'C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Sources/'
REG = json.load(open(R + 'relief/regions.json', encoding='utf-8'))
D = '/Game/Monde/Personnage/'
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
world = unreal.EditorLevelLibrary.get_editor_world()
cams = {a.get_actor_label(): a for a in EAS.get_all_level_actors() if a.get_actor_label().startswith('Vue_')}
dest = []
for d in REG:
    x, y = float(d['ue'][0]), float(d['ue'][1])
    h = unreal.SystemLibrary.line_trace_single(world, unreal.Vector(x, y, 150000), unreal.Vector(x, y, -10000), unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, True, [], unreal.DrawDebugTrace.NONE, True)
    t = h.to_tuple()
    if not t[0]:
        raise RuntimeError('pas de sol sous ' + d['id'] + ' : lancer charger_tout.py')
    z = t[4].z + 100.0
    c = cams.get('Vue_' + d['id'])
    yaw = c.get_actor_rotation().yaw if c else 0.0
    dest.append((d['id'], d['nom'], (x, y, z), yaw))
def vec(v):
    return '(%.1f %.1f %.1f)' % v
def rot(yaw):
    return '(struct :`Yaw` %.1f)' % yaw
def tp(i):
    _, nom, p, yw = dest[i]
    return ('(`self.K2_TeleportTo` %s %s) (`Controller.SetControlRotation` (`GameplayStatics.GetPlayerController` 0) %s) '
            '(`KismetSystemLibrary.PrintString` "%s" true false (struct :`R` 1.0 :`G` 0.85 :`B` 0.55 :`A` 1.0) 4.0)') % (vec(p), rot(yw), rot(yw), nom.replace('"', ''))
touches = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']
ev_touches = ''.join('\n(event `Key|%s` (:`Pressed` %s))' % (k, tp(i)) for i, k in enumerate(touches))
br = '(if (== aller "%s") %s' % (dest[0][0], tp(0))
for i, d in enumerate(dest[1:], 1):
    br += '\n      (elif (== aller "%s") %s' % (d[0], tp(i))
br += ')' * len(dest)
DSL = r'''
%s
(event `self.ReceiveBeginPlay`
  (bind pc (`GameplayStatics.GetPlayerController` 0))
  (bind cl (`KismetSystemLibrary.GetCommandLine`))
  %s
  (bind (aller oka) (`KismetSystemLibrary.ParseParamValue` cl "aller="))
  (if oka
    %s)
  (bind (vue okv) (`KismetSystemLibrary.ParseParamValue` cl "vue="))
  (if okv
    (bind cams (`GameplayStatics.GetAllActorsWithTag` (`KismetStringLibrary.Conv_StringToName` vue)))
    (for c cams (`PlayerController.SetViewTargetWithBlend` :`self` pc :`NewViewTarget` c :`BlendTime` 0.0)))
  (bind (duree okd) (`KismetSystemLibrary.ParseParamValue` cl "duree="))
  (if okd
    (`KismetSystemLibrary.Delay` 8.0)
    (`KismetSystemLibrary.ExecuteConsoleCommand` "CsvProfile Start" pc)
    (`KismetSystemLibrary.Delay` (`KismetStringLibrary.Conv_StringToDouble` duree))
    (`KismetSystemLibrary.ExecuteConsoleCommand` "CsvProfile Stop" pc)
    (`KismetSystemLibrary.ExecuteConsoleCommand` "HighResShot 1" pc)
    (`KismetSystemLibrary.Delay` 5.0)
    (`KismetSystemLibrary.QuitGame` :`SpecificPlayer` pc :`QuitPreference` "Quit" :`bIgnorePlatformRestrictions` false)))
(event `self.ReceiveTick` (params (DeltaSeconds))
  (bind pc (`GameplayStatics.GetPlayerController` 0))
  (bind auto (`KismetSystemLibrary.ParseParam` (`KismetSystemLibrary.GetCommandLine`) "marche"))
  (bind av (- (+ (select `bool` (`PlayerController.IsInputKeyDown` pc (struct :`KeyName` "W")) :true 1.0 :false 0.0)
                 (select `bool` (`PlayerController.IsInputKeyDown` pc (struct :`KeyName` "Z")) :true 1.0 :false 0.0)
                 (select `bool` auto :true 1.0 :false 0.0))
              (select `bool` (`PlayerController.IsInputKeyDown` pc (struct :`KeyName` "S")) :true 1.0 :false 0.0)))
  (bind dr (- (select `bool` (`PlayerController.IsInputKeyDown` pc (struct :`KeyName` "D")) :true 1.0 :false 0.0)
              (+ (select `bool` (`PlayerController.IsInputKeyDown` pc (struct :`KeyName` "A")) :true 1.0 :false 0.0)
                 (select `bool` (`PlayerController.IsInputKeyDown` pc (struct :`KeyName` "Q")) :true 1.0 :false 0.0))))
  (bind rot (`Controller.GetControlRotation` pc))
  (bind lacet (`KismetMathLibrary.MakeRotator` 0.0 0.0 (.yaw rot)))
  (`Pawn.AddMovementInput` self (`KismetMathLibrary.GetForwardVector` lacet) av false)
  (`Pawn.AddMovementInput` self (`KismetMathLibrary.GetRightVector` lacet) dr false)
  (bind (mx my) (`PlayerController.GetInputMouseDelta` pc))
  (`Pawn.AddControllerYawInput` self mx)
  (`Pawn.AddControllerPitchInput` self (- my))
  (set `CharacterMovementComponent.MaxWalkSpeed` :`self` (`self.CharacterMovement`) :`MaxWalkSpeed`
    (select `bool` (`PlayerController.IsInputKeyDown` pc (struct :`KeyName` "LeftShift")) :true 1100.0 :false 260.0))
  (if (`PlayerController.WasInputKeyJustPressed` pc (struct :`KeyName` "SpaceBar")) (`Character.Jump` self))
  (if (< (.z (`Actor.K2_GetActorLocation` self)) -6000.0)
    (`KismetSystemLibrary.PrintString` "CHUTE sous le sol : retour a Capyville" false true)
    %s))
''' % (ev_touches, tp(0), br, tp(0))
res = {}
APERCU = bool(globals().get('ARGS')) and ARGS[0] == 'apercu'  # relecture du DSL sans écrire (une écriture refusée fait planter l'éditeur)
if APERCU:
    open('C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Saved/dsl_capy.txt', 'w', encoding='utf-8').write(DSL)
try:
    if APERCU:
        raise RuntimeError('apercu')
    res['capy'] = str(await call_tool('BlueprintToolsets.BlueprintDslToolset.Write', assetPath=D + 'BP_CapyProvisoire', dsl=DSL))[:700]
except Exception as e:
    res['capy'] = 'ERREUR : ' + str(e)[:1500]
lignes = ''.join('\n      (`self.DrawText` :`Text` "%d   %s" :`TextColor` (struct :`R` 1.0 :`G` 0.93 :`B` 0.8 :`A` 1.0) :`ScreenX` 70.0 :`ScreenY` %.1f :`Scale` 1.5)'
                 % (i + 1, d[1].replace('"', ''), 120 + 34 * i) for i, d in enumerate(dest))
DSL_HUD = r'''
(event `self.ReceiveDrawHUD` (params (SizeX) (SizeY))
  (bind pc (`self.GetOwningPlayerController`))
  (if (`PlayerController.IsInputKeyDown` pc (struct :`KeyName` "Tab"))
    (`self.DrawRect` :`RectColor` (struct :`R` 0.02 :`G` 0.03 :`B` 0.04 :`A` 0.75) :`ScreenX` 40.0 :`ScreenY` 50.0 :`ScreenW` 560.0 :`ScreenH` 380.0)
    (`self.DrawText` :`Text` "Aller a... (touches 1 a 8)" :`TextColor` (struct :`R` 1.0 :`G` 0.8 :`B` 0.45 :`A` 1.0) :`ScreenX` 70.0 :`ScreenY` 70.0 :`Scale` 1.7)%s
    (else
      (`self.DrawText` :`Text` "Tab : Aller a    1-8 : regions    Maj : courir    (capybara provisoire)" :`TextColor` (struct :`R` 1.0 :`G` 1.0 :`B` 1.0 :`A` 0.7) :`ScreenX` 30.0 :`ScreenY` 24.0 :`Scale` 1.1))))
''' % lignes
if APERCU:
    open('C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Saved/dsl_hud.txt', 'w', encoding='utf-8').write(DSL_HUD)
try:
    if APERCU:
        raise RuntimeError('apercu')
    res['hud'] = str(await call_tool('BlueprintToolsets.BlueprintDslToolset.Write', assetPath=D + 'BP_HUDMonde', dsl=DSL_HUD))[:700]
except Exception as e:
    res['hud'] = 'ERREUR : ' + str(e)[:1500]
for p in (() if APERCU else ('BP_CapyProvisoire', 'BP_HUDMonde')):
    b = unreal.load_asset(D + p)
    unreal.BlueprintEditorLibrary.compile_blueprint(b)
    unreal.EditorAssetLibrary.save_loaded_asset(b)
res['arrivees'] = {d[0]: [round(v / 100, 1) for v in d[2]] for d in dest}
res
