# State of the art in real-time web 3D rendering (three.js first), late November 2026

Research date: 2026-11-24. Latest three.js found: **r187 (npm 0.187.0, 30 Oct 2026)**. I found no r188 on the GitHub releases page; on the usual cadence of about 6 to 8 weeks it could land in late Nov or Dec 2026 (inference, unverified).

Source-quality note: the official GitHub release notes for r181 through r187 were fetched directly. The per-release dates and the "breaking changes" summaries rely partly on utsubo.com, a secondary blog that is consistent with the GitHub notes where they overlap. The official three.js wiki migration guide was **not** fetched directly.

---

## 1. three.js releases r180 to r187: key changes, deprecations, breaking changes

### Takeaway
Since r180, three.js work has shifted heavily to WebGPURenderer, TSL and node materials. About 80% of the changed core lines in r187 were on the WebGPU-renderer side. The main migration traps are:
- `PCFSoftShadowMap` is gone (removed in r186; `PCFShadowMap` has been soft since r182).
- `Clock` is deprecated in favour of `Timer` (r183).
- `PostProcessing` was renamed `RenderPipeline` (r183).
- `rangeFog` and `viewportResolution` were removed from TSL (r186).
- `CubeUVReflectionMapping` was removed and PMREM rebuilt on cube render targets (r187).
- `setViewport()`/`setScissor()` no longer scale by pixel ratio when a render target is bound (r187).

### Cited findings

**Release timeline (npm version and date)**

