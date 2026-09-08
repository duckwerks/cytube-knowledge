# HiveStream — Master LLM Handoff

**Document date:** 2026-09-08

## Authorship and provenance

- **Human Project Lead:** Elwood Edwards
- **AI Research & Engineering:** GPT-5.6 Luna (OpenAI) — HiveStream Research & Engineering Assistant
- **AI role:** source investigation, reverse engineering, architectural analysis, technology comparison, evidence classification, test design, and implementation assistance.
- **Document purpose:** durable project handoff for another LLM or engineer. This document is a current-state orientation, not a replacement for the detailed evidence artifacts in this repository.

---

# 1. What HiveStream Is

HiveStream is a browser-oriented **P2P video streaming platform with local media ingestion**.

The primary objective is to reduce dependence on centralized video bandwidth by allowing users watching the same recurring media to retain and redistribute media segments directly to one another.

The long-term room behavior is:

```text
FIRST WATCH
origin/server
    ↓
users acquire segments
    ↓
users retain segments
    ↓
users seed one another

REPEATED WATCHES
room's retained replicas
    ↓
P2P delivery
    ↓
origin demand decreases
```

A second core capability is local media introduction:

```text
user selects local video
        ↓
HiveStream identifies/inspects it
        ↓
media is represented as distributable segments
        ↓
segments are persisted locally
        ↓
segments become available to peers
```

### Project-defining sentence

> **HiveStream turns a recurring watch room from a server-fed collection of viewers into a persistent, cooperative media swarm.**

---

# 2. What HiveStream Is NOT Primarily

Do not allow the project to drift toward these as its central purpose:

- playback synchronization research
- a WebTorrent clone
- a custom BitTorrent protocol
- a generic decentralized network
- a token economy
- reputation/identity infrastructure
- recommendation graphs
- a custom media renderer
- WebGPU playback
- WebCodecs-only playback
- libp2p/Helia as the media transport

Synchronization is useful for a watch-together product, but it is **not the architectural center**. CyTube's leader mechanism was investigated because it was observable in the source/runtime; it should not be mistaken for HiveStream's core synchronization design.

---

# 3. Current Architectural Decision

## Selected initial media-plane engine

**Novage p2p-media-loader** is the current preferred foundation for P2P media segment exchange.

The project should **reuse the engine rather than build another segment-exchange protocol**.

The selected engine should sit behind a narrow HiveStream-owned abstraction, conceptually:

```javascript
MediaDistribution.getSegment(media, representation, segment)
MediaDistribution.hasSegment(media, representation, segment)
MediaDistribution.storeSegment(media, representation, segment, data)
MediaDistribution.getStats()
```

Exact APIs are implementation work; these names are architectural concepts, not existing library APIs.

## Recommended stack

```text
CyTube / HiveStream room UI
        ↓
HiveStream media + playlist layer
        ↓
HiveStream Media Store / Replication Manager
        ↓
MediaDistribution abstraction
        ↓
p2p-media-loader
        ↓
WebRTC DataChannels
        ↓
peer media swarm
```

Playback is a separate concern:

```text
HiveStream / CyTube Video.js
        ↓
HLS.js 1.x integration
        ↓
p2p-media-loader HLS integration
        ↓
MSE / browser-native fallback where appropriate
```

HTTP origin/CDN remains a fallback/bootstrap path.

---

# 4. The Core HiveStream Data Model

HiveStream should think in terms of **MEDIA**, not URLs or torrents.

```text
MEDIA
│
├── identity
│   ├── HiveStream media ID
│   ├── title
│   ├── duration
│   ├── metadata
│   └── external IDs (optional)
│
├── representations
│   ├── video/audio representation(s)
│   └── encoding/quality information
│
├── manifest
│   └── HLS representation
│
├── segments
│   ├── segment 0
│   ├── segment 1
│   └── ...
│
└── distribution state
    ├── locally retained segments
    ├── peer availability
    ├── replication priority
    └── acquisition statistics
```

## Identity rule

Keep HiveStream application identity above transport identity:

```text
HiveStream Media ID
        ↓
Representation ID
        ↓
HiveStream Segment ID
        ↓
p2p-media-loader streamSwarmId / infoHash
```

A WebTorrent infohash or p2p-media-loader infohash must **not** become the canonical application media ID.

---

# 5. Playlist Role

The playlist is not merely a player queue.

For HiveStream it should become the room's persistent **media manifest and playback schedule**.

Conceptually:

```text
Playlist item
    ↓
HiveStream Media ID
    ↓
representation
    ↓
segment set
    ↓
P2P swarm identity
```

The playlist can eventually inform replication priority, e.g. upcoming media should be acquired/retained before less likely media.

Do not overbuild this yet.

---

# 6. Persistent Storage

The important conceptual change is that local storage is not merely a cache.

It is a **local media replica**.

Current direction:

- IndexedDB: metadata, indexes, playlist state, replication state, and initially segment bytes.
- OPFS: investigation target for large segment byte storage/performance.
- Do not make OPFS a hard dependency until an experiment proves the benefit.

The selected P2P engine already exposes a `SegmentStorage` abstraction with initialization, storage, retrieval, existence checks, stored-segment enumeration, usage reporting, and change callbacks.

The desired path is:

```text
HTTP acquisition OR P2P acquisition OR local ingestion
                 ↓
           SegmentStorage
                 ↓
        persistent local replica
                 ↓
       availability inventory
                 ↓
          P2P announcement
                 ↓
          peer requests
                 ↓
       stored bytes uploaded
```

This is one of the strongest reasons p2p-media-loader fits HiveStream.

---

# 7. Replication Manager

HiveStream should eventually own a small policy layer above the P2P engine:

```text
ReplicationManager
     │
     ├── what should we retain?
     ├── what should we prefetch?
     ├── what should we seed?
     ├── what may be evicted?
     └── what upcoming playlist media has priority?
```

This is **not** a replacement for p2p-media-loader's internal scheduler.

HiveStream owns room-level policy; the P2P engine owns segment exchange mechanics.

---

# 8. Local Upload / Ingestion

The desired architecture is:

```text
Local File
   ↓
Media Inspector
   ↓
Media Identity / metadata
   ↓
demux/remux/segment pipeline
   ↓
Media Store
   ↓
SegmentStorage
   ↓
P2P advertisement
```

The first target should be a compatible local MP4 where remuxing/segmenting can be done without expensive transcoding.

FFmpeg WASM should be considered a fallback rather than the default because mobile CPU, RAM, battery, and storage costs matter.

WebCodecs is a future tool for advanced ingestion/media processing, not a requirement for the first playback implementation.

---

# 9. CyTube Knowledge Already Established

The CyTube investigation is substantial and should not be repeated from scratch.

### Socket.IO

Runtime and source evidence established the client path:

```text
server Socket.IO event
        ↓
socket.on(key, ...)
        ↓
Callbacks[key](data)
```

`initSocketIO()` connects the configured Socket.IO server and then calls `setupCallbacks()`.

Current runtime configuration observed included the secure server `https://zip.cytu.be:8443`, Socket.IO namespace `/`, Engine.IO v4, and WebSocket transport.

### Playlist movement

CyTube's Queue Next control emits:

```javascript
socket.emit("moveMedia", {
    from: li.data("uid"),
    after: PL_CURRENT
});
```

The important detail is that playlist identifiers are **UIDs**, not array indexes.

### Current media

`PL_CURRENT` is a client-side numeric playlist UID. `Callbacks.setCurrent(uid)` updates it.

### Natural playback advance

Observed runtime behavior:

```text
current UID
   ↓
player ends
   ↓
leader path may emit playNext
   ↓
server advances playlist
   ↓
setCurrent(next UID)
   ↓
changeMedia(next media)
```

The leader mechanism is a special control mechanism, not the normal definition of playback synchronization.

### Player architecture

