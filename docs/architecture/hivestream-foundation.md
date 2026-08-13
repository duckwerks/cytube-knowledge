# HiveStream Foundation

## Status

PROPOSAL — this document describes the emerging HiveStream architecture. It is not a claim about Cytube internals.

## Architectural thesis

HiveStream is a Cytube-like watch-together system in which the room remains the social and synchronization layer while media distribution can be performed peer-to-peer.

The major layers are:

1. **Room / authority layer** — users, ranks, permissions, moderation, room state, and authoritative playlist decisions.
2. **Playlist / scheduling layer** — the ordered media graph that tells clients what is playing, what should be prepared next, and what should be seeded.
3. **Coordination layer** — WebRTC data channels and/or a future gossip protocol for discovering peers and exchanging swarm/availability information.
4. **Transport layer** — WebTorrent for media-piece distribution where browser capabilities permit it.
5. **Persistence layer** — IndexedDB for local media metadata, playlist state, swarm information, and durable client state.
6. **Trust / identity layer** — WebCrypto-backed identities and room-authorized capabilities; any token economy is an application-level proposal rather than a property of WebTorrent or Cytube.

## Playlist as distribution scheduler

A central design idea is that the playlist is more than a queue. It can act as a lightweight distribution scheduler.

A client can prioritize:

- the currently playing item for immediate playback;
- the next item for pre-buffering;
- subsequent items for background seeding when capacity allows;
- already-complete items for continued seeding according to room policy.

This makes playlist position useful to both playback logic and swarm health without requiring a global torrent index.

## Persistence

IndexedDB is proposed as the browser persistence layer for structured metadata. Example records may include:

- source URL or ingestion reference;
- WebTorrent infohash and magnet metadata;
- media filename and MIME/type information;
- media duration and dimensions when known;
- generated thumbnail reference;
- playlist membership and ordering metadata;
- local completion/seeding state;
- timestamps and provenance.

Actual schema design should be recorded separately before implementation is treated as stable.

## Browser constraints

The architecture must assume peer churn, NAT/firewall limitations, browser lifecycle interruptions, and inconsistent long-term seeding. A room should therefore continue functioning when individual browser peers disappear.

A future always-on desktop/server node can provide stronger persistence and seeding without changing the browser protocol model.

## Open questions

- Which Cytube room events should map directly to HiveStream room messages?
- Which playlist operations require authoritative ordering versus CRDT-style convergence?
- How should peer availability be represented and gossiped?
- How should WebTorrent metadata be validated before it enters a room playlist?
- What synchronization tolerance is acceptable for live playback?
- Which parts of the identity/rank model can safely be delegated to WebCrypto identities?
- What anti-Sybil properties are actually required before introducing any seed-token economy?
