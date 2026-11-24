# Modeles d'IA pour le developpement de jeux et la 3D (fin novembre 2026) : inventaire et verification de trois noms

Notes de recherche du 24 novembre 2026. Les notes sont en anglais, le rapport final sera en francais.
Avertissement sur les sources : beaucoup de chiffres de benchmark sont **declares par les editeurs eux-memes** et mesures avec des harness et des versions differents (Terminal-Bench 2.0/2.1/4.0/4.1, SWE-bench Verified vs Pro, FrontierSWE, DeepSWE...). Ils ne sont **pas comparables directement** d'un editeur a l'autre. La plupart des chiffres sur l'open-weight et les offres gratuites viennent d'agregateurs ou de blogs (morphllm, digitalapplied, blogs sur les API gratuites), pas des sources primaires.

## Q1. Does "GPT-6 Astra" exist? Vendor, date, capabilities, pricing, free access

### Takeaway
Yes. GPT-6 Astra is a real **OpenAI** flagship model (API ID `gpt-6-astra`), rolled out in phases from **September 3, 2026**. It is not Google's "Project Astra". It costs $10 / $50 per 1M tokens and is reserved for paid ChatGPT plans. Free ChatGPT users get the smaller **GPT-6 Luna** instead. A newer **GPT-6.2 Astra** shipped on November 17, 2026.

