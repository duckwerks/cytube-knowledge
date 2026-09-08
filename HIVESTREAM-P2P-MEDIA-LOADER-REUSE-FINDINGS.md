# HiveStream / p2p-media-loader Reuse Investigation

**Status:** Active investigation / architectural checkpoint  
**Date:** 2026-09-07  
**Purpose:** Record what has been established before implementing HiveStream transport code.

## Authors / Contributors

**Human Project Lead**  
Elwood Edwards

**AI Research & Engineering**  
GPT-5.6 Luna (OpenAI) — HiveStream Research & Engineering Assistant

**AI role:** source investigation, reverse engineering, architectural analysis, test design, evidence classification, and implementation assistance.

---

## Evidence Provenance

This document is intended to preserve the provenance of important architectural conclusions. Claims are not treated as equally authoritative.

### Runtime evidence from controlled tests

The following conclusions are grounded in tests actually executed against live CyTube runtime behavior and archived in `duckwerks/cytube-knowledge`:

- **WS-061 — CYTUBE QUEUE-NEXT RUNTIME TRACE**
  - Controlled UI action established that the visible **Queue Next** control emits `moveMedia` with `{from, after}`.
- **WS-063 — CYTUBE CURRENT PLAYLIST ITEM STATE**
  - Runtime inspection established the relationship between `PL_CURRENT`, `setCurrent`, and the active playlist DOM entry.
- **WS-065 — CYTUBE MANUAL PLAY RUNTIME TRACE**
  - Controlled playback established the observed ordering `setCurrent → changeMedia → mediaUpdate` after selecting a playlist item.
- **WS-066 — CYTUBE NATURAL AUTO-ADVANCE RUNTIME TRACE**
  - Controlled observation established a natural transition from one playlist UID to the next and observed `setCurrent` followed by `changeMedia`.
- **WS-068 — CYTUBE LEADER/RANK SEPARATION**
  - Runtime observation established that rank and leader state are separate runtime properties.
- **WS-069 — CYTUBE LEADER ASSIGNMENT SOURCE SCAN**
  - Archived source-scan artifact established the client-side leader-assignment path and the relationship between `assignLeader` and `setLeader`.
- **WS-071 — CYTUBE LEADER PERMISSION CONTROL SOURCE SCAN**
  - Archived source-scan artifact established the `leaderctl` permission and the client-side `assignLeader` command path.
- **WS-072 — CYTUBE LEADER ASSIGNMENT RUNTIME TRACE**
  - Controlled runtime action observed `assignLeader` outbound followed by `setLeader` inbound and `CLIENT.leader` changing from `false` to `true`.

These CyTube tests are evidence about CyTube behavior. They do **not** constitute runtime proof of PeerTube or p2p-media-loader behavior.

### Direct source evidence

The p2p-media-loader conclusions in this document are based on direct inspection of the referenced source repository and commit/ref:

`Novage/p2p-media-loader @ 9ad4979feb656b0cc623d7d10a360cde17b76e94`

PeerTube conclusions are based on direct inspection of the referenced PeerTube source repository/commit investigated during this project.

CyTube server/client conclusions are based on direct inspection of:

`calzoneman/sync @ 589f999a9c526bf773a8b21ecf29ba30faf14739`

### Evidence classification

**SOURCE PROVEN**  
Directly established from source code.

**RUNTIME PROVEN**  
Established by a controlled runtime test.

**STRONG INFERENCE**  
Architectural conclusion derived from multiple source/runtime observations, but not directly observed end-to-end.

**UNPROVEN / OPEN**  
Question remains under investigation.

**DESIGN PROPOSAL**  
A proposed HiveStream architecture. It is not evidence that CyTube, PeerTube, or p2p-media-loader already implements the proposal.

---

## Executive conclusion

HiveStream should **not** begin by implementing its own WebRTC media transport. The current source investigation shows that `Novage/p2p-media-loader` already provides the core P2P segment distribution machinery that HiveStream needs:

