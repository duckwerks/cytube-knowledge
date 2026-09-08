# HiveStream P2P Engine Architecture Decision — 2026-09-08

## Provenance

- Human Project Lead: Elwood Edwards
- AI Research & Engineering: GPT-5.6 Luna (OpenAI) — HiveStream Research & Engineering Assistant
- AI role: source investigation, reverse engineering, architectural analysis, technology comparison, evidence classification, test design, and implementation assistance.

## Decision Status

**Architecture recommendation — PRE-IMPLEMENTATION BASELINE**

This document consolidates the browser P2P streaming investigation and records the current preferred architecture. It intentionally separates what existing technologies provide from what HiveStream uniquely needs to build.

## Executive Decision

**Use Novage p2p-media-loader as the initial HiveStream media-plane engine. Do not use WebTorrent as the core media architecture. Do not build a new P2P media protocol.**

Wrap the selected engine behind a HiveStream `MediaDistribution` abstraction so that the transport remains replaceable.

Use the best ideas found in competing technologies without importing their unnecessary architectural assumptions:

- From p2p-media-loader: segment-oriented P2P, HTTP fallback, persistent/custom `SegmentStorage`, HLS/DASH integration, WebRTC data channels, tracker-based swarm discovery.
- From CDNBye/SwarmCloud: explicit P2P-vs-HTTP statistics, browser fallback thinking, ServiceWorker/native-HLS compatibility research, player-agnostic integration ideas, and evidence that MP4/file P2P can be separated from HLS P2P.
- From WebTorrent: robust torrent-style peer/swarm concepts, streaming-aware piece selection, interoperability with the wider BitTorrent ecosystem where useful, and the principle of not inventing another wire protocol unnecessarily.
- From Streamroot/BemTV: historical evidence for hybrid CDN/P2P HLS architecture and browser WebRTC distribution, but **do not adopt archived code as a dependency**.
- From newer/general P2P systems such as libp2p/Helia: consider content identity, discovery, and application/control-plane networking separately from the media segment transport.

## Core HiveStream Objective

HiveStream is not primarily a synchronization system and not primarily a WebTorrent player.

Its primary objective is:

> Turn recurring watch rooms into persistent cooperative media swarms so that repeated playback increasingly comes from users' retained media replicas rather than the origin/server.

Secondary primary objective:

> Allow a user to ingest local media, persist it, and make it available to other room peers through the same distribution system.

Playback synchronization remains a separate compatibility/functionality layer.

## Why p2p-media-loader Wins the Cross-Examination

### 1. It matches the actual media abstraction

HiveStream needs to distribute media segments while playback consumes a stream. p2p-media-loader already models:

- streams
- stream identities
- segments
- segment storage
- P2P segment announcements
- P2P segment requests
- P2P segment uploads
- HTTP acquisition/fallback
- HLS.js/Shaka integrations

This is much closer to HiveStream's problem than a generic torrent client.

### 2. It has a storage seam we can exploit

The `SegmentStorage` interface supports initialization, storing data, retrieving data, listing stored segment IDs, checking segment existence, usage reporting, and change callbacks.

Its P2P loader derives announcements from stored segment IDs and uploads requested segments directly from storage.

This creates the desired path:

```text
local/p2p/http media bytes
        ↓
   SegmentStorage
        ↓
 stored segment inventory
        ↓
 P2P availability announcement
        ↓
 peer requests
        ↓
 SegmentStorage.getSegmentData()
```

This is the strongest match yet found for HiveStream's persistent-replica concept.

### 3. It is actively maintained

The current `p2p-media-loader-hlsjs` package is version 4.0.0 and was published recently at the time of this decision. Its current migration documentation also shows active evolution of stream identity, storage APIs, and peer metadata.

### 4. It is already player-integration oriented

The HLS.js integration injects fragment/playlist loading rather than requiring HiveStream to replace the entire playback stack.

That fits the existing CyTube architecture:

```text
CyTube
  ↓
Video.js
  ↓
HiveStream HLS integration
  ↓
HLS.js 1.x
  ↓
p2p-media-loader
```

## Why WebTorrent Is Not the Core

WebTorrent is technically capable and remains useful technology, but it solves a broader torrent/file distribution problem rather than the exact segment-storage/playback integration HiveStream needs.

Its strengths include:

- mature BitTorrent model
- browser WebRTC transport
- torrent/magnet interoperability
- piece selection
- streaming files
- interoperability with compatible WebTorrent peers

But the HiveStream-specific costs include:

- torrent piece semantics become another identity layer alongside media/segment identity
- playback integration requires a file/torrent-to-media bridge
- persistent room media would need another mapping between torrent pieces and HiveStream's segment model
- it encourages the architecture to revolve around torrents instead of media objects and representations

Therefore:

> WebTorrent is a useful interoperability or alternate distribution backend candidate, not the HiveStream media-plane foundation.

## CDNBye / SwarmCloud Cross-Examination

CDNBye/SwarmCloud is the strongest alternative discovered.

