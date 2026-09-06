# HiveStream / CyTube Development Lineage & Knowledge Consolidation

_Last compiled: 2026-09-05_

## Purpose

This document records the development history, surviving design knowledge, and canonicalization strategy for the HiveStream / CyTube P2P work. The project was developed iteratively across multiple LLMs and GitHub repositories. The objective is to preserve the **accumulated engineering knowledge**, not merely select one script as "the winner."

The long-term goal is to make `duckwerks/cytube-knowledge` the reusable CyTube engineering knowledge base so that future rooms, channel scripts, games, players, and P2P features can start from known facts instead of rediscovering CyTube's runtime, permissions, Socket.IO behavior, DOM, and deployment workflow.

---

## 1. Development Model

The actual development process was a multi-model relay:

1. ChatGPT — initial architecture and first implementation.
2. Token/context limit — work transferred to Grok.
3. Grok — refined the implementation and accumulated debugging knowledge.
4. Token/context limit — work transferred to Claude.
5. Claude — continued implementation using the accumulated architecture, code, and practical knowledge.
6. A newer implementation was subsequently started from the **general concept + lessons learned**, rather than simply continuing the oldest source tree.
7. ChatGPT redefined the architecture for the newer implementation.
8. Claude then implemented the CyTube/WebRTC/P2P script from that revised architecture.

Therefore the repositories should be treated as **development lineages**, not isolated projects and not as a simple linear version history.

### Important interpretation

The newest implementation is valuable because it represents a later synthesis of prior architectural and practical experience. However:

> **Newer does not automatically mean more correct or more tested.**

A later design can contain better abstractions while an older branch can contain a hard-won fix, empirical test result, or working workaround that was accidentally lost during the rewrite.

The correct goal is therefore:

**preserve all useful knowledge → identify empirically proven facts → compare implementations → establish canonical patterns → build new projects from the knowledge base.**

---

## 2. Known Implementation Lineages

### A. `backwater-battery/cytube-hivestream`

This is the earlier major implementation lineage.

It contains `P2P-Theater-Core-0.00.01.js` through `0.00.13.js`, architecture documents, token architecture, and a CyTube hook framework.

The repository shows rapid sequential development from April 16–28, 2026. `P2P-Theater-Core-0.00.13.js` was committed April 28, 2026.

The v0.00.13 implementation demonstrates accumulated debugging knowledge, including:

- replacement of problematic HEAD/CORS probing with streaming GET behavior;
- webseed fallback behavior;
- handling of large files;
- tracker warning suppression;
- relay echo clarification;
- HLS fallback;
- IndexedDB library work;
- thumbnails;
- upload/seeding paths;
- mobile-tested WebSocket tracker candidates.

The architecture document in this lineage goes considerably beyond a player: identity, metadata, IndexedDB, WebTorrent, WebRTC control messaging, receipts, trust, tokens, playlist intelligence, recommendation graphs, search, peer summaries, bumper content, and optional persistent seeders are all described.

### B. `aolcyberchat-gpu/P2P-Theater-Core`

This is a distinct implementation lineage, developed as `hivestream402x` → `hivestream403x` files.

The latest visible commit is `hivestream4035.js`, committed April 27, 2026.

The v4.0.35 implementation has a clearer compact state-machine/coordinator model:

`IDLE → FETCHING → METADATA → BUFFERING → PLAYING → SEEDING`

It explicitly separates the coordinator from other clients, uses a CyTube chat relay, joins a WebTorrent swarm, and uses IndexedDB for persistent local pieces. It also includes search/top/info/stop/status/sync/seek commands and HLS fallback behavior.

This lineage also contains a valuable `cytube-websocket-dom-scrape.txt` artifact containing direct CyTube source inspection commands/results. That artifact should be treated as raw evidence to be reconciled with the formal WS/DOM research in this knowledge repository.

---

## 3. What "Most Developed" Means

For this project, development maturity has several dimensions:

| Dimension | Meaning |
|---|---|
| Architectural maturity | How coherent the system model is |
| Implementation maturity | How much of the architecture is actually coded |
| Empirical maturity | How much has been tested in real CyTube/mobile runtime |
| Debugging maturity | How many real failures have been diagnosed and mitigated |
| Knowledge maturity | How much of the reasoning is preserved outside the code |
| Reusability | How easily the work can support a different CyTube room/project |

