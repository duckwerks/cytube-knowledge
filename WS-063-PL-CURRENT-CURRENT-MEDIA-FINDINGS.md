# WS-063 — PL_CURRENT / Current-Media Identity Findings

## Test

WS-063 — passive/read-only runtime source introspection on CyTube channel `Turbo`.

## Runtime observation

- `window.PL_CURRENT` exists.
- Type: `number`
- Current value during test: `242`
- DOM contains `.pluid-242`.
- That element has classes:
  - `queue_entry`
  - `pluid-242`
  - `queue_active`
- The matching DOM entry text began with `Raw Video`, followed by duration and playlist controls.

## Source-confirmed meaning

The live `Callbacks.setCurrent` implementation is:

```javascript
function(uid) {
    PL_CURRENT = uid;
    $("#queue li").removeClass("queue_active");
    var li = $(".pluid-" + uid);
    if (li.length !== 0) {
        li.addClass("queue_active");
        var tmr = setInterval(function () {
            if (!PL_WAIT_SCROLL) {
                scrollQueue();
                clearInterval(tmr);
            }
        }, 100);
    }
}
```

Therefore `PL_CURRENT` is the current playlist item's **UID**, not a playlist array index and not the media object itself.

## Queue Next relationship

WS-062/WS-061 established that the Queue Next button emits:

```javascript
socket.emit("moveMedia", {
    from: li.data("uid"),
    after: PL_CURRENT
});
```

WS-063 now proves that `PL_CURRENT` is the UID of the currently active playlist item. Thus Queue Next semantics are:

```text
selected playlist item UID
        ↓
moveMedia({
    from: selectedUID,
    after: currentUID
})
        ↓
server moves selected item immediately after current item
```

The `playlistMove(from, after, cb)` client function independently confirms that both values identify playlist DOM entries using `.pluid-<uid>`.

## Important distinction

Playlist UIDs are persistent item identifiers within the live playlist state; they must not be treated as zero-based array positions. WS-061 observed `from: 235` and `after: 242`, while WS-063 directly showed `PL_CURRENT = 242` and `.pluid-242.queue_active`.

## Other source observations

- `Callbacks.changeMedia(data)` loads/updates the media player and does not itself assign `PL_CURRENT`.
- `Callbacks.mediaUpdate(data)` updates the player but does not assign `PL_CURRENT`.
- `Callbacks.playlist(data)` rebuilds the playlist DOM.
- `Callbacks.queue(data)` creates a queue entry and explicitly checks `data.item.uid === PL_CURRENT` to mark a newly received current item active.
- `makeQueueEntry(item, addbtns)` stores `item.uid` in both the `.pluid-<uid>` class and jQuery `data("uid")`.

## Evidence level

**Runtime + source confirmed.**

We now have a complete client-side identity chain for current playlist selection:

```text
server setCurrent event
        ↓
Callbacks.setCurrent(uid)
        ↓
PL_CURRENT = uid
        ↓
.pluid-<uid>.queue_active
        ↓
Queue Next uses after: PL_CURRENT
```

## Next investigation

WS-064 should determine where the `setCurrent` inbound event originates in the server/client media-transition flow and correlate it with `changeMedia` and playlist state. The key question is whether `setCurrent(uid)` is emitted before, after, or independently of `changeMedia(data)` when the current media changes.