CyTube uses Video.js player abstractions and has an HLS.js-based source handler. The historical plugin is Streamroot-branded `videojs-hlsjs-plugin` v1.0.16 using HLS.js 0.13.2.

This historical plugin is an HLS.js bridge; its presence is **not proof that current CyTube itself supplies the P2P engine HiveStream needs**.

---

# 10. P2P Engine Findings Already Established

p2p-media-loader provides the important primitives:

- HLS/DASH segment-oriented distribution
- WebRTC DataChannel peer exchange
- tracker-based discovery
- HTTP fallback
- custom SegmentStorage
- stored-segment inventory
- segment announcements
- segment requests
- segment uploads
- HLS.js/Shaka integration

Its architecture includes a HybridLoader and P2PLoader. Successful acquisition is stored through SegmentStorage. P2P availability is derived from stored segment IDs, and remote requests are served from storage.

One particularly important unproven boundary remains:

> If segments are prepopulated into persistent storage before the active P2P loader exists, exactly when/how does loader activation cause those stored segments to be announced to peers?

That should be experimentally proven before designing HiveStream around assumptions about it.

---

# 11. Browser Strategy

The playback contract should be:

> **HiveStream can provide the media. P2P is an optimization, not the playback contract.**

Conceptual acquisition preference:

```text
persistent local segment
        ↓
P2P peer
        ↓
HTTP origin/CDN
```

The real p2p-media-loader scheduler may interleave HTTP and P2P; the application should not force a simplistic sequence if doing so harms playback.

Primary experimental browser targets:

1. Chrome desktop
2. Firefox desktop
3. Chrome Android
4. Firefox Android

Secondary targets:

- Safari macOS
- Safari iOS/iPadOS
- Edge and other Chromium browsers

Safari/native-HLS paths need their own compatibility testing.

---

# 12. What We Deliberately Do Not Build Yet

Do not add these until a concrete experiment proves the selected architecture cannot satisfy a requirement:

- custom WebRTC media protocol
- custom BitTorrent replacement
- custom peer scheduler
- second segment-exchange protocol
- custom player renderer
- WebGPU playback
- WebCodecs-only playback
- full libp2p/Helia media transport
- WebTransport media transport
- WebTorrent interoperability layer
- ServiceWorker-first playback
- custom tracker infrastructure
- token economy
- recommendation graph
- elaborate distributed identity

This is a scope-control rule, not a claim that these technologies are bad.

---

# 13. MVP Proof Sequence

The project is ready to move from architecture research toward focused implementation experiments.

## Proof 1 — Real P2P transfer

```text
Browser A
  ↓
HLS.js + p2p-media-loader
  ↓
HTTP acquisition

Browser B
  ↓
same stream
  ↓
P2P segment acquisition from A
```

Required evidence:

- peer count > 0
- P2P downloaded bytes > 0
- P2P uploaded bytes > 0
- playback succeeds
- HTTP/P2P traffic is separately measurable

## Proof 2 — Persistent storage

```text
Browser A
  ↓
acquire segments
  ↓
persistent SegmentStorage
  ↓
close/reload
  ↓
segments remain available
```

## Proof 3 — Persistent storage feeds P2P

```text
A has persisted segments
        ↓
A starts/activates distribution
        ↓
A announces availability
        ↓
B requests segment
        ↓
A supplies stored bytes
        ↓
B does not need origin for that segment
```

This is the most important architectural bridge to prove.

## Proof 4 — Local media sharing

```text
A selects local compatible MP4
        ↓
segment/remux
        ↓
local persistent storage
        ↓
P2P advertisement
        ↓
B acquires media from A
```

## Proof 5 — CyTube integration

Only after the standalone browser path works:

```text
CyTube Video.js
        ↓
HiveStream HLS adapter
        ↓
HLS.js 1.x
        ↓
p2p-media-loader
```

---

# 14. What Counts as Success

The project does **not** need a giant distributed-media platform to prove its premise.

If we can demonstrate:

```text
HTTP source
   ↓
A acquires segments
   ↓
A persists them
   ↓
B gets segments from A over WebRTC
   ↓
B can play
   ↓
A can reuse the stored segments later
   ↓
A can introduce a local file and share it
```

