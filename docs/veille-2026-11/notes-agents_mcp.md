# Autonomous AI coding agents and the MCP ecosystem for game/3D development (state as of 24 Nov 2026)

Research notes (English) for the French final report. 16 tool calls. Many game-engine MCP facts come from third-party blogs and vendor comparison sites, some of which sell a competing product (StraySpark, Ziva, Summer Engine, Voyager). Each such case is flagged. Star counts and versions are as reported on the date given, not checked against GitHub directly.

## 1. Latest MCP specification changes (2025–2026), MCP Registry, related standards

### Takeaway
The current MCP revision is **2026-07-28**, the largest change since launch. It makes MCP **stateless**: no sessions, no `initialize` handshake, and a new `server/discover`. It replaces server-initiated requests (elicitation, sampling, roots) with a **Multi Round-Trip Request (MRTR)** pattern, moves **Tasks** into an official extension, and deprecates Roots, Sampling, Logging and Dynamic Client Registration. The official **MCP Registry is still "preview"** (launched 8 Sep 2025, no GA date). MCP, AGENTS.md, goose and, since Oct 2026, **Agent Skills (SKILL.md)** are governed by the Linux Foundation's **Agentic AI Foundation (AAIF)**.

### Cited Findings
**Spec 2026-07-28: major changes, from the official changelog**
- Protocol-level sessions and the `Mcp-Session-Id` header are removed from Streamable HTTP. Servers that need cross-call state use explicit server-minted handles passed as ordinary tool arguments (SEP-2567). — [MCP changelog 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- The stateless design removes the `initialize`/`notifications/initialized` handshake. Every request carries its protocol version and client capabilities in `_meta` (`io.modelcontextprotocol/protocolVersion`, `.../clientCapabilities`). A version mismatch returns `UnsupportedProtocolVersionError` (SEP-2575). — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- New mandatory `server/discover` RPC, which advertises versions, capabilities and identity. It is also usable as a backward-compatibility probe on STDIO. — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- The HTTP GET endpoint and `resources/subscribe` are replaced by `subscriptions/listen`, a single long-lived POST response stream with opt-in notification types. — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- `ping`, `logging/setLevel` and `notifications/roots/list_changed` are removed. SSE resumability (`Last-Event-ID`) is removed, so a broken stream means re-issuing the request. — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- **Tasks (async)**: moved out of core into the official extension `io.modelcontextprotocol/tasks`. Clients poll `tasks/get`, which replaces the blocking `tasks/result`. New `tasks/update` carries client-to-server input. `tasks/list` is removed. Servers may return task handles unsolicited (SEP-2663). — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- This is a breaking change for anyone who built against the 2025-11-25 experimental Tasks API. The Python SDK 2.2.0 release notes reportedly say the Tasks extension is not implemented yet. — [TrueFoundry / search summary](https://www.truefoundry.com/blog/mcp-2026-07-28-spec-apps-tasks-governance-revisited) (secondary; verify against the SDK)
- **MRTR** (SEP-2322): servers return `InputRequiredResult` (`resultType: "input_required"`) with `inputRequests`, and clients retry with `inputResponses`. This replaces server-initiated `elicitation/create`, `sampling/createMessage` and `roots/list`. All results now carry a required `resultType`. — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- **Elicitation**: `notifications/elicitation/complete` and `elicitationId`, both introduced in 2025-11-25 for URL-mode elicitation, are removed. Servers encode correlation in `requestState`. — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- **Structured outputs**: `inputSchema`/`outputSchema` now accept any JSON Schema 2020-12 keyword, and `structuredContent` may be any JSON value. `$ref` resolution rules are added (SEP-2106). — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- **Auth**: Dynamic Client Registration (RFC 7591) is deprecated in favour of Client ID Metadata Documents. Clients must validate `iss` (RFC 9207). `application_type` is required during DCR. Credentials are bound to the issuing authorization server. — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- **Other minor changes**:
  - `extensions` field added to client and server capabilities.
  - OpenTelemetry `traceparent` propagation documented in `_meta`.
  - `tools/list` SHOULD be in a deterministic order, to improve LLM prompt-cache hit rates.
  - `ttlMs`/`cacheScope` are required on list/read results (`CacheableResult`).
  - `Mcp-Method`/`Mcp-Name` headers are required on HTTP POST.
  - Source: [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- **Deprecated**: Roots, Sampling and Logging (SEP-2577). The migrations are tool parameters, direct LLM API calls, and stderr or OpenTelemetry respectively. The HTTP+SSE transport is formally deprecated in favour of Streamable HTTP. — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- **Governance**: a feature lifecycle policy (Active/Deprecated/Removed, minimum 12-month deprecation window, deprecated-features registry). The SEP process is now PR-based (SEP-1850). — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- Context: the previous revision was 2025-11-25, which introduced experimental Tasks and URL-mode elicitation. — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog); [official blog post on 2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- Secondary coverage describes the 2026-07-28 release as shipping "Apps, Tasks & Governance". "Apps" likely refers to the MCP Apps UI extension, but it is not in the core changelog and I did not verify it. — [TrueFoundry](https://www.truefoundry.com/blog/mcp-2026-07-28-spec-apps-tasks-governance-revisited); [WorkOS on auth changes](https://workos.com/blog/mcp-2026-spec-agent-authentication)

**MCP Registry**
- Launched in preview on 8 Sep 2025 at registry.modelcontextprotocol.io. The official docs still say "currently in preview; breaking changes or data resets may occur before GA". — [MCP blog: Introducing the MCP Registry](https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/); [Registry about page](https://modelcontextprotocol.io/registry/about)
- The Registry working-group charter lists "Registry API v1 GA" as "Ideating" with no target date. @rdimitrov has been sole lead since 30 Jul 2026. — [Registry charter](https://modelcontextprotocol.io/community/working-groups/registry)
- Unofficial counts disagree: about 59,603 entries (October 2026 alone added 16,282); 64,935 servers (15 Nov 2026); 229,461 published versions (8 Nov 2026). The registry records no auth method, security review or uptime check. — [DEV: 59,603 entries](https://dev.to/fast_data_asap/i-counted-every-server-in-the-official-mcp-registry-59603-entries-and-october-alone-added-16282-1jlj); [DEV: Registry by the numbers](https://dev.to/amareswer/the-mcp-registry-by-the-numbers-38nc)

**Related standards / governance**
- Anthropic donated MCP to the new Agentic AI Foundation (a Linux Foundation directed fund) in Dec 2025. Founding projects were MCP, goose (Block) and AGENTS.md (OpenAI). — [Anthropic announcement](https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation); [OpenAI: AAIF and AGENTS.md](https://openai.com/index/agentic-ai-foundation/); [aaif.io](https://aaif.io/)
- AGENTS.md is a simple open format for project-specific agent instructions, now stewarded by AAIF. — [OpenAI](https://openai.com/index/agentic-ai-foundation/)
- Agent Skills (SKILL.md, from Anthropic) moved to AAIF on 22 Oct 2026. The spec did not change, so existing skills keep working. — [safeguard.sh](https://safeguard.sh/resources/blog/agentic-ai-foundation-explained-linux-foundation-governance-for-mcp-and-agent-standards); [sharkly.ai](https://sharkly.ai/blog/agent-skills-agentic-ai-foundation/); [developersdigest](https://www.developersdigest.tech/blog/agent-skills-agentic-ai-foundation-what-changes-2026) (secondary)
- Skills and MCP have different security models. Skills are instructions plus scripts loaded into context; MCP is a tool and network boundary. — [friedrichs-it](https://www.friedrichs-it.de/blog/agent-skills-vs-model-context-protocol/); [kamrancode](https://www.kamrancode.com/blog/agents-md-skills-or-mcp-what-each-one-is-actually-for)

### Inferences
- For game and 3D servers, which are mostly local stdio servers or localhost HTTP servers inside the editor, the 2026-07-28 changes matter less than for remote SaaS servers. Most community engine MCPs probably still implement 2025-06-18 or 2025-11-25 semantics. Clients will need backward compatibility, and the spec says pre-2026 results without `resultType` are treated as `"complete"`.
- Tasks are the relevant feature for long renders and builds, such as Blender renders, Unreal cooks and Unity builds. Because the extension was redesigned and SDK support is lagging, expect few engine servers to use it yet.
- Sampling is deprecated, so servers that delegate LLM calls back to the client will need to migrate.

### Gaps
- I could not verify the exact contents of the "MCP Apps" extension or its status in 2026-07-28 from a primary source.
- I found no confirmed date for the next spec revision.
- A2A (Agent2Agent, Linux Foundation) and the Agent Client Protocol (Zed's ACP, used to plug CLIs such as Gemini, Claude Code and Codex into editors) were not researched within the call budget. Their current versions and governance are unverified here.

## 2. Autonomous coding agents/CLIs: licensing, local/free models, fit for multi-file game projects

### Takeaway
The open-source leader is **OpenCode** (MIT, about 200k stars, provider-agnostic, local models via Ollama). **Codex CLI** (Apache-2.0, sandboxed by default, `--oss` for Ollama/LM Studio), **Cline** (Apache-2.0), **Kilo** (MIT, built on OpenCode), **Goose** (Apache-2.0, AAIF), **OpenHands** (MIT core, sandboxed), **Pi** (MIT) and xAI's **Grok Build CLI** (Apache-2.0, v1.0 on 7 Aug 2026) are the main free/OSS harnesses. There are two big 2026 shifts. **Gemini CLI** stopped serving free, Pro and Ultra users on 18 Jun 2026; it was replaced by the closed-source Antigravity CLI, and **Qwen Code** is the open fork. **Roo Code** was archived in May 2026, and **Aider** has stalled.

### Cited Findings
Source for most rows: [pinggy.io, best open-source CLI coding agents](https://pinggy.io/blog/best_open_source_cli_coding_agents/) (updated 28 Aug 2026; stars as of 29 Aug 2026).
- **OpenCode**:
  - MIT, about 202k stars, local models via Ollama and OpenAI-compatible endpoints, MCP support, build/plan agents, LSP for 20+ languages.
  - Claude subscription login was removed (an API key still works).
  - Source: [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/). Another source says about 212k stars: [pinggy top 5](https://pinggy.io/blog/top_cli_based_ai_coding_agents/)
- **OpenAI Codex CLI**: Apache-2.0, about 119k stars, written in Rust. Shell is sandboxed by default, it has subagents, and `--oss` mode runs with Ollama or LM Studio. — [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/); [Wikipedia: OpenAI Codex (agent)](https://en.wikipedia.org/wiki/OpenAI_Codex_(AI_agent))
- **Gemini CLI**: retired for free, Pro and Ultra accounts on 18 Jun 2026. It now serves Code Assist Standard/Enterprise and paid API keys, and is replaced by the closed-source Antigravity CLI (`agy`). — [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/); [kilo.ai](https://kilo.ai/articles/best-cli-coding-agents) (secondary; check Google's own announcement)
- **Qwen Code**: Apache-2.0, about 27k stars, a fork of Gemini CLI tuned for Qwen-Coder models, with local models supported. — [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/)
- **Cline**:
  - Apache-2.0, about 67k stars, available as IDE extension, CLI and SDK.
  - Supports Ollama and LM Studio, parallel agents and Kanban boards.
  - No bundled free tier without an account or your own key.
  - Source: [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/)
- **Kilo Code / Kilo CLI**: MIT, about 27k stars. The CLI is built on OpenCode and is the main migration target for ex-Roo Code users. It supports BYOK, hosted or local models. — [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/); [kilo.ai](https://kilo.ai/articles/best-cli-coding-agents) (vendor)
- **Roo Code**: final release 15 May 2026, then archived; the team pivoted to a cloud product. **Stale.** — [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/)
- **Aider**: Apache-2.0, about 48k stars. Last push 22 May 2026, with no tagged release since Aug 2025. **Stalled.** — [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/)
- **Goose**: Apache-2.0, about 54k stars, written in Rust, supports Ollama, 70+ MCP extensions, under the Linux Foundation/AAIF. — [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/); [Anthropic AAIF post](https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation)
- **OpenHands**: MIT core, about 85k stars, version 1.0. Sandboxed autonomous runs, headless CI mode, 100+ providers via LiteLLM, and local models via Ollama, llama.cpp, vLLM or MLX. — [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/)
- **Crush** (Charm): FSL-1.1-MIT (source-available, not OSI), about 28k stars, pre-1.0, MCP support, LSP. — [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/)
- **Pi**: MIT, about 98k stars. System prompt under 1,000 tokens thanks to "lazy skills". MCP support. — [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/)
- **Grok Build (xAI Grok CLI)**:
  - Apache-2.0, about 26k stars, v1.0 on 7 Aug 2026, Rust TUI.
  - Plan mode, parallel subagents, headless `-p` mode, MCP via an extension system, and a custom `base_url` for local models.
  - Browser login needs a SuperGrok or X Premium Plus plan; it also accepts `XAI_API_KEY`.
  - Source: [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/)
- Several comparison sites cite unverifiable model and benchmark names (for example "GPT-6.1 Sol", "Terminal-Bench 4.1", and a "DeepSeek Harness" with about 203k stars). Treat their leaderboards with suspicion. — [morphllm leaderboard](https://www.morphllm.com/best-ai-coding-agents-2026); [scriptbyai](https://www.scriptbyai.com/best-cli-ai-coding-agents/)
- Engine tooling is converging on Claude Code, Codex and Cursor as the reference MCP clients:
  - Unity ships a Claude Code plugin marketplace (`/plugin marketplace add Unity-Technologies/unity-agent-plugin`).
  - MCP for Unity documents `codex mcp add`.
  - Epic's plugin targets Claude Code, Cursor and Codex.
  - Sources: [Voyager: Unity MCP](https://voyager.so/blog/unity-mcp); [3daistudio: Unreal MCP](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/unreal-mcp)

### Inferences
- **Zero-cost setups**:
  - OpenCode, Kilo, Cline, Goose or Codex CLI (`--oss`) with a local Ollama or LM Studio model gives a fully free stack.
  - Multi-file game projects are long-horizon, and small local models degrade on them. A free-tier cloud model, or a cheap paid one, will usually be needed for reliable autonomous 3D work. This is a judgement, not a sourced benchmark.
  - The Gemini CLI change removed the most popular free cloud quota; Qwen Code is the open replacement.
- For game projects, sandboxing (Codex, OpenHands) matters, because engine MCPs execute arbitrary code (see §3).

### Gaps
- No primary-source data gathered on Claude Code (proprietary; subscription or API), GitHub Copilot coding agent/CLI, Cursor, Windsurf (Cognition), the Antigravity CLI, or Amp: current versions, prices and free tiers are unverified here.
- No independent benchmark found that is specific to game or 3D multi-file projects.
- Gemini CLI's retirement is reported only by secondary sources; I found no Google primary post.

## 3. MCP servers for 3D tools and game engines

### Takeaway
2026 brought **official first-party MCPs**: the **Blender Lab MCP server** (v1.0.0 on 27 Apr 2026, GPL-3.0, Blender 5.1+), **Epic's Unreal MCP plugin** (experimental, UE 5.8, Jun 2026), and **Unity's CLI `unity mcp`** (CLI 1.0 on 12 Nov 2026, free; the older MCP inside the AI Assistant package is deprecated). Community servers remain more feature-rich:
- **ahujasid's blender-mcp**, renamed **mcp-for-blender** on 16 Sep 2026 (MIT, about 29k stars).
- **CoplayDev/unity-mcp** (MIT, about 16k stars).
- **Coding-Solo/godot-mcp** (MIT).

Web 3D is served mostly by **asset-search MCPs**: ThreeNativeHQ threenative-asset-mcp covers Poly Haven, ambientCG, Fab and Sketchfab. There are no dedicated Babylon.js or PlayCanvas servers.

### Cited Findings
**Blender**
- **Official Blender Lab MCP server**:
  - v1.0.0 on 27 Apr 2026, latest v1.0.3 on 11 Sep 2026. Free, GPL-3.0-or-later, requires Blender 5.1+.
  - 26 tools: scene summaries, screenshots, viewport renders, code execution, and search of bundled Blender API docs and the manual.
  - Used by Anthropic's Blender connector for Claude.
  - Its docs say it runs model-generated code "without any guards" and recommend a VM.
  - Focused on analysis, debugging and scripting rather than model generation.
  - Sources: [StraySpark comparison](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026) (vendor of a competing paid server); [Voyager](https://voyager.so/blog/blender-mcp); repo at blender.org/lab/mcp-server per [search summary](https://www.developersdigest.tech/mcp-servers/blender-mcp)
- **MCP for Blender (formerly ahujasid/blender-mcp)**:
  - Created Mar 2025, MIT, about 29,326 stars (25 Sep 2026).
  - Renamed 16 Sep 2026: the PyPI package is now `mcp-for-blender`, and `uvx blender-mcp` still works.
  - Requires Blender 3.0+ and `uv`. 36 tools, including live API lookup (Sep 2026).
  - Integrations: Poly Haven, Sketchfab, Poly Pizza, Hyper3D Rodin, Hunyuan3D, Tripo.
  - Python execution is on by default; `BLENDER_MCP_SAFE_MODE=1` blocks file, subprocess and network access.
  - Optional premium plan at $10–20/month for generation without your own keys.
  - Sends anonymous telemetry by default; disable with `DISABLE_TELEMETRY=true`.
  - Its socket has no auth or encryption.
  - Four CVEs in 2026, including a Poly Haven downloader path traversal (CVE-2026-66004).
  - Sources: [StraySpark](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026); version reports conflict (2.2.6 / 2.2.7 / 2.3.0) per [Voyager](https://voyager.so/blog/blender-mcp) and [mcp.film](https://mcp.film/apps/blender/)
- **Paid alternatives**:
  - Blender MCP Pro: $5/month or $15 one-time, 120+ tools.
  - StraySpark Blender MCP: $79.99–249.99, proprietary, 556 tools, code execution denied by default, CC0 Poly Haven and ambientCG tools.
  - Tripo MCP: generation via the Tripo API.
  - Sources: [StraySpark](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026); [pulsemcp directory](https://www.pulsemcp.com/servers?q=blender)
- Running a local model with Blender MCP (CADCraft, DWG limits) is discussed in [DEV: local model + Blender MCP](https://dev.to/private_localai/mcp-servers-and-what-they-let-a-local-model-actually-do-blender-cadcraft-and-the-dwg-problem-lcf)

**Unity**
- Unity's original MCP server inside `com.unity.ai.assistant` is **deprecated** (manual 2.18+). The replacement is the free **Unity CLI** (`unity`) with **`unity mcp`**.
  - CLI 1.0.0 shipped 12 Nov 2026 and 1.0.1 on 16 Nov 2026.
  - Driving an open Editor needs Unity 6.0+ and the Pipeline package (`unity pipeline install`). Unity 2021.3–2023 cannot be driven, so use a community server there.
  - Unity recommends plain `unity <command>` shell calls when the agent has a shell.
  - Source: [Voyager: Unity MCP (19 Nov 2026)](https://voyager.so/blog/unity-mcp)
- Install: `curl -fsSL https://unity.com/install.sh | bash` / `brew install --cask unity-cli` / `winget install Unity.CLI`. In Claude Code: `/plugin marketplace add Unity-Technologies/unity-agent-plugin`, then `/plugin install unity@unity-agent-plugin`. — [Voyager](https://voyager.so/blog/unity-mcp)
- Pricing: the CLI, the MCP server and the plugin are free with no concurrency limits. The in-editor assistant is included in Pro/Enterprise/Industry; on Personal it is a trial, then $10/month. — [Voyager](https://voyager.so/blog/unity-mcp); [Unity AI getting-started blog](https://unity.com/blog/unity-ai-how-to-get-started)
- Unity AI went to open beta (in-editor agent, AI Gateway, MCP server) around May 2026. The "AI Gateway", for connecting your own third-party agent subscription, is an early-access sign-up with no confirmed GA. The "Unity AI" brand was reportedly retired. Do not confuse it with Databricks "Unity Gateway". — [Cinevva news](https://app.cinevva.com/news/2026-05-04-unity-ai-open-beta); [Unity AI Gateway beta page](https://create.unity.com/UnityAIGatewayBeta); [Unity Discussions](https://discussions.unity.com/t/unity-ai-s-open-beta-now-live-for-unity-6/1718560)
- **Community Unity MCPs**, with GitHub data as of 19 Nov 2026 from [Voyager](https://voyager.so/blog/unity-mcp):
  - **CoplayDev/unity-mcp ("MCP for Unity")**:
    - 16,078 stars, v10.3.0 on 4 Oct 2026, Unity 2021.3–6.x, MIT.
    - Install via Package Manager git URL `https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#main`.
    - Claude Code: `claude mcp add --transport http unityMCP http://localhost:8080/mcp`.
    - Codex: `codex mcp add unityMCP -- uvx --from mcpforunityserver mcp-for-unity --transport stdio`.
  - **IvanMurzak/Unity-MCP**: 4,668 stars, 1.13.0 on 19 Nov 2026, Unity 2022.3+. Apache-2.0, but two dependencies are under PolyForm Shield 1.0.0. The default mode uses a hosted relay; switch to local "Custom" mode to avoid it.
  - **CoderGamester/mcp-unity**: 2,019 stars, 1.5.0 on 3 Sep 2026, Unity 6+, MIT. Needs Node 18+.
  - **Besty0728/Unity-Skills**: 1,956 stars, v3.0.1 on 18 Nov 2026, MIT.
  - **isuzu-shiranui/UnityMCP**: 344 stars, v4.4.2.
  - **FunplayAI/funplay-unity-mcp**: 330 stars, v0.7.7, MIT.
  - **Unity's own agent plugin**: 658 stars, 0.1.10-beta, Unity Companion License.

**Unreal Engine**
- Epic released an official **Unreal MCP** plugin as a first-party, **Experimental** plugin in **UE 5.8**. Most sources date it **17 Jun 2026**; one says 23 Jun. — [3daistudio](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/unreal-mcp); [Engadget](https://www.engadget.com/2196807/epic-games-details-how-its-embracing-gen-ai-in-unreal-engine/)
- The server runs inside the editor at `http://127.0.0.1:8000/mcp`, for Claude Code, Cursor and Codex. It is UE 5.8 only, so projects on 5.3–5.7 have no official option. This comes from a third-party guide and is unverified against Epic's docs. — [3daistudio](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/unreal-mcp); [pixelsdesign](https://www.pixelsdesign.it/blog/unreal-engine-mcp-claude-code-explained.html)
- The tool set is "deliberately minimal, foundational". APIs will change, closed-loop read-back is "limited this release", and hardening is not finished. Epic calls MCP "core infrastructure" for **Unreal Engine 6**, with Claude and Gemini integrations announced at State of Unreal 2026. UE6 is not shipped. — [StraySpark (competing vendor)](https://www.strayspark.studio/blog/epic-official-mcp-plugin-ue5-8-vs-third-party); [Engadget](https://www.engadget.com/2196807/epic-games-details-how-its-embracing-gen-ai-in-unreal-engine/); [note.com explainer](https://note.com/joyous_iris1179/n/n11ac25311882?hl=en)

**Godot**
- **Coding-Solo/godot-mcp**: MIT, free, the most common starting point.
  - Install: `claude mcp add godot -- npx @coding-solo/godot-mcp` (some guides add `-y`).
  - Runs Godot via the command line: launches the game in debug mode, captures output, stops the run. UID tools need Godot 4.4+.
  - Tested on Godot 4.7.2.
  - Sources: [godotlearning comparison (23 Oct 2026)](https://godotlearning.com/blog/godot-mcp-servers-compared); [DEV: Claude Code for Godot 2026](https://dev.to/orellanaed/claude-code-for-godot-in-2026-connect-it-to-your-game-and-what-it-builds-37md)
- **NPGameDev/godot-mcp-toolkit**: MIT, free, Godot 4.2+ (tested to 4.7). Editor plugin plus npm bridge `@npgamedev/godot-mcp-server`. Screenshots, playtests with live-node inspection, and **input simulation**. — [godotlearning](https://godotlearning.com/blog/godot-mcp-servers-compared)
- **Godot MCP Native (yurineko73)**: MIT. Runs in Godot over HTTP `localhost:9080/mcp` or stdio, with no Node. Editor and runtime screenshots, runtime input, debugger breakpoints. v1.0.8 (30 Jul 2026), marked "unstable" in the store. — [godotlearning](https://godotlearning.com/blog/godot-mcp-servers-compared)
- **Godot MCP Pro**: proprietary, $15 one-time, Godot 4.4+, WebSocket on port 6505, v1.16.0 (Aug 2026). **GDAI MCP (3ddelano)**: all rights reserved, Godot 4.1+, screenshots. **Funplay Godot MCP**: MIT, `npx -y funplay-godot-mcp`, v0.9.2 (Jun 2026). — [godotlearning](https://godotlearning.com/blog/godot-mcp-servers-compared)
- **Other servers**:
  - godot-ai: suggested for Godot 4.7+. Its `game_eval` tool executes code in the running game.
  - Erodenn/godot-mcp-runtime: for older Godot 4.x.
  - Summer Engine MCP: runtime control.
  - Sources: [summerengine (vendor)](https://www.summerengine.com/blog/best-godot-mcp-server); [gamedevaihub](https://gamedevaihub.com/best-godot-mcp-servers-claude-code/); [ziva (vendor)](https://ziva.sh/blogs/godot-mcp-server-claude-code-cursor)

**Web 3D (three.js / Babylon / PlayCanvas) and asset search**
- **baryhuang/mcp-threejs**: finds downloadable Sketchfab models (OAuth2 for the Sketchfab API). — [GitHub](https://github.com/baryhuang/mcp-threejs)
- **ThreeNativeHQ/threenative-asset-mcp ("Fab MCP")**: searches Fab, **Poly Haven** (CC0), **ambientCG**, Smithsonian 3D, Sketchfab and a game-audio catalog. Sketchfab downloads need a user token, and licenses vary per model. A similar fork exists by jonit-dev. — [GitHub](https://github.com/ThreeNativeHQ/threenative-asset-mcp); [Glama](https://glama.ai/mcp/servers/jonit-dev/threenative-asset-mcp)
- **Vuena/vuena-assets-mcp**: free, 76 CC0 low-poly GLB models, works with three.js and Babylon.js. — [GitHub](https://github.com/Vuena/vuena-assets-mcp)
- **3D Asset Server** (arielshad): self-hosted, queries 23 sources (Poly Haven, Kenney, ambientCG, BlenderKit, CGTrader, Sketchfab). — [ai-tldr](https://ai-tldr.dev/releases/arielshad-3d-asset-server/)
- Curated list: **zhuyansen/awesome-3d-skills** covers MCP servers and skills for Blender, Unity, Godot, Unreal, CAD, three.js and 3D generation, each security-graded. — [GitHub](https://github.com/zhuyansen/awesome-3d-skills)
- No dedicated Babylon.js or PlayCanvas MCP server turned up. Both engines consume the glTF output of the asset MCPs above. — [search summary based on the repos above](https://github.com/zhuyansen/awesome-3d-skills)

### Inferences
- **Zero-cost recommended stack by engine**:
  - Blender: mcp-for-blender (MIT, any Blender 3.0+) with `BLENDER_MCP_SAFE_MODE=1`, or the official Blender Lab server on Blender 5.1+ in a VM.
  - Godot: Coding-Solo for build and run, or NPGameDev's toolkit when screenshots and input are needed.
  - Unity 6: the `unity` CLI.
  - Older Unity: CoplayDev.
  - UE 5.8: Epic's experimental plugin.
  - Web: Playwright or Chrome DevTools MCP (§4) plus a CC0 asset MCP.
- First-party servers are minimal and "experimental". Community servers lead in features but carry real security risk: arbitrary code execution, unauthenticated sockets, CVEs, telemetry and hosted relays.

### Gaps
- Epic's official docs and release notes for the Unreal MCP plugin were not fetched. The endpoint and port, tool list and setup are second-hand.
- Community Unreal servers (chongdashu/unreal-mcp, flopperam/unreal-engine-mcp, runreal/unreal-mcp) were not researched; their maintenance status is unknown.
- No information found on Spline, PlayCanvas Editor or Babylon.js official MCPs, or on dedicated Poly Haven, Sketchfab or ambientCG MCPs beyond the multi-source servers above.
- GitHub stars and dates were not independently re-verified.

## 4. MCPs and tools for autonomous visual verification (browser, WebGL/WebGPU, perf)

### Takeaway
**Playwright MCP** (Microsoft) and **Chrome DevTools MCP** (Google) are the standard browser-verification servers. Both default to accessibility-tree snapshots, which are useless for a `<canvas>`. WebGL/WebGPU apps therefore need **screenshots** (Playwright's vision mode, or DevTools' `take_screenshot`) plus console and performance-trace checks. Engine MCPs now add **in-engine screenshots and input simulation**, which closes the loop for native games.

### Cited Findings
- Playwright MCP's default perception is the accessibility tree, which its README calls better than a screenshot. Chrome DevTools MCP also returns an a11y snapshot by default, with screenshots optional. — [mcp.directory: DevTools vs Playwright vs Puppeteer MCP](https://mcp.directory/blog/chrome-devtools-mcp-vs-playwright-mcp-2026)
- For canvas apps and WebGL, the a11y tree gives the agent nothing, so screenshots are the fallback. — [mcp.directory Playwright MCP guide 2026](https://mcp.directory/blog/playwright-browser-mcp-guide-2026)
- Chrome DevTools MCP's `take_screenshot` captures the viewport, full page or one element as PNG, JPEG or WebP. It also exposes console, network and performance traces. — [browserless](https://www.browserless.io/blog/chrome-devtools-mcp)
- Playwright MCP has a vision mode that adds screenshots for visual verification and rendering bugs. — [codeshrew ai-lab-notes](https://codeshrew.github.io/ai-lab-notes/posts/2026-02-08_browser-automation-ai-agents-mcp-playwright/)
- Use Chrome DevTools MCP for live debugging evidence (console errors, network, screenshots, traces) and Playwright MCP for repeatable cross-browser end-to-end assertions. — [agentskillshub](https://agentskillshub.dev/scenarios/mcp-browser-automation/); [pageproofer](https://pageproofer.com/blog/playwright-mcp-browser-testing/); [devflares](https://www.devflares.com/blogs/playwright-mcp-vs-chrome-devtools-mcp)
- Alternative: Vercel's `agent-browser` CLI, compared with Chrome DevTools MCP for coding-agent verification. CLI tools cost fewer context tokens than MCP tool schemas. — [huuhka.net](https://www.huuhka.net/browser-verification-for-coding-agents-chrome-devtools-mcp-vs-agent-browser/); [testmu: Playwright MCP alternatives](https://www.testmuai.com/blog/playwright-mcp-alternatives/)
- **Engine-side visual loops**:
  - Blender Lab MCP offers screenshots and viewport renders. — [StraySpark](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026)
  - NPGameDev's Godot toolkit and Godot MCP Native offer runtime screenshots and input simulation. — [godotlearning](https://godotlearning.com/blog/godot-mcp-servers-compared)
  - Coding-Solo's server captures debug output. — [godotlearning](https://godotlearning.com/blog/godot-mcp-servers-compared)
  - Epic's plugin has "limited" closed-loop read-back in 5.8. — [StraySpark](https://www.strayspark.studio/blog/epic-official-mcp-plugin-ue5-8-vs-third-party)

### Inferences
- A practical WebGL self-test loop:
  1. Start the dev server.
  2. Navigate with Playwright or Chrome DevTools MCP.
  3. Wait for N frames.
  4. Take a screenshot and check it is not blank or a single colour (pixel-variance check).
  5. Assert there are no console errors (shader compile errors, WebGL context lost).
  6. Optionally record a performance trace for frame time.
  7. Have the multimodal model judge the screenshot against the spec.
- Headless Chromium may fall back to software GL (SwiftShader), so performance numbers from CI are not representative. WebGPU may be unavailable headless without flags. This is an inference; I found no source in this pass.
- Vision models judge composition and obvious errors (blank canvas, missing textures, wrong orientation) better than subtle shading quality. Deterministic checks such as pixel-diff against a baseline and console scanning should gate success. This is a judgement, not sourced.

### Gaps
- I found no source that specifically covers WebGL/WebGPU debugging MCPs (for example Spector.js or a WebGPU inspector exposed via MCP), or rigorous studies of how well LLMs judge rendering quality from screenshots.
- Current versions and release dates of Playwright MCP and Chrome DevTools MCP were not captured.

## 5. Best practices for agent autonomy (instructions, skills, self-testing, context, sandboxing, cost)

### Takeaway
The converging pattern is:
- An **AGENTS.md** (or CLAUDE.md) instruction file per repo.
- **Agent Skills (SKILL.md)** for on-demand domain knowledge. Engine vendors now ship skills and plugins: Unity's agent plugin, Unity-Skills, and Epic positioning MCP for UE6.
- **Lean tool surfaces**: deterministic `tools/list`, lazy skills, and CLI calls preferred over MCP where a shell exists.
- **Sandboxing**, because nearly every engine MCP executes arbitrary code.
- A **self-verification loop** with screenshots and console checks.

### Cited Findings
- AGENTS.md is the AAIF-stewarded open format for project-specific agent instructions. — [OpenAI](https://openai.com/index/agentic-ai-foundation/)
- Agent Skills (SKILL.md) are now an AAIF project, unchanged by the move. — [sharkly.ai](https://sharkly.ai/blog/agent-skills-agentic-ai-foundation/)
- Unity recommends plain `unity <command>` shell calls over MCP when the agent can run shell commands. — [Voyager](https://voyager.so/blog/unity-mcp)
- Pi keeps its system prompt under 1,000 tokens through "lazy skills", loaded on demand. — [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/)
- The spec now says `tools/list` SHOULD be in a deterministic order to improve prompt-cache hit rates, and adds `ttlMs` caching hints. — [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- StraySpark's Blender server shows 22 of 556 tools by default, an example of limiting the tool surface for context. — [StraySpark](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026)
- **Sandboxing and security**:
  - Blender Lab's docs recommend a VM because generated code runs "without any guards".
  - mcp-for-blender has a `BLENDER_MCP_SAFE_MODE=1` validator, an unauthenticated socket and four 2026 CVEs.
  - godot-ai's `game_eval` executes code in the running game.
  - IvanMurzak's Unity-MCP defaults to a hosted relay.
  - Sources: [StraySpark](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026); [godotlearning](https://godotlearning.com/blog/godot-mcp-servers-compared); [Voyager](https://voyager.so/blog/unity-mcp)
- Codex CLI runs shell commands sandboxed by default, and OpenHands runs autonomous tasks in sandboxes with a headless CI mode. — [pinggy](https://pinggy.io/blog/best_open_source_cli_coding_agents/)
- The registry records no auth method, security review or uptime check, so vet servers manually. — [DEV registry analysis](https://dev.to/amareswer/the-mcp-registry-by-the-numbers-38nc)
- Curated, security-graded lists exist for 3D MCPs and skills. — [awesome-3d-skills](https://github.com/zhuyansen/awesome-3d-skills)

### Inferences
- **Recommended configuration** for an autonomous free/OSS 3D game workflow:
  1. An open-source harness (OpenCode or Codex CLI) with AGENTS.md describing build, run and test commands and the screenshot path.
  2. One engine MCP plus Playwright or Chrome DevTools MCP. Keep only the needed servers enabled to save context.
  3. Engine know-how packaged as SKILL.md files.
  4. Run inside a container or VM with no secrets.
  5. Enforce "done = build passes + screenshot non-blank + no console errors".
- **Cost control**: prefer CLI calls and lazy skills over large MCP tool lists. Use local models for routine edits and a stronger model for planning and visual judgement.

### Gaps
- I found no sourced, quantitative guidance on cost control (token budgets, cost per autonomous game build) or on context-management techniques specific to game repos (large binary assets, scene files).
- I found no primary vendor docs (code.claude.com, OpenAI Codex docs) on subagents, hooks or permission modes in this pass.