| Release | Date | Source |
|---|---|---|
| r180 | 3 Sep 2025 (older info) | [GitHub r180](https://github.com/mrdoob/three.js/releases/tag/r180) |
| r181 | Nov 2025 | [GitHub r181](https://github.com/mrdoob/three.js/releases/tag/r181) |
| r182 | 10 Dec 2025 | [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed) |
| r183 | 18 Feb 2026 (patches to 0.183.2) | [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed) |
| r184 | 16 Apr 2026 | [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed) |
| r185 | 25 Jun 2026 (0.185.1 on 1 Jul) | [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed) |
| r186 | 8 Sep 2026 (0.186.1 on 24 Sep) | [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed) |
| r187 | 30 Oct 2026 | [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed), [GitHub releases](https://github.com/mrdoob/three.js/releases) |

**r180 (Sep 2025, older info)**
- SSRNode got a performance boost and a quality setting.
- SSRNode now uses linear filtering and a half-float reflection buffer.
- SSRPass gained a `resolutionScale` option.

Sources: [GitHub r180](https://github.com/mrdoob/three.js/releases/tag/r180); [newreleases.io r180](https://newreleases.io/project/github/mrdoob/three.js/release/r180).

**r181 (Nov 2025)**
- GGX VNDF importance sampling added to PMREMGenerator.
- TSL gained `isolate()`.
- Y-flip in TextureNode is now handled as a uniform.
- Quaternion `slerp()` was rewritten.

Source: [GitHub releases](https://github.com/mrdoob/three.js/releases).

TRAANode got a new TRAA implementation in the r181 range, plus a ghosting/smearing reduction. An SSGINode entry also appears around r181 ([GitHub r181](https://github.com/mrdoob/three.js/releases/tag/r181), via search snippet; details not verified).

An Inspector for WebGPURenderer (performance, memory and timeline panels) is said to ship "since r181". This claim comes from one secondary guide ([utsubo migration guide](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)). Official notes confirm Inspector work in r182 to r184 (see below).

**r182 (Dec 2025)**
- Shadow mapping was modernised: `PCFShadowMap` is now soft and `PCFSoftShadowMap` is deprecated.
- MeshStandardMaterial and MeshPhysicalMaterial became more physically accurate.
- New manual pages cover WebGPURenderer and its post-processing.
- `colorBufferType` was renamed `outputBufferType`.

Source: [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed).

Official notes for r182:
- Nodes: `StorageInstancedBufferAttribute` support in InstanceNode.
- TSL: `texture3DLoad()` and `texture3DLevel()`.
- Float pack/unpack intrinsics.
- `builtinShadowContext()` and `builtinAOContext()`.
- `DFGApprox` renamed `DFGLUT`.
- WebGPU shadow fixes for VSM, point lights and PCF.
- `getColorBufferType()` renamed `getOutputBufferType()`.
- Inspector gained a mini-panel.
- `LightProbe.fromJSON()` and `SUPPORTS_VERTEX_TEXTURES` were removed.

Source: [GitHub releases](https://github.com/mrdoob/three.js/releases).

**r183 (Feb 2026)**
- `PostProcessing` renamed to `RenderPipeline`. The old name still works but warns.
- Read-write storage textures in TSL.
- Per-instance opacity in BatchedMesh.
- Reversed depth buffer on WebGPURenderer.
- `llms.txt` docs added.
- `Clock` deprecated in favour of `Timer`.
- Breaking:
  - Improved WebGPU shadows, so old shadow bias values may need reducing or removing.
  - `WebGLCubeRenderTarget` no longer works with WebGPURenderer; use `CubeRenderTarget`.
  - `RoomEnvironment` and `Sky` now render differently.

Source: [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed).

Official notes for r183:
- Scriptable node removed.
- Playground archived.
- `TSL.md` spec added.
- Internal renames: `Nodes` became `NodeManager`, and the internal `RenderPipeline` became `RenderObjectPipeline`.
- `shadowMap.color` renamed to `shadowMap.transmitted`.
- Per-attachment MRT blending in WebGPU.
- Inspector Timeline export.

Source: [GitHub releases](https://github.com/mrdoob/three.js/releases).

**r184 (Apr 2026)**
- `compileAsync()` no longer blocks rendering.
- TSL and node materials work on WebGLRenderer through a compatibility layer.
- FSR 1 and TAAU upscaling nodes.
- `LightProbeGrid` addon.
- HTMLTexture.
- Breaking:
  - The deprecated BatchedMesh multi-draw instancing path was removed.
  - Background and environment rotation now follow object rotation.
  - FBXLoader converts Z-up models to Y-up.

Sources: [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed); [GitHub releases](https://github.com/mrdoob/three.js/releases).

Official notes for r184:
- TSL gained hyperbolic math nodes, global/local scopes, and `OnFrameUpdate`/`OnBeforeFrameUpdate` hooks.
- TSL compilation reported as **3.0x faster**.
- `ReadbackBuffer` and partial `getArrayBufferAsync()` readback.
- WEBGL_multi_draw fallback.
- `depth32float` for reversed depth.
- Inspector gained a Memory tab, a Timeline (command recorder), TSL Graph and a `forceWebGL` option.

Source: [GitHub releases](https://github.com/mrdoob/three.js/releases).

**r185 (Jun/Jul 2026)**
- WebXR on WebGPURenderer.
- Clustered (Forward+) lighting.
- WebGPU descriptor classes with caching.
- Rendering to texture arrays.
- Uncaptured GPU errors and WGSL diagnostics surfaced.
- `storageTexture3D` and `lighting.enabled`.
- `registerMaterial()` and `Material.fromJSON()`.
- `Matrix3.scale()`, `.rotate()` and `.translate()` deprecated.
- Breaking:
  - Premultiplied alpha changed in WebGPURenderer.
  - `positionLocal` inside `positionNode` no longer includes skinning; use `positionGeometry`.
  - `TiledLighting` removed.
  - `examples/fonts` dropped from npm.
  - `directionToColor()` and `colorToDirection()` renamed.
  - SSGINode switched to a half-float render target.

Sources: [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed); [GitHub releases](https://github.com/mrdoob/three.js/releases).

**r186 (Sep 2026)**
- New features:
  - `SunLight` addon with cascaded shadow maps (CSM) for both renderers, later reduced to 2 cascades.
  - `compileComputeAsync()`.
  - `DirectRenderPipeline`.
  - Async `dispose()`.
  - Compute `updateBefore`/`updateAfter`.
- Materials:
  - Reworked multi-scattering and energy conservation in PBR; the `BRDF_GGX_Multiscatter` shader was removed.
  - Gaussian splatting addon.
  - Retroreflective MeshPhysicalMaterial.
- Removed:
  - `PCFSoftShadowMap` (renderers warn and fall back to `PCFShadowMap`).
  - The `rangeFog` and `viewportResolution` TSL exports; use `fog(...)` and `screenSize`.
  - Minified builds.
- Deprecated: the CommonJS build.
- Renamed: `Source` to `TextureSource`.
- Changed:
  - Custom Object3D subclasses must call `super.dispose()`.
  - PMREM blur switched to a spiral blur.

Sources: [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed); [GitHub releases](https://github.com/mrdoob/three.js/releases).

**r187 (30 Oct 2026)**
- New features:
  - PMREM rebuilt on cube render targets; `CubeUVReflectionMapping` removed.
  - EON rough-diffuse BRDF in MeshPhysicalMaterial.
  - TSL type promotion.
  - `Texture.mipmapsAutoUpdate`.
  - Depth-only render targets in WebGPURenderer.
  - **Meshlet and visibility-buffer addons.**
  - Spot lights in clustered lighting.
  - `ProxyNodeMaterial`.
  - Parallel pipeline compilation in `compileAsync()`.
  - `FrustumArray` support.
- Deprecated: `iridescenceThicknessRange`, replaced by `iridescenceThicknessMinimum` and `iridescenceThicknessMaximum`.
- Removed: code deprecated in r177.
- Breaking:
  - `setViewport()`/`setScissor()` no longer scale by pixel ratio when a render target is bound.
  - TSL struct storage buffers are always arrays.
  - Custom lights use `CustomLight.registerNode()`.
  - An error is thrown if `count` and `dispatchSize` are used together in compute.

Sources: [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed); [GitHub releases](https://github.com/mrdoob/three.js/releases).

Other r187 notes from secondary sources:
- `ColorManagement.fromWorkingColorSpace` and `toWorkingColorSpace` are reportedly removed but not listed in the migration guide.
- XR camera position and projection now come from the first sub-camera.
- Both renderers use WeakRef/FinalizationRegistry internally.
- About 80% of changed core lines were WebGPU-renderer side.

Sources: [techbycountry blog](https://techbycountry.blogspot.com/2026/10/three-js-r187-release-new-features-explained.html); [sirocco18 analysis](https://sirocco18.jp/journal/en/threejs-r187.html).

**Clock to Timer migration**
- Use `new THREE.Timer()`, then `timer.connect(document)`, which pauses the timer while the page is hidden.
- Call `timer.update()` once per frame before `getDelta()`.

Source: [utsubo migration guide](https://www.utsubo.com/blog/webgpu-threejs-migration-guide).

**Import paths**
- Renderer: `three/webgpu`.
- TSL: `three/tsl`.

Source: [utsubo migration guide](https://www.utsubo.com/blog/webgpu-threejs-migration-guide).

**R3F shadows note**
- The Tres.js (Vue) project defaults to `PCFShadowMap` on WebGPU since r186 ([Tres PR #1508](https://github.com/Tresjs/tres/pull/1508)).
- One guide suggests R3F `shadows="percentage"` ([utsubo migration guide](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)).

### Inferences
- Modern code should:
  - import from `three/webgpu` and `three/tsl`;
  - use `RenderPipeline` with `pass()` and TSL nodes instead of `EffectComposer`;
  - use `Timer`, not `Clock`;
  - use `PCFShadowMap` or VSM, never `PCFSoftShadowMap`;
  - use `screenSize`, not `viewportResolution`;
  - use `positionGeometry` for pre-skinning positions;
  - await `renderer.init()`, or use `setAnimationLoop`, before rendering.
- Code that hand-computes pixel-ratio-scaled viewports on render targets breaks in r187.
- Avoid UMD/CJS/minified builds; ESM only.

### Gaps
- Exact r180 and r181 feature lists were not fully read; the r181 notes were truncated.
- The official migration-guide wiki was not fetched.
- I could not confirm the exact release in which the Inspector replaced stats.js as the recommended performance tool.
- The precise MRT API changes (beyond per-attachment blending in r183 and MRT use in Codrops tutorials) were not verified.

---

## 2. WebGPURenderer and TSL best practices, WebGL fallback, browser support

### Takeaway
WebGPURenderer is production-usable and automatically falls back to a WebGL 2 backend. Since r184, TSL and node materials also run on WebGLRenderer through a compatibility layer, so TSL is the forward-looking shader language for both. WebGPU now ships by default in:
- Chrome and Edge, desktop and Android 12+;
- Safari 26 on macOS, iOS, iPadOS and visionOS (caniuse marks this "partial");
- Firefox on Windows (141+) and Apple-silicon macOS (145+).

Firefox on Linux and Android was still not on by default as of the latest sources.

### Cited findings
- WebGPURenderer is enabled by default in Chrome, Edge, Safari 26 and Firefox (some platforms) and falls back automatically to WebGL 2. Gains are scene-dependent, and some forum users report it running slower than WebGL ([utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed)).
- Firefox support by version and platform:
  - Firefox 141 shipped WebGPU on Windows; Firefox 145 added Apple-silicon macOS.
  - Linux and Android were pre-release only as of Aug 2026.
  - caniuse lists Firefox for Android as "disabled by default" through v160.

  Sources: [caniuse WebGPU](https://caniuse.com/webgpu); [Wikipedia WebGPU](https://en.wikipedia.org/wiki/WebGPU).
- Chrome on Android has had WebGPU since Chrome 121, on Android 12+ devices with Qualcomm/ARM GPUs ([web.dev](https://web.dev/blog/webgpu-supported-major-browsers)).
- Safari 26 supports WebGPU on macOS, iOS, iPadOS and visionOS. caniuse marks Safari desktop 26.0 to 27.1 as "partial" and iOS 26.0 to 26.6 as supported ([caniuse](https://caniuse.com/webgpu); [webgpu.com](https://webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers/)).
- TSL and node materials run on WebGLRenderer via a compatibility layer since r184 ([utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed)).
- The Inspector has a `forceWebGL` option for testing the fallback path (r184) ([GitHub releases](https://github.com/mrdoob/three.js/releases)).
- `compileAsync()` is non-blocking since r184 and compiles pipelines in parallel since r187. `compileComputeAsync()` arrived in r186 ([GitHub releases](https://github.com/mrdoob/three.js/releases)).
- Reversed depth buffer is available since r183, with `depth32float` since r184 ([utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed); [GitHub releases](https://github.com/mrdoob/three.js/releases)).
- Post-processing on the two renderers:
  - pmndrs `postprocessing` / `EffectComposer` do not run on WebGPURenderer.
  - Use three.js's built-in `RenderPipeline` with TSL nodes.

  Sources: [utsubo migration guide](https://www.utsubo.com/blog/webgpu-threejs-migration-guide); [threejsresources](https://threejsresources.com/best/post-processing).
- Tres.js is adding a `/webgpu` EffectComposer and `defineEffect` ([Tres PR #1554](https://github.com/Tresjs/tres/pull/1554)).
- TSL builds shaders as a node graph, so JS loops are unrolled at shader compile time ([Codrops liquid glass grid](https://tympanus.net/codrops/2026/09/08/building-an-infinite-liquid-glass-grid-with-three-js-webgpu-and-tsl/)).
- WebGPU-only-feature caveat: WGSL diagnostics and uncaptured GPU errors are surfaced since r185 ([GitHub releases](https://github.com/mrdoob/three.js/releases)).

### Inferences
- **When to choose which renderer:**
  - Default to WebGPURenderer with TSL for new projects. You get compute, storage buffers and textures, indirect draws, clustered lighting, meshlets, and the modern post stack, and the WebGL 2 fallback covers Firefox on Linux and Android and older devices.
  - Stay on WebGLRenderer with GLSL when you depend on WebGL-only libraries (pmndrs postprocessing, `onBeforeCompile` hacks, three-gpu-pathtracer) or must maximise older mobile reach.
- Compute-heavy effects (GPU particles, cloth) do not run with WebGPU-level efficiency on the WebGL fallback. Design graceful degradation, for example lower particle counts when `renderer.backend.isWebGLBackend`; this flag name comes from general knowledge, not a fetched source.
- Always test with the Inspector's `forceWebGL` option.

### Gaps
- No primary Chrome, WebKit or Mozilla release notes were fetched. Exact Safari "partial" gaps (which features are missing) are unknown.
- No primary data on Firefox Android shipping in late 2026; one secondary source says it was "targeted late 2026".
- Market-share figures for WebGPU availability were not found.

---

## 3. Advanced rendering techniques available on the web now

### Takeaway
Core three.js plus its addons now cover:
- SSR (SSRNode);
- SSGI (SSGINode);
- TRAA (TRAANode);
- AO (built-in AO context, GTAO node);
- FSR 1 and TAAU upscaling;
- cascaded shadows (SunLight);
- clustered Forward+ lighting;
- LightProbeGrid irradiance volumes;
- Gaussian splats;
- meshlets with visibility buffer (virtual-geometry building blocks, r187);
- improved PBR (multi-scatter energy conservation, EON diffuse, retroreflection).

GPU compute in TSL drives particles, cloth and procedural geometry.

### Cited findings
- SSRNode: quality setting, half-float buffer (r180) ([GitHub r180](https://github.com/mrdoob/three.js/releases/tag/r180)).
- SSGINode: added around r181, half-float render target since r185 ([search snippet of GitHub releases](https://github.com/mrdoob/three.js/releases)).
- TRAANode: reimplemented around r181, with ghosting reduction ([GitHub r181](https://github.com/mrdoob/three.js/releases/tag/r181)).
- FSR 1 and TAAU upscaling nodes (r184) ([utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed)).
- LightProbeGrid addon (r184) ([utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed)).
- Clustered (Forward+) lighting (r185), with spot lights added in r187 ([utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed)).
- SunLight with cascaded shadow maps (r186) ([GitHub releases](https://github.com/mrdoob/three.js/releases)).
- Meshlet and visibility-buffer addons (r187) ([utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed)).
- PBR improvements:
  - Multi-scatter and energy conservation rework (r186);
  - EON rough diffuse (r187);
  - GGX VNDF importance-sampled PMREM (r181).

  Sources: [utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed); [GitHub releases](https://github.com/mrdoob/three.js/releases).
- The physically based Sky/`RoomEnvironment` render differently since r183 ([utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed)).
- Babylon.js 9.0 (Mar 2026) has a Physically Based Atmosphere addon and a volumetric lighting system ([Windows Dev Blog](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/)).
- GPU cloth simulation in TSL compute passes ([Codrops, Sep 2026](https://tympanus.net/codrops/2026/09/08/building-an-infinite-liquid-glass-grid-with-three-js-webgpu-and-tsl/)).
- Instanced procedural geometry with TSL node materials and three-mesh-bvh picking ([Codrops, Aug 2026](https://tympanus.net/codrops/2026/08/11/exploring-procedural-geometry-with-three-js-and-webgpu/)).
- Path tracing:
  - The pmndrs org has a "pathtracer" repo described as "WebGPU Pathtracing and Raytracing for our Rendering Ecosystem", updated 21 Nov 2026 ([pmndrs GitHub](https://github.com/pmndrs)).
  - I found nothing current on three-gpu-pathtracer (WebGL-based; older info).
- Relighting 2D images with depth maps in TSL (a form of learned-depth or 2.5D rendering) ([Codrops, Aug 2026](https://tympanus.net/codrops/2026/08/19/relighting-images-with-depth-maps-and-three-js/)).

### Inferences
- A "best-looking" modern three.js pipeline is:
  1. Build MRT outputs: colour, normals, depth, velocity.
  2. Run screen-space effects: SSGI or GTAO, then SSR.
  3. Apply TRAA.
  4. Add bloom.
  5. Tone map with AgX/Neutral.
  6. Upscale with FSR or TAAU on mobile.

  Add SunLight CSM, a LightProbeGrid for indirect lighting, and an HDR environment from PMREM.
- The meshlet and visibility-buffer addons are early building blocks toward Nanite-like virtual geometry. They are probably experimental.

### Gaps
- No verified current sources on:
  - virtual texturing on the web;
  - realistic water (FFT ocean) libraries;
  - GPU-driven grass and foliage libraries;
  - volumetric clouds in three.js;
  - neural / learned rendering in production web apps;
  - the current status of three-gpu-pathtracer.
- Whether GTAO and SSGI are combined in the official `webgpu_postprocessing_ssgi` example was not verified.

---

## 4. Gaussian splatting on the web

### Takeaway
**Spark 2.0** (World Labs; open source; three.js; preview announced 14 to 15 Apr 2026) adds:
- a streamable continuous-LoD splat tree;
- the `.RAD` file format, fetched with HTTP Range requests;
- 100M+ splat worlds on any device, including mobile and VR, on WebGL2.

PlayCanvas is the other leader: engine 2.19 to 2.24 brought a compute-based WebGPU splat renderer, relighting and shadows. Babylon.js 9 adds splat shadows and SOG. three.js itself gained a Gaussian splatting addon in r186.

### Cited findings
- Spark 2.0 core claims:
  - Streams massive 100M+ splat worlds "to any device from mobile to VR using WebGL2".
  - Uses Rust compiled to WASM for asynchronous LoD updates.

  Sources: [sparkjs on X](https://x.com/sparkjsdev/status/2044090505982816449); [World Labs blog](https://worldlabs.ai/blog/spark-2.0).
- Spark 2.0 details:
  - LoD trees are built with `tiny-lod` (fast, in-browser) or `bhatt-lod` (quality, via the `build-lod` CLI).
  - The per-frame splat budget defaults to 500K to 2.5M depending on device type.
  - A shared GPU splat pool defaults to 16M splats.
  - `ExtSplats` use 32 bytes per splat with float32 centres; `PackedSplats` use 16 bytes.
  - Covariance splats (experimental), multiple SparkRenderers and SparkPortals.
  - Huge files load through `ReadableStream`.
  - Experimental linear blend skinning and SparkXr.

  Source: [Spark 2.0 features](https://sparkjs.dev/docs/new-features-2.0/).
- Spark's programmable GPU pipeline per splat supports SDF clipping, animated transitions and 4DGS interpolation, with a two-pass radix sort in a Web Worker ([sparkjs on X](https://x.com/sparkjsdev/status/2044090524286714175)).
- The Spark 2.0 docs are still labelled "2.0.0-preview" ([Spark LoD rendering docs](https://sparkjs.dev/2.0.0-preview/docs/new-spark-renderer/)).
- PlayCanvas splat timeline:
  - Engine 2.17: f16 spherical harmonics, GPU sorting, global splat budget on WebGPU ([cinevva](https://app.cinevva.com/news/2026-03-06-playcanvas-v217-webgpu-splatting)).
  - Engine 2.19: compute-based WebGPU splat renderer (culling, projection and radix sort in compute) ([radiancefields](https://radiancefields.com/platforms/playcanvas)).
  - Engine 2.20: relighting, soft shadows, DoF, clipping, "billions of splats, even in VR under WebGPU", procedural skies, physics joints and ragdolls ([PlayCanvas on X](https://x.com/playcanvas/status/2069782916196929704); [forum](https://forum.playcanvas.com/t/engine-v2-20-0/42387)).
  - Engine 2.23.0 released 1 Oct 2026; SuperSplat 3.8 uses engine 2.24 ([radiancefields](https://radiancefields.com/platforms/supersplat)).
- SuperSplat Editor 3.0 (Sep 2026) was rebuilt on WebGPU. On a 4.4M-splat scene, idle memory fell from 1,557 MB to 105 MB ([CG Channel](https://www.cgchannel.com/2026/09/playcanvas-releases-supersplat-editor-3-0/); [PlayCanvas blog](https://blog.playcanvas.com/new-in-supersplat-webgpu-and-streaming-bring-huge-performance-wins/)).
- Babylon.js 9.0 supports splat shadow casting, the SOG/SOGS format alongside .splat/.ply/.spz, and triangle splatting (announced) ([radiancefields](https://radiancefields.com/babylon.js-v9.0-3dgs-gets-shadows-sogs-and-triangle-splatting-support-announced)).
- three.js r186 added a Gaussian splatting addon ([utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed)).

### Inferences
- For three.js, Spark is the de facto splat renderer. Its splats render inside a normal three.js scene, so meshes and splats mix with depth.
- Mobile limits are handled with LoD budgets of about 500K splats on mobile, the low end of the default range.
- Relighting splats in three.js is less mature than in PlayCanvas 2.20.

### Gaps
- Spark 2.0 final (non-preview) release status in Nov 2026 is unconfirmed.
- No sourced details on Spark WebGPU support or Spark relighting.
- The capabilities of the three.js r186 splat addon were not verified.
- No sourced mobile memory and FPS benchmarks.

---

## 5. Ecosystem: R3F, drei, postprocessing, physics, Babylon, PlayCanvas, Needle

### Takeaway
- **React Three Fiber:** R3F v9 (React 19) is the stable line. R3F v10 is in alpha (alpha.6) and goes "WebGPU first": the default Canvas uses WebGPURenderer, WebGL moves to `@react-three/fiber/legacy`, and TSL hooks move to `@react-three/tsl`. It requires three ≥0.185 and React 19.0 to <19.4. Drei had no release for fiber 10 yet.
- **Babylon.js:** 9.0 shipped in Mar 2026.
- **PlayCanvas:** engine is at about 2.24.
- **Needle Engine:** 6.0 alpha bundles three r185.

### Cited findings
- R3F v10.0.0-alpha.6, "Going WebGPU First":
  - WebGPU is the default renderer.
  - Peer requirements are three ≥0.185 and React 19.0 to <19.4.
  - WebGL Canvas and createRoot live at `@react-three/fiber/legacy`, which is needed for GLSL ShaderMaterial, `onBeforeCompile` and pmndrs postprocessing.
  - TSL hooks moved to `@react-three/tsl`.

  Sources: [R3F alpha.6 release](https://github.com/pmndrs/react-three-fiber/releases/tag/v10.0.0-alpha.6); [v10 migration](https://r3f.docs.pmnd.rs/next/migration/v10); [breaking changes](https://r3f.docs.pmnd.rs/next/migration/breaking-changes).
- The R3F docs advise stable users to stay on v9. The v10 migration docs state that drei has no release for fiber 10 yet ([v10 migration](https://r3f.docs.pmnd.rs/next/migration/v10)).
- R3F v10 alpha.6 remaining release work is tracked in [issue #4026](https://github.com/pmndrs/react-three-fiber/issues/4026). A pmndrs Advanced R3F workshop ran in Paris on 8 to 9 Sep 2026 ([r3f.paris](https://www.r3f.paris/)).
- pmndrs `postprocessing` remains WebGL-only. For WebGPU, use three's `RenderPipeline` ([utsubo](https://www.utsubo.com/blog/webgpu-threejs-migration-guide); [threejsresources](https://threejsresources.com/best/post-processing)).
- Babylon.js 9.0 (blog dated 26 Mar 2026; another article says 5 Apr) includes:
  - clustered lighting;
  - area-light emission textures;
  - volumetric lighting;
  - a Node Particle Editor;
  - large-world rendering (floating-origin precision) and a Geospatial camera;
  - animation retargeting;
  - a rebuilt Inspector;
  - Frame Graph v1;
  - a Physically Based Atmosphere addon;
  - an Outline renderer;
  - Gaussian splat shadows and SOG.

  Sources: [Windows Dev Blog](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/); [Babylon Medium](https://babylonjs.medium.com/welcome-to-babylon-js-9-0-c3edc9ee6428); [cinevva](https://app.cinevva.com/news/2026-03-26-babylonjs-9).
- PlayCanvas engine 2.x: see section 4. Engine 2.20 also added procedural skies and physics joints/ragdolls ([PlayCanvas on X](https://x.com/playcanvas/status/2069782916196929704)).
- Needle Engine: 6.0.0-alpha.1 bundles three.js r185 and updates the MaterialX runtime; 6.0.0-alpha.2 is dated 30 Jul 2026. Stable 5.1.x docs exist ([Needle changelog](https://engine.needle.tools/docs/reference/changelogs/needle-engine); [jsDelivr changelog](https://cdn.jsdelivr.net/npm/@needle-tools/engine@6.0.0-alpha.1/CHANGELOG.md)).

### Inferences
- An agent writing React code today should:
  - target R3F v9 and drei for stability, with WebGLRenderer and pmndrs postprocessing; or
  - target R3F v10 alpha for WebGPU, writing TSL materials and three's `RenderPipeline` without drei.
- Mixing pmndrs postprocessing with WebGPURenderer is a common outdated pattern to avoid.

### Gaps
- No current sources were found for:
  - Theatre.js status (believed largely dormant since 2024; unverified);
  - Rapier versions or Jolt Physics (JoltPhysics.js) WASM versions for 2026;
  - a drei v11 release;
  - three-gpu-pathtracer updates.
- Whether Needle Engine exposes WebGPURenderer was not confirmed.

---

## 6. Most impressive recent showcases and their techniques

### Takeaway
2026 Codrops tutorials are dominated by three.js WebGPURenderer and TSL. Recurring techniques:
- TSL compute simulations (cloth, particles);
- MRT-based selective bloom;
- noise-driven dissolve shaders;
- glass and refraction;
- procedural instanced geometry;
- depth-map relighting of images.

### Cited findings
- "WebGPU Gommage Effect" (28 Jan 2026): MSDF text dissolved by a noise-driven TSL shader, particles, and selective bloom via MRT ([Codrops](https://tympanus.net/codrops/2026/01/28/webgpu-gommage-effect-dissolving-msdf-text-into-dust-and-petals-with-three-js-tsl/)).
- "Garden Anomaly" (6 Aug 2026): WebGPU and TSL with physics, glass deformation and procedural sound ([Codrops](https://tympanus.net/codrops/2026/08/06/garden-anomaly-a-tiny-webgpu-and-tsl-experiment/)).
- "Exploring Procedural Geometry with Three.js and WebGPU" (11 Aug 2026): instancing, TSL node materials and three-mesh-bvh ([Codrops](https://tympanus.net/codrops/2026/08/11/exploring-procedural-geometry-with-three-js-and-webgpu/)).
- "Interactive 3D Cluster with Three.js, TSL and Three Start" (12 Aug 2026): noise and post-processing ([Codrops](https://tympanus.net/codrops/2026/08/12/creating-an-interactive-3d-cluster-with-three-js-tsl-and-three-start/)).
- "Relighting Images with Depth Maps" (19 Aug 2026) ([Codrops](https://tympanus.net/codrops/2026/08/19/relighting-images-with-depth-maps-and-three-js/)).
- "Infinite Liquid Glass Grid" (8 Sep 2026): GPU cloth simulation in TSL compute passes ([Codrops](https://tympanus.net/codrops/2026/09/08/building-an-infinite-liquid-glass-grid-with-three-js-webgpu-and-tsl/)).
- Other 2026 Codrops entries:
  - persistent WebGPU page transitions (30 Jun);
  - dual-scene fluid X-ray reveal (23 Mar);
  - custom-brush cursor trail in TSL (24 Sep).

  Source: [Codrops webgpu tag](https://tympanus.net/codrops/tag/webgpu/); [Codrops TSL tag](https://tympanus.net/codrops/tag/tsl/).
- Splat showcases: Spark 2.0 demos of 100M+ splat worlds ([World Labs blog](https://worldlabs.ai/blog/spark-2.0)) and SuperSplat 3.0 handling tens of millions of Gaussians ([PlayCanvas on X](https://x.com/playcanvas/status/2097307578690584721)).

### Inferences
- The "award-winning" web look in 2026 is:
  - WebGPU and TSL;
  - compute-driven motion;
  - MRT selective bloom with tone mapping;
  - glass and refraction;
  - noise-based transitions;
  - splat scenes for photoreal environments.

### Gaps
- No Awwwards Site-of-the-Day or SOTY 2026 entries, three.js forum showcase threads, or specific X/Twitter creators were verified in this pass.
- The Codrops items for Oct and Nov 2026 were not identified.
