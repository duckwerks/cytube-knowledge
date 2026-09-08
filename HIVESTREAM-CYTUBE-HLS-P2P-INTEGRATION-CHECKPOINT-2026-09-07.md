# HiveStream / CyTube HLS + P2P Integration Investigation Checkpoint

**Status:** Investigation checkpoint — transport reuse validated; adapter boundary narrowed
**Date:** 2026-09-07
**Repository:** `duckwerks/cytube-knowledge`

## Authors / Contributors

**Human Project Lead**  
Elwood Edwards

**AI Research & Engineering**  
GPT-5.6 Luna (OpenAI) — HiveStream Research & Engineering Assistant

**AI role:** source investigation, reverse engineering, architectural analysis, compatibility analysis, test design, evidence classification, and implementation assistance.

---

## 1. Purpose of this checkpoint

This document records the investigation immediately before implementing a HiveStream HLS/P2P integration layer for CyTube.

The investigation began with the question:

> Can HiveStream reuse the existing CyTube Video.js/HLS architecture and insert modern `p2p-media-loader` rather than inventing a new WebRTC media transport?

The answer is now strongly supported:

> **Yes. The preferred architecture is to replace CyTube's old HLS source-handler implementation with a HiveStream HLS source handler that drives modern HLS.js and `p2p-media-loader`, while leaving CyTube's playlist/player/control architecture intact.**

This does **not** yet prove the complete implementation works end-to-end. Browser runtime validation and the exact adapter implementation remain open.

---

## 2. HiveStream project priority

HiveStream is primarily a P2P media-distribution and media-reuse system.

Primary goals:

1. Move video bandwidth from the central server/origin into the room's peer network.
2. Persist acquired media so it can be reused on later plays.
3. Allow users to ingest local media and share it with room peers.
4. Allow recurring rooms to become increasingly self-seeding.
5. Reuse identical media rather than repeatedly retrieving it from the origin.

Playback synchronization is secondary. It must not drive the transport architecture.

Project-defining concept:

> **HiveStream turns a recurring watch room from a server-fed collection of viewers into a persistent, cooperative media swarm.**

---

## 3. CyTube's actual player architecture

Direct inspection of the CyTube source established that the deployed Video.js build is **Video.js 7.18.0**.

CyTube's HLS player is layered on top of `VideoJSPlayer` rather than implementing its own media transport.

The HLS player supplies a normal HLS source using the MIME type:

```text
application/x-mpegURL
```

The normal player path is therefore:

```text
CyTube media item
       |
       v
HLSPlayer
       |
       v
VideoJSPlayer
       |
       v
Video.js 7.18.0
       |
       v
Video.js source selection
       |
       v
HLS source handler
```

This is a major architectural seam for HiveStream.

### Evidence classification

**SOURCE PROVEN** — CyTube's HLS player supplies an ordinary HLS source to Video.js, and the bundled Video.js version is 7.18.0.

---

## 4. CyTube already uses a replaceable HLS source-handler layer

CyTube bundles a file named:

```text
www/js/vjs/videojs-hlsjs-plugin.js
```

The bundled plugin is the old Streamroot HLS.js integration. The investigation established that it registers an HLS source handler and connects HLS.js to the Video.js media element.

CyTube's current architecture is therefore effectively:

```text
Video.js 7.18.0
       |
       v
Streamroot HLS source handler
       |
       v
HLS.js 0.13.2
       |
       v
HTMLVideoElement
```

HiveStream does not need to replace Video.js itself.

The proposed architecture is:

```text
Video.js 7.18.0
       |
       v
HiveStream HLS source handler
       |
       v
HLS.js 1.x
       |
       v
HlsJsP2PEngine
       |
       v
p2p-media-loader
       |
       +---- HTTP
       |
       +---- WebRTC
```

### Evidence classification

**STRONG INFERENCE** — the old HLS source-handler implementation can be replaced without changing CyTube's playlist/control architecture, because CyTube passes HLS through the normal Video.js source system.

---

## 5. Video.js 7.18 source-handler contract

