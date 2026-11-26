# Construction de matériaux Unreal par script : un nœud Custom (HLSL) qui reçoit textures, position monde, normales, UV, paramètres,
# et rend couleur, rugosité, normale, occlusion, déplacement, émission, opacité. Utilisé par Outils/py/materiaux_*.py.
import unreal

MEL = unreal.MaterialEditingLibrary
AT = unreal.AssetToolsHelpers.get_asset_tools()

T_F1 = unreal.CustomMaterialOutputType.CMOT_FLOAT1
T_F2 = unreal.CustomMaterialOutputType.CMOT_FLOAT2
T_F3 = unreal.CustomMaterialOutputType.CMOT_FLOAT3
T_F4 = unreal.CustomMaterialOutputType.CMOT_FLOAT4

PROPS = {
    'couleur': (unreal.MaterialProperty.MP_BASE_COLOR, T_F3),
    'rugosite': (unreal.MaterialProperty.MP_ROUGHNESS, T_F1),
    'normale': (unreal.MaterialProperty.MP_NORMAL, T_F3),
    'ao': (unreal.MaterialProperty.MP_AMBIENT_OCCLUSION, T_F1),
    'deplacement': (unreal.MaterialProperty.MP_DISPLACEMENT, T_F1),
    'emission': (unreal.MaterialProperty.MP_EMISSIVE_COLOR, T_F3),
    'opacite': (unreal.MaterialProperty.MP_OPACITY, T_F1),
    'masque': (unreal.MaterialProperty.MP_OPACITY_MASK, T_F1),
    'speculaire': (unreal.MaterialProperty.MP_SPECULAR, T_F1),
    'souscouleur': (unreal.MaterialProperty.MP_SUBSURFACE_COLOR, T_F3),
    'metal': (unreal.MaterialProperty.MP_METALLIC, T_F1),
}

# Bibliothèque HLSL commune, collée en tête de chaque nœud Custom (structure à méthodes : seule façon de déclarer des fonctions).
LIB = r'''
struct CapyLib {
  float h21(float2 p) { p = frac(p * float2(123.34, 456.21)); p += dot(p, p + 45.32); return frac(p.x * p.y); }
  float vn(float2 p) { float2 i = floor(p), f = frac(p); float2 u = f * f * (3.0 - 2.0 * f);
    return lerp(lerp(h21(i), h21(i + float2(1, 0)), u.x), lerp(h21(i + float2(0, 1)), h21(i + float2(1, 1)), u.x), u.y); }
  float fbm(float2 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { s += a * vn(p); p = mul(float2x2(1.6, 1.2, -1.2, 1.6), p); a *= 0.5; } return s; }
  float2 rot(float2 p, float a) { float c = cos(a), s = sin(a); return float2(c * p.x - s * p.y, s * p.x + c * p.y); }
  float3 nrm(float4 t) { float3 n; n.xy = t.xy * 2.0 - 1.0; n.z = sqrt(saturate(1.0 - dot(n.xy, n.xy))); return n; }
  float3 udn(float3 a, float3 b) { return normalize(float3(a.xy + b.xy, a.z)); }
};
CapyLib L;
'''


def nouveau(chemin, remplacer=True):
    """Crée (ou recrée) un Material vide à `chemin` (/Game/.../M_Nom)."""
    d, n = chemin.rsplit('/', 1)
    if unreal.EditorAssetLibrary.does_asset_exist(chemin):
        if not remplacer:
            return unreal.load_asset(chemin)
        m = unreal.load_asset(chemin)
        MEL.delete_all_material_expressions(m)
        return m
    return AT.create_asset(n, d, unreal.Material, unreal.MaterialFactoryNew())


