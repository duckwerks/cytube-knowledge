# HiveStream Browser P2P Engine & Media Primitive Research

**Date:** 2026-09-08  
**Human Project Lead:** Elwood Edwards  
**AI Research & Engineering:** GPT-5.6 Luna (OpenAI) — HiveStream Research & Engineering Assistant

## Purpose

This document records a broad investigation of browser-JavaScript-friendly P2P media engines, browser-native media/storage primitives, and adjacent technologies that could materially affect HiveStream architecture.

The purpose is **not** to select the shiniest technology. It is to determine which browser primitives should become durable HiveStream foundations and which should remain replaceable adapters.

## HiveStream architectural north star

> HiveStream turns a recurring watch room from a server-fed collection of viewers into a persistent, cooperative media swarm.

Primary objective:

- reduce centralized/origin video bandwidth;
- retain acquired media locally;
- allow peers to serve retained media to other peers;
- allow users to ingest local media and make it reusable in the room;
- make the room progressively more self-sufficient as replicas accumulate.

Playback synchronization is secondary. P2P media distribution and persistent media reuse are primary.

---

# 1. Executive conclusion

The research strengthens, rather than weakens, the current p2p-media-loader direction — but with an important architectural qualification:

**p2p-media-loader should be treated as the initial media-distribution engine, not as the definition of HiveStream's media architecture.**

The recommended architecture is now:

```text
                         HIVE STREAM
                              |
              +---------------+----------------+
              |                                |
        MEDIA / ROOM MODEL                PLAYBACK
              |                                |
              v                                v
       Media Identity                    Video.js / HLS.js
       Playlist                         HiveStream HLS adapter
       Replication policy                       |
       Metadata                                  v
              |                         p2p-media-loader
              v                           /          \
       Persistent Media Store          WebRTC       HTTP
              |                            \          /
              +-----------------------------v--------+
                                           peers/origin
```

The important change is that the **media model and persistent store belong to HiveStream**, while p2p-media-loader is a replaceable distribution adapter.

---

# 2. Browser P2P streaming engines investigated

## 2.1 Novage p2p-media-loader — current leading candidate

Repository: https://github.com/Novage/p2p-media-loader

Current package line investigated: 4.x.

Capabilities established from current documentation/source investigation:

- browser JavaScript/TypeScript;
- WebRTC DataChannels for peer media exchange;
- HLS and MPEG-DASH;
- VOD and live;
- Hls.js integration;
- Shaka Player integration;
- HTTP fallback;
- peer segment announcements;
- segment requests/uploads;
- configurable swarm identity;
- custom SegmentStorage;
- IndexedDB example implementation;
- WebTorrent-compatible tracker signaling;
- modern desktop/mobile browser targets.

Current documentation explicitly describes a hybrid model: HTTP initially supplies media, peers subsequently exchange segments, and peers continue sharing already acquired segments.

Most important HiveStream finding:

```text
SegmentStorage
    |
    +-- stored segment IDs
    |       |
    |       +--> P2P availability announcement
    |
    +-- segment bytes
            |
            +--> P2P upload
```

This is unusually well aligned with HiveStream's persistent-replica goal.

### Qualification

p2p-media-loader uses compatible WebTorrent trackers for signaling. That does **not** make the application architecture equivalent to WebTorrent. The media protocol is segment-oriented rather than generic BitTorrent file distribution.

### Assessment

**Status:** STRONG CANDIDATE  
**Role:** media distribution adapter  
**Do not make:** application-level media identity/database

---

# 3. CDNBye / SwarmCloud family

Repositories include:

- https://github.com/cdnbye/hlsjs-p2p-engine
- https://github.com/cdnbye/dashjs-p2p-engine
- https://github.com/swarm-cloud/hls-p2p-engine
- https://github.com/swarm-cloud/vhs-p2p-engine
- https://github.com/cdnbye/file-p2p-engine

Official product/docs: https://cdnbye.com/

This is the most significant alternative discovered in the broad search.

The HLS engine explicitly implements:

- WebRTC DataChannels;
- live and VOD HLS;
- BitTorrent-like peer protocol;
- fallback to normal server delivery;
- HLS.js integration;
- Video.js and other player integration;
- scheduling policies;
- encrypted HLS support;
- browser P2P delivery.

The project also has separate engines for:

- HLS;
- MPEG-DASH;
- Shaka Player;
- Video.js VHS;
- MP4;
- file delivery;
- ServiceWorker-based HLS delivery.

