# Cytube Project — Repository Map

_Last compiled: 2026-09-05_

This is a consolidated index across all known GitHub repos related to
your Cytube channel/room development work, spanning three accounts.
Purpose: stop losing track of what exists where, especially since work
has been split across multiple LLM sessions (Claude + ChatGPT) without
a single running index until now.

---

## 1. `duckwerks/cytube-knowledge`
**https://github.com/duckwerks/cytube-knowledge**

**Type:** Reference / reverse-engineering knowledge base (no shipped
channel features — this is the "how Cytube works" layer).

**Status:** Actively maintained, current session's home base.

**Contents:**
- DOM structure research (`2026-02-26_Cytube DOM structure.txt`,
  `2026-04-07_cytube websocket and dom structure.txt`)
- Numbered `DOM-00x` / `WS-0xx` research files (client resources,
  data.js findings, Socket.IO/Engine.IO handshake behavior, transport
  upgrade protocol, browser fingerprinting comparisons)
- `WS-028`: full inbound Socket.IO event catalog (70 events, from
  `callbacks.js`)
- `WS-029`: full outbound Socket.IO event catalog (~46 events, from
  `ui.js` + other core files)
- `WS-030`: full channel CSS/JS injection + permission mechanism
  (`channelCSSJS` event → `checkScriptAccess()` → `JSPREF` →
  `localStorage` key `channel_js_pref`)
- `my-cytube-development-environment.txt` — environment notes
- Workflow/conventions doc (mobile-only dev, versioning, jsDelivr,
  troubleshooting discipline) — drafted this session, not yet
  confirmed pushed

**Open items flagged but not yet done:**
- Rank/permission value map
- Global `window` objects exposed by Cytube's client bundle
- Emote/chat markup parsing rules
- Full LocalStorage/cookie key inventory
- Behavior of "Remember my choice" unchecked vs. Deny persistence

---

## 2. `backwater-battery/cytube-hivestream`
**https://github.com/backwater-battery/cytube-hivestream**

**Type:** Active feature project — appears to be a **P2P
theater/sync layer** for Cytube, i.e. peer-to-peer synchronized
playback/streaming, possibly with a token/donation component (name
echoes the unrelated third-party "HiveStream" donation platform, but
this looks like your own separate build under a similar name — worth
double-checking there's no naming confusion with `fkosmala/hivestream`,
an unrelated PHP donation-platform project that also uses the name
"HiveStream").

**Contents:**
- `HiveStream P2P Architecture.txt` — architecture doc
- `HiveStream Token Architecture JS.txt` — token system architecture doc
- `P2P-Theater-Core-0.00.01.js` through `0.00.13.js` (13 versions,
  including a `0.00.04a` variant) — main script, actively iterated
- `cytube-hook-framework-0.00.01.js` — a separate hook/framework
  script, only one version so far (early stage or paused)
- `cytube websocket and dom structure.txt` — same research lineage as
  the `duckwerks` repo's WS/DOM files (likely from an earlier or
  parallel ChatGPT session — worth diffing against `duckwerks` files
  to check for overlap/conflicting findings)

**Status:** Most actively version-iterated project of the four (13
versions on the core script). Likely represents significant undocumented
progress relative to `duckwerks/cytube-knowledge`.

**Follow-up needed:** Confirm current working version, what's still
broken/in-progress, and whether the token/donation piece is live or
conceptual.

---

## 3. `backwater-battery/Dadders-cybertube`
**https://github.com/backwater-battery/Dadders-cybertube**

**Type:** Single-channel feature script ("American Dad room").

**Contents:**
- `Klausfishbowlchat-7.0.01.js` through `7.0.07.js`, plus an
  unversioned `Klausfishbowlchat-7.js`
- Name suggests a chat-related feature (possibly a themed/character
  chat overlay or bot-like chat behavior — "Klaus" being an American
  Dad character)

