# Blender and game engines in the AI era: automation, AI integration and AI game creation (state as of 24 Nov 2026)

Research method: 19 tool calls (extended web search plus a few official-page fetches). blender.org main-site release pages returned HTTP 403 to the fetcher, but developer.blender.org docs were readable. Many 2026 "AI + engine" sources are vendor blogs (StraySpark, Cinevva, Summer Engine, Ziva) that sell competing tools. They are flagged where used.

---

## 1. Blender releases (4.5 LTS -> 5.x): headline features and what matters for web/game assets

### Takeaway
The current stable release is **Blender 5.3 (10 Nov 2026)**. Supported LTS lines are **5.2 LTS (14 Jul 2026, supported to Jul 2028)** and **4.5 LTS (15 Jul 2025, supported to Jul 2027)**, and 5.4 is in alpha. For web and game asset work, the most useful recent changes are in 5.2's glTF exporter: meshopt compression export, point clouds, iridescence/dispersion and KHR primitive attributes. 5.2 also brought experimental Geometry-Nodes-based hair/cloth physics and 5.1's Vulkan performance work. Any source calling 4.5 or 5.0 "latest" is outdated.

### Cited Findings
- **Release table (official):** 5.4 alpha; **5.3 current stable, 10 Nov 2026**; **5.2 LTS 14 Jul 2026, supported until Jul 2028**; **4.5 LTS 15 Jul 2025, supported until Jul 2027**. 5.1 (17 Mar 2026) and 5.0 (18 Nov 2025) are no longer supported. Cadence is about one release every 4 months, plus one LTS per year maintained for 2 years. — [Blender Developer Docs, Release Notes index](https://developer.blender.org/docs/release_notes/)
- **Blender 5.0 (Nov 2025) highlights:** ACES 1.3/2.0 workflows and an HDR/wide-gamut color pipeline (HDR display on Linux needs Vulkan + Wayland). Also a major Video Sequencer overhaul, Grease Pencil motion blur and a Pen tool, and Cycles' default volume method switched to null-scattering. — [It's FOSS](https://itsfoss.com/news/blender-5-0-release/); [Digital Production](https://digitalproduction.com/2025/11/20/blender-5-0-its-here/)
- 5.0 also added a **volume grid data type in Geometry Nodes** (OpenVDB grids) and handling of much larger .blend files and scenes with millions of vertices. — [Digital Production](https://digitalproduction.com/2025/11/20/blender-5-0-its-here/)
- 5.0 improved Vulkan viewport support across GPUs and drivers, removed big-endian support, and switched point caches to Zstd. — [Phoronix](https://www.phoronix.com/news/Blender-5.0-Released)
- 5.0 added compositor presets and saved node groups. — [Blender Vitals](https://blendervitals.beehiiv.com/p/the-biggest-features-in-blender-5-0/)
- **Blender 5.1 (17 Mar 2026):** a "major performance boost on Vulkan" and faster GPU shader compilation through shader-source preprocessing. glTF fixes cover a crash on import with missing GPU-instancing properties and light normalization/temperature conversion on export. — search summary of [blender.org 5.1](https://www.blender.org/download/releases/5-1/) (the page itself was not fetched directly because of the 403)
- **Blender 5.2 LTS:** its largest addition is an **experimental Geometry Nodes physics system for procedural hair and cloth simulation**. — search summary citing [blender.org 5.2](https://www.blender.org/releases/5-2/) and [Phoronix 5.2](https://www.phoronix.com/news/Blender-5.2-Released) (not verified on the official sub-page)
- **5.2 glTF exporter (official Pipeline & I/O notes):** point cloud export; **`EXT_meshopt_compression` and `KHR_meshopt_compression` export**; `KHR_materials_iridescence` and `KHR_materials_dispersion` export; glTF **Hooks can now stop an export**; official KHR primitive attributes export. Performance work includes inline materials where possible and faster animation export with the viewport disabled. Nodes are now sorted by name. — [Blender 5.2 Pipeline & I/O](https://developer.blender.org/docs/release_notes/5.2/pipeline_io/)
- **5.2 glTF importer:** point cloud import, KHR primitive attributes, iridescence/dispersion, meshopt support, and a fix for a multi-custom-attribute crash. **USD** gained color-space support and a flush-frequency option to cut peak memory. **Alembic** gained visibility and camera animation import. — [Blender 5.2 Pipeline & I/O](https://developer.blender.org/docs/release_notes/5.2/pipeline_io/)
- The 5.2 notes have **no entries for KTX2, Draco, FBX, OBJ or LOD**. — [Blender 5.2 Pipeline & I/O](https://developer.blender.org/docs/release_notes/5.2/pipeline_io/)
- **5.2 Python API / compatibility breaks:** the Python API for Geometry Nodes modifier properties changed; `paint.eraser_brush*` was removed; GN tool asset files must be re-saved; socket identifiers changed for the Compare and Random Value nodes; meshes created from scratch in GN no longer share the object's original mesh name. — [Blender 5.2 LTS Release Notes](https://developer.blender.org/docs/release_notes/5.2/)
- **5.3 and Vulkan default:** one secondary source says the 5.3 alpha notes make "Vulkan backend now default on Windows (not ARM) and Linux". This was **not confirmed** on official notes. — search summary referencing [Releasebot](https://releasebot.io/updates/blender) / [blendertutoring](https://www.blendertutoring.com/blog/blender-5-features)
- 5.2.x point releases included a Vulkan fix for a "Missing features are [VK_KHR_swapchain]" message on a future driver. The official site lists 5.2.4 as of 10 Nov 2026. — search summary of [blender.org 5.2](https://www.blender.org/releases/5-2/)
- Third-party game-dev guides discuss add-on breakage across the 5.x jump. They are vendor blogs and were not read in full. — [StraySpark 5.2 upgrade guide](https://www.strayspark.studio/blog/blender-5-2-lts-released-game-developer-upgrade-guide); [Cinevva, Blender 5 for game artists](https://app.cinevva.com/guides/blender-5-for-game-artists)

### Inferences
- For a web pipeline, **5.2 LTS is the sensible pin**: it is supported to 2028, can export meshopt-compressed GLB natively, and is the newest LTS. Use 5.3 only if a specific feature such as the official MCP server (needs 5.1+) or the Vulkan default matters.
- Scripts written for 4.x/5.0 that touch Geometry Nodes modifier inputs via Python are likely to break on 5.2. Agents should target one pinned version.
- KTX2/Basis texture compression is still not part of the native exporter according to the 5.2 notes. It would be done after export (e.g. with glTF-Transform), but no 2026 source confirming this tooling was retrieved.

### Gaps
- EEVEE (EEVEE Next shipped in 4.2) and Cycles details for 5.1–5.3 were not retrieved. blender.org release pages returned 403.
- The exact 5.3 feature list (Vulkan default, GN additions, Python API changes) is unconfirmed.
- Blender 4.5 LTS headline features (e.g. Vulkan maturity) were not retrieved in this pass.

---

## 2. Automating Blender: headless, bpy module, Geometry Nodes via Python, baking, batch export, MCP/AI add-ons

### Takeaway
Blender can be driven entirely from code in two ways: the CLI (`blender -b file.blend --python script.py`) or **`pip install bpy`**. The bpy package tracks releases (5.0.x on PyPI, alongside 4.5.x LTS) and is locked to one CPython version (3.11 for 5.0). For agent control of a live Blender, there is now an **official Blender Lab MCP server**. It is experimental, needs Blender 5.1+, is distributed via Blender Extensions and is reportedly used by Claude's Blender connector. The popular community `blender-mcp` by ahujasid was **renamed "mcp-for-blender" in Sept 2026** and still supports older Blender (3.0+).

### Cited Findings
- **bpy on PyPI:** bpy 5.0.0 and 5.0.1 are listed alongside the 4.5.x LTS line, as CPython 3.11 wheels for Windows/Linux/macOS. Versions outside the current LTS window are removed from PyPI but kept at download.blender.org. Each Blender release supports exactly one Python version. The PyPI page's example command is stale (`bpy==3.6.0`). — [PyPI bpy 5.0.0](https://pypi.org/project/bpy/5.0.0/); [PyPI bpy](https://pypi.org/p/bpy)
- Third-party type stubs for the 5.0 API (`blender-python-stubs>=5.0,<5.1`) help autocompletion and type checking for agent-written scripts. — [PyPI blender-python-stubs](https://pypi.org/project/blender-python-stubs/5.0.1.0/)
- Background on the bpy module's origin. — [Simon Willison, "Blender on PyPI" (2023)](https://www.simonwillison.net/2023/Sep/8/blender-on-pypi)
- **Official MCP server:** maintained by **Blender Lab** (Blender Foundation). It is described as official but **experimental, "outside the current Blender roadmap"**, **requires Blender 5.1+**, and its add-on is distributed via the official Blender Extensions platform. Docs are at blender.org/lab/mcp-server. Claude's Blender connector reportedly uses this server. Version numbers (1.0.0–1.0.3) and dates differ between aggregators. — [StraySpark comparison](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026); [Voyager](https://voyager.so/blog/blender-mcp); [aztech3d](https://aztech3d.com/en/guides/blender-mcp-official-vs-community/); [mcp.film Blender Lab MCP](https://mcp.film/mcps/blender-lab-mcp/) (aggregators; the blender.org page itself returned 403)
- **Community server:** the ahujasid project was **renamed "mcp-for-blender" (Sept 2026)** to avoid confusion with the official one, and supports Blender 3.0+. — [mcp.film overview](https://mcp.film/apps/blender/); [mcp.so](https://mcp.so/servers/blender-mcp)
- Other integrations: Griptape Nodes documents a Blender MCP server; "3d-agent" markets an agent with no MCP setup needed. — [Griptape docs](https://docs.griptapenodes.com/en/stable/guides/mcp/servers/blender/); [3d-agent.com](https://3d-agent.com/blender-mcp)
- The 5.2 Python API changed how Geometry Nodes modifier properties are accessed, which matters for scripts that set GN inputs procedurally. — [Blender 5.2 release notes](https://developer.blender.org/docs/release_notes/5.2/)
- The 5.2 glTF exporter supports **Hooks that can abort the export** and has faster animation export. Both help batch pipelines validate assets. — [Blender 5.2 Pipeline & I/O](https://developer.blender.org/docs/release_notes/5.2/pipeline_io/)

### Inferences
- **How an agent should drive Blender:**
  - Use headless batch scripts (`blender -b -P script.py -- args`) or `bpy` in a Python 3.11 venv for reproducible CI-style generation: procedural mesh, Geometry Nodes modifier, bake, GLB export.
  - Use MCP (official Blender Lab for 5.1+, community mcp-for-blender for older) only for interactive scene editing with a GUI and screenshots.
  - MCP is not needed in a headless sandbox. Plain bpy scripts are more deterministic.
- **Typical headless recipe** (standard bpy patterns, not re-verified against 5.3 docs):
  - procedural geometry via `bmesh` or by adding a GN modifier that references a node group asset;
  - Cycles bake (`bpy.ops.object.bake(type='AO'|'DIFFUSE'|'COMBINED')`) into an image, saved with `image.save_render`;
  - LOD via Decimate modifiers at ratios such as 1.0/0.5/0.25;
  - `bpy.ops.export_scene.gltf(filepath=..., export_format='GLB', ...)` with Draco, or, from 5.2, native meshopt;
  - KTX2 textures via external glTF-Transform.
- The official MCP being "outside the roadmap" means it should be treated as experimental. Breaking changes are plausible.

### Gaps
- No official doc was retrieved confirming the exact 5.x glTF exporter parameter names (e.g. meshopt flag), nor the bpy 5.2/5.3 wheels on PyPI. Only 5.0.x was confirmed.
- No sources were retrieved on AI add-ons beyond MCP (e.g. in-Blender LLM assistants, AI texture tools) or on their maturity.
- No 2026 source covered LOD-generation add-ons or the state of glTF-Transform/KTX2 tooling.

---

## 3. Game engines with AI integration: Godot, Unity, Unreal, Bevy, Defold (web/mobile, zero cost, licensing)

### Takeaway
- **Godot (4.7, Jun 2026; 4.7.2 Aug 2026)** has no official AI/MCP. It has many third-party MCP plugins. Its web export is still **WebGL 2 only** (wasm64 added in 4.7), and **C# projects still cannot export to web**. It is MIT-licensed and free.
- **Unity** made its **MCP server and Unity CLI free (announced July 2026)**. The in-editor Unity AI Assistant stays paid on Personal (about $10/month after trial) and is in beta. Unity Personal is free under $200K revenue+funding.
- **Unreal 5.7 (Nov 2025)** shipped an in-editor **AI Assistant** (F1 contextual help plus C++ generation). MCP comes from community plugins (Epic's official MCP status is unclear).
- **Bevy 0.20 (Oct 2026)** supports WebGPU and WebGL 2 on the web.
- For zero-cost web/mobile output by a small team driving the engine with an AI agent, **Godot (GDScript) or a code-first web stack (three.js) remain the most frictionless choices**.

### Cited Findings
**Godot**
- Godot 4.6-stable was released **26 Jan 2026** (polish/performance focus). Wikipedia lists **4.7.2 as current stable (18 Aug 2026)**. — [Godot 4.6 download archive](https://godotengine.org/download/archive/4.6-stable/); [Wikipedia Godot](https://en.wikipedia.org/wiki/Godot_(game_engine))
- Godot **4.7 stable is dated 18 Jun 2026** (another source says 19 Jun). Headlines: HDR output, AreaLight3D, a rebuilt Asset Store, and **wasm64 web exports** that lift the 4 GB heap limit on browsers supporting 64-bit wasm. — [Godot 4.7 download](https://godotengine.org/download/archive/4.7-stable/); [Cinevva news](https://app.cinevva.com/news/2026-06-19-godot-4-7-released)
- Web export in 4.7 is **still WebGL 2.0 via the Compatibility renderer**. A source retracted an earlier claim of WebGPU behind a flag. HDR output is unsupported on Web/Android/X11. — [Cinevva news](https://app.cinevva.com/news/2026-06-19-godot-4-7-released)
- Official docs: "Projects written in C# using Godot 4 currently cannot be exported to the web." — [Godot 4.7 docs, Exporting for the Web](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html)
- **Third-party Godot MCPs:**
  - IvanMurzak/Godot-MCP (C#, Apache-2.0, with a cloud link to ai-game.dev) — [GitHub](https://github.com/IvanMurzak/Godot-MCP)
  - tomyud1/godot-mcp (MCP server + plugin) — [GitHub](https://github.com/tomyud1/godot-mcp)
  - godot-dotnet-mcp (4.6+, live editor state, scene editing, runtime control, screenshots) — [GitHub](https://github.com/LuoxuanLove/godot-dotnet-mcp)
  - Godot MCP Toolkit (4.2–4.7) — [Godot Asset Store](https://store.godotengine.org/asset/npgamedev/godot-mcp-toolkit/)
  - Funplay MCP (tested on 4.6.3) — [Godot Asset Store](https://store.godotengine.org/asset/funplay/funplay-godot-mcp/)
  - "Godot AI" 3.2.5 is the final build for 4.5/4.6; newer versions require 4.7+ — [Godot Asset Library](https://godotengine.org/asset-library/asset/5050)

**Unity**
- **Unity AI** went to open beta (around May 2026) with an in-editor agent, an AI Gateway and an MCP server. Initially MCP was tied to a paid plan: Personal got a 14-day trial with 1,000 credits, then $10/month, and community backlash followed. — [Cinevva news](https://app.cinevva.com/news/2026-05-04-unity-ai-open-beta); [Unity Discussions thread](https://discussions.unity.com/t/request-for-official-clarification-unity-mcp-access-subscription-requirements-and-future-policy/1720323)
- **15 Jul 2026:** Unity announced the **Unity CLI**. The CLI, the MCP server (`unity mcp`) and the official plugin are **free, need no AI subscription, and have no concurrency limits**. The MCP inside the Assistant package is **deprecated**. The in-editor Assistant remains paid on Personal and is in beta. — [StraySpark "Is Unity MCP free"](https://www.strayspark.studio/blog/is-unity-mcp-free-2026); [DEV Community](https://dev.to/indiebots/unitys-mcp-server-is-deprecated-what-to-use-instead-2026-3khl); [Voyager](https://voyager.so/blog/unity-mcp); [AIGamer guide](https://www.aigamer.gg/guides/unity-ai-mcp-claude-code) (secondary sources; no official Unity pricing page was fetched)
- **Licensing:** Unity Personal is free for revenue+funding under **$200K** over the last 12 months (raised from $100K with Unity 6, 17 Oct 2024). Pro is required above $200K and Enterprise above $25M. The Runtime Fee was cancelled. Pro/Enterprise prices rose 5% from 12 Jan 2026. — [Unity pricing updates](https://unity.com/products/pricing-updates); [Unity blog: canceling the runtime fee](https://unity.com/blog/unity-is-canceling-the-runtime-fee)

**Unreal**
- **UE 5.7 released (Nov 2025)** with an in-editor **AI Assistant**: F1 over any UI element starts a contextual conversation, and a slide-out panel offers Q&A and **C++ code generation**. It was previewed as "Epic Developer Assistant". PCG and Substrate are production-ready; Nanite Foliage is experimental. — [Epic: UE 5.7 is now available](https://www.unrealengine.com/news/unreal-engine-5-7-is-now-available); [Digital Production](https://digitalproduction.com/2025/11/12/unreal-engine-5-7-foliage-pcg-and-in-editor-ai/); [80.lv](https://80.lv/articles/unreal-engine-5-7-is-now-availabe)
- Its maturity label is disputed: GameEngineHub calls it "Experimental", while Epic's page doesn't. — [GameEngineHub](https://gameenginehub.com/insights/unreal-engine-5-7-released)
- One article claims Epic had not shipped a first-party in-editor agent as of 27 May 2026. This conflicts with the above and probably means an agentic, scene-editing assistant versus a help/codegen assistant. — [sorceress.games](https://sorceress.games/blog/pair-the-best-ai-for-unreal-engine-honest-2026-pick)
- **Community UE MCPs:** StraySpark Unreal MCP Server (207 tools, 5.7, commercial), UnrealClaude (Claude Code panel in the editor, 20+ tools), Monolith (5.7+), UnrealAIAssistant (Windows-only), and chir24/unreal_mcp (UE 5.0–5.6 via the Remote Control API). — [Epic forums, StraySpark](https://forums.unrealengine.com/t/strayspark-unreal-mcp-server-200-ai-tools-for-ue5-editor-automation-via-mcp/2707474); [mcpmarket UnrealClaude](https://mcpmarket.com/server/unrealclaude); [GitHub chir24/unreal_mcp](https://github.com/chir24/unreal_mcp)

**Bevy / Defold**
- **Bevy 0.20** was posted 8 Oct 2026, and v0.20.1 (28 Oct) is marked Latest on GitHub. Bevy has supported WebGPU in browsers (plus WebGL 2) since 0.11 (Jul 2023), and 0.20 mentions UASTC transcoding for WebGPU targets. — [Bevy 0.20](https://bevy.org/news/bevy-0-20/); [GitHub releases](https://github.com/bevyengine/bevy/releases); [Bevy + WebGPU](https://bevy.org/news/bevy-webgpu/)
- Defold: no 2026 results were retrieved.

### Inferences
- **Small team, zero cost, web + mobile, agent-driven:**
  - **Godot 4.7 with GDScript:** MIT license, no royalties, text-based scenes (.tscn) that agents edit well, plus many MCPs. Its web output is limited to WebGL 2 and wasm builds are heavy.
  - **Code-first web stack (three.js/Babylon + Blender GLB):** the most agent-friendly option for browser targets.
  - **Unity Personal:** free under $200K, and MCP/CLI are now free. Web builds are heavier, and the in-editor AI costs extra.
  - **Unreal:** web export is not practical, so it is a poor fit for web output.
  - **Bevy:** viable for Rust teams wanting WebGPU, but it is still pre-1.0 with breaking changes every release.
- The Unity MCP reversal (paid to free in about two months) shows engine vendors are competing to be the target of external coding agents. Expect volatility, so pin versions.

### Gaps
- **Unreal licensing** was not retrieved in this pass. Training-data knowledge, unverified for 2026: free to use, 5% royalty on gross revenue above US$1M per product, with web export not officially supported since UE4.
- **Defold** (free, source-available license, strong HTML5/mobile export) was not verified with a 2026 source.
- Whether Epic ships an **official** UE MCP server was not confirmed. Only community ones were found.
- No official Godot statement on AI policy/tooling was found. All Godot MCPs are third-party.
- Unity 6 minor version numbers (6.3/6.4/6.5) and Unity web (WebGPU) status were not retrieved.

---

## 4. AI-native game creation platforms and "vibe-coding" game tools

### Takeaway
The prompt-to-game space has split into four groups:
1. **Platform-locked generators:** Roblox Cube 3D/4D (free inside Roblox; 4D "interactive objects" in beta since Feb 2026) and Google Project Genie (world-model playable worlds; AI Ultra subscribers; Genie 4 reportedly announced 27 Oct 2026).
2. **Browser prompt-to-game makers:** Rosebud AI and Google Playground (US, 18+).
3. **App-builder agents** that make games: **xAI Grok Build**, in grok.com and the apps, opened to SuperGrok and X Premium in Aug 2026.
4. **Coding agents (Claude Code, Cursor) driving Godot/Unity/three.js:** described as what "serious developers actually use".

xAI's promised "great AI-generated game" by end of 2026 had **no confirmed release** in sources found.

### Cited Findings
- **Rosebud AI** grew from an asset generator into a full AI game maker, and is called "the fastest way from a sentence to a playable browser game". — [Ludo.ai comparison](https://ludo.ai/compare/best-ai-game-makers); [Cinevva AI game generators 2026](https://app.cinevva.com/guides/ai-game-generators-2026) (listicles, affiliate-style)
- **Roblox Assistant + Cube:** listed as a free AI creation stack within Roblox. — [Cinevva guide](https://app.cinevva.com/guides/ai-game-generators-2026)
- **Roblox 4D generation:** announced Mar 2025, early access Nov 2025, **open beta Feb 2026**. It generates interactive objects (drivable car, flyable plane) and the beta focuses on in-experience creation. Roblox reports +64% play time in "Wish Master" for players using 4D (company-reported). — [Roblox newsroom (Feb 2026)](https://about.roblox.com/newsroom/2026/02/accelerating-creation-powered-roblox-cube-foundation-model); [Sherwood News](https://sherwood.news/business/roblox-answers-googles-project-genie-launching-the-open-beta-for-its-4d-ai/); [Technology.org](https://www.technology.org/2026/02/05/roblox-new-ai-type-give-me-car-then-drive-it/)
- Roblox also pitched a "Real-time Dreaming" concept to compete with Genie. — [GIGAZINE](https://gigazine.net/gsc_news/en/20260206-roblox-real-time-dreaming/)
- Cube 3D background. — [Wikipedia Cube 3D](https://en.wikipedia.org/wiki/Cube_3D)
- **Google Project Genie:** launched around late Jan 2026 to Gemini/AI Ultra subscribers. It generates playable 3D worlds from prompts, with limited interactivity. Game stocks (Roblox, Take-Two, Unity) dipped after launch. Wikipedia says Project Genie gives AI Ultra subscribers access to Genie 3 and **Genie 4 (announced 27 Oct 2026)**; this was not corroborated elsewhere. — [Sherwood News](https://sherwood.news/business/roblox-answers-googles-project-genie-launching-the-open-beta-for-its-4d-ai/); [Wikipedia Genie](https://en.wikipedia.org/wiki/Genie_(world_model)); [wetheflywheel comparison](https://wetheflywheel.com/en/guides/ai-world-generation-tools-2026/)
- **Google Playground:** prompt-to-playable games inside Google's platform, **US and 18+ only**. — [Cinevva guide](https://app.cinevva.com/guides/ai-game-generators-2026)
- **xAI:**
  - xAI began building a game team in Nov 2024 and announced a game studio in a Feb 2025 livestream.
  - In Oct 2025 Musk said the xAI game studio would release "a great AI-generated game before the end of next year" (i.e. 2026).
  - xAI hired "Video Games Tutors" at $45–100/h.
  - No release was confirmed in the sources found.
  - [VGC](https://www.videogameschronicle.com/news/elon-musk-says-his-xai-company-will-release-a-great-ai-generated-game-by-the-end-of-2026/); [NME](https://www.nme.com/news/gaming-news/elon-musk-promises-to-release-great-ai-game-by-end-of-2026-3897708); [Hitmarker](https://hitmarker.net/news/xai-will-create-a-great-ai-generated-game-by-the-end-of-2026-elon-musk-claims-1535899)
- **Grok Build:** xAI's app-building agent in grok.com and the iOS/Android apps. It generates playable games (racing, puzzle) from descriptions, and access was broadened to all SuperGrok and X Premium holders in **Aug 2026**. — [Wikipedia: Grok Build](https://en.wikipedia.org/wiki/Grok_Build); [Basenor](https://www.basenor.com/blogs/news/grok-can-now-build-custom-games-what-you-need-to-know) (secondary blog)
- Developer-oriented options also mentioned: Unity AI, GDevelop, Summer Engine. One guide says Cursor or Claude Code driving Godot/Unity "is what serious developers actually use". — [Summer Engine guide](https://www.summerengine.com/blog/how-to-make-games-with-ai) (vendor); [Summer Engine, best AI game engine](https://www.summerengine.com/blog/best-ai-game-engine)
- Developer and gamer pushback against AI in game development is a noted 2026 trend. — [Military.com](https://www.military.com/off-duty/games/gamers-and-devs-are-pushing-back-against-ai-game-development.html)

### Inferences
- **Export and ownership:**
  - Roblox Cube output and Genie worlds are **platform-locked**, with no standalone game export.
  - Rosebud and Grok Build produce web code (JS/three.js-type), which is more portable. Ownership terms depend on each ToS and were not verified.
  - For free plus full ownership, the best path is an open-source engine or a JS stack driven by a coding agent.
- World models such as Genie are not yet substitutes for authored game engines: they have limited interactivity, no exportable assets and a subscription requirement.

### Gaps
- Pricing tiers and **export/IP ownership terms** for Rosebud, Grok Build, Google Playground and Project Genie were not retrieved.
- No official xAI announcement of a shipped AI-generated game was found as of 24 Nov 2026.
- Other platforms (Meshy, Tripo, Hunyuan3D for AI 3D assets; GDevelop AI; Ludo.ai; Summer Engine) were not researched individually.

---

## 5. Recommended pipelines (Blender -> glTF -> three.js; AI asset -> Blender cleanup -> web; procedural content in code)

### Takeaway
The robust zero-cost pipeline in late 2026 uses headless Blender 5.2 LTS (bpy) to generate, clean up and bake assets. Export to **GLB with native meshopt compression (new in 5.2)** or Draco, then compress textures to KTX2 externally, then load in three.js (GLTFLoader + MeshoptDecoder/DRACOLoader/KTX2Loader). AI-generated meshes (from AI 3D generators or Roblox-style tools) need a Blender cleanup pass for retopology/decimation, UVs, baking and scale before web use. Abstract or geometric games are best generated procedurally in code.

### Cited Findings
- Blender 5.2's glTF exporter natively writes `EXT_meshopt_compression` / `KHR_meshopt_compression`, KHR primitive attributes, point clouds and iridescence/dispersion materials. Export hooks can abort an export, which allows validation gates. — [Blender 5.2 Pipeline & I/O](https://developer.blender.org/docs/release_notes/5.2/pipeline_io/)
- Godot web export still uses WebGL 2 only, and C# cannot export to web. For web targets, a GDScript or JS pipeline is required. — [Godot 4.7 web export docs](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html); [Cinevva](https://app.cinevva.com/news/2026-06-19-godot-4-7-released)
- Bevy 0.20 targets WebGPU with UASTC (Basis) texture transcoding at load time, the same idea as KTX2 in three.js. — [Bevy 0.20](https://bevy.org/news/bevy-0-20/)
- MCP servers exist for live, agent-driven Blender editing: official Blender Lab for 5.1+ and community mcp-for-blender. — [StraySpark comparison](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026); [mcp.film](https://mcp.film/apps/blender/)
- bpy wheels make Blender scriptable from a plain Python 3.11 environment, which suits CI and sandbox use. — [PyPI bpy 5.0.0](https://pypi.org/project/bpy/5.0.0/)

### Inferences (practical recipes; derived from standard tooling, not individually re-verified with 2026 sources)
- **A. Blender -> glTF -> three.js (headless):**
  1. Run `blender -b -P build_asset.py -- --out asset.glb` (or `python -c "import bpy"` in a 3.11 venv).
  2. Script steps: build geometry (bmesh/GN), apply modifiers, triangulate, generate UVs (`smart_project`), bake AO/diffuse to a 1K–2K texture (Cycles CPU in headless), add LODs via Decimate.
  3. Export GLB with meshopt (5.2+) or Draco.
  4. Post-process with glTF-Transform CLI (`gltf-transform optimize` / `etc1s`/`uastc` for KTX2, `resize`, `dedup`, `prune`).
  5. Load in three.js with `GLTFLoader` + `MeshoptDecoder` / `DRACOLoader` + `KTX2Loader`.
- **B. AI-generated asset -> Blender cleanup -> web:**
  1. Import the GLB/OBJ from an AI 3D generator.
  2. Normalize scale/origin, merge by distance, decimate to a polygon budget, recalculate normals, re-unwrap.
  3. Bake high-to-low (normal/AO), then export as in A.
  4. Check the license/ownership terms of the generator.
- **C. Procedural in code:** for geometric/abstract games (tetris, snake, breakout), generate geometry and materials directly in three.js or canvas. Use noise-based terrain, instancing (`InstancedMesh`) and seeded RNG. Avoid the asset pipeline entirely.
- **D. Engine route:** for Godot web, use GDScript with the Compatibility renderer, import Blender GLB natively (Godot imports glTF), and use an MCP plugin for agent-driven scene edits. Expect large wasm downloads.

### Gaps
- No 2026 source was retrieved confirming three.js loader versions or glTF-Transform's KTX2 command syntax. Recipes are based on established tooling.
- No benchmark comparing meshopt and Draco size/decode speed in 2026 was retrieved.
- No authoritative 2026 article covered "AI asset -> Blender cleanup" best practice (e.g. auto-retopology add-ons such as QuadRemesher or Instant Meshes integration).
