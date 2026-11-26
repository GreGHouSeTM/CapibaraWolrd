# U1 étape 5 : matériaux du monde, écrits en HLSL (capy_mat.py).
# - M_Sol_Ile : sol du Landscape par grandes surfaces (herbe, sol sec, mousse, sable, roche, neige, chemin, route), lues dans les
#   masques de surfaces exportés du jeu (4096², pas de 2 m, par position monde) + pente réelle (roche des falaises).
#   Anti-répétition : deux échelles tournées, variation macro (bruit de 30 à 400 m), fondu vers l'échelle large au loin.
#   Normales en espace monde (projection du dessus, triplanaire pour la roche).
# - M_Eau (Single Layer Water) : lacs, rivières, mer ; M_Glace : lac gelé ; M_Repere : bornes des régions (émissif doux).
import importlib, sys
sys.path.append('C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Content/Python')
import capy_mat
importlib.reload(capy_mat)
C = capy_mat
T = '/Game/Monde/Textures/'
M = '/Game/Monde/Materiaux/'

entrees = [
    ('WP', 'wp', None), ('CAM', 'cam', None), ('VN', 'vn', None),
    ('MA', 'tex', T + 'masques_a'), ('MB', 'tex', T + 'masques_b'),
    ('Gd', 'tex', T + 'grass_diff'), ('Gn', 'tex', T + 'grass_nor'),
    ('Dd', 'tex', T + 'Ground037_4K-JPG_Color'), ('Dn', 'tex', T + 'Ground037_4K-JPG_NormalDX'),
    ('Fd', 'tex', T + 'forestmoss_diff'), ('Fn', 'tex', T + 'forestmoss_nor'),
    ('Sd', 'tex', T + 'sand_diff'), ('Sn', 'tex', T + 'sand_nor'),
    ('Rd', 'tex', T + 'rock_face_03_diff_4k'), ('Rn', 'tex', T + 'rock_face_03_nor_dx_4k'), ('Ra', 'tex', T + 'rock_face_03_arm_4k'),
    ('Nd', 'tex', T + 'snow_diff'), ('Nn', 'tex', T + 'snow_nor'),
    ('Cd', 'tex', T + 'dirtroad_diff'), ('Cn', 'tex', T + 'dirtroad_nor'),
    ('Ad', 'tex', T + 'asphalt_diff'), ('An', 'tex', T + 'asphalt_nor'),
    ('TeinteHerbe', 'vec', (0.56, 0.76, 0.48, 1.0)), ('TeinteSec', 'vec', (0.80, 0.78, 0.64, 1.0)), ('TeinteMousse', 'vec', (0.42, 0.55, 0.38, 1.0)),
    ('TeinteRoche', 'vec', (0.64, 0.69, 0.78, 1.0)), ('TeinteNeige', 'vec', (0.86, 0.90, 0.97, 1.0)), ('TeinteSable', 'vec', (1.0, 0.95, 0.86, 1.0)),
    ('Macro', 'scal', 0.22), ('Luminosite', 'scal', 1.0), ('Debogage', 'scal', 0.0),
]