It provides:

- WebRTC data-channel P2P
- HLS live/VOD support
- DASH support
- HLS.js integration
- Video.js and other player integrations
- P2P/HTTP fallback
- P2P traffic statistics
- ServiceWorker-based engines
- MP4/file-oriented P2P engines
- browser compatibility work including iOS Safari paths

Its most useful ideas for HiveStream are:

1. Treat P2P as an optimization over a reliable HTTP playback path.
2. Measure HTTP downloaded, P2P downloaded, and P2P uploaded bytes separately.
3. Keep the P2P engine below the player integration seam.
4. Investigate ServiceWorker delivery for browser-native playback paths.
5. Keep HLS, DASH, and direct-file P2P as distinct adapters rather than forcing everything into one player implementation.

However, the public CDNBye HLS repository's visible issue/PR history is substantially older than p2p-media-loader's current release activity, and its architecture includes service-specific concepts such as dashboard/domain registration and tokens. SwarmCloud's newer fork is active, but it is less attractive for HiveStream as a foundational dependency because we want an open-source engine whose storage/core abstractions we can directly control and extend.

**Decision:** study and borrow architectural ideas; do not select CDNBye/SwarmCloud as the core engine at this stage.

## Streamroot / BemTV

BemTV is strong historical prior art for hybrid CDN/P2P HLS over WebRTC. It demonstrates that browser P2P video delivery can be organized around HLS segments and a hybrid origin/P2P architecture.

But the repository is archived and read-only.

**Decision:** architectural reference only.

## Other Generic Torrent Engines

Z-Torrent and similar projects demonstrate interesting browser torrent capabilities, including streaming, on-demand piece fetching, sequential/rarest-first selection, and browser WebRTC.

These are useful research references but do not improve the primary HiveStream architecture enough to justify another torrent abstraction.

**Decision:** monitor as possible future interoperability/back-end candidates, not the initial engine.

## What We Consolidate From the Alternatives

### Peer selection / piece scheduling

HiveStream should preserve the concept of actively balancing:

- imminent playback demand
- rare segments
- peer availability
- HTTP fallback
- peer upload capacity

p2p-media-loader already has P2P scheduling machinery; HiveStream should expose policy controls above it rather than replacing the scheduler prematurely.

### Explicit transport accounting

Expose metrics such as:

```text
HTTP bytes downloaded
P2P bytes downloaded
P2P bytes uploaded
P2P ratio
segment cache hit rate
peer count
peer churn
origin fallback count
```

These metrics are essential for proving the project's primary objective: server bandwidth reduction.

### Browser fallback

Playback must never depend on P2P availability.

Preferred acquisition order should conceptually be:

```text
persistent local segment
        ↓
P2P peer
        ↓
HTTP origin/CDN
```

The exact p2p-media-loader scheduler may interleave these paths, but the application contract remains:

> P2P is an optimization; playback must remain viable without it.

### ServiceWorker research

Do not make ServiceWorker a core dependency yet.

Keep it as a future playback/distribution adapter for environments where HLS.js/MSE is unavailable or undesirable, particularly Safari/iOS experiments.

### Torrent interoperability

Do not make torrents the media identity.

If WebTorrent interoperability is eventually useful, map it behind `MediaDistribution`:

```text
HiveStream Media Identity
        ↓
Distribution Backend
        ├── p2p-media-loader
        ├── WebTorrent adapter (future)
        └── other backend (future)
```

## Revised HiveStream Architecture

```text
                         CYTUBE / ROOM UI
                                │
                         CyTube Adapter
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│                      HIVESTREAM CORE                         │
│                                                              │
│  Room/Playlist       Media Model        Replication Manager  │
│       │                   │                     │             │
│       └───────────────────┼─────────────────────┘             │
│                           ▼                                   │
│                    Media Store API                            │
│                           │                                   │
│                ┌──────────┴──────────┐                        │
│                │                     │                        │
│           metadata/index        segment bytes                 │
│                │                     │                        │
│             IndexedDB              OPFS*                      │
│                                      │                        │
│                                      │                        │
│                         SegmentStorage Adapter                │
│                                      │                        │
│                                      ▼                        │
│                        MediaDistribution API                  │
│                                      │                        │
│                         ┌────────────┴────────────┐            │
│                         │                         │            │
│                  p2p-media-loader          future adapters    │
│                         │                    (WebTorrent,      │
│                         │                     etc.)           │
│                    WebRTC                                   │
│                         │                                     │
└─────────────────────────┼─────────────────────────────────────┘
                          │
                    room media swarm
                          │
                ┌─────────┴─────────┐
                │                   │
             peers               HTTP origin

PLAYBACK ADAPTER (separate concern)

CyTube Video.js
      ↓
HiveStream HLS integration
      ↓
HLS.js 1.x
      ↓
p2p-media-loader HLS engine
      ↓
MSE / native fallback where appropriate
```

