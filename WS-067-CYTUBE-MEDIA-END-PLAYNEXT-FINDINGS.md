# WS-067 — CyTube Media-End / playNext Findings

## Test

WS-067 — live source scan of loaded CyTube JavaScript for media-end and auto-advance handling.

## Result

**CONFIRMED: CyTube's player layer emits the outbound Socket.IO event `playNext` when media reaches its end, but only from the current leader client.**

The live `player.js` source contains multiple player-specific end-of-media handlers. The common behavior is:

```javascript
if (CLIENT.leader) {
    return socket.emit('playNext');
}
```

Confirmed occurrences include:

- Dailymotion: `player.js:92-95`
- NicoNico: `player.js:242-245`
- PeerTube: `player.js:370-372` via `playbackStatusUpdate` and `playbackState === "ended"`
- SoundCloud: `player.js:493-495` via the FINISH event
- Twitch: `player.js:628-630`
- Vimeo: `player.js:766-768`
- YouTube: `player.js:908-909` via `YT.PlayerState.ENDED`
- PlayerJS: `player.js:1004-1006`
- Another player-specific path: `player.js:1554-1556`
- An additional delayed `playNext` path occurs around `player.js:1183`.

## Important architectural conclusion

This resolves the major ambiguity left by WS-066.

The normal auto-advance architecture is:

```text
MEDIA PLAYER REACHES END
        |
        v
player.js end/finish handler
        |
        | if CLIENT.leader
        v
socket.emit("playNext")
        |
        v
SERVER handles playNext
        |
        v
SERVER selects/advances playlist current item
        |
        v
Socket.IO inbound events
        |
        +--> Callbacks.setCurrent(nextUid)
        |       |
        |       +--> PL_CURRENT = nextUid
        |       +--> .queue_active moves to next item
        |
        +--> Callbacks.changeMedia(mediaDescriptor)
                |
                +--> player loads next media

        then
        |
        v
Callbacks.mediaUpdate(...)
```

## Correlation with WS-066

WS-066 observed natural auto-advance:

```text
PL_CURRENT 2 -> 3
Callbacks.setCurrent(3)
        -> Callbacks.changeMedia(s1e4.mp4)
```

WS-067 now identifies the missing upstream trigger: the **leader's player emits `playNext` when playback ends**.

WS-066 did not capture `playNext` because the test's capture window began after the observed transition had already occurred, and the later captured outbound events (`joinChannel`, `initUserPLCallbacks`) were caused by a subsequent connection/session initialization rather than the actual transition.

## Leader authority

The source consistently guards the end-of-media command with:

```javascript
if (CLIENT.leader)
```

Therefore ordinary viewers do not independently request auto-advance. The leader is the client responsible for telling the server that the current media has ended.

This is an important architectural distinction:

- **Client/player:** detects physical media completion.
- **Leader:** sends `playNext`.
- **Server:** authoritative playlist transition/selection.
- **All clients:** receive the resulting current-media state through inbound callbacks.

## WS-067 test limitations

The test was a broad source scan. It produced 807 total keyword matches and 279 interesting matches across loaded scripts. Many were unrelated uses of words such as `complete` or `ended` inside libraries.

The decisive evidence came from `https://cytu.be/js/player.js`, where the relevant player-specific handlers explicitly combine an end/finish condition with `CLIENT.leader` and `socket.emit('playNext')`.

WS-067 therefore establishes the **static source path** but does not itself capture a live `playNext` emission. A focused runtime test could still be used to capture the actual leader-side `playNext` event if desired.

## Status

**WS-067 COMPLETE — source-level auto-advance trigger identified.**

Next investigation should move from "what triggers auto-advance?" to the server-side semantics of `playNext`: what request the server accepts, how it chooses the next UID, and exactly which outbound/inbound events it produces for all clients.