CODE = r'''
SamplerState SS = View.MaterialTextureBilinearWrapedSampler;
float2 p = WP.xy * 0.01;                         // mètres (Unreal X = x, Y = z du jeu)
float dist = length(WP - CAM) * 0.01;
float far = saturate((dist - 25.0) / 120.0);
float3 N = normalize(VN);
float pente = 1.0 - N.z;                        // 0 à plat, 0,29 à 45°
// masques des surfaces : grille de 2 m du jeu, nœud i en x = -4096 + 2i
float2 uvm = (p + 4097.0) / 8192.0;
float4 ma = Texture2DSample(MA, SS, uvm);        // roche, sable, neige, route
float4 mb = Texture2DSample(MB, SS, uvm);        // sec, mousse, humidité, chemin
// variation macro (anti-répétition à grande échelle)
float m1 = L.fbm(p * 0.0045 + 1.7), m2 = L.fbm(p * 0.03 + 5.1), m3 = L.vn(p * 0.21 + 2.0);
float wv = saturate(smoothstep(0.35, 0.65, m2) * 0.5 + far);
float tresLoin = saturate((dist - 220.0) / 700.0);
float varLoin = 0.86 + 0.28 * L.fbm(p * 0.012 + 9.0);

// échantillon d'une couche : deux échelles (la seconde tournée et 3,4 fois plus grande), mêlées par wv ; au-delà de ~250 m,
// la couche devient sa couleur moyenne (mip le plus bas) modulée par un bruit macro → plus de motif répété au loin.
// Fonction de structure (aucune directive de préprocesseur dans un nœud Custom : une directive mal formée fait planter l'éditeur).
struct CapyCouche {
  float3 co; float3 no;
  void echantillon(Texture2D TD, Texture2D TN, SamplerState S, float2 p, float ech, float ang, float ofs, float wv, float tl, float vl) {
    float c = cos(ang), s = sin(ang);
    float2 pr = float2(c * p.x - s * p.y, s * p.x + c * p.y);
    float2 u1 = p / ech + ofs, u2 = pr / (ech * 3.4) + ofs * 1.7;
    co = lerp(Texture2DSample(TD, S, u1).rgb, Texture2DSample(TD, S, u2).rgb, wv);
    float4 t1 = Texture2DSample(TN, S, u1), t2 = Texture2DSample(TN, S, u2);
    float3 n1 = float3(t1.xy * 2.0 - 1.0, 0.0); n1.z = sqrt(saturate(1.0 - dot(n1.xy, n1.xy)));
    float3 n2 = float3(t2.xy * 2.0 - 1.0, 0.0); n2.z = sqrt(saturate(1.0 - dot(n2.xy, n2.xy)));
    n2.xy = float2(c * n2.x + s * n2.y, -s * n2.x + c * n2.y);
    no = normalize(lerp(n1, n2, wv));
    co = lerp(co, Texture2DSampleLevel(TD, S, float2(0.5, 0.5), 14.0).rgb * vl, tl);
    no = normalize(lerp(no, float3(0, 0, 1), tl * 0.7));
  }
};
CapyCouche K;
K.echantillon(Gd, Gn, SS, p, 3.0, 1.13, 0.11, wv, tresLoin, varLoin); float3 cG = K.co, nG = K.no;
K.echantillon(Dd, Dn, SS, p, 4.0, 0.71, 0.37, wv, tresLoin, varLoin); float3 cD = K.co, nD = K.no;
K.echantillon(Fd, Fn, SS, p, 3.2, 2.05, 0.53, wv, tresLoin, varLoin); float3 cF = K.co, nF = K.no;
K.echantillon(Sd, Sn, SS, p, 5.0, 0.43, 0.29, wv, tresLoin, varLoin); float3 cS = K.co, nS = K.no;
K.echantillon(Nd, Nn, SS, p, 5.0, 1.71, 0.61, wv, tresLoin, varLoin); float3 cN = K.co, nN = K.no;
K.echantillon(Cd, Cn, SS, p, 3.5, 0.0, 0.17, wv, tresLoin, varLoin); float3 cC = K.co, nC = K.no;
K.echantillon(Ad, An, SS, p, 6.0, 0.0, 0.83, wv, tresLoin, varLoin); float3 cA = K.co, nA = K.no;
cG *= TeinteHerbe.rgb; cD *= TeinteSec.rgb; cF *= TeinteMousse.rgb; cS *= TeinteSable.rgb; cN *= TeinteNeige.rgb;

// roche : triplanaire (falaises sans étirement), 7 m, deux échelles
float3 bw = pow(abs(N), 4.0); bw /= (bw.x + bw.y + bw.z);
float ER = 7.0;
float3 cR = 0; float3 nRw = 0; float aoR = 0;
{ float2 ux = WP.yz * 0.01 / ER, uy = WP.xz * 0.01 / ER, uz = p / ER;
  float2 vx = ux / 3.1 + 0.3, vy = uy / 3.1 + 0.6, vz = L.rot(uz, 0.9) / 3.1 + 0.2;
  float3 cx = lerp(Texture2DSample(Rd, SS, ux).rgb, Texture2DSample(Rd, SS, vx).rgb, wv);
  float3 cy = lerp(Texture2DSample(Rd, SS, uy).rgb, Texture2DSample(Rd, SS, vy).rgb, wv);
  float3 cz = lerp(Texture2DSample(Rd, SS, uz).rgb, Texture2DSample(Rd, SS, vz).rgb, wv);
  cR = cx * bw.x + cy * bw.y + cz * bw.z;
  // au loin : échelle de 60 m (les strates restent lisibles sans motif répété)
  float3 cL = Texture2DSample(Rd, SS, uz / 8.5 + 0.11).rgb * bw.z + Texture2DSample(Rd, SS, ux / 8.5).rgb * bw.x + Texture2DSample(Rd, SS, uy / 8.5).rgb * bw.y;
  cR = lerp(cR, lerp(cL, Texture2DSampleLevel(Rd, SS, float2(0.5, 0.5), 14.0).rgb, 0.5) * varLoin, tresLoin);
  float3 tx = L.nrm(Texture2DSample(Rn, SS, ux)), ty = L.nrm(Texture2DSample(Rn, SS, uy)), tz = L.nrm(Texture2DSample(Rn, SS, uz));
  // normales projetées remises en espace monde (mélange « whiteout » ; vert DX inversé pour une projection sur les axes du monde)
  tx.y = -tx.y; ty.y = -ty.y; tz.y = -tz.y;
  float3 wx = float3(tx.xy + N.zy, abs(tx.z) * N.x).zyx;
  float3 wy = float3(ty.xy + N.xz, abs(ty.z) * N.y).xzy;
  float3 wz = float3(tz.xy + N.xy, abs(tz.z) * N.z);
  nRw = normalize(wx * bw.x + wy * bw.y + wz * bw.z);
  nRw = normalize(lerp(nRw, N, tresLoin * 0.85)); // au loin, le relief des normales de détail crée un motif répété
  aoR = Texture2DSample(Ra, SS, uz).r * bw.z + Texture2DSample(Ra, SS, ux).r * bw.x + Texture2DSample(Ra, SS, uy).r * bw.y; }
cR = lerp(dot(cR, float3(0.3, 0.59, 0.11)).xxx, cR, 0.3) * TeinteRoche.rgb;

// ---- poids des surfaces (mélange par hauteur : la luminance sert de hauteur de détail)
float hG = dot(cG, 0.33), hR = dot(cR, 0.33), hS = dot(cS, 0.33), hN = dot(cN, 0.33);
float wSec = saturate(mb.r * 1.1 + (m1 - 0.62) * 0.45);
float wMousse = saturate(mb.g * 1.1);
float wSable = ma.g;
float wRoche = saturate(max(ma.r * 1.15, smoothstep(0.22, 0.36, pente)) + (hR - 0.45) * 0.6 * (1.0 - far));
float alt = WP.z * 0.01;
wRoche = max(wRoche, smoothstep(380.0, 520.0, alt + (m2 - 0.5) * 80.0));
wRoche = smoothstep(0.35, 0.65, wRoche);
float wNeige = ma.b * (1.0 - smoothstep(0.30, 0.48, pente));
wNeige = smoothstep(0.30, 0.60, wNeige + (hN - 0.5) * 0.4);
float wChemin = smoothstep(0.25, 0.75, mb.a + (m3 - 0.5) * 0.25);
float wRoute = smoothstep(0.35, 0.65, ma.a);

float3 col = lerp(cG, cD, wSec); float3 nT = normalize(lerp(nG, nD, wSec));
col = lerp(col, cF, wMousse * 0.85); nT = normalize(lerp(nT, nF, wMousse * 0.85));
float wS = smoothstep(0.3, 0.7, wSable + (hS - hG) * 0.5);
col = lerp(col, cS, wS); nT = normalize(lerp(nT, nS, wS));
col = lerp(col, cC, wChemin); nT = normalize(lerp(nT, nC, wChemin));
col = lerp(col, cA, wRoute); nT = normalize(lerp(nT, nA, wRoute));
// normales des couches projetées du dessus → espace monde (Unreal : Y monde = -vert de la carte DX)
float3 nW = normalize(N + float3(nT.x, -nT.y, 0.0) * 0.9);
col = lerp(col, cR, wRoche); nW = normalize(lerp(nW, nRw, wRoche));
col = lerp(col, cN, wNeige); nW = normalize(lerp(nW, normalize(N + float3(nN.x, -nN.y, 0.0) * 0.6), wNeige));
// humidité au bord de l'eau : plus sombre et plus lisse
float hum = mb.b * (1.0 - wNeige) * (1.0 - wRoute);
col *= 1.0 - hum * 0.35;
// variation macro de valeur et de teinte (lecture des distances, pas d'aplat uniforme)
float mv = (m1 - 0.5) * Macro + (m2 - 0.5) * Macro * 0.5;
col *= 1.0 + mv;
col = lerp(col, col * float3(1.06, 1.0, 0.9), saturate((m1 - 0.5) * 2.0) * (1.0 - wNeige) * 0.6);
col *= Luminosite;
// contrôle : 1 = masques A (roche, sable, neige), 2 = masques B (sec, mousse, humidité), 3 = poids finaux (roche, neige, route)
if (Debogage > 3.5) { normale = N; rugosite = 1.0; ao = 1.0; return Debogage < 4.5 ? float3(frac(uvm * 16.0), 0.0) : Texture2DSample(MA, SS, float2(0.5, 0.05)).rgb; }
if (Debogage > 0.5) { normale = N; rugosite = 1.0; ao = 1.0; return Debogage < 1.5 ? ma.rgb : (Debogage < 2.5 ? mb.rgb : float3(wRoche, wNeige, wRoute)); }
rugosite = lerp(0.95, 0.88, wRoche);
rugosite = lerp(rugosite, 0.55, wNeige);
rugosite = lerp(rugosite, 0.8, wRoute);
rugosite = lerp(rugosite, 0.45, hum);
ao = lerp(1.0, aoR, wRoche);
normale = nW;
return saturate(col);
'''