`OPFS*` is an investigation target, not yet an implementation decision. IndexedDB remains the known-good baseline until storage experiments prove an OPFS design superior.

## Media Identity Rule

HiveStream's application identity must remain above transport-specific identities.

```text
HiveStream Media ID
        ↓
Representation ID
        ↓
HiveStream Segment ID
        ↓
p2p-media-loader streamSwarmId/infoHash
```

Do not expose WebTorrent infohashes or p2p-media-loader infohashes as the canonical application media identity.

## Local Ingestion

Local ingestion should eventually use the same media-store/distribution path as downloaded media:

```text
Local File
   ↓
Media Inspector
   ↓
Identity / metadata
   ↓
Demux/remux/segment pipeline
   ↓
Media Store
   ↓
SegmentStorage
   ↓
P2P advertisement
```

The critical open experiment is whether compatible local media can be segmented/remuxed without transcoding and populated into the storage representation expected by the selected P2P engine.

## What We Should NOT Build Yet

Do not build:

- a custom WebRTC media protocol
- a custom BitTorrent replacement
- a custom peer scheduler
- a second segment-exchange protocol
- a custom player renderer
- WebGPU-based playback
- WebCodecs-only playback
- a custom P2P tracker unless existing tracker behavior proves inadequate

These are all unnecessary until an experiment demonstrates that the selected engine cannot meet a concrete HiveStream requirement.

## Practical Scope Check

The following are in scope now:

1. HLS.js 1.x + p2p-media-loader browser compatibility.
2. Two-browser P2P segment transfer.
3. Custom/persistent SegmentStorage.
4. Mapping HiveStream media identity to p2p-media-loader swarm identity.
5. CyTube Video.js/HLS integration seam.
6. Local compatible-media ingestion experiments.
7. Server bandwidth reduction measurement.
8. Replication/prefetch policy above the P2P engine.

The following are deferred:

- replacing HLS/MSE with WebCodecs-only playback
- WebGPU rendering pipeline
- full libp2p/Helia media transport
- WebTransport as a media transport
- WebTorrent interoperability
- ServiceWorker-first playback
- custom tracker infrastructure

## Next Experimental Sequence

### Experiment 1 — Browser P2P proof

```text
Browser A
   ↓
HLS.js + p2p-media-loader
   ↓
HTTP seed

Browser B
   ↓
same stream identity
   ↓
P2P segment acquisition
```

Prove actual P2P bytes, not merely successful playback.

### Experiment 2 — Persistent storage

```text
Browser A
   ↓
acquire segments
   ↓
custom SegmentStorage
   ↓
close/reopen
   ↓
restore inventory
```

### Experiment 3 — Storage-to-P2P announcement

```text
pre-existing local segments
        ↓
loader activation
        ↓
segment announcement
        ↓
Browser B requests them
```

This is currently one of the most important unproven boundaries.

### Experiment 4 — Local ingestion

```text
local compatible MP4
        ↓
segment/remux
        ↓
SegmentStorage
        ↓
P2P peer
```

### Experiment 5 — CyTube integration

```text
CyTube Video.js
        ↓
HiveStream HLS adapter
        ↓
HLS.js 1.x
        ↓
p2p-media-loader
```

Only after the standalone path works.

## Evidence Classification

### SOURCE PROVEN

- p2p-media-loader is a browser JavaScript P2P media engine for HLS/DASH.
- It uses WebRTC data channels and tracker-based peer discovery.
- It has a public SegmentStorage abstraction and custom storage support.
- Its HLS.js integration is implemented below the player through loader integration.
- CDNBye/SwarmCloud provides HLS/DASH/MP4/file P2P engines and ServiceWorker-based browser paths.
- WebTorrent provides browser WebRTC BitTorrent streaming.
- BemTV is archived HLS/WebRTC P2P prior art.

### STRONG INFERENCE

- p2p-media-loader is the best current fit for HiveStream's media plane.
- WebTorrent should be treated as interoperability/backend technology rather than the architectural center.
- CDNBye/SwarmCloud ideas are useful for fallback, statistics, and browser compatibility, but do not justify replacing p2p-media-loader now.
- HiveStream should put application identity, persistence, and replication policy above the P2P engine.

### UNPROVEN / OPEN

- Persistent pre-existing segments activating a P2P loader and being announced without first being acquired through the loader.
- Best persistent byte store: IndexedDB vs OPFS vs hybrid.
- Best local-file remux/segmentation path.
- Exact HLS.js 1.x + CyTube Video.js compatibility in the real target page.
- Real Android-to-desktop P2P performance.
- Whether a future WebTorrent adapter would provide meaningful interoperability benefits.

## Final Architecture Principle

> **HiveStream should own media identity, persistence, replication policy, room integration, and local ingestion. The P2P engine should own peer-to-peer segment exchange. The playback engine should own decoding/rendering.**

The first implementation should therefore reuse p2p-media-loader rather than reinventing its transport, while keeping a narrow `MediaDistribution` seam so that the engine remains replaceable.
