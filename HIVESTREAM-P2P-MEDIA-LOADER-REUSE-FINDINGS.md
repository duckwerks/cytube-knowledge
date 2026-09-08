# HiveStream / p2p-media-loader Reuse Investigation

**Status:** Active investigation / architectural checkpoint  
**Date:** 2026-09-07  
**Purpose:** Record what has been established before implementing HiveStream transport code.

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

Each P2PLoader registers for a storage-updated event associated with its `streamSwarmId`.

When storage changes, the loader can rebuild the stored-segment list and broadcast a new announcement to peers.

This means the intended design already supports the concept:

```text
new segment becomes stored
        |
        v
storage change notification
        |
        v
P2PLoader announcement
        |
        v
peers learn that this peer now has the segment
```

The exact custom-storage callback contract still needs to be examined carefully before implementation, but the architectural connection is explicit in source.

---

## 10. What this means for local media ingestion

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

## 11. The remaining hard problem

The investigation has moved the main unknown from **transport** to **media packaging/segmentation**.

For HLS media, the existing adapter receives segment definitions from an HLS manifest.

For a local MP4, HiveStream must determine how to create a compatible segment representation.

Potential approaches still to evaluate:

- MP4 fragmentation/segmentation using MP4Box.js or equivalent
- ffmpeg.wasm
- WebCodecs-based processing
- pre-segmented local media
- another browser-compatible media packaging strategy

This is the next major engineering boundary.

---

## 12. Important distinction: `runtimeId` vs `externalId`

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

## 13. Deterministic swarm identity remains promising

`p2p-media-loader` supports computed stream identity and also provides a `streamSwarmIdBuilder` customization point.

HiveStream may use this to make identical local media converge on the same swarm identity, rather than creating a new swarm merely because the file came from a different user's device.

Potential future model:

```text
User A local file --\
                    +--> deterministic HiveStream media identity
User B local file --/              |
                                   v
                              same swarm
```

This is an architectural possibility, not yet a final design. The identity must be constructed so that two streams are merged only when their media/segment semantics are actually compatible.

---

## 14. What has been proven vs inferred

### Source-proven

- `p2p-media-loader` uses WebRTC DataChannels for peer media transfer.
- WebTorrent-compatible tracker signaling is used to discover/connect peers.
- `SegmentStorage` is a first-class extension point.
- Stored segment IDs are used to build P2P availability announcements.
- P2P uploads read segment bytes directly from `SegmentStorage`.
- Stored segments can satisfy playback requests without network acquisition.
- Successfully acquired segments are stored.
- Stream and segment identity are explicitly modeled.
- PeerTube uses this architecture for HLS P2P playback.

### Strong architectural inference

- A custom persistent storage implementation can act as the long-lived media reservoir for HiveStream.
- A locally ingested segment should be able to participate in P2P distribution if it is correctly registered and stored.
- HiveStream can likely reuse the existing WebRTC/WebTorrent transport rather than implementing another transport layer.

### Not yet proven

- The complete lifecycle for pre-populating custom storage *before* normal playback/loader activity.
- Whether every storage implementation must invoke a particular callback immediately after external/local insertion.
- The cleanest way to generate browser-playable segments from arbitrary local MP4/MKV/etc.
- Whether a local-origin stream can be represented cleanly without an HTTP URL at all integration layers.
- The exact best deterministic identity scheme for HiveStream media.

---

## 15. Next investigation

The next source investigation should focus on the storage callback and loader lifecycle:

1. Exact `SegmentStorage.setSegmentChangeCallback()` semantics.
2. Where Core attaches the callback.
3. How the callback maps to `onStorageUpdated-{streamSwarmId}`.
4. Whether external/local storage insertion can trigger announcements without a loader download.
5. Whether `P2PLoader` requires the segment to have an active request state before serving it. Current source strongly suggests it does not: the upload path reads directly from storage.
6. How `P2PLoadersContainer` creates/updates loaders as streams are registered.
7. Whether a locally created stream can become P2P-active before any player request.
8. The minimum viable adapter required to make a local media object a Core stream.

After that, investigate local-media segmentation/packaging.

---

## 16. Architectural direction at this checkpoint

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

## Primary source

`Novage/p2p-media-loader`, investigated at commit/ref:

`9ad4979feb656b0cc623d7d10a360cde17b76e94`

Most important source files investigated:

- `packages/p2p-media-loader-core/src/core.ts`
- `packages/p2p-media-loader-core/src/hybrid-loader.ts`
- `packages/p2p-media-loader-core/src/p2p/loader.ts`
- `packages/p2p-media-loader-core/src/segment-storage/index.ts`
- `packages/p2p-media-loader-core/src/stream-identity.ts`
- `packages/p2p-media-loader-core/src/types.ts`
- `packages/p2p-media-loader-core/src/webtorrent/webtorrent-manager/index.ts`
- `packages/p2p-media-loader-hlsjs/src/engine.ts`
- `packages/p2p-media-loader-hlsjs/src/segment-manager.ts`
- `packages/p2p-media-loader-hlsjs/src/fragment-loader.ts`

This document is a **checkpoint**, not a final architecture specification. It should be updated as the remaining storage-lifecycle and local-segmentation questions are resolved.