- WebRTC peer connections through WebTorrent tracker signaling
- segment announcements
- segment requests and uploads
- P2P segment downloads
- HTTP fallback
- pluggable segment storage
- storage-first playback
- persistent-storage integration through a custom `SegmentStorage`

Most importantly, the P2P loader's upload path reads directly from `SegmentStorage`, and its segment announcement path obtains the list of available segments directly from `SegmentStorage.getStoredSegmentIds(...)`.

This is a strong indication that **locally ingested media can become a first-class P2P source without inventing a second transport protocol**, provided HiveStream can create/register the corresponding stream and segment metadata and populate the storage correctly.

The remaining question is no longer whether storage participates in P2P distribution. Source proves that it does. The remaining engineering question is how HiveStream should create valid segment registrations for locally sourced media, especially for media that does not originate as HLS.

---

## 1. HiveStream's actual priority

The project goal is P2P media distribution and reuse, not playback synchronization.

Primary goals:

1. Move media bandwidth from the central server into the room's peer network.
2. Persist acquired media so it can be reused on future plays.
3. Allow users to ingest local media and share it with other room participants.
4. Make recurring rooms increasingly self-seeding over time.
5. Use playlist/media identity to recognize and reuse the same content.

Playback synchronization is a separate concern and should not drive the transport architecture.

---

## 2. What PeerTube already does

PeerTube integrates `p2p-media-loader` into its HLS player stack.

The PeerTube HLS options builder enables P2P under defined conditions and supplies:

- WebSocket tracker announce URLs
- WebRTC/STUN configuration
- swarm identity information
- segment validation
- HTTP range behavior
- P2P upload/download configuration

PeerTube therefore demonstrates a production architecture in which HLS playback is combined with P2P segment distribution.

CyTube's `Accept PeerTube embeds automatically` setting does **not** mean CyTube itself implements this P2P network. CyTube embeds PeerTube's player; PeerTube performs the P2P work.

---

## 3. p2p-media-loader architecture established so far

The relevant layering is:

```text
Player integration (HLS.js / PeerTube / future HiveStream adapter)
                    |
                    v
             p2p-media-loader Core
                    |
             +------+------+
             |             |
             v             v
        HybridLoader     SegmentStorage
             |
       +-----+-----+
       |           |
       v           v
      P2P          HTTP
       |
       v
 WebTorrent signaling
       |
       v
 WebRTC DataChannel
```

The player integration is an adapter. The Core owns stream/segment registration and the hybrid loading machinery.

---

## 4. Segment registration is separate from segment bytes

The Core maintains a registered stream containing `Segment` records.

A segment contains metadata including:

- `runtimeId`
- `externalId`
- URL
- optional byte range
- start time
- end time

The HLS adapter obtains these from the HLS manifest/playlist and feeds them into Core.

This is important for HiveStream: **the transport does not inherently require the media to have originated from HTTP/HLS.** What it needs is a valid registered stream and segment model plus bytes accessible through storage.

---

## 5. Storage-first playback is proven

`HybridLoader.loadSegment()` first checks `SegmentStorage` using:

```text
swarmId
streamSwarmId
segment.externalId
```

If the segment exists, the loader retrieves its `ArrayBuffer` from storage and resolves the player request immediately.

Therefore a previously stored segment can satisfy playback without downloading it again over HTTP or from another peer.

This is a major fit for HiveStream's persistent-media objective.

---

## 6. Successful downloads are stored

The hybrid acquisition path stores successfully acquired segment bytes through:

```text
SegmentStorage.storeSegment(...)
```

This applies to media acquired through the normal P2P/HTTP machinery.

Thus the intended lifecycle is already:

```text
HTTP or P2P acquisition
        |
        v
   segment bytes
        |
        v
 SegmentStorage
        |
        +--> future local playback
        |
        +--> P2P upload to other peers
```

---

## 7. Critical finding: stored segments are announced to peers

`P2PLoader` constructs its segment announcement by calling:

```typescript
this.#segmentStorage.getStoredSegmentIds(
    this.#stream.swarmId,
    this.#stream.streamSwarmId,
)
```

The returned IDs become the `loaded` list in the `SegmentsAnnouncement` sent to connected peers.