That breadth is architecturally interesting.

### Why it matters to HiveStream

The `mp4` and ServiceWorker variants are particularly relevant because HiveStream eventually wants local-file ingestion and persistent media reuse, not merely CDN offload.

However, the ecosystem appears substantially more product/service-oriented than p2p-media-loader. The public source exists, but production operation, dashboards, peer grouping, and service integration are part of the broader SwarmCloud offering.

### Assessment

**Status:** IMPORTANT ALTERNATIVE / RESEARCH REFERENCE  
**Potential advantage:** broader player/media integration and ServiceWorker/MP4 variants  
**Potential concern:** architecture/service dependency and less obvious fit for HiveStream-owned persistent storage

This should remain on the shortlist until we inspect its actual storage, peer protocol, and licensing boundaries more deeply.

---

# 4. Streamroot / BemTV lineage

Repository:

https://github.com/streamroot/bemtv

BemTV is an archived Apache-2.0 open-source HLS/WebRTC P2P project. The repository describes itself as a hybrid CDN/P2P architecture for live video using HLS and WebRTC.

The Streamroot GitHub organization also contains:

- DNA integration samples;
- Clappr P2P HLS plugin;
- Video.js HLS.js source handler;
- BemTV.

This is particularly relevant because CyTube already contains a Streamroot-branded HLS.js integration layer.

### What it tells us

Streamroot/BemTV demonstrates that the exact architecture we are considering has historical precedent:

```text
Video player
    |
HLS source handler
    |
HLS.js
    |
P2P engine
    |
WebRTC
```

But BemTV is archived and therefore should not become a new dependency.

### Assessment

**Status:** ARCHITECTURAL REFERENCE  
**Use:** study peer scheduling, source-handler integration, and historical design decisions  
**Do not use as:** current production dependency

---

# 5. p2p-hls / webp2p-hls

Repository:

https://github.com/augok/p2p-hls

This is a smaller Hls.js-based browser P2P library. It explicitly supports HLS live/VOD, uses WebRTC, and exposes traffic/peer events.

It demonstrates another minimal architecture:

```text
HLS.js
  |
p2p-hls
  |
WebRTC
```

It is useful as a lightweight comparative implementation, but its smaller ecosystem and much smaller community footprint make it less attractive as HiveStream's foundation.

### Assessment

**Status:** EXPERIMENTAL REFERENCE  
**Use:** inspect simplicity and API surface  
**Do not currently select over p2p-media-loader

---

# 6. WebTorrent

Repository: https://github.com/webtorrent/webtorrent

WebTorrent remains a legitimate browser P2P engine. It uses WebRTC DataChannels in browsers and supports streaming torrent files into HTML media elements.

However, our earlier repository investigation and this wider comparison reinforce the architectural concern:

WebTorrent models the problem primarily as:

```text
Torrent
  |
Pieces
  |
BitTorrent swarm
  |
Files
```

HiveStream's desired model is closer to:

```text
Media
  |
Representation
  |
Segments
  |
Persistent replica
  |
Room swarm
```

WebTorrent is therefore more generic and more file/torrent-oriented than we need for the core playback path.

### Assessment

**Status:** USEFUL GENERAL-PURPOSE P2P ENGINE / NOT CURRENT LEADING MEDIA ENGINE  
**Potential future role:** desktop bridge, generic file transfer, local seeding, or comparison implementation

We should not discard it, but we should stop treating it as the default HiveStream media transport merely because it is well known.

---

# 7. PeerLive / PCDN / PeerJS-based prototypes

Examples:

- https://github.com/titpetric/PeerLive
- https://github.com/Iragne/PCDN

These projects demonstrate hybrid CDN/P2P HLS using PeerJS/WebRTC and Video.js.

They are valuable because they expose a simpler conceptual architecture:

```text
Video.js
   |
HLS
   |
PeerJS
   |
WebRTC
```

But the repositories explicitly describe themselves as proof-of-concept projects.

### Assessment

**Status:** HISTORICAL / EDUCATIONAL REFERENCE

Useful for understanding minimal P2P CDN construction, not appropriate as a foundation.

---

# 8. Decentralized P2P CDN research prototype

Repository:

https://github.com/Peer-to-Peer-CDN/P2P-CDN

This project is not primarily a production media engine. Its importance is architectural: it explores decentralized peer discovery rather than relying on a conventional centralized discovery service.