Direct inspection of Video.js 7.18.0's `Tech` implementation confirms the Source Handler pattern.

The technology registers source handlers through:

```javascript
Tech.registerSourceHandler(handler, index)
```

Video.js selects a handler by calling:

```javascript
handler.canHandleSource(source, options)
```

and then delegates source handling to the selected handler.

The modern Video.js documentation describes this pattern as specifically intended for adaptive formats such as HLS and DASH that load media data and feed it into Media Source Extensions.

The practical minimum contract for the HiveStream adapter is therefore centered on:

```text
canHandleSource(source, options)
handleSource(source, tech)
```

with optional source-handler methods for delegated behavior such as duration/seekable handling.

### Important consequence

The HiveStream integration does not need to rewrite CyTube's `VideoJSPlayer` API.

It needs to provide a source handler that:

1. recognizes HLS sources;
2. creates or obtains an HLS.js 1.x instance;
3. attaches HLS.js to the Video.js HTML media element;
4. loads the HLS URL;
5. exposes the expected source-handler lifecycle;
6. destroys the HLS/P2P resources when Video.js disposes the source/tech.

### Evidence classification

**SOURCE PROVEN** — Video.js 7.18.0 provides the source-handler mechanism needed for this architecture.

---

## 6. Modern p2p-media-loader HLS integration

The investigated p2p-media-loader revision is:

```text
Novage/p2p-media-loader
9ad4979feb656b0cc623d7d10a360cde17b76e94
```

The HLS package is version:

```text
p2p-media-loader-hlsjs 4.0.0
```

Its package metadata lists:

```text
hls.js ^1.7.0
```

as a development dependency.

### Important version interpretation

This does **not** establish a runtime peer dependency of exactly 1.7.x.

The package injects loader classes into an HLS.js constructor supplied by the application. The source code imports HLS.js types and builds configuration for its loader integration.

Therefore the important compatibility requirement is:

```text
HLS.js version compatible with the p2p-media-loader HLS integration
```

rather than “HiveStream must blindly use 1.7.0.”

The exact stable version to freeze remains an implementation decision to validate with the package's release/build matrix.

---

## 7. The p2p-media-loader integration seam is unusually clean

The official integration mechanism is:

```javascript
const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
```

The injected constructor creates an `HlsJsP2PEngine`, obtains the P2P loader configuration, and passes that configuration into the underlying HLS.js constructor.

Conceptually:

```text
HLS.js constructor
       |
       | injectMixin()
       v
Hls.js + P2P loader configuration
       |
       +--> fLoader
       +--> pLoader
       |
       v
p2p-media-loader Core
```

This means HiveStream does not need to modify HLS.js internals.

It supplies an HLS.js constructor with P2P-enabled loaders.

---

## 8. The P2P engine binds to an HLS instance

`HlsJsP2PEngine` provides:

```javascript
bindHls(hls)
```

and internally tracks the current HLS instance.

It listens to important HLS lifecycle events including:

```text
MANIFEST_LOADED
LEVEL_SWITCHING
LEVEL_UPDATED
AUDIO_TRACK_LOADED
DESTROYING
MEDIA_ATTACHING
MANIFEST_LOADING
MEDIA_DETACHED
MEDIA_ATTACHED
```

It also listens to media-element:

```text
timeupdate
seeking
ratechange
```

and reports playback state into the P2P Core.

This is important because the P2P engine already understands HLS playback lifecycle. HiveStream should not duplicate this logic.

---

## 9. P2P engine destruction is part of the integration

The HLS P2P engine explicitly reacts to HLS destruction and media lifecycle events.

Its source contains a dedicated `destroy()` path that destroys Core and unregisters event handlers.

CyTube already destroys the old Video.js player when changing media.

Therefore the desired lifecycle is:

```text
CyTube changes media
        |
        v
old Video.js player disposed
        |
        v
HiveStream HLS handler cleanup
        |
        v
HLS.js destroy
        |
        v
p2p-media-loader Core destroy
        |
        v
old media P2P resources released
```

This alignment is favorable.

### Open validation

Actual runtime verification is still required to confirm that the exact CyTube disposal sequence reliably reaches the P2P engine cleanup path.