def entree(m, nom, sorte, valeur=None, x=-1600, y=0):
    """Crée l'expression qui alimente une entrée du Custom. sorte : tex, texp (paramètre texture), wp, vn, uv0, uv1, cam, scal, vec, vc, rnd, pnorm."""
    E = unreal
    if sorte == 'tex':
        e = MEL.create_material_expression(m, E.MaterialExpressionTextureObject, x, y)
        e.set_editor_property('texture', unreal.load_asset(valeur))
    elif sorte == 'texp':
        e = MEL.create_material_expression(m, E.MaterialExpressionTextureObjectParameter, x, y)
        e.set_editor_property('parameter_name', nom)
        e.set_editor_property('texture', unreal.load_asset(valeur))
    elif sorte == 'wp':
        e = MEL.create_material_expression(m, E.MaterialExpressionWorldPosition, x, y)
    elif sorte == 'vn':
        e = MEL.create_material_expression(m, E.MaterialExpressionVertexNormalWS, x, y)
    elif sorte in ('uv0', 'uv1'):
        e = MEL.create_material_expression(m, E.MaterialExpressionTextureCoordinate, x, y)
        e.set_editor_property('coordinate_index', int(sorte[-1]))
    elif sorte == 'cam':
        e = MEL.create_material_expression(m, E.MaterialExpressionCameraPositionWS, x, y)
    elif sorte == 'scal':
        e = MEL.create_material_expression(m, E.MaterialExpressionScalarParameter, x, y)
        e.set_editor_property('parameter_name', nom)
        e.set_editor_property('default_value', float(valeur))
    elif sorte == 'vec':
        e = MEL.create_material_expression(m, E.MaterialExpressionVectorParameter, x, y)
        e.set_editor_property('parameter_name', nom)
        e.set_editor_property('default_value', unreal.LinearColor(*valeur))
    elif sorte == 'vc':
        e = MEL.create_material_expression(m, E.MaterialExpressionVertexColor, x, y)
    elif sorte == 'rnd':
        e = MEL.create_material_expression(m, E.MaterialExpressionPerInstanceRandom, x, y)
    elif sorte == 'objpos':
        e = MEL.create_material_expression(m, E.MaterialExpressionObjectPositionWS, x, y)
    elif sorte == 'twosign':
        e = MEL.create_material_expression(m, E.MaterialExpressionTwoSidedSign, x, y)
    else:
        raise ValueError(sorte)
    return e


def construire(chemin, code, entrees, sorties, principale='couleur', reglages=None, monde_normale=False):
    """entrees : [(nom, sorte, valeur)] ; sorties : liste de clés de PROPS (la première = sortie principale du Custom).
    Le code HLSL assigne les sorties supplémentaires par leur nom et `return` la principale."""
    m = nouveau(chemin)
    for k, v in (reglages or {}).items():
        m.set_editor_property(k, v)
    m.set_editor_property('tangent_space_normal', not monde_normale)
    c = MEL.create_material_expression(m, unreal.MaterialExpressionCustom, -500, 0)
    c.set_editor_property('code', LIB + code)
    c.set_editor_property('output_type', PROPS[principale][1])
    c.set_editor_property('description', chemin.rsplit('/', 1)[1])
    ins = []
    for nom, sorte, val in entrees:
        ci = unreal.CustomInput()
        ci.set_editor_property('input_name', nom)
        ins.append(ci)
    c.set_editor_property('inputs', ins)
    outs = []
    for s in sorties:
        if s == principale:
            continue
        co = unreal.CustomOutput()
        co.set_editor_property('output_name', s)
        co.set_editor_property('output_type', PROPS[s][1])
        outs.append(co)
    c.set_editor_property('additional_outputs', outs)
    y = -800
    for nom, sorte, val in entrees:
        e = entree(m, nom, sorte, val, -1400, y)
        y += 90
        MEL.connect_material_expressions(e, '', c, nom)
    MEL.connect_material_property(c, '', PROPS[principale][0])
    for s in sorties:
        if s != principale:
            MEL.connect_material_property(c, s, PROPS[s][0])
    MEL.recompile_material(m)
    return m


def instance(chemin, parent, scalaires=None, textures=None, vecteurs=None):
    d, n = chemin.rsplit('/', 1)
    if unreal.EditorAssetLibrary.does_asset_exist(chemin):
        mi = unreal.load_asset(chemin)
    else:
        mi = AT.create_asset(n, d, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(mi, unreal.load_asset(parent) if isinstance(parent, str) else parent)
    for k, v in (scalaires or {}).items():
        MEL.set_material_instance_scalar_parameter_value(mi, k, float(v))
    for k, v in (textures or {}).items():
        MEL.set_material_instance_texture_parameter_value(mi, k, unreal.load_asset(v) if isinstance(v, str) else v)
    for k, v in (vecteurs or {}).items():
        MEL.set_material_instance_vector_parameter_value(mi, k, unreal.LinearColor(*v))
    MEL.update_material_instance(mi)
    return mi


def erreurs(m):
    """Erreurs de compilation du matériau (vide si OK)."""
    try:
        return [str(e) for e in MEL.get_material_compile_errors(m)] if hasattr(MEL, 'get_material_compile_errors') else []
    except Exception as e:
        return ['?' + str(e)]