Therefore the announcement mechanism does **not** ask whether a segment was originally downloaded from HTTP or from another peer.

It asks storage which segment IDs are currently stored.

This is the key reuse boundary for HiveStream.

---

## 8. Critical finding: peer uploads are served directly from storage

When a remote peer requests a segment, `P2PLoader`:

1. resolves the requested `externalId` to the registered segment;
2. calls `SegmentStorage.getSegmentData(...)`;
3. if bytes are present, uploads those bytes over the P2P peer connection;
4. if bytes are absent, reports the segment as unavailable.

The relevant path is conceptually:

```text
REMOTE PEER
    |
    | SegmentRequest(externalId)
    v
P2PLoader
    |
    | identify registered segment
    v
SegmentStorage.getSegmentData(...)
    |
    +---- bytes exist ----> WebRTC upload
    |
    +---- absent ---------> SegmentAbsent
```

This is stronger than merely proving persistent playback. It proves that **storage is itself the authoritative byte source for P2P uploads**.

---

## 9. Critical finding: storage changes trigger announcements

The `SegmentStorage` interface defines `setSegmentChangeCallback(callback)`, with the callback receiving the affected `streamSwarmId`. The callback is specifically documented as being invoked when segments are added to or removed from storage.

Core attaches this callback and maps the affected `streamSwarmId` into an internal `onStorageUpdated-{streamSwarmId}` event. `P2PLoader` listens for that event and rebuilds its announcement from the storage contents.

The resulting architecture is:

```text
SegmentStorage change
        |
        | callback(streamSwarmId)
        v
Core onStorageUpdated-{streamSwarmId}
        |
        v
P2PLoader announcement
        |
        v
getStoredSegmentIds(...)
        |
        v
peers learn newly available segments
```

This is source-proven. The remaining question is **when a P2PLoader exists** for a stream that has been locally populated before any playback request.

---

## 10. Critical lifecycle finding: P2PLoader creation is tied to HybridLoader creation

`P2PLoadersContainer` creates its current `P2PLoader` during construction. `HybridLoader` constructs a `P2PLoadersContainer`, and Core constructs a `HybridLoader` when `getStreamHybridLoader()` is first reached.

Core's public `loadSegment()` path is:

```text
Core.loadSegment(segmentRuntimeId)
        |
        v
initializeSegmentStorage()
        |
        v
identifySegment()
        |
        v
getStreamHybridLoader()
        |
        v
new HybridLoader()
        |
        v
new P2PLoadersContainer()
        |
        v
new P2PLoader()
```

The important implication is that **registering a stream alone does not appear to create a P2P loader**. A playback/segment-loading path creates the loader.

`P2PLoadersContainer` also deliberately retains loaders for streams with stored segments when the current stream changes, using a destroy timeout rather than immediately destroying a loader when stored IDs exist.

Therefore the likely local-ingestion bootstrap is not simply “put bytes in storage.” HiveStream must also ensure that the relevant stream gets a live P2P loader.

---

## 11. Important consequence for local pre-seeding

We now have a more precise model of the possible local-ingestion path:

```text
LOCAL FILE
    |
    v
HiveStream creates segment representation
    |
    +--> registers stream + Segment metadata
    |
    +--> persistent storage contains segment bytes
    |
    v
P2P loader must become active
    |
    v
P2PLoader reads stored IDs
    |
    v
availability announcement
    |
    v
other peers can request segments
```

The unresolved point is whether HiveStream can deliberately trigger the normal Core/HybridLoader lifecycle using a storage hit, thereby activating P2P without first downloading the media from HTTP.

That is a much smaller and more concrete question than “can we build a WebRTC media transport?”

---

## 12. What this means for local media ingestion

The emerging HiveStream model is:

```text
LOCAL FILE
    |
    v
HiveStream local-media adapter
    |
    +--> identify media
    +--> segment/package media
    +--> construct deterministic stream identity
    +--> register Segment records with Core
    +--> place bytes into SegmentStorage
    |
    v
p2p-media-loader
    |
    +--> announce stored segments
    +--> answer SegmentRequest from storage
    +--> upload over WebRTC
    +--> accept/download missing segments
    |
    v
OTHER ROOM USERS
```