That is relevant to HiveStream because our long-term room swarm may eventually want room-local or application-level peer discovery rather than universal public trackers.

### Assessment

**Status:** ARCHITECTURAL RESEARCH REFERENCE

Particularly worth studying for future HiveStream control-plane discovery.

---

# 9. IPFS / Helia / libp2p

This is the most important alternative outside the HLS-P2P-engine family.

Helia: https://github.com/ipfs/helia

IPFS browser documentation: https://docs.ipfs.tech/how-to/ipfs-in-web-apps/

Helia is a modern TypeScript IPFS implementation designed to run in browsers, Service Workers, Node.js, Electron and React Native.

It provides:

- content addressing;
- content routing;
- peer routing;
- libp2p transports;
- browser WebRTC;
- WebTransport;
- WebSockets;
- verified content retrieval.

Current IPFS browser documentation explicitly discusses direct browser connectivity using WebRTC-direct and WebTransport and notes browser networking constraints.

### Why this matters to HiveStream

Helia is **not a drop-in replacement for p2p-media-loader**.

It solves a different problem:

```text
IPFS / Helia
    = decentralized content addressing + retrieval
```

whereas:

```text
p2p-media-loader
    = playback-aware segment distribution
```

But Helia may be highly relevant to the HiveStream **control/content identity layer**.

Potential future architecture:

```text
HiveStream Media Identity
        |
        +-- HLS/P2P swarm identity
        |
        +-- optional CID
                |
                v
             Helia
                |
        decentralized retrieval
```

### Assessment

**Status:** IMPORTANT SECONDARY TECHNOLOGY

Do not replace p2p-media-loader with Helia today.

Investigate Helia as a possible **content-addressing, discovery, and long-term distribution substrate**.

---

# 10. libp2p browser WebRTC

Repository:

https://github.com/libp2p/js-libp2p-webrtc

libp2p's JavaScript WebRTC transport gives HiveStream a more general peer networking substrate than p2p-media-loader.

It supports protocol multiplexing and encrypted connections and can operate with WebRTC and WebTransport transports.

The important distinction is:

```text
libp2p
  = general P2P network substrate
```

while:

```text
p2p-media-loader
  = media-specific P2P engine
```

### Assessment

**Status:** HIGH-VALUE FUTURE CONTROL-PLANE TECHNOLOGY

Potential uses:

- room gossip;
- peer identity;
- media metadata exchange;
- availability exchange;
- room-local discovery;
- future desktop/browser interoperability.

Do not duplicate p2p-media-loader's segment protocol with libp2p until there is a demonstrated requirement.

---

# 11. WebTransport

Current MDN documentation identifies WebTransport as a modern client/server transport using HTTP/3, supporting:

- multiple streams;
- unidirectional streams;
- reliable delivery;
- out-of-order delivery;
- unreliable datagrams.

It is available in Web Workers and is becoming broadly available in current browsers.

WebTransport is **not peer-to-peer by itself**. Its natural topology is browser ↔ server.

### HiveStream role

Potentially excellent for:

```text
browser
   |
WebTransport
   |
HiveStream infrastructure
```

for:

- bootstrap;
- signaling;
- room control;
- tracker replacement;
- fallback media acquisition;
- communication with desktop/server peers;
- future libp2p/WebTransport interoperability.

IPFS documentation also demonstrates WebTransport as a browser-to-node transport for decentralized systems.

### Assessment

**Status:** IMPORTANT INFRASTRUCTURE RESEARCH

Not a replacement for WebRTC peer exchange.

Potentially a major improvement to HiveStream's control/bootstrap plane.

---

# 12. OPFS — potentially important architecture change

MDN:

https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system

OPFS is now widely available and designed for high-performance origin-private storage. It supports worker-side synchronous access handles.

This is significant because HiveStream wants to store **large persistent media**, not merely small application records.

Recommended division:

```text
IndexedDB
  |
  +-- media metadata
  +-- playlist metadata
  +-- segment index
  +-- replication state

OPFS
  |
  +-- segment bytes
  +-- local media files
  +-- potentially packaged media
```

This is now a serious candidate for the bulk media store.

### Important limitation

OPFS is subject to origin storage quotas and eviction. It is not a permanent user-visible filesystem. `navigator.storage.estimate()` and `StorageManager.persist()` must be part of the storage policy.

### Assessment