---

## 10. The P2P transport itself should not be rewritten

The investigation has now accumulated enough evidence that a custom HiveStream WebRTC segment protocol would be duplication.

The existing p2p-media-loader stack already provides:

```text
tracker signaling
       |
       v
peer discovery
       |
       v
WebRTC connections
       |
       v
RTCDataChannel
       |
       v
segment requests / announcements / uploads
```

It also provides HTTP fallback.

Therefore HiveStream's transport-layer responsibility should be kept small.

### Design proposal

HiveStream should own:

- media identity
- playlist identity
- local-media ingestion
- media packaging/segmentation
- persistent storage policy
- room/swarm policy
- application-specific metadata

`p2p-media-loader` should own:

- P2P transport
- peer connections
- segment exchange
- HTTP/P2P hybrid acquisition
- segment availability announcements
- P2P uploads

---

## 11. P2P is an optimization, not the playback contract

The desired playback contract remains:

```text
HiveStream can play the media
```

P2P is the preferred acquisition path, not a prerequisite for playback.

The desired acquisition hierarchy is:

```text
1. local persistent segment storage
2. P2P peer segment
3. HTTP/origin segment
```

If no peers are reachable, playback must still be able to fall back to HTTP where an HTTP source exists.

This is especially important for:

- first-time media acquisition;
- browsers behind restrictive NAT/firewalls;
- browser churn;
- unsupported/partially supported P2P environments.

---

## 12. CyTube synchronization remains outside the P2P layer

CyTube's existing playback and synchronization machinery remains conceptually separate from the HLS/P2P transport.

The HiveStream adapter should therefore not attempt to merge:

```text
P2P delivery
```

with:

```text
CyTube playback synchronization
```

The correct separation remains:

```text
CyTube
  |
  +--> playlist / room control
  |
  +--> playback synchronization
  |
  +--> Video.js playback API
              |
              v
        HiveStream HLS adapter
              |
              v
        HLS.js + P2P loader
```

This preserves the actual project priority: P2P media distribution first.

---

## 13. Browser compatibility checkpoint

The currently intended Tier-1 test matrix is:

```text
Chrome Desktop
Firefox Desktop
Chrome Android
Firefox Android
```

These are sufficient to validate the initial architecture because they cover the user's available desktop and mobile environments and are supported targets of the modern HLS.js/p2p-media-loader stack.

Safari should be treated as a separate compatibility path:

```text
Safari
  |
  +--> modern HLS.js / Managed Media Source where supported
  |
  +--> native HLS fallback where appropriate
```

No Mac is available for the current project, so Safari P2P should remain explicitly marked **UNTESTED**, not **UNSUPPORTED**.

---

## 14. Important new conclusion about the adapter boundary

The investigation has reduced the HiveStream integration problem to a relatively narrow adapter:

```text
CyTube HLS source
       |
       v
Video.js 7.18 Source Handler
       |
       v
HLS.js 1.x
       |
       v
HlsJsP2PEngine.injectMixin(Hls)
       |
       v
p2p-media-loader
```

CyTube does not need to know whether a segment came from:

- HTTP;
- a peer;
- IndexedDB;
- another user's locally ingested media.

As long as the HLS.js layer receives valid media bytes, CyTube continues to see a normal Video.js playback surface.

---

## 15. Important remaining question: local media is a different problem

The successful HLS/P2P integration does **not** automatically solve local MP4 ingestion.

A local file still has to become a segmentable stream representation.

For example:

```text
local.mp4
   |
   v
HiveStream ingestion
   |
   v
segment/package
   |
   v
HLS-compatible representation
   |
   v
p2p-media-loader
```

Potential technologies to investigate include:

- MP4 fragmentation/segmentation libraries;
- ffmpeg.wasm;
- WebCodecs-based processing;
- browser-native MediaSource workflows;
- pre-segmented local media;
- other browser-compatible packaging approaches.

This should be investigated separately from the P2P transport.

---

## 16. Checkpoint: what is proven now

### SOURCE PROVEN