The important point is that HiveStream does not necessarily need a fake HTTP server or a second custom WebRTC protocol merely to make local media shareable.

---

## 13. The remaining hard problem

The investigation has moved the main unknown from **transport** to **media packaging/segmentation**.

For HLS media, the existing adapter receives segment definitions from an HLS manifest.

For a local MP4, HiveStream must determine how to create a compatible segment representation.

Potential approaches still to evaluate:

- MP4 fragmentation/segmentation using MP4Box.js or equivalent
- ffmpeg.wasm
- WebCodecs-based processing
- pre-segmented local media
- another browser-compatible media packaging strategy

This is the next major engineering boundary, but it should be investigated only after the loader bootstrap question is closed.

---

## 14. Important distinction: `runtimeId` vs `externalId`

The P2P announcement/request protocol uses the segment's `externalId` as the compact segment identifier.

The stream registry still needs to be able to map that external ID back to a registered `Segment` containing timing and other metadata.

Therefore HiveStream cannot merely dump arbitrary byte blobs into storage and expect P2P distribution to work. It must establish a coherent:

```text
stream identity
      +
segment registry
      +
external segment IDs
      +
stored bytes
```

relationship.

---

## 15. Deterministic swarm identity remains promising

`p2p-media-loader` supports computed stream identity and also provides a `streamSwarmIdBuilder` customization point.

HiveStream may use this to make identical local media converge on the same swarm identity, rather than creating a new swarm merely because the file came from a different user's device.

Potential future model:

```text
User A local file --\\
                    +--> deterministic HiveStream media identity
User B local file --/              |
                                   v
                              same swarm
```

This is an architectural possibility, not yet a final design. The identity must be constructed so that two streams are merged only when their media/segment semantics are actually compatible.

---

## 16. What has been proven vs inferred

### SOURCE PROVEN

- `p2p-media-loader` uses WebRTC DataChannels for peer media transfer.
- WebTorrent-compatible tracker signaling is used to discover/connect peers.
- `SegmentStorage` is a first-class extension point.
- Stored segment IDs are used to build P2P availability announcements.
- P2P uploads read segment bytes directly from `SegmentStorage`.
- Stored segments can satisfy playback requests without network acquisition.
- Successfully acquired segments are stored.
- `SegmentStorage.setSegmentChangeCallback()` reports storage changes by `streamSwarmId`.
- Core maps storage changes to per-stream internal storage-update events.
- P2PLoader listens for those storage-update events and can rebuild announcements.
- `P2PLoadersContainer` creates P2PLoader instances when a HybridLoader is constructed.
- PeerTube uses this architecture for HLS P2P playback.

### RUNTIME PROVEN

- CyTube's live Socket.IO architecture and several playlist/leader behaviors have been established through controlled tests WS-061, WS-063, WS-065, WS-066, WS-068, and WS-072.
- WS-072 specifically established a live `assignLeader → setLeader → CLIENT.leader` path.

### STRONG INFERENCE

- A custom persistent storage implementation can act as the long-lived media reservoir for HiveStream.
- A locally ingested segment should be able to participate in P2P distribution if it is correctly registered and stored and if a P2PLoader is active for the stream.
- HiveStream can likely reuse the existing WebRTC/WebTorrent transport rather than implementing another transport layer.
- A storage-hit bootstrap may be sufficient to activate the existing loader without requiring an HTTP-origin download first, but this needs direct validation.

### UNPROVEN / OPEN

- Whether a custom storage implementation can safely pre-populate data during `initialize()` and expose it immediately to Core.
- Whether HiveStream can intentionally activate a P2PLoader for a locally registered stream using a storage-hit path without unwanted HTTP/network acquisition.
- Whether an externally inserted segment should invoke the storage-change callback immediately or whether HiveStream must explicitly do so through its storage implementation.
- The exact minimum sequence of Core calls needed to turn a locally stored segment into an announced P2P source.
- The cleanest way to generate browser-playable segments from arbitrary local MP4/MKV/etc.
- Whether every local media type can be represented cleanly without an HTTP URL at all integration layers.
- The exact best deterministic identity scheme for HiveStream media.