The later rewrite should therefore be considered the **latest synthesis**, while the earlier lineage remains an important **experimental/debugging archive**.

The knowledge repository should become the place where those two are reconciled.

---

## 4. Current CyTube Knowledge That Should Be Reused

The knowledge repository already contains empirical reverse-engineering artifacts including:

- DOM/client resource research;
- Socket.IO/Engine.IO handshake and transport behavior;
- inbound Socket.IO event catalog (`WS-028`);
- outbound Socket.IO event catalog (`WS-029`);
- channel CSS/JS injection and permission behavior (`WS-030`);
- runtime global exposure tests (`WS-033`);
- runtime event observation (`WS-034`);
- media/playlist event capture (`WS-035`);
- playlist/queue event capture (`WS-036`);
- later live playlist testing (`WS-041`).

Observed runtime facts include:

- `window === globalThis`;
- `window.socket` exists and can be connected;
- `window.io` exists;
- `window.Callbacks` exists;
- Cytube exposes playlist/media behavior through observable callbacks/events;
- media updates expose playback state such as current time and paused state.

These are more valuable for future development than any particular HiveStream version number because they describe the host platform itself.

---

## 5. Architectural Knowledge From the HiveStream Work

The accumulated HiveStream architecture can be understood as two related systems.

### Host integration layer

CyTube provides:

- room membership;
- chat transport;
- ranks/authority;
- playlist/media state;
- channel script injection;
- DOM/UI surface.

### HiveStream data/distribution layer

HiveStream adds:

- content ingestion;
- WebTorrent swarm distribution;
- WebRTC control-plane messaging;
- IndexedDB persistence;
- playback synchronization;
- media metadata;
- playlist intelligence;
- optional identity/trust/receipt/token systems;
- optional persistent seeders.

This separation is important. A future CyTube project should be able to reuse the **CyTube integration knowledge** without importing the entire HiveStream P2P system.

---

## 6. Critical Architectural Insight: Control Plane vs Media Plane

The HiveStream designs converge on a useful separation:

### Media plane

**WebTorrent/WebRTC** carries the media pieces.

### Control plane

**CyTube chat/Socket.IO and/or WebRTC data messaging** carries small coordination messages.

Examples:

- current media identity;
- playback state;
- timestamps;
- swarm hints;
- playlist metadata;
- peer summaries;
- votes;
- receipts.

This distinction should be retained even if implementation details change.

---

## 7. Coordinator / Authority Model

The later implementation explicitly models a coordinator. It first checks CyTube's server-provided leader state and uses rank-based logic as a fallback.

General principle:

> **Do not invent a second authority system when CyTube already supplies room authority.**

CyTube rank/leader state can establish who is allowed to initiate or control shared playback, while WebRTC/WebTorrent handles distribution.

This should be tested against the empirical rank/permission research before being treated as universal.

---

## 8. Relay Protocol Pattern

The later implementation uses a compact chat relay of the form:

`!hs _i <40charHash> <base64WebseedUrl>`

The base64 encoding was specifically designed to avoid characters that interact badly with CyTube chat link handling.

This is a good example of a **platform-specific workaround** that belongs in the knowledge base rather than being rediscovered in every implementation.

It should be classified as an implementation pattern, not yet as a CyTube platform guarantee.

---

## 9. WebTorrent / Webseed Lessons

The two lineages demonstrate that "P2P playback" is not one mechanism.

Possible paths include:

1. real WebTorrent swarm playback;
2. webseed-backed acquisition;
3. HTTP playback fallback;
4. HLS fallback;
5. local IndexedDB cache/reseed behavior.

A future implementation should expose which path is active rather than treating every successful video playback as proof of P2P operation.

This distinction is especially important because a video can play successfully over HTTP while the P2P layer is nonfunctional.

---

## 10. Mobile Development Is a First-Class Constraint

The development workflow is mobile-first and uses Android/Termux plus browser-based CyTube testing.

Therefore future scripts and tests should favor:

- copy/paste-friendly scripts;
- small passive/read-only diagnostic tests;
- console output that is compact rather than DOM-heavy;
- timestamped artifacts generated by the developer's own workflow;
- incremental test IDs;
- no assumption of desktop DevTools;
- explicit mobile WebRTC/WSS validation;
- reproducible capture of runtime facts.

This is not merely a convenience preference. It is part of the actual development environment and should be documented as such.

---

## 11. Evidence Hierarchy

When implementations disagree, use this order of trust:

1. **Direct observation in the live CyTube runtime**
2. **Captured Cytube source (`ui.js`, `callbacks.js`, etc.)**
3. **Repeatable test artifact in `cytube-knowledge`**
4. **Working implementation behavior confirmed by test**
5. **Architecture documents**
6. **Unverified comments/assumptions in code**

Architecture is valuable, but an architecture diagram does not prove that the browser or Cytube server actually behaves that way.

Likewise, a working hack does not automatically explain why it works.

The knowledge repository should preserve both the observation and the explanation.

---

## 12. Canonicalization Rule

Do **not** designate one entire repository as universally canonical.

Instead maintain three categories:

### CANONICAL KNOWLEDGE

Facts about CyTube, browser behavior, protocols, deployment, and tested constraints that are backed by evidence.

### CANONICAL ARCHITECTURE

The currently preferred design for the HiveStream/P2P system after reconciling both implementation lineages.

### HISTORICAL IMPLEMENTATIONS

Old scripts retained because they contain useful code, experiments, workarounds, or debugging history.

This avoids losing knowledge when a rewrite replaces an implementation.

---

## 13. Future "One-Shot" CyTube Project Workflow

The desired future workflow is:

`KNOWLEDGE BASE → PROJECT TEMPLATE → FEATURE IMPLEMENTATION → TEST → ARCHIVE FINDINGS`

A new CyTube project should begin by consulting:

1. development environment/workflow;
2. deployment and channel-script injection rules;
3. DOM map;
4. Socket.IO inbound/outbound event map;
5. rank/permission map;
6. known global runtime objects;
7. chat/markup rules;
8. localStorage/cookie behavior;
9. relevant reusable test harness;
10. feature-specific architecture.

Only then should implementation begin.

The result should be that creating a new room feature is closer to **configuration + feature code** than reverse-engineering CyTube again.

---

## 14. Required Future Knowledge Artifacts

Priority research to finish the reusable CyTube foundation:

- [ ] rank → numeric value → permission map;
- [ ] complete global `window` object inventory;
- [ ] complete localStorage/cookie inventory;
- [ ] chat parsing/linkification/command behavior;
- [ ] emote markup and rendering rules;
- [ ] "Remember my choice" permission persistence;
- [ ] standardized passive runtime test harness;
- [ ] standardized channel deployment checklist;
- [ ] reusable project skeleton for new CyTube scripts;
- [ ] reconciliation of duplicate DOM/WebSocket research files;
- [ ] implementation comparison of HiveStream v0.00.13 and v4.0.35;
- [ ] determine which P2P behaviors are actually verified end-to-end on mobile.

---

## 15. Immediate Canonicalization Plan

The next serious pass should not be another feature rewrite.

It should be a **knowledge extraction pass**:

1. Diff `P2P-Theater-Core-0.00.13.js` against `hivestream4035.js`.
2. Identify features unique to each lineage.
3. Identify fixes that exist only in one lineage.
4. Identify architecture that is better represented in the later rewrite.
5. Compare both against `WS-028` through `WS-041`.
6. Move confirmed CyTube facts into this repository.
7. Move reusable HiveStream architecture into a canonical architecture document.
8. Mark uncertain behavior as hypothesis until tested.
9. Preserve both source lineages as historical references.
10. Build a reusable CyTube project template.

Only after this pass should a new "official" implementation be selected.

---

## Bottom Line

The project's accumulated value is **not located in one JavaScript file**.

It is the combination of:

**LLM architectural reasoning + implementation iterations + failures + debugging discoveries + live CyTube observations + mobile testing + reverse-engineering artifacts.**

The job of `cytube-knowledge` is to turn that accumulated experience into durable engineering knowledge.

Once that is done, future CyTube projects should be able to start from the known platform model and concentrate on the new feature itself — rather than repeatedly rebuilding the development environment, rediscovering Cytube internals, and relearning the same lessons.
