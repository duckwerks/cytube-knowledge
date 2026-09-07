# WS-064 — CyTube Current Media / PL_CURRENT Source Findings

## Test
- Test: WS-064
- Channel: `Turbo`
- Completed: `2026-09-07T00:05:18.321Z`
- External scripts scanned: 29
- Output: `WS-064-TEST-OUTPUT.txt`

## Purpose
Trace source references for `PL_CURRENT`, `setCurrent`, `changeMedia`, and related current-media logic across the loaded CyTube JavaScript files.

## Confirmed source locations

### `data.js`
`PL_CURRENT` is initialized as a global numeric state variable:

```javascript
var PL_CURRENT = -1;
```

This establishes that playlist-current identity is maintained as global client-side state.

### `util.js`
`scrollQueue()` uses `playlistFind(PL_CURRENT)` to locate the current playlist entry.

`makeQueueEntry()` assigns each playlist item a DOM class based on its UID:

```javascript
li.addClass("pluid-" + item.uid);
li.data("uid", item.uid);
```

The Queue Next control emits:

```javascript
socket.emit("moveMedia", {
    from: li.data("uid"),
    after: PL_CURRENT
});
```

Therefore Queue Next is a `moveMedia` operation using playlist UIDs, not array indexes.

### `callbacks.js`
The source contains the authoritative client-side current transition:

```javascript
setCurrent: function(uid) {
    PL_CURRENT = uid;
    $("#queue li").removeClass("queue_active");
    var li = $(".pluid-" + uid);
    if (li.length !== 0) {
        li.addClass("queue_active");
        // scroll handling...
    }
},
```

The same file contains `changeMedia`, but the source evidence shows it as the media-player handler rather than the assignment point for `PL_CURRENT`.

### `player.js`
Search hits for `setCurrent` include player adapter methods such as Vimeo/player.js `seekTo` implementations. These are media-player APIs and are distinct from CyTube's playlist `Callbacks.setCurrent` event.

A `changeMedia` reference was also found in player-related code associated with `onEmptyPlaylist`; this calls `Callbacks.changeMedia(...)` for a special fallback/media case and does not establish playlist UID state.

### `ui.js`
The media refresh control emits:

```javascript
socket.emit("playerReady");
```

and explicitly documents that `playerReady` causes the server to send `changeMedia`, after which the `changeMedia` handler reloads the player.

The playlist sortable handler separately emits `moveMedia` with `from` and `after` UIDs.

## Combined state model

```text
SERVER
  │
  ├── setCurrent(uid)
  │      ↓
  │   Callbacks.setCurrent(uid)
  │      ↓
  │   PL_CURRENT = uid
  │      ↓
  │   .pluid-<uid> becomes queue_active
  │
  └── changeMedia(data)
         ↓
      Callbacks.changeMedia(data)
         ↓
      media/player state
```

The source evidence supports treating `setCurrent(uid)` as the client-side playlist-current identity transition and `changeMedia(data)` as the downstream media/player transition.

## Queue Next relationship

```text
Queue Next click
  ↓
moveMedia({ from: selectedUID, after: PL_CURRENT })
  ↓
server processes playlist move
  ↓
playlist/current state may subsequently produce inbound events
```

The earlier WS-061 runtime capture observed:

```json
{
  "event": "moveMedia",
  "args": ["moveMedia", {"from": 235, "after": 242}]
}
```

At that runtime point `PL_CURRENT` was independently confirmed as `242` by WS-063. This is strong runtime + source correlation that `after` is the current playlist item's UID.

## Important distinction

Do not conflate these identifiers:

- playlist item UID (`item.uid` / `PL_CURRENT`)
- playlist array position
- media identifier inside `item.media`
- player/media type or media ID

CyTube's queue DOM and Queue Next implementation operate on playlist item UIDs.

## Evidence level
**High — source-confirmed and cross-checked against runtime tests WS-061 and WS-063.**

## Recommended next investigation
Perform a controlled runtime capture of inbound Socket.IO events while causing exactly one playlist-current transition. Specifically correlate:

1. outbound action, if any;
2. inbound `setCurrent(uid)`;
3. inbound `changeMedia(data)`;
4. resulting `PL_CURRENT` value;
5. player/media fields in the `changeMedia` payload;
6. event ordering and timing.

This should establish the server-to-client event sequence for changing the active playlist item.
