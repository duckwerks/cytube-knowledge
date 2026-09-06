# WS-054 — CyTube Socket.IO Outbound Event Map Findings

## Test

**WS-054 — CYTUBE SOCKET.IO OUTBOUND EVENT MAP TEST**

Runtime observed on channel `American-Dad`.

Timestamp: `2026-09-06T05:59:42.875Z`

## Purpose

Map literal `socket.emit("event", ...)` call sites in same-origin CyTube JavaScript without invoking any outbound events.

## Runtime

- `window.socket` exists: true
- Socket connected: true
- Loaded script tags: 30
- Same-origin external scripts successfully fetched: 23
- Fetch errors: none

## Important qualification

The raw `socket.emit(...)` search also finds Socket.IO's own library documentation/examples inside `/socket.io/socket.io.js` (`foo`, `message`, `hello`) and an internal Socket.IO timeout error emission. Those are **not CyTube application protocol events**.

The application-level outbound map comes primarily from:

- `/js/util.js`
- `/js/player.js`
- `/js/ui.js`
- `/js/callbacks.js`

## Confirmed CyTube application outbound events

### Connection / session

- `joinChannel`
- `channelPassword`
- `login`
- `reportReconnect`
- `borrow-rank`
- `initUserPLCallbacks`
- `playerReady`

### Chat / users / moderation

- `chatMsg`
- `pm`
- `assignLeader`
- `setChannelRank`
- `unban`
- `vote`

### Playlist / media control

- `queue`
- `queuePlaylist`
- `moveMedia`
- `jumpTo`
- `delete`
- `setTemp`
- `playNext`
- `mediaUpdate`
- `requestPlaylist`
- `clearPlaylist`
- `shufflePlaylist`
- `togglePlaylistLock`
- `uncache`
- `deletePlaylist`
- `clonePlaylist`

### Search / polls

- `searchMedia`
- `newPoll`
- `closePoll`
- `voteskip`

### Channel configuration

- `setPermissions`
- `setOptions`
- `readChanLog`
- `setMotd`
- `setChannelCSS`
- `setChannelJS`

### Filters / emotes

- `removeFilter`
- `updateFilter`
- `moveFilter`
- `addFilter`
- `requestChatFilters`
- `importFilters`
- `importEmotes`
- `removeEmote`
- `renameEmote`
- `updateEmote`

## Especially important source observations

### `callbacks.js`

The connection callback emits:

```text
joinChannel
channelPassword   (only when channel has a password)
login             (when reconnecting as a guest identity)
```

Reconnect emits:

```text
reportReconnect
```

The siteadmin rank UI can emit:

```text
borrow-rank
```

Successful login can emit:

```text
initUserPLCallbacks
```

### `player.js`

Across the supported media backends, media completion causes the leader to emit:

```text
playNext
```

This appears repeatedly because CyTube supports multiple player backends, not because one playback completion necessarily sends multiple events.

### `ui.js`

Important playlist/media operations include:

```text
playerReady
moveMedia
queue
togglePlaylistLock
voteskip
requestPlaylist
clearPlaylist
shufflePlaylist
setChannelRank
```

The normal chat input emits:

```text
chatMsg
```

## Current protocol picture

Combined with WS-043 through WS-053, the observed architecture is now:

```text
CyTube page bootstrap
    |
    +-- GET /socketconfig/<channel>.json
    |       |
    |       +-- selected server: https://zip.cytu.be:8443
    |       +-- secure: true
    |       +-- withCredentials: true
    |
    +-- Socket.IO / Engine.IO
    |       |
    |       +-- namespace: /
    |       +-- path: /socket.io
    |       +-- Engine.IO v4
    |       +-- live transport: WebSocket
    |
    +-- inbound dispatch
    |       |
    |       +-- socket.on(event)
    |       +-- generic listener
    |       +-- Callbacks[event](data)
    |
    +-- outbound application protocol
            |
            +-- socket.emit(event, payload)
            |
            +-- server handles event
            |
            +-- server emits callback/state events back to clients
```

## What WS-054 proves

WS-054 proves the **static application vocabulary and source call sites** for outbound Socket.IO events.

It does **not** yet prove:

1. which events are actually emitted during a normal session;
2. the exact runtime payloads for each event;
3. whether dynamically constructed/non-literal emits exist elsewhere;
4. server acceptance/rejection semantics for those events;
5. whether every client-side event has a corresponding server-side handler with the same name.

## Next investigation

The next test should observe **actual runtime outbound traffic** without intentionally invoking any event. The highest-value first target is the transparent observation of `socket.emit` while the page continues normal operation, especially `mediaUpdate` and other naturally generated events.

The observer should record event name, argument count, serialized arguments, timestamp, and a short stack trace when possible. It must not call `emit` itself or synthesize test traffic.