then the central HiveStream concept is proven.

The rest is engineering, scaling, browser compatibility, UI, and policy.

---

# 15. Current Status — 2026-09-08

### Architecture

**STATUS: DECIDED FOR INITIAL IMPLEMENTATION**

p2p-media-loader is the preferred media-plane foundation.

### CyTube reverse engineering

**STATUS: SUBSTANTIALLY MAPPED**

Socket.IO callbacks, playlist commands, current-media handling, leader behavior, player integration, and relevant HLS architecture have been investigated with both source and runtime evidence.

### P2P browser proof

**STATUS: NOT YET THE FINAL TWO-BROWSER PROOF**

The next meaningful work should prove actual segment transfer between two browsers rather than continue broad technology hunting.

### Persistent storage integration

**STATUS: ARCHITECTURE IDENTIFIED; RUNTIME BRIDGE UNPROVEN**

### Local ingestion

**STATUS: ARCHITECTURE IDENTIFIED; IMPLEMENTATION UNPROVEN**

### CyTube integration

**STATUS: INTEGRATION SEAM IDENTIFIED; IMPLEMENTATION DEFERRED UNTIL STANDALONE P2P PROOF**

---

# 16. Repository / Lineage

Primary knowledge repository:

`duckwerks/cytube-knowledge`

Earlier implementation lineage:

`backwater-battery/cytube-hivestream`

Later compact/synthesized lineage:

`aolcyberchat-gpu/P2P-Theater-Core`

These are related development lineages, not the same repository and should not be treated as interchangeable.

The knowledge repository is the durable research record and should be the first place a new LLM reads before making architectural claims.

---

# 17. Evidence Classification Convention

Every future durable document should classify claims as:

```text
SOURCE PROVEN
Directly established from source code.

RUNTIME PROVEN
Established by controlled runtime testing.

STRONG INFERENCE
Architectural conclusion derived from multiple source/runtime observations.

UNPROVEN / OPEN
Question remains under investigation.

DESIGN PROPOSAL
Proposed HiveStream architecture; not evidence that a referenced project implements it.
```

Do not turn inference into fact merely because it is plausible.

---

# 18. Handoff Instructions to a Future LLM

If another LLM takes over this project, it should:

1. Read this document first.
2. Read `HIVESTREAM-P2P-ENGINE-ARCHITECTURE-DECISION-2026-09-08.md` next.
3. Read `HIVESTREAM-P2P-MEDIA-LOADER-REUSE-FINDINGS.md` for detailed engine evidence.
4. Read `HIVESTREAM-CYTUBE-HLS-P2P-INTEGRATION-CHECKPOINT-2026-09-07.md` for the CyTube/HLS boundary.
5. Treat runtime test artifacts as evidence, not as architectural requirements.
6. Preserve the project's scope: **P2P streaming + persistent reuse + local media ingestion**.
7. Do not restart the broad technology survey unless a concrete implementation blocker appears.
8. Prefer experiments that falsify assumptions over additional speculation.
9. Keep HiveStream-owned concepts above replaceable transport libraries.
10. Clearly identify whether every important claim is source-proven, runtime-proven, inferred, open, or proposed.

---

# 19. Immediate Next Step

The next engineering objective should be a **standalone two-browser P2P segment-transfer proof using p2p-media-loader**, with explicit measurements of HTTP bytes, P2P bytes, peer count, and stored segment inventory.

Once that works, persistent storage should be tested as the source of P2P-served segments, followed by local-file ingestion.

Do not start by rebuilding CyTube integration.

---

# Final Principle

> **HiveStream should own media identity, persistence, replication policy, room integration, and local ingestion. The P2P engine should own peer-to-peer segment exchange. The playback engine should own decoding/rendering.**

**Human Project Lead:** Elwood Edwards  
**AI Research & Engineering:** GPT-5.6 Luna (OpenAI) — HiveStream Research & Engineering Assistant