**Status:** HIGH PRIORITY ARCHITECTURE INVESTIGATION

This may be a better bulk-storage substrate than putting every large segment directly into IndexedDB.

---

# 13. WebCodecs

MDN:

https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API

WebCodecs provides low-level browser-native access to encoded and decoded media:

```text
EncodedVideoChunk
        |
        v
VideoDecoder
        |
        v
VideoFrame
```

and corresponding audio APIs.

It is useful for:

- media processing;
- remuxing/transcoding pipelines;
- browser video editing;
- custom rendering;
- low-level streaming.

### Why HiveStream should care

Local-file ingestion is one of HiveStream's primary goals.

A future ingestion pipeline could become:

```text
local file
   |
demux
   |
encoded chunks
   |
WebCodecs / packaging
   |
fMP4/HLS segments
   |
Media Store
   |
P2P
```

The major advantage is that compatible media might be **repackaged rather than transcoded**.

### Important limitation

MDN still marks `VideoDecoder` as not Baseline because browser support is not universal. Therefore WebCodecs cannot currently become the only playback path.

### Assessment

**Status:** HIGH-VALUE INGESTION/ADVANCED-PLAYBACK TECHNOLOGY

Do not replace HLS/MSE today.

---

# 14. MSE / Managed Media Source

MSE remains the mainstream browser mechanism for JavaScript-driven segmented playback.

Managed Media Source is particularly interesting because the browser can actively manage buffered media memory and evict content when necessary.

This is relevant to mobile devices where memory pressure matters.

However, ManagedMediaSource is still marked limited/experimental by MDN and therefore should remain an adaptive implementation detail rather than the sole playback contract.

---

# 15. SharedWorker / BroadcastChannel / Web Locks

These technologies become important once a single origin has multiple HiveStream tabs/windows.

### SharedWorker

A SharedWorker can be accessed by multiple same-origin browsing contexts.

Potential architecture:

```text
Tab A ─┐
Tab B ─┼── SharedWorker ── P2P manager
Tab C ─┘                  storage manager
```

This could prevent every tab from establishing its own redundant P2P swarm connections.

### BroadcastChannel

Useful for lightweight same-origin coordination between tabs/workers.

### Web Locks

Useful for ensuring that only one context performs certain operations, such as:

- storage maintenance;
- media ingestion;
- replica eviction;
- swarm maintenance.

### Assessment

**Status:** FUTURE ARCHITECTURE SUPPORT

Do not make these required for the first prototype.

---

# 16. WebTorrent tracker is not the same thing as WebTorrent media transport

This distinction is now important enough to document explicitly.

p2p-media-loader currently uses WebTorrent-compatible trackers for peer discovery/signaling.

Therefore:

```text
WebTorrent tracker
       !=
WebTorrent media protocol
```

HiveStream can potentially use:

```text
p2p-media-loader
      |
WebRTC segment protocol
      |
WebTorrent-compatible tracker
```

without making WebTorrent's torrent/piece model part of HiveStream.

Long term, the tracker/signaling component could potentially be replaced with HiveStream/libp2p/WebTransport-based discovery if there is a reason to do so.

---

# 17. Revised comparison

| Technology | Browser P2P | Media-aware | HLS/DASH | Persistent storage seam | Local-file relevance | Current HiveStream role |
|---|---:|---:|---:|---:|---:|---|
| p2p-media-loader | Yes | **Yes** | **Yes** | **Excellent** | Good | **Leading media transport** |
| CDNBye/SwarmCloud | Yes | **Yes** | **Yes** | Unknown/less aligned | Potentially strong | Major alternative/reference |
| WebTorrent | Yes | Generic files | No native HLS model | Different model | **Strong** | Generic P2P/file transport |
| Streamroot/BemTV | Yes | Yes | HLS | Unknown | Medium | Historical reference |
| p2p-hls | Yes | Yes | HLS | Unknown | Medium | Experimental reference |
| PeerJS PCDN | Yes | Yes | HLS | Weak | Medium | Historical prototype |
| Helia/IPFS | Yes | Generic content | Not playback-aware | Strong content-addressing | **Strong** | Content/discovery substrate |
| libp2p | Yes | Generic protocols | No | Depends on app | Strong | Control-plane/network substrate |
| WebTransport | No inherent P2P | Generic | Can carry media | Depends | Strong | Server/bootstrap/control transport |
| WebCodecs | No P2P | Media-native | No | No | **Excellent** | Ingestion/advanced playback |
| OPFS | No P2P | Storage | N/A | **Excellent** | **Excellent** | Likely bulk media store |