**Status:** 7 iterated versions — mature-ish, but no architecture doc
alongside it (unlike HiveStream), so the design intent isn't written
down anywhere yet.

**Follow-up needed:** Confirm what `Klausfishbowlchat` actually does,
and whether it depends on anything from `cytube-hivestream` or
`cytube-knowledge` findings (e.g. does it rely on specific Socket.IO
events we've now cataloged?).

---

## 4. `aolcyberchat-gpu` (separate GitHub account, 6 repos)
**https://github.com/aolcyberchat-gpu**

**Type:** Grab-bag of separate Cytube feature projects, all JS/HTML.

| Repo | Description (per GitHub) |
|---|---|
| `cytube-tanks-script` | "CyTube BattleTanks deterministic game v Beta" — a real-time or turn-based tanks game built for Cytube chat/channel |
| `cytube-dictionary-assets` | Esperanto–English dictionary pairings (data asset, not a script — possibly feeds a translation/chat feature) |
| `cytube-myspace` | "my music room" — personal channel customization |
| `P2P-Theater-Core` | Same/similar name to the core script in `cytube-hivestream` — **possible duplicate, fork, or divergent copy; needs diffing** to determine which is canonical |
| `cytube-ring-plug` | "A web ring for cytube" — cross-channel/cross-site linking feature |
| `Cytube-HLS-minplayer` | "A HLS min player for Cytube" — custom minimal HLS video player, HTML-based |

**Status:** Unknown activity level — only saw repo names/descriptions,
not file-level detail yet.

**Follow-up needed (highest priority ambiguity):** `P2P-Theater-Core`
exists in BOTH `aolcyberchat-gpu` and as the versioned script inside
`backwater-battery/cytube-hivestream`. Need to determine:
- Are these the same project under two accounts?
- Which one is newer/canonical?
- Was one abandoned in favor of the other?

---

## Cross-Repo Observations

1. **Duplicate research lineage:** Both `duckwerks/cytube-knowledge`
   and `backwater-battery/cytube-hivestream` contain a file titled
   `cytube websocket and dom structure.txt`. These may be identical,
   near-identical, or diverged — worth a direct diff to merge findings
   rather than maintaining two copies.
2. **Three separate "accounts of record"** (`duckwerks`,
   `backwater-battery`, `aolcyberchat-gpu`) with no cross-linking
   between them (no repo references another by URL in its README, as
   far as surfaced). Consider whether these should eventually be
   consolidated under one account/org, or at minimum cross-linked in
   each README so future-you (or future-LLM) doesn't lose track again.
3. **`duckwerks/cytube-knowledge` is the only pure-reference repo** —
   everything else is a shipped/in-progress feature. This is actually
   a healthy split (reference vs. implementation) — worth keeping
   deliberately, and worth having every feature repo's README link
   back to it as the shared source of truth for event names/DOM
   structure/permission behavior, so future feature work doesn't
   re-derive things already confirmed (e.g. Klausfishbowlchat or the
   Tanks script don't need to re-discover the `channelCSSJS`
   permission gate — it's already documented in `WS-030`).
4. **No single "project board" or top-level index existed before this
   file.** This doc is a reasonable candidate to live in
   `duckwerks/cytube-knowledge` itself as e.g. `REPO-INDEX.md`, so it's
   discoverable from the reference repo going forward.

---

## Suggested Next Steps (pick one)

- Diff the two `cytube websocket and dom structure.txt` files
  (duckwerks vs. hivestream) to check for conflicting or additional
  findings not yet folded into the WS-0xx catalog.
- Pull file contents of `P2P-Theater-Core-0.00.13.js` (latest hivestream
  version) and the `aolcyberchat-gpu/P2P-Theater-Core` repo's latest
  file to resolve the duplicate-project question.
- Pull `Klausfishbowlchat-7.0.07.js` (latest) to document what that
  feature actually does and whether it can benefit from the WS-030
  permission findings.
- Continue the original reverse-engineering plan in `cytube-knowledge`
  (rank/permission value map next).