sol = C.construire(M + 'M_Sol_Ile', CODE, entrees, ['couleur', 'rugosite', 'ao', 'normale'], monde_normale=True)
err_sol = C.erreurs(sol) if hasattr(C, 'erreurs') else None
mi_sol = C.instance(M + 'MI_Sol_Ile', sol)

# ---- eau : Single Layer Water, normales de vagues procédurales (deux octaves qui défilent)
CODE_EAU = r'''
float2 p = WP.xy * 0.01;
float t = View.GameTime;
float e = 0.35;
float2 q1 = p * 0.35 + float2(t * 0.05, t * 0.03), q2 = L.rot(p, 0.8) * 1.3 + float2(-t * 0.08, t * 0.06);
float h0 = L.vn(q1) + 0.5 * L.vn(q2);
float hx = L.vn(q1 + float2(0.02, 0)) + 0.5 * L.vn(q2 + float2(0.026, 0));
float hy = L.vn(q1 + float2(0, 0.02)) + 0.5 * L.vn(q2 + float2(0, 0.026));
normale = normalize(float3((h0 - hx) * Vagues, (h0 - hy) * Vagues, 1.0));
rugosite = 0.03;
return Couleur.rgb;
'''
eau = C.construire(M + 'M_Eau', CODE_EAU, [('WP', 'wp', None), ('Couleur', 'vec', (0.02, 0.06, 0.07, 1.0)), ('Vagues', 'scal', 0.8)],
                   ['couleur', 'rugosite', 'normale'])
