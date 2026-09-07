# WS-065 — CyTube Inbound Current/Media Correlation Findings

## Test

**WS-065 — CYTUBE INBOUND CURRENT/MEDIA CORRELATION TEST**

Controlled action: click exactly one visible playlist **Play** button.

Channel: `Turbo`

## Controlled action

At `2026-09-07T02:39:21.330Z`, the test captured one click on:

- Button: `Play`
- Class: `btn btn-xs btn-default qbtn-play`
- Playlist UID: `2`
- `PL_CURRENT` at click: `242`

Therefore the action was specifically: **play playlist item UID 2 while UID 242 was current**.

## Inbound callback sequence

Immediately after the click, the runtime received:

1. `setCurrent(2)` at `2026-09-07T02:39:21.405Z`
   - `PL_CURRENT_before`: `242`
   - argument: `2`
   - `PL_CURRENT_after`: `2`
   - active DOM UID after callback: `2`

2. `changeMedia({...})` at `2026-09-07T02:39:21.412Z`
   - `PL_CURRENT_before`: `2`
   - `PL_CURRENT_after`: `2`
   - active DOM UID: `2`
   - media URL: `https://archive.org/download/00ifukedurmom_202306/s1e3.mp4`
   - title: `Raw Video`
   - duration: `1391` seconds / `23:11`
   - media type: `fi`
   - codec: `mov/h264`
   - bitrate: `495.051`
   - initial `currentTime`: `-3`
   - initial `paused`: `true`

3. `mediaUpdate` begins at `2026-09-07T02:39:24.428Z`
   - `PL_CURRENT`: `2`
   - `currentTime`: `0`
   - `paused`: `false`

Subsequent `mediaUpdate` callbacks continue approximately every 5 seconds with `PL_CURRENT = 2`, and `currentTime` advancing normally (5, 10, 15, ... seconds).

## Important timing

The transition was:

```text
02:39:21.330  user clicks Play on UID 2
02:39:21.405  inbound setCurrent(2)
02:39:21.412  inbound changeMedia(media for UID 2)
02:39:24.428  inbound mediaUpdate {currentTime: 0, paused: false}
```

The gap from click to `setCurrent` was approximately **75 ms**.

The gap from `setCurrent` to `changeMedia` was approximately **7 ms**.

The gap from `changeMedia` to the first observed playing `mediaUpdate` was approximately **3.016 seconds**.

## Findings

### 1. `setCurrent` is the observed playlist-current transition

This test provides runtime evidence that playing a specific playlist item causes the server/client callback `setCurrent(uid)` to update `PL_CURRENT` from the old UID to the selected UID.

```text
PL_CURRENT: 242 → 2
```

The corresponding `.queue_active` DOM item also changed to UID `2`.

### 2. `changeMedia` follows `setCurrent`

For this controlled Play action, `changeMedia` arrived **after** `setCurrent` and operated with `PL_CURRENT` already equal to `2`.

This supports the following observed runtime sequence:

```text
Play action
   ↓
setCurrent(selected UID)
   ↓
PL_CURRENT updated
   ↓
changeMedia(media descriptor)
   ↓
player loads/changes media
   ↓
mediaUpdate playback telemetry
```

This is stronger evidence than static source inspection alone, but it represents this controlled transition and should not yet be treated as a universal guarantee for every CyTube transition path.

### 3. `changeMedia` carries media identity/content, not the playlist UID

The `changeMedia` payload contains the media descriptor (`id`, `title`, `seconds`, `duration`, `type`, `meta`, `currentTime`, `paused`) but does not contain the playlist UID `2` in the captured object.

The playlist identity is therefore separately represented by `setCurrent(uid)` / `PL_CURRENT`.

### 4. `mediaUpdate` is downstream playback state

After `changeMedia`, `mediaUpdate` reports playback state such as `currentTime` and `paused` while retaining the current playlist UID through `PL_CURRENT`.

This confirms the separation:

- `setCurrent` → **which playlist item is current**
- `changeMedia` → **what media should be loaded/played**
- `mediaUpdate` → **where playback currently is / paused state**

### 5. The media actually played successfully

The first post-transition `mediaUpdate` reported:

```json
{
  "currentTime": 0,
  "paused": false
}
```

and subsequent updates advanced normally. This is useful evidence that the observed `changeMedia` payload corresponded to an actual player transition rather than merely a metadata update.

## Architectural implication

For a CyTube-compatible implementation, the observed client state machine should conceptually preserve these as separate state transitions:

```text
CURRENT_PLAYLIST_ITEM
    UID = 2
        │
        │ setCurrent(2)
        ▼
MEDIA_SELECTION
    media descriptor
        │
        │ changeMedia(media)
        ▼
PLAYER_STATE
    currentTime / paused / playback state
        │
        │ mediaUpdate(...)
        └───────────────► ongoing synchronization telemetry
```

Do not collapse `setCurrent`, `changeMedia`, and `mediaUpdate` into one generic event in the future HiveStream/CyTube-compatible protocol. They represent distinct layers of state.

## Confidence / limitations

**High confidence for the tested Play transition.**

The test was controlled to one Play click, captured the exact target UID, and observed the inbound callback sequence with before/after `PL_CURRENT` and DOM state.

Still unproven:

- whether every CyTube transition path always emits `setCurrent` immediately before `changeMedia`;
- whether automatic next-item playback has exactly the same ordering;
- whether `jumpTo`, `playNext`, vote-skip, playlist exhaustion, or server-side moderation paths use identical sequencing;
- whether other media types introduce additional callbacks between these events.

Those should be tested separately rather than inferred.