---

## 17. Next investigation

The next investigation should close the loader-bootstrap question before any HiveStream transport implementation:

1. Inspect the complete `initializeSegmentStorage()` implementation.
2. Establish exactly when Core installs the storage callback.
3. Trace the storage callback into `onStorageUpdated-{streamSwarmId}`.
4. Confirm whether a storage implementation can be populated during initialization.
5. Determine the minimum Core API sequence that causes a HybridLoader/P2PLoader to exist for a registered stream.
6. Determine whether `loadSegment()` can hit pre-populated storage and still activate P2P cleanly.
7. Determine whether the resulting P2PLoader immediately announces the stored IDs to peers.
8. Only after this is resolved, investigate local-media segmentation/packaging.

A focused runtime proof may be appropriate if source inspection cannot establish the bootstrap path conclusively. Any such test should be archived with an explicit evidence-provenance record.

---

## 18. Architectural direction at this checkpoint

Do not build a HiveStream-specific WebRTC transport yet.

The likely division of responsibility is:

```text
HiveStream
-------------------------------------------------
media identity
local ingestion
media segmentation/package creation
playlist integration
persistent media policy
room-level coordination

p2p-media-loader
-------------------------------------------------
stream/segment loading
WebRTC peer transport
tracker signaling
availability announcements
segment requests
segment uploads
HTTP/P2P hybrid acquisition
storage interface

Browser/player layer
-------------------------------------------------
actual media playback
buffering
seeking
watch-room controls
```

This keeps HiveStream focused on the parts that make it different rather than reimplementing an existing P2P media engine.

---

## Primary source repositories

### p2p-media-loader

`Novage/p2p-media-loader`  
Investigated at commit/ref:

`9ad4979feb656b0cc623d7d10a360cde17b76e94`

Important source files investigated:

- `packages/p2p-media-loader-core/src/core.ts`
- `packages/p2p-media-loader-core/src/hybrid-loader.ts`
- `packages/p2p-media-loader-core/src/p2p/loader.ts`
- `packages/p2p-media-loader-core/src/p2p/loaders-container.ts`
- `packages/p2p-media-loader-core/src/segment-storage/index.ts`
- `packages/p2p-media-loader-core/src/segment-storage/segment-memory-storage.ts`
- `packages/p2p-media-loader-core/src/stream-identity.ts`
- `packages/p2p-media-loader-core/src/types.ts`
- `packages/p2p-media-loader-core/src/webtorrent/webtorrent-manager/index.ts`
- `packages/p2p-media-loader-hlsjs/src/engine.ts`
- `packages/p2p-media-loader-hlsjs/src/segment-manager.ts`
- `packages/p2p-media-loader-hlsjs/src/fragment-loader.ts`
- `packages/p2p-media-loader-demo/src/custom-segment-storage-example/indexed-db-storage.ts`

### PeerTube

`Chocobozzz/PeerTube`  
Investigated at commit/ref:

`9cf034c43a099abe48696725061c375b2f7fd06a`

Important source areas included the HLS options builder, player-options plumbing, and PeerTube's video-infohash model.

### CyTube / sync

`calzoneman/sync`  
Investigated at commit/ref:

`589f999a9c526bf773a8b21ecf29ba30faf14739`

Important source areas included:

- `src/channel/permissions.js`
- `src/channel/playlist.js`
- `www/js/data.js`
- `www/js/util.js`
- `www/js/callbacks.js`
- player adapters and update logic

---

## Investigation status

This document is a **durable evidence checkpoint**, not a final architecture specification.

The central conclusion is now strong enough to guide the next investigation:

> **Do not reinvent the P2P transport. Determine the smallest HiveStream-specific layer needed to feed locally sourced media into the existing p2p-media-loader stream/segment/storage model.**

The next unresolved boundary is the **local storage → loader activation → P2P announcement** path. Once that is closed, the remaining major problem is local media segmentation/packaging.
