# AI generation of game/3D assets (free / open / local), state as of late November 2026

Scope note: research done 2026-11-24 with ~18 search/fetch calls. Many sources are third-party guides/vendor blogs; primary sources (GitHub READMEs, HF model cards, official X posts) are flagged where used. License claims from secondary sources should be re-checked against the LICENSE file before shipping.

## 1. Image/text-to-3D models (Hunyuan3D, TRELLIS.2, SAM 3D, TripoSG, Step1X-3D, Direct3D-S2, SF3D/SPAR3D...)

### Takeaway
The best zero-cost, commercially clean open image-to-3D option in Nov 2026 is still Microsoft TRELLIS.2-4B (MIT, PBR GLB output, ~24 GB VRAM, released Dec 2025); Hunyuan3D 2.1 (June 2025) remains Tencent's newest open shape+PBR model but its license excludes EU/UK/South Korea, and Tencent's newer 2.5/3.0/3.1 are hosted-only. For low VRAM, TripoSG (MIT, ~8 GB) / TripoSR (MIT, ~6 GB) are the permissive fallbacks; SAM 3D Objects (custom SAM License, ~32 GB) is strong for photo-to-object reconstruction.

### Cited Findings
**TRELLIS.2 (Microsoft)**
- TRELLIS.2-4B: 4B-parameter model, outputs a mesh with PBR materials including opacity; released under the MIT License (official HF model card) — [HF README](https://huggingface.co/microsoft/TRELLIS.2-4B/blob/main/README.md)
- Release date 2025-12-16; "upstream requests at least 24 GB NVIDIA GPU memory"; dependencies have separate terms — [Cinevva timeline (updated 2026-11-21)](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026)
- PBR maps: base colour, roughness, metallic, opacity (PBR GLB); 24 GB+ NVIDIA, Linux tested; a free TRELLIS.2 HF Space exists; TRELLIS v1 (MIT, 16 GB+) last commit Oct 27, 2026 — [Vi3W guide, 2026-11-21](https://vi3w.in/guides/best-open-source-3d-ai-2027)
- Unofficial VRAM figures vary: 12 GB min / quantized 8 GB at 512 res; by resolution 512³≈16 GB, 1024³≈24 GB, 1536³≈40 GB+; one user measured ~16 GB generating, ~30 GB rendering (all third-party, not Microsoft) — [Webkul](https://webkul.com/blog/trellis-2/), [trify3d](https://trify3d.com/blog/trellis-2-complete-guide), [sonusahani](https://sonusahani.com/blogs/trellis-2)
- TRELLIS text-conditioned models + training code released 2025-03-25 — [Cinevva timeline](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026)

**Hunyuan3D (Tencent)**
- Hunyuan3D 2.1 released 2025-06-13 ("first production-ready 3D asset generation model"), tech report 2025-06-19; VRAM: shape 10 GB, texture 21 GB, both 29 GB; PBR texture model replaces RGB one ("physics-grounded material simulation", metallic reflections, SSS); free demo: huggingface.co/spaces/tencent/Hunyuan3D-2.1 — [GitHub Hunyuan3D-2.1](https://github.com/tencent-hunyuan/hunyuan3d-2.1)
- Author-reported shape benchmark (Uni3D-I, higher better): Hunyuan3D-Shape-2.1 0.3213 > Step1X-3D 0.3195 > TripoSG 0.3129 > Trellis (v1) 0.3116 > Direct3D-S2 0.2930 — [GitHub Hunyuan3D-2.1](https://github.com/tencent-hunyuan/hunyuan3d-2.1)
- License: Tencent Hunyuan community licence, not valid in EU, UK, South Korea; last commit Oct 17, 2025; Hunyuan3D 2.0/2mini: 6 GB shape, 16 GB with texture — [Vi3W guide](https://vi3w.in/guides/best-open-source-3d-ai-2027)
- Hunyuan3D 2.5, 3.0, 3.1 are hosted/closed-weight; open-source request for 2.5 unanswered since July 2025; Hunyuan3D-Omni (2025-09-25; control via point cloud, voxel, skeleton, bbox) and Hunyuan3D-Part (2025-09-28; P3-SAM + X-Part part segmentation) are open under Tencent community licenses — [Cinevva timeline (via search summary)](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026); [Tencent Cloud](https://www.tencentcloud.com/techpedia/148303?lang=en) describes 2.1 as historical behind hosted 3.0
- Hunyuan3D-Buffalo 1.0 paper (2026-08-05), no weights verified; Tencent retired HunyuanTo3D 2.5 / ProfileTo3D 1.0 API endpoints 2026-10-20 — [Cinevva timeline](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026)

**Meta SAM 3D**
- SAM 3D Objects and SAM 3D Body released 2025-11-19, custom SAM License; mesh and Gaussian outputs — [Cinevva timeline](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026)
- Official repo: checkpoints and code under the "SAM License" (custom, not OSI); weights on HF facebook/sam-3d-objects — [GitHub facebookresearch/sam-3d-objects](https://github.com/facebookresearch/sam-3d-objects)
- Weights/inference code usable for noncommercial and commercial uses subject to trade restrictions — [DeepLearning.AI The Batch](https://www.deeplearning.ai/the-batch/metas-sam-3-image-segmentation-suite-analyzes-and-creates-3d-bodies-and-other-objects); conflicting third-party claims of Apache 2.0 / CC-BY-NC for variants — [Roboflow](https://playground.roboflow.com/models/meta/sam-3d-objects) (likely confused with other SAM models; treat as unreliable)
- Gated weights, 32 GB+ NVIDIA Linux, Gaussian splat by default, mesh optional — [Vi3W guide](https://vi3w.in/guides/best-open-source-3d-ai-2027)

**TripoSG / Step1X-3D / Direct3D-S2 / others**
- Step1X-3D (StepFun): Apache 2.0 per official README — [GitHub stepfun-ai/Step1X-3D](https://github.com/stepfun-ai/Step1X-3D); ~27 GB GPU memory for geometry+texture per official inference table — [localclaw guide](https://localclaw.io/3d/step1x-3d)
- TripoSG (VAST, 1.5B, Mar 2025): MIT, 8 GB+; TripoSR (Feb 2024) MIT ~6 GB — [Vi3W guide](https://vi3w.in/guides/best-open-source-3d-ai-2027)
- Direct3D-S2: MIT and ~6 GB VRAM claimed only by a competing vendor blog, unverified — [triposplat](https://triposplat.com/blog/best-3d-ai-generators-2026)
- Pixal3D (Tencent ARC): TRELLIS.2-based version (2026-05, inference+training code, MIT), multiview update 2026-09 (MIT); Hi3D v1.0 (2026-10-23): refines coarse mesh from reference image, geometry only, custom "Hi3D Open License Agreement" — [Cinevva timeline](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026)
- Commercial (freemium, closed) competitors in 2026: Tripo P1.0/H3.1 (2026-03-09), Tripo P2.0 (2026-09-21), Meshy 6 (2026-01-18), Meshy 7 (2026-08-10), Meshy 7.1 (2026-09-10), Rodin Gen-2.5 (2026-05-26); Meshy quadruped rigging 2026-11-18, Meshy CLI 2026-11-13, Tripo Substance Painter bridge 2026-11-20 — [Cinevva timeline](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026)

### Inferences
- For a zero-cost, commercial, worldwide-safe web game pipeline: TRELLIS.2 (MIT) is the default; TripoSG/TripoSR as low-VRAM fallbacks; Hunyuan3D 2.1 only if the user is outside EU/UK/KR (note: a French/EU user is explicitly excluded by the Tencent license territory clause, per Vi3W summary).
- Without a 24 GB GPU, the zero-cost route is the free HF Spaces (TRELLIS.2, Hunyuan3D-2.1), subject to ZeroGPU quotas.
- Open models remain behind hosted ones (Hunyuan 3.x, Tripo P2, Meshy 7, Rodin Gen-2.5) — the open frontier has largely stalled since TRELLIS.2 (Dec 2025), with derivatives (Pixal3D) rather than new foundation releases.

### Gaps
- Stable Fast 3D / SPAR3D (Stability AI): no 2026 source found on status or license in this pass (from prior knowledge they were under the Stability AI Community License, free <$1M revenue — unverified here).
- No source on topology quality / quad retopology of any open model; all output dense triangle meshes per general knowledge, unconfirmed.
- No independent (non-author) benchmark found; 3D Arena rankings only via vendor summary.
- Official Hunyuan3D 2.1 LICENSE text not read directly (territory restriction comes from secondary source).

## 2. PBR textures/materials, HDRI/skies, upscaling, local image models, CC0 libraries

### Takeaway
Tileable PBR material generation is mature in ComfyUI: Ubisoft's open-sourced CHORD (SDXL-based, SIGGRAPH Asia 2025), StableMaterials nodes, and core-ComfyUI Patina nodes (late Oct 2026). For base image models with commercial rights, Z-Image-Turbo (Apache 2.0) and FLUX.2 [klein] 4B (Apache 2.0) are the safe picks; FLUX.2 [dev]/[klein 9B] and Qwen-Image-2.1 are non-commercial. True open HDR sky generation remains scarce (open LoRAs produce SDR equirectangular). CC0 libraries (Poly Haven, ambientCG, Kenney) are the zero-risk backbone.

### Cited Findings
- Ubisoft La Forge "Generative Base Material" / CHORD: open-source prototype for PBR material estimation debuting at SIGGRAPH Asia 2025 — [Ubisoft](https://www.ubisoft.com/en-us/studio/laforge/news/1i3YOvQX2iArLlScBPqBZs/generative-base-material-an-opensource-prototype-for-pbr-material-estimation-debuting-at-siggraph-asia-2025); weights + ComfyUI nodes (github.com/ubisoft/ComfyUI-Chord), seamless tileable textures from text/lineart/height, "SDXL + CHORD workflow" for tileables — [ComfyUI.org](https://comfyui.org/en/ubisoft-open-sources-the-chord-model), [Comfy](https://comfy.org/customers/ubisoft-chord/)
- StableMaterials ComfyUI nodes: 5 PBR maps from text or image, tileable option, OpenRAIL (commercial permitted) — [GitHub P5ina](https://github.com/P5ina/comfyui-stable-materials)
- QFX PBRGenerator: full PBR set from one image, tiling modes off/seamless/mirror/replicate — [GitHub qornflex](https://github.com/qornflex/ComfyUI-QFX-PBRGenerator)
- Patina partner nodes merged into core ComfyUI (~late Oct 2026): seamless PBR with basecolor, normal, roughness, metalness, height — [ArtRealm](https://artrealmai.com/article/patina-pbr-material-nodes-comfyui-seamless-textures) (partner nodes may require paid API — unverified)
- Example headless pipeline: text→image→seamless→upscale→PBR decomposition, 7 maps, three.js preview — [GitHub wxjhhhh](https://github.com/wxjhhhh/ai-pbr-texture-generator)
- Image model licenses (Aug 2026 matrix + others): Z-Image-Turbo Apache 2.0 (~16 GB for 8 steps, or ~7–9 GB with 8-bit + offloaded encoder); FLUX.2 [klein] 4B Apache 2.0 (~13 GB); FLUX.2 [klein] 9B & [dev] FLUX Non-Commercial (outputs sellable, commercial deployment needs BFL license); Qwen-Image (20B) Apache 2.0 (~15–24 GB quantized); Qwen-Image-2.1 moved to non-commercial Qwen Research License — [Invideo license matrix](https://invideo.io/blog/open-source-image-models-licenses/), [rohitraj](https://rohitraj.tech/notes/qwen-image-2-1-commercial-license-alternatives-2026), [localaimaster](https://localaimaster.com/blog/local-image-model-licenses-commercial-use), [bestfreewebresources](https://www.bestfreewebresources.com/best-local-image-generation-models-2026)
- 360 skies: Qwen-Image + 360 LoRA ComfyUI workflow, seamless left/right edges, output SDR — [Floyo](https://www.floyo.ai/workflows/-qwen-image-text-to-360-hdri-panoram-kl3r5gmd7mar); Flux-LoRA-Equirectangular-v3 on FLUX.1-dev (so inherits FLUX.1-dev non-commercial license) — [AIbase](https://model.aibase.com/models/details/1915705885546143745); NVIDIA Edify HDR 360 panorama is research/closed — [arXiv Edify Image](https://arxiv.org/pdf/2411.07126); a "RadianceHDR360Generate" ComfyUI node exists — [comfy.icu](https://comfy.icu/node/RadianceHDR360Generate)
- CC0 libraries: Poly Haven assets free under CC0 — [Poly Haven corporate](https://polyhaven.com/corporate); ambientCG CC0, API with no key needed; Kenney CC0, 270+ packs / 40,000+ assets; Quaternius mostly CC0 but one guide says some CC-BY — [Cinevva free game assets guide 2026](https://app.cinevva.com/guides/game-assets-guide); curated list — [awesome-cc0](https://www.github.com/madjin/awesome-cc0)

### Inferences
- Practical zero-cost recipe: Z-Image-Turbo or FLUX.2 klein 4B (Apache) → tileable workflow → CHORD/StableMaterials for normal/roughness/height → upscale → KTX2. For skies, prefer Poly Haven CC0 HDRIs; AI skyboxes as SDR equirect for background only (lighting via PMREM of SDR is acceptable for stylized games).
- An agent can fetch Poly Haven/ambientCG assets programmatically, which is more reliable than generation for realistic materials/HDRIs.

### Gaps
- License of CHORD weights not verified (Ubisoft research license vs open).
- Poly Haven API (api.polyhaven.com) status/terms not confirmed by a 2026 source.
- No open model confirmed producing true HDR (.hdr/.exr) skies with sun intensity; LDR→HDR inverse tone mapping step not researched.
- Upscaler options (Real-ESRGAN, etc.) not covered by sources found.

## 3. Characters, rigging and animation

### Takeaway
UniRig (SIGGRAPH 2025, Tsinghua + VAST/Tripo) is the reference open auto-rigger for diverse skeletons; Tencent's HY-Motion 1.0 (Dec 2025, billion-parameter flow-matching DiT) is the leading open text-to-motion model, but for humanoids and under a disputed (likely Tencent community) license. Mixamo's 2026 status could not be verified. Commercial services (Meshy, Rodin) are adding rigging features fast.

### Cited Findings
- UniRig: open-source, staged release, Rig-XL dataset of 14,000+ rigged models; claims +215% rigging accuracy and +194% motion accuracy vs SOTA; repo now also promotes successor "SkinTokens" — [GitHub VAST-AI-Research/UniRig](https://github.com/VAST-AI-Research/UniRig), [ACM paper](https://dl.acm.org/doi/10.1145/3730930)
- HY-Motion 1.0: scales DiT flow-matching text-to-motion to billion parameters, 3D human motion from text — [arXiv 2512.23464](https://arxiv.org/abs/2512.23464); SourceForge mirror says MIT — [SourceForge](https://sourceforge.net/projects/hy-motion-1-0.mirror/); a GitHub issue says the upstream Tencent license excludes EU/UK/KR with an MAU threshold, and that text-to-motion integration supports humanoid rigs only — [QtMeshEditor issue #818](https://github.com/fernandotonon/QtMeshEditor/issues/818)
- Research in 2026: UniMate (unified animation for diverse skeletons, arXiv 2609.05415), MotionBricks (real-time modular motion, arXiv 2604.24833), OpenT2M (open large-scale motion data, arXiv 2603.18623) — [UniMate](https://arxiv.org/pdf/2609.05415), [MotionBricks](https://arxiv.org/pdf/2604.24833), [OpenT2M](https://arxiv.org/pdf/2603.18623)
- SAM 3D Body (Meta, 2025-11-19) for human body reconstruction, SAM License — [Cinevva timeline](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026)
- Commercial: Meshy quadruped rigging (2026-11-18), skeleton options (2026-11-10); Rodin prompt-editable rigging (2026-11-03) — [Cinevva timeline](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026)
- Mixamo listed as "free commercial" in one 2026 comparison table only — [Cinevva game assets guide](https://app.cinevva.com/guides/game-assets-guide)

### Inferences
- For a three.js game with a French/EU user, HY-Motion's Tencent license may be territorially unusable; Mixamo (if still up) + three.js AnimationMixer remains the simplest zero-cost humanoid route; UniRig for non-humanoids.

### Gaps
- UniRig license (MIT? per prior knowledge) not confirmed in this pass.
- No source on video-to-motion open models (e.g. GVHMR-type) or retargeting tools in 2026.
- Mixamo official status/terms in 2026 unverified.

## 4. Audio: music, SFX, TTS

### Takeaway
ACE-Step 1.5 (MIT, commercial outputs allowed, XL 4B variants April 2026, runs on CUDA/AMD/Mac/Intel) is the leading open local music model. Stable Audio Open (Stability Community License, free under $1M revenue) suits SFX/loops. For voices: Kokoro (Apache 2.0, CPU-friendly, preset voices) and Qwen3-TTS (Apache 2.0, cloning) are the safe picks; Chatterbox retired Aug 2026, VibeVoice research-only, F5-TTS/XTTS-v2 non-commercial.

### Cited Findings
- ACE-Step 1.5: MIT, generated music usable commercially per model card; supports Mac, AMD, Intel, CUDA; XL 4B DiT released — [GitHub ace-step/ACE-Step-1.5](https://github.com/ace-step/ACE-Step-1.5), [HF model card](https://huggingface.co/ACE-Step/Ace-Step1.5); AMD blog on running it on Ryzen AI/Radeon — [AMD](https://www.amd.com/en/blogs/2026/commercial-grade-ai-music-generation-on-amd-ryzen-ai-and-radeon-ace-step-1-5.html); caveat: model license does not clear copyright/dataset issues in outputs — [The Rundown](https://www.therundown.ai/tools/ace-step-1-5)
- Stable Audio Open: Stability AI Community License, commercial under $1M revenue, instrumental/SFX/loops; DiffRhythm Apache 2.0; MusicGen, Stable Audio Open, Magenta RealTime instrumental only — [Boppy](https://boppy.me/blog/best-open-source-ai-music-models), [songcreator.pro](https://songcreator.pro/blog/best-open-source-ai-music-models)
- StepAudio 3 Music technical report (arXiv 2609.16034, Sept 2026) — [arXiv](https://arxiv.org/pdf/2609.16034) (license/weights not checked)
- TTS: Kokoro Apache 2.0 code+weights, CPU-capable, no cloning; Chatterbox MIT but retired by Resemble AI Aug 2026; VibeVoice MIT but README research-only and TTS code removed Sept 2025; Qwen3-TTS Apache 2.0, 3-second cloning; F5-TTS CC-BY-NC-4.0 and XTTS-v2 CPML non-commercial — [Cekura](https://www.cekura.ai/blogs/open-source-tts), [Cartesia](https://www.cartesia.ai/learn/open-source-tts), [ocdevel](https://ocdevel.com/blog/20250720-tts)

### Inferences
- Fully local zero-cost audio stack: ACE-Step 1.5 (music) + Stable Audio Open (SFX, if revenue <$1M) + Kokoro/Qwen3-TTS (voices) + CC0 sound libraries (Kenney audio packs).

### Gaps
- HunyuanVideo-Foley, MMAudio (video-to-audio SFX) licenses not found in this pass.
- No quality benchmark for SFX generators.

## 5. World models and generative environments

### Takeaway
Only two families give exportable assets: Tencent HY-World 2.0 (open weights, April 16 2026, exports mesh / 3DGS / point cloud for Unity/UE, Tencent community license) and World Labs Marble (commercial, free tier ~4 worlds/month, free PLY splat export, paid mesh export). Genie 3 is a real-time playable prototype (Google AI Ultra) without asset export; HY-World 1.5 (WorldPlay) outputs streaming video only.

### Cited Findings
- HY-World 2.0: open-sourced 2026-04-16 (inference code + weights on HF tencent/HY-World-2.0); generates/reconstructs/simulates 3D worlds from text, images, video; exports mesh, 3DGS, point clouds; integrates into Unity/UE — [Tencent Hy on X](https://x.com/TencentHunyuan/status/2044604754836505076), [GitHub HY-World-2.0](https://github.com/Tencent-Hunyuan/HY-World-2.0), [GIGAZINE](https://gigazine.net/gsc_news/en/20260417-tencent-hy-world-2/); Tencent Community Licence — [southwardtech](https://southwardtech.com/chinese-open-source-world-models/)
- HunyuanWorld 1.0 (2025-07-26): open-source immersive 3D world generation (360 panorama + layered mesh) — [GitHub Hunyuan3D-2.1 news](https://github.com/tencent-hunyuan/hunyuan3d-2.1)
- HY-World 1.5 / WorldPlay (2025-12-17): real-time interactive streaming video world model, 24 FPS, license "tencent-hy-worldplay-community", built on HunyuanVideo 1.5 — [GitHub HY-WorldPlay](https://github.com/Tencent-Hunyuan/HY-WorldPlay), [HF README](https://huggingface.co/tencent/HY-WorldPlay/blob/7a5889c4a766a603ec1fbb4e862aab959ebd2a01/README.md); Tencent community license reportedly excludes EU/UK/KR and >1M MAU needs permission — [southwardtech](https://southwardtech.com/chinese-open-source-world-models/)
- World Labs Marble: GA; tiers Standard $20, Pro $35, Max $95/month; free plan ~7,000 credits/month ≈ 4 worlds, no card; PLY splat export free; high-quality mesh export ~3,500 credits (~$2.80 per other source); world gen 1,500 credits (150 draft, up to 3,000 on Marble 1.1 Plus) — [Hokai](https://hokai.io/hub/tools/marble), [Maverickframe](https://maverickframe.com/blog/world-labs-marble-splats/), [Invideo (Aug 2026)](https://invideo.io/blog/world-labs-marble-3d-worlds/) (pricing page not verified directly)
- Genie 3: public prototype since 2026-01-29 for Google AI Ultra (US), wider regions May 2026; no export; no general API as of Sept 2026 — [tech-insider](https://tech-insider.org/genie-3-vs-marble-vs-nvidia-cosmos-world-models-2026/), [robocloud](https://robocloud-dashboard.vercel.app/learn/blog/world-models-genie-3-marble-2026)
- Playable Gaussian splats in engines (2026 overview) — [top3d.ai](https://www.top3d.ai/learn/gaussian-splatting-playable-game-engines-2026)

### Inferences
- For three.js: Marble free-tier PLY splats or HY-World 2.0 3DGS can be rendered with a three.js splat renderer (e.g. Spark / GaussianSplats3D) as backdrops; collision needs the mesh export. Genie 3 / Odyssey-type video world models are not usable as game assets.

### Gaps
- HY-World 2.0 VRAM requirements not found.
- Odyssey and other world-model startups not researched (budget).
- Genie 3 successors (if any) not confirmed.

## 6. End-to-end pipeline to glTF for the web

### Takeaway
Standard pipeline: generate GLB (TRELLIS.2/Hunyuan) → cleanup/decimate → bake/resize textures → gltf-transform / gltfpack with meshopt (EXT_meshopt_compression) + KTX2 (ETC1S color, UASTC normals) + LODs → three.js loaders (MeshoptDecoder, KTX2Loader with Basis transcoder).

### Cited Findings
- Recommended order: shrink textures, quantize, then Meshopt/Draco, simplify last; via gltf-transform and gltfpack — [Cinevva GLB optimization guide](https://app.cinevva.com/guides/optimize-glb-for-web)
- `gltf-transform optimize`: dedup, instance, weld, light simplify, prune, textures capped at 2048 px, Meshopt geometry; `simplify` uses meshoptimizer (default error 0.0001); KTX2 etc1s/uastc requires KTX-Software — [compress-glb.com](https://compress-glb.com/blog/gltf-transform-optimize/)
- three.js loader wiring: Meshopt needs decoder; KTX2 needs Basis transcoder (KHR_texture_basisu) — [paprika3d](https://paprika3d.com/docs/guides/threejs-draco-meshopt-ktx2)
- Real-world chain: dedup, prune, weld, reduce, LOD via meshopt simplify, KTX2 (ETC1S color / UASTC normals), quantize + EXT_meshopt_compression — [theprototype PR #390](https://github.com/theprototype-app/core/pull/390)
- Research on native (artist-like) mesh generation: TaoFlowForge (arXiv 2609.37139) — [arXiv](https://arxiv.org/pdf/2609.37139)

### Inferences
- An agent can automate all post-processing with Node (gltf-transform CLI) without Blender; retopology/UV unwrap for AI meshes would still need Blender (headless) or service features.

### Gaps
- Blender QuadriFlow / Instant Meshes retopo and texture-baking automation for AI meshes: no source found in this pass.
- Claimed 87–95% geometry size reduction unverified.