### Cited Findings
- OpenAI began rolling out GPT-6 Astra on September 3, 2026, in phases. Companies in its application-based cybersecurity program got access first. It is OpenAI's first model to reach the "Critical" internal cybersecurity threshold, so its advanced cyber capabilities are restricted — [CNBC](https://www.cnbc.com/2026/09/03/open-ai-astra-gpt-6-cyber.html)
- OpenAI's launch post says the model is "rolling out today" to a limited set of organizations, then to Plus, Pro, Business and Enterprise over the following days. It is in the API as `gpt-6-astra` and also on Microsoft Azure and Amazon Bedrock. Pro, Business and Enterprise also get **GPT-6 Astra Pro**. Enterprise admins must switch Astra on, since it is off by default. The post does **not mention free ChatGPT users** — [OpenAI, GPT-6 Astra](https://openai.com/index/gpt-6-astra/)
- API pricing is $10 per 1M input tokens and $50 per 1M output tokens. Fast mode runs up to 2x faster at 2x the price. Zero Data Retention is available to eligible customers — [OpenAI](https://openai.com/index/gpt-6-astra/); the price is confirmed by [OpenRouter](https://openrouter.ai/openai/gpt-6-astra)
- Capabilities OpenAI claims: "best OpenAI model for software engineering" with a new context-retention approach in Codex; computer and browser use; **3D, namely CAD code generation from multi-view renders (BenchCAD 95.9%), with Blender and Unreal Engine examples**; screen understanding (ScreenSpot-Pro 92.7%) — [OpenAI](https://openai.com/index/gpt-6-astra/)
- Benchmarks OpenAI reports for GPT-6 Astra vs GPT-5.6 Sol: Terminal-Bench 4.0 57.9% vs 37.3%; DeepSWE v1.1 74.1% vs 72.7%; OSWorld 2.0 (offline, partial) 72.6%; BrowseComp 91.5%; ARC-AGI-3 99.9%; FrontierMath Tier 4 97.6% (the body text says 98%, an internal inconsistency); GPQA Diamond 96.0%; HLE with tools 57.2%. **No SWE-bench score is given** — [OpenAI](https://openai.com/index/gpt-6-astra/)
- The context window is not stated outright. Long-context retrieval (MRCR v2 8-needle) scores 96.3% at 512K–1M tokens, which implies a window of about 1M — [OpenAI](https://openai.com/index/gpt-6-astra/)
- Later releases in the family:
  - **GPT-6 Sol** and **GPT-6 Luna**: September 22, 2026.
  - **GPT-6.1 Sol**: September 29, 2026.
  - **GPT-6.2 Astra and Sol**: November 17, 2026. The post calls this OpenAI's latest model.
  - Source for these dates: [OpenAI update notes on the Astra page](https://openai.com/index/gpt-6-astra/). Artificial Analysis also lists GPT-6.2 Astra, and gives GPT-6 Astra a score of up to 57 on its Intelligence Index — [Artificial Analysis](https://artificialanalysis.ai/models/releases/gpt-6-astra)
- Free access, from secondary sources:
  - Free and Go users got GPT-6 Luna in the ChatGPT desktop app on September 22, 2026, and reportedly in the regular Chat tab from October 8, 2026. Paid plans get Sol in Chat — [Notebookcheck](https://www.notebookcheck.net/ChatGPT-Free-and-Go-users-start-getting-GPT-6-Luna-in-Chat.1419032.0.html); [Notebookcheck (desktop only)](https://www.notebookcheck.net/ChatGPT-Free-gets-GPT-6-Luna-but-only-in-the-desktop-app.1407282.0.html)
  - Conflict: one report says OpenAI's help page still names GPT-5.6 Luna as the default for Free and Go users, and no usage limit for free users has been published — [choosely.ai](https://choosely.ai/ai-radar/is-gpt-6-free-in-chatgpt)
- Third-party comparison from Anthropic's Fable page: GPT-6 Astra scores 65.5% on FrontierSWE v2 and 68.1% on Terminal-Bench-Science 0.1 — [Anthropic, Claude Fable](https://www.anthropic.com/claude/fable)

### Inferences
- The user's "GPT-6 Astra" is correct and needs no correction. If the user means OpenAI's best model today, though, that is **GPT-6.2 Astra** (November 17, 2026).
- For zero-cost use, GPT-6 Astra is **not free**. The free route into OpenAI's GPT-6 family is Luna in ChatGPT Free, a smaller model with unpublished limits. Astra's 3D and CAD claims (BenchCAD, Blender, Unreal) bear directly on 3D and game workflows.

### Gaps
- Exact Astra rate limits per ChatGPT plan were not found.
- GPT-6.2 Astra's benchmarks and pricing were not retrieved.
- Whether Luna accepts image input for visual QA was not verified.
- The ARC-AGI-3 score of 99.9% is extraordinary and vendor-reported only. I did not find independent confirmation.

## Q2. Does "Fable 5.2" exist? Capabilities, positioning vs Opus 5.5 / Sonnet 5.5 / Haiku 5.5, pricing, free access

### Takeaway
Yes. **Claude Fable 5.2** (`claude-fable-5-2`) is Anthropic's most capable generally available model, released **November 9, 2026** together with Claude Mythos 5.2. It costs $8 / $40 per 1M tokens, has a 1M-token context and 128K output, and is aimed at the hardest coding and long-horizon agent work. Anthropic itself points everyday coding to **Opus 5.5** ($4 / $20). Fable 5.2 is **not** on the free Claude plan.

### Cited Findings
- Anthropic introduced Fable 5.2 on November 9, 2026, as "our most capable generally available model for technical fields" (coding, science, finance). For everyday coding and knowledge work, Anthropic recommends **Opus 5.5** instead — [Anthropic, Claude Fable](https://www.anthropic.com/claude/fable); [MacRumors, 2026-11-09](https://www.macrumors.com/2026/11/09/anthropic-launches-claude-fable-5-2/)
- Capabilities Anthropic claims: work across multiple repositories and monorepos; self-testing and root-cause analysis; running ambiguous engineering work for days while coordinating hundreds of subagents; reading detailed images and PDFs; **support for 3D, hardware design, simulation and robotics** — [Anthropic](https://www.anthropic.com/claude/fable)
- Benchmarks Anthropic reports, at each model's highest effort setting:

  | Benchmark | Fable 5.2 | Comparison |
  |---|---|---|
  | FrontierSWE v2 | 69.9% | Fable 5.1 56.3%, GPT-6 Astra 65.5% |
  | OSWorld 2.1 | 89.3% | Opus 5.5 87.2% |
  | Terminal-Bench-Science 0.1 | 74.6% | GPT-6 Astra 68.1% |
  | HLE with tools | 74.2% | Opus 5.5 67.7% |
  | Remote Labor Index | 41.3% | Opus 5.5 21.3% |
  | Chartography (no tools) | 73.4% | Gemini 4 Carbon 72.5% |

  Source: [Anthropic](https://www.anthropic.com/claude/fable). One outlet adds 49.1% on FrontierCode 2.0 — [online-tech-tips](https://www.online-tech-tips.com/anthropic-claude-fable-5-2-mythos-5-2/)
- Pricing:
  - Standard: $8 / $40 per 1M tokens, down from $10 / $50 for Fable 5.1, a 20% cut.
  - Cache reads: $0.20 per 1M tokens.
  - Fast mode: $16 / $80, up to 2.5x faster.
  - US-only inference: 1.1x the standard price.
  - Source: [Anthropic](https://www.anthropic.com/claude/fable); [The Next Web](https://thenextweb.com/news/claude-fable-5-2-mythos-5-2-anthropic-launch-price)
- Availability: Pro, Max, Ultra, Team and Enterprise plans; Claude Platform API; AWS, Google Cloud and Microsoft Foundry. The page does **not mention the free plan**. Data retention of 30 days is required by default for safety monitoring. Cyber or bio queries flagged by safeguards can be routed to less capable models such as Opus — [Anthropic](https://www.anthropic.com/claude/fable)
- Mythos 5.2 is the same underlying model with fewer restrictions, limited to vetted programs. Fable 5.2 has about 55% fewer safeguard blocks than Fable 5.1, which launched September 1, 2026 — [search summary of TNW / online-tech-tips coverage](https://thenextweb.com/news/claude-fable-5-2-mythos-5-2-anthropic-launch-price)
- Conflict on free access: one report says Fable 5.2 is "open to all users", another says it needs a paid plan or the API. Anthropic's own page lists only paid plans — [online-tech-tips](https://www.online-tech-tips.com/anthropic-claude-fable-5-2-mythos-5-2/) vs [Anthropic](https://www.anthropic.com/claude/fable)
- Kingy.ai notes that "Fable 5.5" appeared in earlier coverage but was never officially announced. **Fable 5.2 is the correct name** — [kingy.ai](https://kingy.ai/blog/claude-fable-5-5/)
- The rest of the Anthropic lineup comes from Anthropic's API model reference (the Claude API skill in this environment, cached November 3, 2026, and consistent with the launch page). It is an internal reference with no public URL; prices are per 1M input / output tokens, and every model has a 1M context and 128K output:

  | Model | Model ID | Price per 1M tokens | Notes |
  |---|---|---|---|
  | Claude Fable 5.2 | `claude-fable-5-2` | $8 / $40 | Thinking always on; effort from low to max |
  | Claude Opus 5.5 | `claude-opus-5-5` | $4 / $20 | Default model; fast mode $8 / $40 |
  | Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 | |
  | Claude Haiku 5.5 | `claude-haiku-5-5` | $0.10 / $0.50 | Rate for prompts up to 100K tokens; $0.50 / $2.50 beyond |
  | Claude Mythos 5.2 | `claude-mythos-5-2` | Same as Fable 5.2 | Verified organizations only |

  Fable 5.1 and Fable 5 ($10 / $50) are still served. Source: Anthropic API model table (internal skill reference)

### Inferences
- The user's guessed ID `claude-fable-5-2` is exactly right.
- On cost/quality for game and 3D coding, Opus 5.5 at half the price is Anthropic's own everyday recommendation. Fable 5.2 is worth it for long, ambiguous multi-repo or agent tasks.
- Haiku 5.5 at $0.10 / $0.50 is a very cheap paid option for bulk visual-QA judging. Its vision quality was not checked.

### Gaps
- The free Claude.ai plan's current default model (likely a Sonnet) and its limits were not verified.
- No independent SWE-bench Verified or Pro numbers for Fable 5.2 were found.
- Fable 5.2's release date comes from Anthropic's page and press, but the exact Opus 5.5, Sonnet 5.5 and Haiku 5.5 release dates were not retrieved.

## Q3. Does "Google Neon" exist? What is it exactly?

### Takeaway
"Google Neon" is not an official product name. It almost certainly means **Gemini 4 Neon**, a Google model announced on **November 18, 2026**. In the Gemini 4 family it sits between Hydrogen (fast, everyday) and Carbon (top reasoning); the family also has Argon (code and analysis). It costs $3 / $15 per 1M tokens, has a 1M context, and is for paid Google AI Pro and Ultra subscribers. It is **unrelated to Project Astra** and to **Neon Postgres**.

### Cited Findings
- Announcement and family:
  - Gemini 4 Neon was announced November 18, 2026. The family is Hydrogen (everyday help, replacing Flash), Argon (code and analysis), Carbon (most complex work) and Neon (between Hydrogen and Carbon).
  - Carbon and Hydrogen launched the previous week.
  - Google says Neon performs "comparable to or surpassing Carbon in coding, reasoning, and agentic tasks, at Flash speeds".
  - Source: [9to5Google, 2026-11-18](https://9to5google.com/2026/11/18/gemini-4-neon-announcement/)
- Specs: 1M-token context; thinking levels Low, Medium, High and Extra High; reads images, PDFs and spreadsheets — [9to5Google](https://9to5google.com/2026/11/18/gemini-4-neon-announcement/)
- Benchmarks, as reported by 9to5Google:
  - Artificial Analysis Intelligence Index: 61 at xhigh, #3 overall.
  - Artificial Analysis Coding Agent Index: 58.6, #1.
  - Terminal-Bench 4.1: 65.2%.
  - FrontierCode 2.0: 46.2%.
  - Terminal-Bench Science: 70.5%.
  - AutomationBench: 56.3%.
  - Source: [9to5Google](https://9to5google.com/2026/11/18/gemini-4-neon-announcement/). Another outlet says Neon delivers Carbon-like performance at 3x the speed and 60% of the cost — [Interesting Engineering](https://interestingengineering.com/ai-robotics/google-gemini-4-neon-faster-coding-research)
- Pricing:
  - Neon: $3 / $15 per 1M tokens in the Gemini API.
  - Argon and Carbon: introductory $2 / $10 until November 30, 2026, then $4 / $20.
  - Source: [9to5Google](https://9to5google.com/2026/11/18/gemini-4-neon-announcement/)
- Availability:
  - Gemini app: AI Pro and AI Ultra subscribers. Neon replaces Argon in the picker, and Gemini 3.1 Pro is being retired. The picker now reads Auto (Gemini 3.5 Flash-Lite for paid users), Everyday help (Hydrogen), Deeper analysis (Neon), and Code & complex work (Carbon).
  - Google Antigravity (agentic IDE): paid AI Pro or Ultra only. Neon can coordinate sub-agents there.
  - The article says **nothing about free users or the AI Studio free tier**.
  - Source: [9to5Google](https://9to5google.com/2026/11/18/gemini-4-neon-announcement/); [KuCoin flash](https://www.kucoin.com/news/flash/google-launches-gemini-4-neon-ai-model-leads-in-programming-agent-index)
- Project Astra is **not mentioned** in the Neon announcement — [9to5Google](https://9to5google.com/2026/11/18/gemini-4-neon-announcement/)
- Conflicts and noise:
  - Some sources date the launch November 19 rather than November 18.
  - Carbon's launch is dated variously November 10 or late October.
  - A Dutch outlet mentions Android Studio availability, which English sources do not.
  - Source: [note.com summary](https://note.com/ai_douga/n/ndef48dc15b30?hl=en); [Dutch IT Channel](https://www.dutchitchannel.nl/news/765622/google-introduceert-snel-ai-model-gemini-4-neon)
  - `gemini4neonai.com` is an unofficial third-party site and should be ignored — [gemini4neonai.com](https://gemini4neonai.com/)
- Local confusion risk: the user's own workspace instructions mention a **`neon` skill** in the App Builder workspace. It is for the **Neon Postgres database**, and the instructions say to use it only when the app needs a database. It has nothing to do with Google — local file `/home/user/FOLIO/AGENTS.md`

### Inferences
- The user should say **"Gemini 4 Neon"**, not "Google Neon".
- "Astra" in the user's list belongs to OpenAI (GPT-6 Astra). Google's Project Astra is a separate assistant research project, and none of the 2026 sources tie it to Neon.
- For zero cost, Neon is paid-only in the consumer app. The AI Studio free-tier status of Neon is unknown, so the free Google route most likely remains the lower models (Hydrogen and Flash-Lite) in AI Studio. This is unverified.

### Gaps
- No official blog.google or deepmind.google page for Neon was retrieved; the facts above come via 9to5Google and other press.
- Whether Neon or Hydrogen is in the Gemini API free tier, and with what limits, was not found.
- Project Astra's 2026 status was not researched this session.
- That "Neon" is not also a Google-internal codename elsewhere could not be fully ruled out.

## Q4. Frontier proprietary models for coding / agents / 3D (late Nov 2026) and benchmark standing

### Takeaway
The top tier in late November 2026 is:
- **OpenAI**: GPT-6 Astra and GPT-6.2 Astra.
- **Anthropic**: Claude Fable 5.2, with Opus 5.5 as the cheaper workhorse.
- **Google**: Gemini 4 Carbon and Neon.

xAI's **Grok 4.7** is far cheaper but trails on independent indices. No single benchmark is comparable across vendors. On vendor-chosen comparisons:
- Fable 5.2 leads FrontierSWE v2 and OSWorld 2.1.
- GPT-6 Astra claims state-of-the-art on Terminal-Bench 4.0.
- Gemini 4 Neon claims #1 on the Artificial Analysis Coding Agent Index.

### Cited Findings
- OpenAI GPT-6 Astra: Terminal-Bench 4.0 57.9%, DeepSWE v1.1 74.1%, BenchCAD 95.9%; $10 / $50 — [OpenAI](https://openai.com/index/gpt-6-astra/)
- Anthropic Fable 5.2: FrontierSWE v2 69.9% vs GPT-6 Astra 65.5%; OSWorld 2.1 89.3%; $8 / $40 — [Anthropic](https://www.anthropic.com/claude/fable)
- Google Gemini 4 Neon: AA Coding Agent Index 58.6 (#1), Terminal-Bench 4.1 65.2%, AA Intelligence Index 61 (#3); $3 / $15 — [9to5Google](https://9to5google.com/2026/11/18/gemini-4-neon-announcement/). Artificial Analysis Intelligence Index per a secondary source: Neon 61, Carbon 60, Hydrogen 54, Argon 50 — [softtechhub summary via search](https://softtechhub.us/2026/11/21/gemini-4-neon-hydrogen-carbon/)
- xAI Grok 4.7, released September 21, 2026:
  - Price: $2 / $6 per 1M tokens.
  - xAI's own numbers: CursorBench 4.0 46.3%, DeepSWE v1.1 71.0%.
  - The Decoder: Artificial Analysis Intelligence Index 46, vs 53 for Fable 5.1 and GPT-6; Terminal-Bench 26%, vs about 60% for GPT-6 Astra.
  - Another source reports Grok 4.7 at 38.0% on Terminal-Bench. The versions and setups behind the two figures are unreconciled.
  - Source: [The Decoder](https://the-decoder.com/xai-launches-grok-4-7-at-bargain-prices-but-benchmarks-reveal-a-wide-gap-to-claude-and-gpt-6/); [sqmagazine](https://sqmagazine.co.uk/xai-launches-grok-4-7-coding-model/)
  - Earlier: Grok 4.5 (July 2026) was xAI's flagship coding model at the time — [daily.dev](https://daily.dev/posts/grok-4-5-launches-as-xai-s-flagship-coding-and-agentic-model-rksbgbgmq)
- Meta: the open-weight **Muse Spark Open** (October 15, 2026) is 816B total / 42B active parameters, takes image, audio and video input, and uses a Muse Model License. No coding benchmark is listed — [morphllm open-source ranking](https://www.morphllm.com/best-open-source-llm)
- Mistral: Devstral 2 (123B dense, Modified MIT, 72.2% SWE-bench Verified) and Devstral Small 2 (24B, Apache 2.0, 68.0%). These figures are as of June 2026; no newer Mistral release was found — [digitalapplied, 2026-06-29](https://www.digitalapplied.com/blog/best-open-weight-coding-models-self-host-hardware-match-2026)
- Aggregate leaderboards exist that rank coding models by benchmark and cost per task, including a SWE-bench Pro board dated November 2026 — [morphllm best coding model](https://www.morphllm.com/best-ai-model-for-coding); [morphllm SWE-bench Pro](https://www.morphllm.com/swe-bench-pro)
- An academic review warns that differing harnesses make reported coding scores non-comparable — [arXiv 2610.38977](https://arxiv.org/pdf/2610.38977)

### Inferences
- Value picks for paid API use in game and 3D coding: Gemini 4 Neon at $3 / $15 and Claude Opus 5.5 at $4 / $20 sit near the top tier at half to a third of the flagship price. Grok 4.7 is the cheapest frontier-ish option but measurably behind.
- For 3D specifically, GPT-6 Astra (BenchCAD, Blender, Unreal) and Fable 5.2 ("3D, simulation") are the only models whose vendors explicitly claim 3D workflows.

### Gaps
- Current independent SWE-bench Verified and Pro numbers for GPT-6.2 Astra, Fable 5.2, Opus 5.5, Gemini 4 Carbon and Neon were not obtained. The SWE-bench Pro leaderboard page was found but not fetched.
- No current Mistral proprietary flagship (Mistral Large or Medium, 2026) was researched.
- No LMArena WebDev leaderboard snapshot was taken. It would be the most relevant board for web games.

## Q5. Best open-weight models for coding/agents: versions, licenses, sizes, hardware

### Takeaway
The open-weight frontier (Kimi K3/K3.1, DeepSeek-V4.x, GLM-5.x, Qwen3.8 Max, Reflection Beam, Muse Spark Open) is now 0.5T to 2.8T parameters and needs multi-GPU servers. It is "local" only for organizations. Realistic options on consumer hardware are:
- **Qwen3.8-27B** (Apache-2.0, one GPU).
- **Devstral Small 2** (24B, about 12 GB at Q4).
- **Qwen3-Coder-30B-A3B** (about 15 GB at Q4).
- **Gemma 4** (E2B to 31B, Apache-2.0, multimodal).
- **gpt-oss-20b and 120b**.

A single 96 GB card or a Mac Studio fits **Qwen3-Coder-Next 80B-A3B**, **Devstral 2 123B** and **Nemotron 3 Super**.

### Cited Findings
- The November 2026 open-weight ranking (vendor-reported scores; the source covers 17 models):
  - **Kimi K3** (Moonshot): weights July 27, 2026; 2.8T / 104B; custom Kimi K3 License; 1M context; image input; Terminal-Bench 2.1 88.3, FrontierSWE 81.2. **Kimi K3.1 Pro** weights followed November 2, 2026, at the same size.
  - **DeepSeek-V4.1-Flash**: September 10, 2026; 552B total, 8B active at prefill / 16B at decode; **MIT**; 1M context; image input; Terminal-Bench 2.1 90.6 (vendor), DeepSWE 74.2.
  - **GLM-5.3** (Z.ai): weights August 28, 2026; 753B; GLM-5.3 License; Terminal-Bench 2.1 88.2.
  - **GLM-5.3-Flash**: August 26, 2026; 320B / 18B; MIT; natively multimodal.
  - **GLM-5.2**: MIT; SWE-bench Pro 62.1%.
  - **DeepSeek-V4-Pro**: 1.6T / 49B; MIT; SWE-bench Verified 80.6%.
  - **Reflection Beam**: October 16, 2026; 501B / 23B; Apache-2.0; SWE-bench Verified 81.6%, Pro 66.1%; NVFP4 checkpoint about 280 GB.
  - **Meta Muse Spark Open**: October 15, 2026; 816B / 42B; about 1.5 TB in BF16; NVFP4 build runs on one B200 node.
  - **MiniMax M3**: 428B / 23B; non-commercial by default; SWE-bench Pro 59.0%.
  - **Qwen3.8-2.4T-A95B**: August 8, 2026; custom license.
  - **Qwen3.8-Flash-Next**: August 24, 2026; 125B / 6B; Qwen Community license; SWE-bench Pro 62.5%.
  - **Qwen3.8-27B**: August 5, 2026; 27B dense; **Apache-2.0**; SWE-bench Pro 61.7%, Terminal-Bench 2.1 73.0; runs on a single GPU.
  - **Gemma 4** (Google DeepMind): Apache-2.0; E2B to 31B. E2B and E4B run on phones, 12B on a laptop, 26B-A4B and 31B on a consumer GPU or workstation. Multimodal.
  - **gpt-oss-120b** (OpenAI): 117B / 5.1B; Apache-2.0; 128K context; SWE-bench Pro 16.2.
  - Source: [morphllm, Best Open Source LLMs Nov 2026](https://www.morphllm.com/best-open-source-llm)
- Another summary reports Kimi K3 at 93.4% SWE-bench Verified and GLM-5.3 at 95.4% (both via Vals AI), with Qwen3.8-Flash-Next leading SWE-bench Pro at 62.5%. The aggregator itself flags the sources as inconsistent — [morphllm best coding model](https://www.morphllm.com/best-ai-model-for-coding); [faros.ai](https://www.faros.ai/blog/open-weight-models)
- Hardware fits, as of **June 2026**:
  - **Qwen3-Coder-30B-A3B**: about 15 GB at Q4; RTX 3090 or 5090; about 60–90 tok/s on an RTX 5090.
  - **Devstral Small 2** (24B dense, Apache 2.0, 68.0% SWE-bench Verified): about 12 GB at Q4; a 24 GB GPU; about 25–35 tok/s on an RTX 4090 or 5090.
  - **Nemotron 3 Nano** (30B / 3B): about 15 GB at Q4; a 16 GB GPU; 38.8% SWE-bench Verified.
  - **Qwen3-Coder-Next** (80B / 3B): about 46 GB at Q4_K_M plus KV cache; a 96 GB card or Mac Studio M3 Ultra; about 71.3% SWE-bench Verified; about 25–35 tok/s on the Mac.
  - **Devstral 2** (123B, Modified MIT, 72.2%): about 62 GB at Q4; one 96 GB card; about 9 tok/s on an M3 Ultra.
  - **Nemotron 3 Super** (120B / 12B): about 60 GB at Q4; 1M context.
  - **GLM-5.2**: INT4 about 372 GB; at least 4× H200.
  - Source: [digitalapplied, 2026-06-29](https://www.digitalapplied.com/blog/best-open-weight-coding-models-self-host-hardware-match-2026)
- The top open-weight models (Kimi K3, DeepSeek-V4-Pro, GLM-5.3, MiniMax M3) need multiple high-memory GPUs and vLLM or SGLang — [morphllm](https://www.morphllm.com/best-open-source-llm)

### Inferences
- Rule of thumb from the figures above: Q4 weights take about 0.5 GB per billion parameters, plus room for the KV cache.
- Mapping to hardware:
  - 16–24 GB of VRAM fits about 24–30B models (Devstral Small 2, Qwen3-Coder-30B-A3B, Qwen3.8-27B, Gemma 4 31B).
  - 64–128 GB of unified memory on Apple silicon, or a 96 GB workstation card, fits about 80–123B models.
  - Anything at frontier open-weight scale needs a server.
- For permissive licensing, the best options are Qwen3.8-27B and Gemma 4 (Apache-2.0), GLM-5.2, GLM-5.3-Flash and DeepSeek-V4.x (MIT), and Devstral Small 2 (Apache). Kimi K3, MiniMax M3, Qwen Max and Muse Spark Open use custom or non-commercial licenses.
- For visual QA of rendered screenshots on a local machine, the multimodal options are Gemma 4 and GLM-5.3-Flash. The big multimodal options are Kimi K3 and DeepSeek-V4.1-Flash.

### Gaps
- The hardware page is from June 2026 and predates Qwen3.8, GLM-5.3, Kimi K3 and Beam, so there are no measured VRAM or speed figures for those.
- No Llama 5 or Mistral open release after mid-2026 was found. This may mean none exists, or that it was not covered.
- No independent (Scale SEAL or Vals) verification was fetched.
- Gemma 4's release date was not given.

## Q6. Local runtimes and free access paths (and their limits)

### Takeaway
Free API routes, from aggregator data:
- **OpenRouter `:free` models**: 20 requests per minute, 50 per day, rising to 1,000 per day after a one-time $10 credit.
- **Groq free plan**: 30 RPM, 1,000 requests and 200K tokens per day, on gpt-oss-120b/20b and Qwen3.8-27B.
- **Google AI Studio free tier**: the best route for long context, but limits now show only per project, and free-tier data may be used to improve Google's products.
- **Cerebras**: its no-card free tier **reportedly ended mid-2026**.

The free consumer chat apps give access to the smaller frontier tiers: GPT-6 Luna in ChatGPT Free. Fable 5.2, GPT-6 Astra and Gemini 4 Neon are all paid.

### Cited Findings
- OpenRouter: `:free` models cost nothing per token; limits are 20 RPM and 50 requests per day, or 1,000 per day after buying $10 of credits — [OpenRouter free LLM APIs compared](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/); [continuumcode](https://continuumcode.ai/guides/free-llm-api/)
- Groq free plan: 30 RPM, 1,000 requests per day, 8K tokens per minute and 200K tokens per day on gpt-oss-120b, gpt-oss-20b and Qwen3.8 27B — [opengpuradar](https://opengpuradar.com/free-llm-apis); [plugsky, Nov 2026](https://plugsky.com/free-llm-api)
- Cerebras (conflicting): some sources list about 1M tokens per day and 30 RPM. Others say the no-card free tier was replaced by a $5, 30-day trial that needs a card (July 16, 2026), or ended in August 2026 — [klymentiev](https://klymentiev.com/blog/free-llm-api); [gravity.fast](https://gravity.fast/data/free-llm-api-tiers/)
- Google AI Studio: about 15 RPM on Flash models, with daily caps of 20–1,500 depending on the model. Google no longer publishes the per-model free limits in its docs; they are shown per project in AI Studio. Free-tier content may be used to improve Google's products — [free-llm.com](https://free-llm.com/guides/ultimate-free-llm-api-guide); [tokenmix](https://tokenmix.ai/blog/free-llm-apis-2026-every-provider-free-tier-tested)
- ChatGPT Free and Go get GPT-6 Luna, with rollout varying — [Notebookcheck](https://www.notebookcheck.net/ChatGPT-Free-and-Go-users-start-getting-GPT-6-Luna-in-Chat.1419032.0.html)
- Self-hosting runtimes named in the sources: vLLM and SGLang for multi-GPU serving of large MoE models — [morphllm](https://www.morphllm.com/best-open-source-llm)

### Inferences
- The most practical zero-cost stack is:
  - a local mid-size coder (Qwen3.8-27B or Devstral Small 2) through Ollama, LM Studio or llama.cpp, or MLX on a Mac;
  - plus OpenRouter or Groq free tiers for larger open models;
  - plus the AI Studio free tier for long context and vision.
- Treat every free tier as volatile. Cerebras shows they can disappear within months.

### Gaps
- No primary-source pages were fetched for Ollama, LM Studio, llama.cpp or MLX, so their current versions and whether they support the newest models (Qwen3.8, Gemma 4, GLM-5.3-Flash) are unverified.
- GitHub Models and Mistral (La Plateforme) free-tier limits were not researched.
- AI Studio free-tier availability of Gemini 4 Hydrogen or Neon was not found.
- The free Claude.ai plan's model was not verified.
- The free-API figures above come from aggregators, not official rate-limit pages.

## Q7. Vision / multimodal capability for judging rendered screenshots (visual QA loops)

### Takeaway
All three flagship families explicitly claim strong image and screen understanding:
- GPT-6 Astra: ScreenSpot-Pro 92.7%, plus BenchCAD from multi-view renders.
- Fable 5.2: "reads detailed images", OSWorld 2.1 89.3%, Chartography 73.4%.
- Gemini 4 Neon: reads images and PDFs, Chartography 73.5%.

Open-weight vision options are Gemma 4 (small and local), GLM-5.3-Flash, Kimi K3, DeepSeek-V4.1-Flash, MiniMax M3 and Muse Spark Open.

### Cited Findings
- GPT-6 Astra: ScreenSpot-Pro 92.7%; OSWorld 2.0 72.6%; BenchCAD (CAD code from multi-view renders) 95.9% — [OpenAI](https://openai.com/index/gpt-6-astra/)
- Fable 5.2: reads detailed images and PDFs; OSWorld 2.1 89.3% (Opus 5.5 87.2%); Chartography 73.4% vs Gemini 4 Carbon 72.5% — [Anthropic](https://www.anthropic.com/claude/fable)
- Gemini 4 Neon: reads photos, PDFs and spreadsheets "more precisely"; Chartography 73.5% — [9to5Google](https://9to5google.com/2026/11/18/gemini-4-neon-announcement/)
- Open-weight models with image input: Kimi K3, DeepSeek-V4.1-Flash, GLM-5.3-Flash, MiniMax M3 (image and video), Muse Spark Open (image, audio and video) and Gemma 4. Reflection Beam is text-only — [morphllm](https://www.morphllm.com/best-open-source-llm)

### Inferences
- For a cheap automated screenshot-judging loop, the candidates are:
  - **Haiku 5.5** at $0.10 / $0.50 (vision support assumed from the Claude family, not verified);
  - **Gemini 4 Hydrogen**, or a Flash model on the AI Studio free tier;
  - **Gemma 4 locally** for zero cost.
- Reserve the flagships for hard cases. Chartography and ScreenSpot-Pro are the closest published proxies for judging rendered visuals, but no benchmark measures "is this game frame rendered correctly".

### Gaps
- No benchmark specific to judging 3D or game render quality was found.
- Vision support and quality for Haiku 5.5, GPT-6 Luna and Gemini 4 Hydrogen were not verified.
- Gemma 4 vision benchmark numbers were not retrieved.