---

# 18. Revised HiveStream architecture

The research suggests six major layers.

```text
+------------------------------------------------------------+
|                    HIVE STREAM APPLICATION                 |
+------------------------------------------------------------+
| ROOM / PLAYLIST                                            |
| room state, playlist, permissions, scheduling              |
+------------------------------------------------------------+
| MEDIA MODEL                                                |
| media identity, representations, manifests, metadata       |
+------------------------------------------------------------+
| REPLICATION                                                |
| retention, prefetch, replica health, priority              |
+------------------------------------------------------------+
| MEDIA STORE                                                |
| IndexedDB metadata + OPFS bulk bytes                       |
+------------------------------------------------------------+
| DISTRIBUTION                                               |
| p2p-media-loader / WebRTC / tracker / HTTP                 |
+------------------------------------------------------------+
| PLAYBACK                                                   |
| Video.js / HLS.js / MSE or MMS / native fallback           |
+------------------------------------------------------------+
```

Separate control-plane candidates:

```text
HiveStream Control Plane
    |
    +-- WebSocket initially
    +-- WebTransport candidate
    +-- libp2p candidate
    +-- BroadcastChannel for same-origin local coordination
```

Separate ingestion path:

```text
Local File
    |
    +-- inspect
    +-- identify/hash
    +-- demux/remux
    +-- WebCodecs where appropriate
    +-- segment/package
    v
Media Store
    v
P2P Distribution
```

---

# 19. What should NOT be combined prematurely

Do not build one giant custom P2P engine that simultaneously owns:

- peer discovery;
- media segmentation;
- storage;
- playlist state;
- playback;
- room state;
- WebRTC protocol;
- synchronization.

That would recreate the complexity we are deliberately trying to avoid.

Instead:

```text
HiveStream owns:
  media identity
  room/playlist semantics
  persistence policy
  replication policy
  local ingestion
  control plane

Existing engines own:
  media playback
  segment P2P transport
  WebRTC mechanics
  HTTP fallback
```

---

# 20. New high-priority research questions

Before committing to the final implementation architecture, investigate these in order:

### R1 — OPFS as bulk SegmentStorage

Can p2p-media-loader's SegmentStorage interface be backed by OPFS efficiently while IndexedDB stores the metadata/index?

### R2 — Existing segment restoration

Can pre-populated persistent segments activate a P2PLoader and cause those segments to be announced to peers without first downloading them through the normal HTTP path?

This remains an important open question from the earlier investigation.

### R3 — Local MP4 ingestion without transcoding

Can common H.264/AAC MP4 files be inspected/remuxed/segmented in-browser without FFmpeg transcoding?

### R4 — WebCodecs-assisted ingestion

Can WebCodecs be used selectively for unsupported or special inputs while preserving HLS as the playback contract?

### R5 — CDNBye/SwarmCloud storage and protocol

Inspect its source to determine whether its architecture offers anything materially better than p2p-media-loader for persistent room swarms.

### R6 — Helia/libp2p control plane

Determine whether HiveStream should eventually use content addressing and libp2p discovery for room/media metadata while retaining p2p-media-loader for actual media segments.

### R7 — WebTransport

Determine whether WebTransport should become the preferred HiveStream bootstrap/control transport instead of expanding WebSocket infrastructure.

### R8 — Multi-tab ownership

Test whether a SharedWorker can safely own the P2P/storage manager for multiple HiveStream tabs on Android and desktop.

---

# 21. Revised implementation strategy

Do not start by writing a custom WebRTC media engine.

Do not start by implementing WebCodecs playback.

Do not start by replacing HLS.

Instead:

```text
Phase 1
  Standalone HLS.js + p2p-media-loader
  desktop + Android
  two-browser P2P proof

Phase 2
  custom SegmentStorage
  IndexedDB baseline
  OPFS experimental backend

Phase 3
  persistent segment restoration
  storage -> P2P announcement proof

Phase 4
  HiveStream Media Identity
  HiveStream Playlist -> Media Identity

Phase 5
  local-file ingestion
  compatible-file remux/segment path

Phase 6
  replication manager
  prefetch/retention policy

Phase 7
  CyTube HLS source-handler integration

Phase 8
  optional libp2p/WebTransport control-plane experiments
```