# sortie « Single Layer Water » obligatoire : diffusion et absorption de l'eau (eau claire de lac, un peu verte)
MEL = unreal.MaterialEditingLibrary
slw = MEL.create_material_expression(eau, unreal.MaterialExpressionSingleLayerWaterMaterialOutput, 0, 400)
for nom, val, y in (('Diffusion', (0.008, 0.035, 0.03, 1.0), 300), ('Absorption', (0.35, 0.09, 0.06, 1.0), 400)):
    v = MEL.create_material_expression(eau, unreal.MaterialExpressionVectorParameter, -400, y)
    v.set_editor_property('parameter_name', nom)
    v.set_editor_property('default_value', unreal.LinearColor(*val))
    MEL.connect_material_expressions(v, '', slw, 'ScatteringCoefficients' if nom == 'Diffusion' else 'AbsorptionCoefficients')
eau.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_SINGLE_LAYER_WATER)
MEL.recompile_material(eau)
# ---- glace du lac de l'Aurore
CODE_GLACE = r'''
float2 p = WP.xy * 0.01;
float f = L.fbm(p * 0.15), c = L.fbm(p * 2.0);
rugosite = lerp(0.08, 0.35, f);
return lerp(float3(0.55, 0.68, 0.78), float3(0.82, 0.88, 0.93), f) * (0.92 + c * 0.1);
'''
glace = C.construire(M + 'M_Glace', CODE_GLACE, [('WP', 'wp', None)], ['couleur', 'rugosite'])
# ---- repères des régions : pierre claire et bandeau lumineux doux (visibles de jour comme de nuit)
CODE_REP = r'''
float b = smoothstep(0.80, 0.83, UV.y) * (1.0 - smoothstep(0.90, 0.93, UV.y));
emission = Couleur.rgb * b * Intensite;
rugosite = 0.7;
return lerp(float3(0.62, 0.58, 0.52), Couleur.rgb, b);
'''
rep = C.construire(M + 'M_Repere', CODE_REP, [('UV', 'uv0', None), ('Couleur', 'vec', (1.0, 0.75, 0.35, 1.0)), ('Intensite', 'scal', 6.0)],
                   ['couleur', 'rugosite', 'emission'])
unreal.EditorAssetLibrary.save_directory(M)
unreal.log('=== U1 materiaux construits ===')
{'sol': err_sol, 'eau': C.erreurs(eau) if hasattr(C, 'erreurs') else None}