- CyTube uses Video.js 7.18.0.
- CyTube's HLS player feeds HLS sources through Video.js.
- CyTube's HLS integration is implemented as a source-handler layer.
- Video.js 7.18.0 supports the Source Handler pattern.
- Modern p2p-media-loader provides an HLS.js integration through `HlsJsP2PEngine`.
- The HLS integration injects custom fragment and playlist loaders into HLS.js.
- The P2P engine binds itself to an HLS.js instance.
- The P2P engine listens to HLS lifecycle events and media playback events.
- The P2P engine has explicit destruction/cleanup behavior.
- `p2p-media-loader` provides WebRTC/P2P segment transport plus HTTP fallback.
- `SegmentStorage` participates directly in playback and P2P upload/availability logic.

### RUNTIME PROVEN

- CyTube's existing runtime and player behavior have been established through the project's WS-series tests.
- The current investigation has **not yet** run the modern HLS.js + p2p-media-loader stack inside the live CyTube page.

### STRONG INFERENCE

- The smallest sensible CyTube integration is a replacement HLS Source Handler.
- CyTube's existing playlist/player/control architecture can remain intact.
- P2P transport should be delegated to p2p-media-loader.
- CyTube synchronization should remain outside the transport layer.
- Desktop + Android Chrome/Firefox form an appropriate first certification matrix.

### UNPROVEN / OPEN

1. Exact HLS.js version to freeze for HiveStream.
2. Actual HLS.js 1.x + p2p-media-loader operation under CyTube's Video.js 7.18.0 runtime.
3. Actual source-handler disposal behavior inside CyTube.
4. Real P2P connectivity between the user's Android and desktop browsers.
5. Persistent storage behavior in the target browsers.
6. Local MP4 → HLS/segment packaging strategy.
7. Local pre-seeded storage → active P2P loader → peer announcement lifecycle.
8. Safari/iOS P2P runtime behavior.

---

## 17. Recommended next step after this checkpoint

Do **not** implement the full HiveStream adapter yet.

First build a minimal standalone compatibility harness containing:

```text
Video.js 7.18.0
        +
HLS.js 1.x
        +
p2p-media-loader
```

Use one ordinary public HLS stream.

Validate on:

```text
Chrome Desktop
Firefox Desktop
Chrome Android
Firefox Android
```

The harness should prove:

1. HLS.js can initialize.
2. Video.js can hand the HLS source to the handler.
3. HLS playback works.
4. p2p-media-loader initializes.
5. segment events are visible.
6. HTTP fallback works.
7. two browsers using the same swarm can discover/connect.
8. a segment can actually be received from a peer.
9. destruction releases the P2P engine cleanly.

Only after that should the adapter be inserted into CyTube.

---

## 18. Architectural checkpoint statement

At this point the investigation has crossed an important threshold.

We are no longer asking:

> “Can HiveStream build a WebRTC video-sharing transport?”

The existing source evidence makes that unnecessary for the HLS delivery path.

The engineering question is now:

> **How thin can the HiveStream/CyTube adapter be while exposing persistent HiveStream media to the existing HLS.js + p2p-media-loader pipeline?**

That is a much smaller problem.

The likely long-term architecture is:

```text
                    CYTUBE
                       |
             playlist / room control
                       |
                       v
                  Video.js 7.18
                       |
                       v
             HiveStream HLS Handler
                       |
                       v
                    HLS.js
                       |
                       v
              p2p-media-loader
                 /           \
                /             \
             HTTP           WebRTC
              |                |
              +-------+--------+
                      |
                      v
                SegmentStorage
                      |
                      v
                   IndexedDB
                      |
                      v
             persistent room swarm
```

And local ingestion remains a separate upstream concern:

```text
LOCAL FILE
    |
    v
HiveStream media ingestion
    |
    v
segmentation / packaging
    |
    v
HLS-compatible media
    |
    v
persistent SegmentStorage
    |
    v
p2p-media-loader
    |
    v
room peers
```

**This checkpoint should be treated as the boundary between investigation of the existing transport ecosystem and implementation of HiveStream's integration layer.**