This ordering minimizes irreversible decisions.

---

# 22. Evidence classification

## SOURCE PROVEN

- p2p-media-loader is a browser JavaScript P2P media engine for HLS/DASH.
- p2p-media-loader supports custom SegmentStorage and derives P2P segment availability from storage.
- CDNBye/SwarmCloud provides browser HLS/DASH/MP4/file P2P engines using WebRTC.
- Streamroot/BemTV is an archived open-source HLS/WebRTC P2P architecture.
- WebTorrent is a browser JavaScript P2P file/torrent engine using WebRTC.
- Helia is a browser-capable JavaScript IPFS implementation.
- libp2p has browser WebRTC/WebTransport transports.
- OPFS provides high-performance origin-private storage and worker synchronous access handles.
- WebCodecs provides browser-native encoded/decoded media primitives.
- WebTransport provides HTTP/3 streams and datagrams.
- SharedWorker, BroadcastChannel and Web Locks provide same-origin coordination primitives.

## RUNTIME PROVEN

Existing HiveStream/CyTube tests have established the CyTube player, HLS source-handler boundary, Socket.IO behavior, playlist lifecycle, and current browser runtime observations documented in prior knowledge artifacts.

## STRONG INFERENCE

- p2p-media-loader is currently the best fit for HiveStream's initial playback-oriented P2P segment layer.
- OPFS is a strong candidate for bulk persistent media storage.
- IndexedDB remains better suited to media metadata/index/replication state than as the only bulk byte store.
- Helia/libp2p may fit a future control/content-addressing plane rather than replacing the playback P2P engine.
- WebCodecs is especially promising for local ingestion and selective advanced media processing.
- WebTransport is potentially valuable for server/bootstrap/control communication but is not itself a browser-to-browser P2P solution.

## UNPROVEN / OPEN

- OPFS performance and quota behavior on the user's target Android browser for multi-gigabyte media.
- OPFS-backed p2p-media-loader SegmentStorage interoperability.
- Pre-populated storage -> P2PLoader -> peer announcement lifecycle.
- CDNBye/SwarmCloud superiority or inferiority for HiveStream persistent swarms.
- WebCodecs-assisted local HLS/fMP4 packaging without transcoding.
- SharedWorker feasibility and lifecycle behavior on target Android browsers.
- Whether Helia/libp2p adds enough value to justify a second P2P network/control substrate.

## DESIGN PROPOSAL

The recommended architecture is a layered HiveStream media system in which:

1. HiveStream owns media identity, playlist semantics, persistence policy, replication policy and ingestion.
2. p2p-media-loader initially owns segment-oriented P2P delivery.
3. OPFS is investigated as the bulk persistent byte store.
4. IndexedDB stores metadata/index/state.
5. HLS.js/MSE remain the initial playback contract.
6. WebCodecs is reserved for ingestion/advanced media processing.
7. libp2p/WebTransport remain optional control/discovery infrastructure.

---

# 23. Final checkpoint

The wide search did **not** reveal a clearly superior open-source browser P2P media engine that invalidates p2p-media-loader.

It did reveal two important architectural possibilities that deserve immediate testing before the architecture is frozen:

```text
OPFS
  -> likely better bulk persistent media substrate

Helia/libp2p/WebTransport
  -> potentially valuable future control/discovery substrate
```

It also identified CDNBye/SwarmCloud as the most significant direct alternative worth source-level comparison.

Therefore the next experimental work should not be a wholesale architecture rewrite.

It should be a **focused validation of the new boundaries**:

```text
             HiveStream Media Store
                      |
              +-------+-------+
              |               |
          IndexedDB         OPFS
          metadata          bytes
              |               |
              +-------+-------+
                      |
                SegmentStorage
                      |
               p2p-media-loader
                      |
                WebRTC peers
```

while independently investigating:

```text
Local file
   |
WebCodecs / demux/remux
   |
HLS/fMP4 segments
   |
Media Store
```

This preserves the current strongest candidate while keeping the architecture open at exactly the points where the research has identified meaningful alternatives.

---

## Provenance

**Human Project Lead:** Elwood Edwards  
**AI Research & Engineering:** GPT-5.6 Luna (OpenAI) — HiveStream Research & Engineering Assistant

AI role in this artifact: browser/P2P technology source investigation, comparative architectural analysis, evidence classification, and research planning. Human remains project lead and final architectural decision-maker.
