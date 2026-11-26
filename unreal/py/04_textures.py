# U1 étape 4 : import des textures du sol (CC0) et des masques de surfaces (export_relief.mjs).
# Sources : textures CC0 du jeu (public/assets/tex, Poly Haven, 1K) et, pour la roche et le sol sec, les 4K CC0 de la preuve
# (CapyForet-UE\Sources\textures : Poly Haven rock_face_03, ambientCG Ground037), ramenées à 2K (le 4K ne se voit pas à la distance de jeu).
import os
DEPOT = 'C:/Users/greg7/Documents/CLAUDE/CapibaraWolrd/'
TEX = DEPOT + 'public/assets/tex/'
PREUVE = 'C:/Users/greg7/Documents/CLAUDE/CapyForet-UE/Sources/textures/'
REL = 'C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Sources/relief/'
D = '/Game/Monde/Textures'
fichiers = [TEX + n for n in ['grass_diff.jpg', 'grass_nor.jpg', 'grass_rough.jpg', 'sand_diff.jpg', 'sand_nor.jpg', 'snow_diff.jpg', 'snow_nor.jpg',
                              'asphalt_diff.jpg', 'asphalt_nor.jpg', 'dirtroad_diff.jpg', 'dirtroad_nor.jpg', 'terrain/forestmoss_diff.jpg', 'terrain/forestmoss_nor.jpg']]
fichiers += [PREUVE + 'rock_face_03/rock_face_03_diff_4k.jpg', PREUVE + 'rock_face_03/rock_face_03_nor_dx_4k.jpg', PREUVE + 'rock_face_03/rock_face_03_arm_4k.jpg',
             PREUVE + 'Ground037/Ground037_4K-JPG_Color.jpg', PREUVE + 'Ground037/Ground037_4K-JPG_NormalDX.jpg']
fichiers += [REL + 'masques_a.png', REL + 'masques_b.png']
manquants = [f for f in fichiers if not os.path.exists(f)]
if manquants:
    raise RuntimeError('sources manquantes : ' + ', '.join(manquants))
at = unreal.AssetToolsHelpers.get_asset_tools()
tasks = []
for f in fichiers:
    t = unreal.AssetImportTask()
    t.filename = f; t.destination_path = D; t.automated = True; t.replace_existing = True; t.save = True
    tasks.append(t)
at.import_asset_tasks(tasks)
out = {}
for t in tasks:
    for p in t.imported_object_paths:
        tex = unreal.load_asset(p)
        n = tex.get_name().lower()
        if n.startswith('masques'):
            tex.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_DEFAULT)  # BC3 ; le BC7 n'était jamais reconstruit (masque blanc)
            tex.set_editor_property('srgb', False)
            tex.set_editor_property('lod_group', unreal.TextureGroup.TEXTUREGROUP_WORLD)
            tex.set_editor_property('address_x', unreal.TextureAddress.TA_CLAMP)
            tex.set_editor_property('address_y', unreal.TextureAddress.TA_CLAMP)
            tex.set_editor_property('never_stream', False)
            k = 'masques'
        elif 'nor' in n:
            tex.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_NORMALMAP)
            tex.set_editor_property('srgb', False)
            k = 'normale'
        elif 'arm' in n or 'rough' in n:
            tex.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_MASKS)
            tex.set_editor_property('srgb', False)
            k = 'masques'
        else:
            k = 'couleur'
        if '4k' in n:
            tex.set_editor_property('max_texture_size', 2048)
        out[tex.get_name()] = k + ' ' + str(tex.blueprint_get_size_x())
unreal.EditorAssetLibrary.save_directory(D)
out
