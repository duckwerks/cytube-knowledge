# HiveStream — Implementation Roadmap & Open Questions

**Date:** 2026-09-08

## Provenance

- **Human Project Lead:** Elwood Edwards
- **AI Research & Engineering:** GPT-5.6 Luna (OpenAI) — HiveStream Research & Engineering Assistant
- **Purpose:** provide a compact execution plan after the architecture investigation.

---

# Mission

Build a browser-based P2P video streaming platform with local media ingestion whose defining benefit is reducing centralized video bandwidth through persistent peer-to-peer media reuse.

**Do not expand the MVP beyond this without evidence that it is necessary.**

---

# Implementation Order

## Phase 0 — Freeze the architecture boundary

```text
HiveStream application
        ↓
MediaDistribution abstraction
        ↓
p2p-media-loader
        ↓
WebRTC
```

Playback remains separate:

```text
HiveStream/CyTube
        ↓
Video.js
        ↓
HLS.js 1.x
        ↓
p2p-media-loader
```

**Goal:** prevent the implementation from coupling HiveStream directly to transport internals.

---

## Phase 1 — Two-browser P2P proof

Use a known HLS/VOD source.

Browser A:
- loads the stream
- obtains segments through HTTP
- participates in the P2P swarm

Browser B:
- loads the same stream identity
- obtains at least some segments from A

Capture:

```text
peer count
HTTP downloaded bytes
P2P downloaded bytes
P2P uploaded bytes
segment IDs acquired
playback state
```

**PASS:** B demonstrably receives media segment bytes through P2P and playback succeeds.

**FAIL:** playback works but P2P bytes remain zero. Investigate swarm identity, tracker discovery, browser connectivity, and engine integration before building higher layers.

---

## Phase 2 — Persistent segment storage

Implement/adapt a persistent SegmentStorage.

Start with IndexedDB because it is already familiar and sufficient for the first proof.

Test:

```text
A acquires segment
      ↓
store bytes
      ↓
close/reload
      ↓
segment still exists
      ↓
metadata still maps it to the correct media identity
```

Measure storage usage and verify eviction/error behavior.

OPFS remains an optimization experiment, not a prerequisite.

---

## Phase 3 — Persistent replica → P2P seed

This is the key HiveStream-specific experiment.

Test:

```text
A previously stored segment
        ↓
A starts distribution
        ↓
A advertises availability
        ↓
B requests segment
        ↓
A serves stored bytes
        ↓
B receives segment from A
        ↓
origin is not required for that segment
```

The experiment must establish exactly what lifecycle causes a pre-existing stored segment to become part of the active P2P advertisement.

Do not infer this from source code alone if runtime testing can establish it.

---

## Phase 4 — Local media ingestion

First target: a compatible local MP4.

```text
<File>
   ↓
inspect container/codecs
   ↓
derive media identity
   ↓
segment/remux
   ↓
SegmentStorage
   ↓
P2P availability
   ↓
second browser playback
```

Prefer remuxing/segmenting over transcoding.

Use FFmpeg WASM only when a concrete compatibility case requires it.

WebCodecs may be useful for later ingestion work but is not part of the first playback contract.

---

## Phase 5 — Minimal media/playlist model

Introduce only the fields needed to map:

```text
playlist item
    ↓
media ID
    ↓
representation
    ↓
manifest
    ↓
segment IDs
    ↓
swarm identity
```

Do not build a generalized distributed playlist system yet.

---

## Phase 6 — Replication policy

Once the underlying path is proven, add a small policy manager.

Responsibilities:

- retain useful segments
- prioritize currently playing media
- prioritize upcoming playlist media
- prefetch where appropriate
- avoid unnecessary origin downloads
- evict low-value data when storage pressure exists

The policy should sit above the selected P2P engine.

---

## Phase 7 — CyTube adapter

Only after standalone HiveStream media distribution works:

```text
CyTube media event
      ↓
HiveStream media identity
      ↓
HiveStream HLS adapter
      ↓
HLS.js 1.x
      ↓
p2p-media-loader
```

CyTube-specific playlist commands, player lifecycle, and synchronization should be adapters rather than foundations of the P2P media system.

---

# Critical Open Questions

## OQ-001 — Persistent storage activation

**Question:** Can pre-existing SegmentStorage data be made immediately available to a newly activated P2P loader and announced to peers without reacquiring it from HTTP?

**Status:** UNPROVEN / OPEN

**Priority:** Very high

---

## OQ-002 — Best persistent byte store

**Question:** Is IndexedDB adequate for the target media segment workload, or does OPFS materially improve performance/storage behavior?

**Status:** UNPROVEN / OPEN

**Priority:** High, but after the P2P proof.

---

## OQ-003 — Local MP4 segmentation

**Question:** What is the smallest practical browser-side pipeline for turning a compatible local MP4 into the HLS/fMP4 segment representation required by playback and P2P distribution without transcoding?

**Status:** UNPROVEN / OPEN

**Priority:** High.

---

## OQ-004 — Android ↔ desktop behavior

**Question:** Does the intended browser mix maintain stable WebRTC P2P connections and useful transfer rates between Android and desktop browsers?

**Status:** UNPROVEN / OPEN

**Priority:** High.

---

## OQ-005 — CyTube HLS.js 1.x integration

**Question:** What exact adapter changes are required to introduce a modern HLS.js/p2p-media-loader path into CyTube's existing Video.js architecture?

**Status:** Architecture seam identified; implementation unproven.

**Priority:** Medium until standalone proof succeeds.

---

# Evidence Rules

Future implementation notes must distinguish:

```text
SOURCE PROVEN
RUNTIME PROVEN
STRONG INFERENCE
UNPROVEN / OPEN
DESIGN PROPOSAL
```

A plausible design must never be written as though an existing project already implements it.

---

# Success Metrics

HiveStream's primary KPI is **origin/server bandwidth displaced by peer delivery**.

At minimum, record:

```text
origin HTTP bytes
P2P download bytes
P2P upload bytes
P2P/total media ratio
persistent cache hit rate
number of peers
peer churn
segments retained
segments served from local storage
```

The eventual recurring-room experiment should demonstrate the intended direction:

```text
watch 1 → significant origin acquisition
watch 2 → more P2P reuse
watch 3 → more P2P reuse
...
```

The objective is not to promise literally zero server bandwidth in every condition. The engineering goal is to make the room's retained swarm increasingly capable of serving repeated media without origin traffic.

---

# Scope Guardrail

If a proposed feature does not directly help prove or implement one of these:

1. P2P segment streaming
2. persistent media reuse
3. local media ingestion
4. media identity needed for those functions
5. measurement of server-bandwidth reduction

then it should probably be deferred.

This is the project's anti-scope-creep rule.

---

# Immediate Next Experiment

**Build the smallest standalone two-browser p2p-media-loader test that can report actual P2P segment traffic.**

Do not begin with:

- CyTube modification
- custom signaling
- custom tracker
- WebTorrent integration
- libp2p
- WebCodecs playback
- WebGPU
- token/reputation systems

First prove the media bytes can move browser-to-browser.

**Human Project Lead:** Elwood Edwards  
**AI Research & Engineering:** GPT-5.6 Luna (OpenAI) — HiveStream Research & Engineering Assistant
