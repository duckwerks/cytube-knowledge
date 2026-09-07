# WS-066 — CyTube Auto-Advance Findings

## Test

**WS-066 — CYTUBE AUTO-ADVANCE CAPTURE TEST**  
Passive / controlled / mobile

## Result

**Natural playlist auto-advance was captured successfully.**

Initial state:

- `PL_CURRENT = 2`
- active DOM playlist UID = `2`

At `2026-09-07T03:02:37.655Z`, CyTube delivered:

```text
Callbacks.setCurrent(3)
```

State changed:

```text
PL_CURRENT: 2 -> 3
active DOM UID: 2 -> 3
```

26 ms later, at `2026-09-07T03:02:37.681Z`, CyTube delivered:

```text
Callbacks.changeMedia({
  id: "https://archive.org/download/00ifukedurmom_202306/s1e4.mp4",
  title: "Raw Video",
  seconds: 1344,
  duration: "22:24",
  type: "fi",
  meta: {
    codec: "mov/h264",
    bitrate: 493.512
  },
  currentTime: -3,
  paused: true
})
```

`changeMedia` did not change `PL_CURRENT`; it remained `3`.

## Definitive transition sequence

The observed natural auto-advance therefore follows:

```text
CURRENT MEDIA ENDS NATURALLY
        |
        v
Callbacks.setCurrent(3)
        |
        |  PL_CURRENT: 2 -> 3
        |  active DOM: 2 -> 3
        v
Callbacks.changeMedia(next media)
        |
        v
new media begins playback
```

This matches the ordering established by WS-065 for manual Play:

```text
setCurrent(uid)
    -> changeMedia(media descriptor)
    -> mediaUpdate(...)
```

The important new result is that **natural playlist auto-advance uses the same authoritative current-item transition: `setCurrent(nextUid)` occurs before `changeMedia(nextMedia)`.**

## Additional callbacks observed

At `03:03:10.017Z`, after the new item was already current, another:

```text
Callbacks.setCurrent(3)
```

was observed, followed at `03:03:10.018Z` by:

```text
Callbacks.setCurrent(3)
Callbacks.changeMedia(next media, currentTime ~= 5.002, paused=false)
```

and another `setCurrent(3)` at `03:03:10.071Z`.

These later callbacks do **not** represent a second playlist advance because `PL_CURRENT` remained `3` throughout. They are best treated as a player initialization/reconciliation/reload sequence unless a future test identifies their exact source.

## Outbound Socket.IO result

No playlist-control outbound event was captured during the actual transition.

The captured outbound events were:

- `joinChannel` — emitted during socket connection/rejoin
- `initUserPLCallbacks` — emitted during login/session initialization

Neither is evidence of an auto-advance command.

Therefore WS-066 provides **no evidence that the client emits `playNext` (or another playlist command) to cause natural auto-advance.**

Given the timing, the strongest current interpretation is that the server/runtime directly delivers the next current-media state to the client, producing `setCurrent(nextUid)` followed by `changeMedia(nextMedia)`.

This is an inference about the source of the transition, not yet a proof of whether the server or another client-side mechanism selected UID 3.

## Important limitation

The test's `transition` field remained `null` because WS-066 did not automatically populate that field for a natural transition. The actual transition is nevertheless proven by the callback records and state changes.

## Evidence level

### Proven

1. Initial current playlist item was UID `2`.
2. Natural playback progressed until the next item became active.
3. `Callbacks.setCurrent(3)` changed `PL_CURRENT` from `2` to `3`.
4. The active DOM playlist item changed from UID `2` to UID `3`.
5. `Callbacks.changeMedia(...)` followed 26 ms later.
6. `changeMedia` received the media descriptor for `s1e4.mp4`.
7. `changeMedia` did not itself change `PL_CURRENT`.
8. No relevant outbound playlist command was captured.

### Not yet proven

1. Whether the server explicitly selects the next UID and emits `setCurrent`/`changeMedia` directly.
2. Whether a client-side `playNext`/end-of-media handler requests the advance but the request was missed because the test began after the relevant event, or because the event uses a different path.
3. Exact source/call site responsible for the natural end-of-media transition.

## Next logical investigation

Do **not** repeat WS-066 immediately.

The next test should inspect the player end-of-media path and correlate it with the already-established inbound transition. Search the live `player.js`, `util.js`, and `callbacks.js` sources for the media player's natural `ended`/completion handler and determine whether it:

- emits an outbound Socket.IO event such as `playNext`,
- calls a local function that ultimately causes the transition, or
- simply reports completion while the server independently advances the playlist.

If a concrete end-of-media call site is found, perform one controlled runtime test around that exact handler rather than another long-duration natural playback test.
