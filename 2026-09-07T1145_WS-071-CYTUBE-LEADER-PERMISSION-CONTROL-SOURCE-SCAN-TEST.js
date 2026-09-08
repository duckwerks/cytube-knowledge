/*
===============================================================================
WS-071 — CYTUBE LEADER / PERMISSION CONTROL SOURCE SCAN TEST
===============================================================================

TEST CLASS
-------------------------------------------------------------------------------
PASSIVE / READ-ONLY / LIVE SOURCE INTROSPECTION

PURPOSE
-------------------------------------------------------------------------------
We are investigating the relationship between:

    CHANNEL OWNER
        ↓
    CHANNEL PERMISSIONS
        ↓
    USER RANK
        ↓
    LEADER ADMINISTRATION
        ↓
    CLIENT.leader
        ↓
    LEADER-ONLY BEHAVIOR
        ↓
    socket.emit("playNext")

Previous tests established several important facts.

WS-042 / WS-042B
----------------
CyTube permissions are threshold based:

    CLIENT.rank >= CHANNEL.perms[permissionName]

The live channel exposed:

    leaderctl: 2

This means rank alone does not necessarily make somebody a leader.
Rather, rank determines whether the user has permission to perform
leader-related administrative operations.

WS-063
------
PL_CURRENT is the client's current playlist UID.

WS-065
------
A manual Play operation produced:

    Play click
        ↓
    inbound setCurrent(uid)
        ↓
    PL_CURRENT = uid
        ↓
    inbound changeMedia(media)
        ↓
    mediaUpdate

WS-066
------
Natural media completion produced:

    media end
        ↓
    inbound setCurrent(nextUID)
        ↓
    inbound changeMedia(nextMedia)

WS-067
------
Live player.js source showed that the leader is the client that performs:

    if (CLIENT.leader)
        socket.emit("playNext")

Therefore:

    PLAYER END
        ↓
    LEADER
        ↓
    playNext
        ↓
    SERVER
        ↓
    SERVER CHOOSES NEXT PLAYLIST ITEM
        ↓
    setCurrent(nextUID)
        ↓
    changeMedia(nextMedia)

WS-068
------
Runtime showed:

    CLIENT.rank   = 1
    CLIENT.leader = false

and the channel had:

    leaderctl = 2

This reinforces that rank and leader are separate concepts.

WS-069
------
Source inspection found the actual client-side leader state logic.

In callbacks.js the client receives a leader name and compares it
against CLIENT.name.

Conceptually:

    server-provided leader name
        ↓
    if name === CLIENT.name
        ↓
    CLIENT.leader = true

and when the leader becomes active:

    LEADTMR = setInterval(sendVideoUpdate, 5000)

WS-070
------
We passively wrapped Callbacks.setLeader for TWO separate 60-second
windows.

Both produced:

    events: []

and:

    CLIENT.leader = false

This tells us that simply waiting for a normal setLeader event is not
a useful next experiment.

THE QUESTION NOW
----------------
We need to understand the browser-side ADMINISTRATION PATH.

Specifically:

    Where does the UI expose leader administration?

    Which permission enables it?

    Which function handles it?

    What Socket.IO event does the browser emit?

    Is it "assignLeader"?

    Is it "setUserRank"?

    Is it "borrow-rank"?

    Is there another event?

    How does this relate to leaderctl?

    How does the server response eventually reach:

        Callbacks.setLeader(...)

This test therefore performs a focused static scan of the LIVE CyTube
client source.

IMPORTANT
---------
This is intentionally NOT a controlled administrative action.

We are NOT going to:

    - assign anybody as leader
    - remove anybody as leader
    - change anybody's rank
    - change permissions
    - click administrative controls
    - emit an administrative Socket.IO event
    - modify the playlist
    - modify player state
    - disconnect the socket

We first determine the browser's intended protocol from source.

That is safer and gives us a much better target for the next test.

===============================================================================
FILES SCANNED
===============================================================================

The test fetches the exact live versions of:

    /js/callbacks.js
    /js/ui.js
    /js/util.js
    /js/player.js

It also scans inline scripts already present in the page.

===============================================================================
SEARCH VOCABULARY
===============================================================================

The scan concentrates on:

    leaderctl
    assignLeader
    setLeader
    CLIENT.leader
    handlePermissionChange
    setPermissions
    channelRanks
    setUserRank
    borrow-rank
    borrowRank
    leader

The important improvement over a generic source search is that we also
look specifically for socket.emit(...) calls occurring near these
leader/rank/permission terms.

That should allow us to distinguish:

    "leader is mentioned"

from:

    "this browser function actually sends an event related to leader
     administration."

===============================================================================
DOM INSPECTION
===============================================================================

The test also looks at currently existing UI elements whose:

    text
    title
    aria-label
    id
    class
    name
    value

contains words such as:

    leader
    rank
    permission
    moderator
    owner
    admin

This is observational only.

The test does NOT click anything.

The DOM information may reveal whether leader/rank administration is
currently exposed to the logged-in user and what controls the browser
actually renders.

===============================================================================
OUTPUT
===============================================================================

The complete result is stored in:

    window.__WS071_DATA__

The object contains:

    runtime
    files
    sourceMatches
    emitContexts
    domControls
    errors
    summary

Because Kiwi's mobile DevTools clipboard behavior requires the copy()
operation to occur synchronously from the console command, the test
does NOT attempt to copy its own asynchronous result.

After the test completes, use the separate synchronous copy command
provided immediately after this script.

===============================================================================
EXPECTED VALUE
===============================================================================

The most valuable result would be something resembling:

    UI control
        ↓
    permission check
        ↓
    function
        ↓
    socket.emit("SOME_EVENT", payload)
        ↓
    server
        ↓
    inbound setLeader
        ↓
    CLIENT.leader

If we find that chain, WS-071 will give us the browser-side protocol
needed for the next controlled runtime experiment.

===============================================================================
*/

(async function WS071() {

    const TEST = "WS-071";
    const started = new Date().toISOString();

    /*
    ---------------------------------------------------------------------------
    Focused search vocabulary.
    ---------------------------------------------------------------------------

    We deliberately avoid searching every occurrence of generic words
    such as "user" or "channel".  Those would produce enormous amounts
    of irrelevant source.

    These terms correspond directly to things already observed in
    previous reverse-engineering tests.
    */
    const PATTERNS = [
        "leaderctl",
        "assignLeader",
        "setLeader",
        "CLIENT.leader",
        "handlePermissionChange",
        "setPermissions",
        "channelRanks",
        "setUserRank",
        "borrow-rank",
        "borrowRank",
        "leader"
    ];

    /*
    ---------------------------------------------------------------------------
    Core CyTube application files.

    These are the files where the browser-side protocol and UI logic
    have previously been observed.
    */
    const CORE_FILES = [
        "/js/callbacks.js",
        "/js/ui.js",
        "/js/util.js",
        "/js/player.js"
    ];

    /*
    Number of source lines to include before and after each interesting
    match.

    Five lines on either side is usually enough to expose the enclosing
    function or the nearby socket.emit() call without producing an
    impossibly large result.
    */
    const CONTEXT_RADIUS = 5;

    /*
    ---------------------------------------------------------------------------
    Master result object.
    ---------------------------------------------------------------------------
    */
    const data = {
        test: TEST,
        status: "RUNNING",
        started,

        page: {
            url: location.href,
            title: document.title,
            readyState: document.readyState
        },

        runtime: {
            channelName: window.CHANNEL?.name ?? null,
            clientName: window.CLIENT?.name ?? null,
            clientRank: window.CLIENT?.rank ?? null,
            clientLeader: window.CLIENT?.leader ?? null,

            socketExists: !!window.socket,
            socketConnected: !!window.socket?.connected,

            callbacksExists: !!window.Callbacks,

            /*
            Capture the permission object exactly as exposed by the
            running client.

            This is particularly important because leaderctl is one
            of the permissions we are investigating.
            */
            channelPerms: window.CHANNEL?.perms ?? null
        },

        files: [],

        /*
        Every source line matching one of the focused patterns.
        */
        sourceMatches: [],

        /*
        Only socket.emit() lines that occur in source context containing
        leader/rank/permission-related vocabulary.
        */
        emitContexts: [],

        /*
        Potentially relevant administrative controls currently rendered
        in the DOM.
        */
        domControls: [],

        errors: [],

        summary: null,

        completed: null
    };

    /*
    Store the object globally immediately.

    This means that even if something later fails, the partial diagnostic
    state remains accessible from DevTools.
    */
    window.__WS071_DATA__ = data;

    /*
    ---------------------------------------------------------------------------
    Helper: return source context around a matching line.
    ---------------------------------------------------------------------------
    */
    function addContext(lines, index) {

        const start = Math.max(
            0,
            index - CONTEXT_RADIUS
        );

        const end = Math.min(
            lines.length,
            index + CONTEXT_RADIUS + 1
        );

        return lines
            .slice(start, end)
            .map(function(text, offset) {

                return {
                    lineNumber: start + offset + 1,
                    text
                };

            });
    }

    /*
    ---------------------------------------------------------------------------
    Helper: determine whether a line contains one of our focused terms.
    ---------------------------------------------------------------------------
    */
    function interesting(text) {

        return PATTERNS.some(function(pattern) {

            return text
                .toLowerCase()
                .includes(pattern.toLowerCase());

        });
    }

    /*
    ---------------------------------------------------------------------------
    Helper: determine whether a source line actually contains a Socket.IO
    emit call.

    We are interested in application protocol emissions, not generic
    JavaScript function calls.
    ---------------------------------------------------------------------------
    */
    function hasEmit(text) {

        return /\bsocket\.emit\s*\(/i.test(text) ||
               /\bwindow\.socket\.emit\s*\(/i.test(text);
    }

    /*
    ---------------------------------------------------------------------------
    Fetch one exact live source file.
    ---------------------------------------------------------------------------
    */
    async function fetchSource(path) {

        const url = location.origin + path;

        try {

            const response = await fetch(
                url,
                {
                    credentials: "same-origin"
                }
            );

            if (!response.ok) {

                throw new Error(
                    "HTTP " + response.status
                );
            }

            return {
                path,
                url,
                source: await response.text()
            };

        } catch (error) {

            data.errors.push({
                stage: "fetch",
                path,
                error: String(
                    error && (
                        error.stack ||
                        error
                    )
                )
            });

            return null;
        }
    }

    /*
    ===========================================================================
    1. FETCH AND SCAN CORE SOURCE FILES
    ===========================================================================
    */

    for (const path of CORE_FILES) {

        const result = await fetchSource(path);

        if (!result) {
            continue;
        }

        const lines = result.source.split(/\r?\n/);

        data.files.push({
            path,
            url: result.url,
            lineCount: lines.length,
            sourceLength: result.source.length
        });

        /*
        -----------------------------------------------------------------------
        First pass:
        capture every focused leader/rank/permission source match.
        -----------------------------------------------------------------------
        */

        lines.forEach(function(text, index) {

            if (!interesting(text)) {
                return;
            }

            data.sourceMatches.push({
                path,
                url: result.url,
                lineNumber: index + 1,
                text,
                context: addContext(lines, index)
            });

        });

        /*
        -----------------------------------------------------------------------
        Second pass:
        capture actual socket.emit() calls that occur in a nearby
        leader/rank/permission context.

        This is the most important part of WS-071.

        For example, if the source contains:

            if(hasPermission("leaderctl")) {
                socket.emit("assignLeader", ...);
            }

        the emitContext should expose both the permission check and
        the actual outbound protocol event.
        -----------------------------------------------------------------------
        */

        lines.forEach(function(text, index) {

            if (!hasEmit(text)) {
                return;
            }

            const nearby = lines
                .slice(
                    Math.max(0, index - 8),
                    Math.min(lines.length, index + 9)
                )
                .join("\n");

            if (!interesting(nearby)) {
                return;
            }

            data.emitContexts.push({

                path,
                url: result.url,

                lineNumber: index + 1,

                emitLine: text,

                context: addContext(
                    lines,
                    index
                )
            });

        });
    }

    /*
    ===========================================================================
    2. SCAN INLINE SCRIPTS
    ===========================================================================
    */

    /*
    Some CyTube behavior can be initialized from inline page scripts
    rather than the four primary external files.

    We therefore inspect inline scripts too.

    We do NOT execute them.
    We only inspect their existing text.
    */

    const inlineScripts = Array
        .from(document.scripts)
        .filter(function(script) {

            return !script.src &&
                   script.textContent;

        });

    inlineScripts.forEach(function(script, scriptIndex) {

        const lines = script
            .textContent
            .split(/\r?\n/);

        lines.forEach(function(text, index) {

            if (!interesting(text)) {
                return;
            }

            data.sourceMatches.push({

                path:
                    "[inline-script-" +
                    scriptIndex +
                    "]",

                url: location.href,

                lineNumber: index + 1,

                text,

                context:
                    addContext(
                        lines,
                        index
                    )
            });

        });

    });

    /*
    ===========================================================================
    3. INSPECT CURRENT ADMINISTRATION-RELATED DOM CONTROLS
    ===========================================================================
    */

    /*
    Search the current page for controls whose visible or identifying
    metadata suggests that they may be related to:

        leader
        rank
        permissions
        moderation
        ownership
        administration

    This does NOT interact with them.
    */

    const allElements = Array.from(
        document.querySelectorAll(
            "button, a, input, select, option, li, tr, td"
        )
    );

    allElements.forEach(function(el, index) {

        const text = [

            el.textContent || "",

            el.getAttribute("title") || "",

            el.getAttribute("aria-label") || "",

            el.getAttribute("id") || "",

            el.getAttribute("class") || "",

            el.getAttribute("name") || "",

            el.getAttribute("value") || ""

        ]
        .join(" ")
        .trim();

        if (
            !/leader|rank|permission|moderator|owner|admin/i
                .test(text)
        ) {
            return;
        }

        const rect =
            typeof el.getBoundingClientRect === "function"
                ? el.getBoundingClientRect()
                : null;

        data.domControls.push({

            index,

            tag: el.tagName,

            id:
                el.id ||
                null,

            className:
                typeof el.className === "string"
                    ? el.className
                    : null,

            name:
                el.getAttribute("name"),

            value:
                el.getAttribute("value"),

            title:
                el.getAttribute("title"),

            ariaLabel:
                el.getAttribute("aria-label"),

            text:
                (el.textContent || "")
                    .trim()
                    .replace(/\s+/g, " ")
                    .slice(0, 300),

            hidden:
                !!(
                    el.offsetParent === null &&
                    !rect?.width
                ),

            rect:
                rect
                    ? {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    }
                    : null

        });

    });

    /*
    ===========================================================================
    4. BUILD SUMMARY
    ===========================================================================
    */

    const leaderSource =
        data.sourceMatches.filter(function(m) {

            return /leader|assignLeader|setLeader|borrow-rank|borrowRank/i
                .test(m.text);

        }).length;

    const permissionSource =
        data.sourceMatches.filter(function(m) {

            return /permission|setPermissions|handlePermissionChange|leaderctl|setUserRank|channelRanks/i
                .test(m.text);

        }).length;

    /*
    Try to extract actual event names from nearby socket.emit() source.

    Example:

        socket.emit("assignLeader", ...)

    becomes:

        "assignLeader"

    This gives us a concise list without losing the surrounding
    source context stored above.
    */

    const emitNames =
        data.emitContexts
            .map(function(item) {

                const match =
                    item.context
                        .map(function(line) {
                            return line.text;
                        })
                        .join("\n")
                        .match(
                            /socket\.emit\s*\(\s*["']([^"']+)["']/i
                        );

                return match
                    ? match[1]
                    : null;

            })
            .filter(Boolean);

    data.summary = {

        fileCount:
            data.files.length,

        sourceMatchCount:
            data.sourceMatches.length,

        leaderRelatedMatchCount:
            leaderSource,

        permissionRelatedMatchCount:
            permissionSource,

        emitContextCount:
            data.emitContexts.length,

        emitEventNames:
            Array.from(
                new Set(emitNames)
            ),

        domControlCount:
            data.domControls.length,

        inlineScriptCount:
            inlineScripts.length
    };

    /*
    ===========================================================================
    COMPLETE
    ===========================================================================
    */

    data.status = "COMPLETE";

    data.completed =
        new Date().toISOString();

    console.log(
        "WS-071 COMPLETE — leader/permission source scan finished"
    );

    console.log(
        data.summary
    );

    console.log(
        "Full result stored in window.__WS071_DATA__"
    );

})();

/*===========================
/* Test output 
/*========================

{
  "test": "WS-071",
  "status": "COMPLETE",
  "started": "2026-09-07T18:45:54.294Z",
  "page": {
    "url": "https://cytu.be/r/American-Dad",
    "title": "❌❌❌ AMERICAN DAD ❌❌ WATCH THE HILARIOUS SHOW IN ITS ENTIRETY!!!! ❌❌❌",
    "readyState": "complete"
  },
  "runtime": {
    "channelName": "American-Dad",
    "clientName": "heytheirturbo",
    "clientRank": 1,
    "clientLeader": false,
    "socketExists": true,
    "socketConnected": true,
    "callbacksExists": true,
    "channelPerms": {
      "seeplaylist": -1,
      "playlistadd": 1.5,
      "playlistnext": 1.5,
      "playlistmove": 1.5,
      "playlistdelete": 2,
      "playlistjump": 1.5,
      "playlistaddlist": 1.5,
      "oplaylistadd": -1,
      "oplaylistnext": 1.5,
      "oplaylistmove": 1.5,
      "oplaylistdelete": 2,
      "oplaylistjump": 1.5,
      "oplaylistaddlist": 1.5,
      "playlistaddcustom": 3,
      "playlistaddrawfile": 2,
      "playlistaddlive": 1.5,
      "exceedmaxlength": 2,
      "addnontemp": 2,
      "settemp": 2,
      "playlistshuffle": 2,
      "playlistclear": 2,
      "pollctl": 1.5,
      "pollvote": -1,
      "viewhiddenpoll": 1.5,
      "voteskip": -1,
      "viewvoteskip": 1.5,
      "mute": 1.5,
      "kick": 1.5,
      "ban": 2,
      "motdedit": 3,
      "filteredit": 3,
      "filterimport": 3,
      "emoteedit": 3,
      "emoteimport": 3,
      "playlistlock": 2,
      "leaderctl": 2,
      "drink": 1.5,
      "chat": 0,
      "chatclear": 2,
      "exceedmaxitems": 2,
      "deletefromchannellib": 2,
      "exceedmaxdurationperuser": 2
    }
  },
  "files": [
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineCount": 1355,
      "sourceLength": 43674
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineCount": 980,
      "sourceLength": 30031
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineCount": 3501,
      "sourceLength": 117149
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineCount": 1997,
      "sourceLength": 61791
    }
  ],
  "sourceMatches": [
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 298,
      "text": "        handlePermissionChange();",
      "context": [
        {
          "lineNumber": 293,
          "text": ""
        },
        {
          "lineNumber": 294,
          "text": "        if(opts.allow_voteskip)"
        },
        {
          "lineNumber": 295,
          "text": "            $(\"#voteskip\").attr(\"disabled\", false);"
        },
        {
          "lineNumber": 296,
          "text": "        else"
        },
        {
          "lineNumber": 297,
          "text": "            $(\"#voteskip\").attr(\"disabled\", true);"
        },
        {
          "lineNumber": 298,
          "text": "        handlePermissionChange();"
        },
        {
          "lineNumber": 299,
          "text": "    },"
        },
        {
          "lineNumber": 300,
          "text": ""
        },
        {
          "lineNumber": 301,
          "text": "    setPermissions: function(perms) {"
        },
        {
          "lineNumber": 302,
          "text": "        CHANNEL.perms = perms;"
        },
        {
          "lineNumber": 303,
          "text": "        genPermissionsEditor();"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 301,
      "text": "    setPermissions: function(perms) {",
      "context": [
        {
          "lineNumber": 296,
          "text": "        else"
        },
        {
          "lineNumber": 297,
          "text": "            $(\"#voteskip\").attr(\"disabled\", true);"
        },
        {
          "lineNumber": 298,
          "text": "        handlePermissionChange();"
        },
        {
          "lineNumber": 299,
          "text": "    },"
        },
        {
          "lineNumber": 300,
          "text": ""
        },
        {
          "lineNumber": 301,
          "text": "    setPermissions: function(perms) {"
        },
        {
          "lineNumber": 302,
          "text": "        CHANNEL.perms = perms;"
        },
        {
          "lineNumber": 303,
          "text": "        genPermissionsEditor();"
        },
        {
          "lineNumber": 304,
          "text": "        handlePermissionChange();"
        },
        {
          "lineNumber": 305,
          "text": "    },"
        },
        {
          "lineNumber": 306,
          "text": ""
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 304,
      "text": "        handlePermissionChange();",
      "context": [
        {
          "lineNumber": 299,
          "text": "    },"
        },
        {
          "lineNumber": 300,
          "text": ""
        },
        {
          "lineNumber": 301,
          "text": "    setPermissions: function(perms) {"
        },
        {
          "lineNumber": 302,
          "text": "        CHANNEL.perms = perms;"
        },
        {
          "lineNumber": 303,
          "text": "        genPermissionsEditor();"
        },
        {
          "lineNumber": 304,
          "text": "        handlePermissionChange();"
        },
        {
          "lineNumber": 305,
          "text": "    },"
        },
        {
          "lineNumber": 306,
          "text": ""
        },
        {
          "lineNumber": 307,
          "text": "    channelCSSJS: function(data) {"
        },
        {
          "lineNumber": 308,
          "text": "        if (CyTube.channelCustomizations.cssHash !== data.cssHash) {"
        },
        {
          "lineNumber": 309,
          "text": "            $(\"#chancss\").remove();"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 386,
      "text": "    channelRanks: function(entries) {",
      "context": [
        {
          "lineNumber": 381,
          "text": "        }"
        },
        {
          "lineNumber": 382,
          "text": ""
        },
        {
          "lineNumber": 383,
          "text": "        formatCSBanlist();"
        },
        {
          "lineNumber": 384,
          "text": "    },"
        },
        {
          "lineNumber": 385,
          "text": ""
        },
        {
          "lineNumber": 386,
          "text": "    channelRanks: function(entries) {"
        },
        {
          "lineNumber": 387,
          "text": "        var tbl = $(\"#cs-chanranks table\");"
        },
        {
          "lineNumber": 388,
          "text": "        tbl.data(\"entries\", entries);"
        },
        {
          "lineNumber": 389,
          "text": "        formatCSModList();"
        },
        {
          "lineNumber": 390,
          "text": "    },"
        },
        {
          "lineNumber": 391,
          "text": ""
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 432,
      "text": "        handlePermissionChange();",
      "context": [
        {
          "lineNumber": 427,
          "text": ""
        },
        {
          "lineNumber": 428,
          "text": "    rank: function(r) {"
        },
        {
          "lineNumber": 429,
          "text": "        if(r >= 255)"
        },
        {
          "lineNumber": 430,
          "text": "            SUPERADMIN = true;"
        },
        {
          "lineNumber": 431,
          "text": "        CLIENT.rank = r;"
        },
        {
          "lineNumber": 432,
          "text": "        handlePermissionChange();"
        },
        {
          "lineNumber": 433,
          "text": "        if(SUPERADMIN && $(\"#setrank\").length == 0) {"
        },
        {
          "lineNumber": 434,
          "text": "            var li = $(\"<li/>\").addClass(\"dropdown\")"
        },
        {
          "lineNumber": 435,
          "text": "                .attr(\"id\", \"setrank\")"
        },
        {
          "lineNumber": 436,
          "text": "                .appendTo($(\".nav\")[0]);"
        },
        {
          "lineNumber": 437,
          "text": "            $(\"<a/>\").addClass(\"dropdown-toggle\")"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 450,
      "text": "                        socket.emit(\"borrow-rank\", r);",
      "context": [
        {
          "lineNumber": 445,
          "text": "            function addRank(r, disp) {"
        },
        {
          "lineNumber": 446,
          "text": "                var li = $(\"<li/>\").appendTo(menu);"
        },
        {
          "lineNumber": 447,
          "text": "                $(\"<a/>\").attr(\"href\", \"javascript:void(0)\")"
        },
        {
          "lineNumber": 448,
          "text": "                    .html(disp)"
        },
        {
          "lineNumber": 449,
          "text": "                    .on('click', function() {"
        },
        {
          "lineNumber": 450,
          "text": "                        socket.emit(\"borrow-rank\", r);"
        },
        {
          "lineNumber": 451,
          "text": "                    })"
        },
        {
          "lineNumber": 452,
          "text": "                    .appendTo(li);"
        },
        {
          "lineNumber": 453,
          "text": "            }"
        },
        {
          "lineNumber": 454,
          "text": ""
        },
        {
          "lineNumber": 455,
          "text": "            addRank(0, \"<span class='userlist_guest'>Guest</span>\");"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 577,
      "text": "    setLeader: function (name) {",
      "context": [
        {
          "lineNumber": 572,
          "text": "            return;"
        },
        {
          "lineNumber": 573,
          "text": "        user.data(\"profile\", data.profile);"
        },
        {
          "lineNumber": 574,
          "text": "        formatUserlistItem(user);"
        },
        {
          "lineNumber": 575,
          "text": "    },"
        },
        {
          "lineNumber": 576,
          "text": ""
        },
        {
          "lineNumber": 577,
          "text": "    setLeader: function (name) {"
        },
        {
          "lineNumber": 578,
          "text": "        $(\".userlist_item\").each(function () {"
        },
        {
          "lineNumber": 579,
          "text": "            $(this).find(\".glyphicon-star-empty\").remove();"
        },
        {
          "lineNumber": 580,
          "text": "            if ($(this).data(\"leader\")) {"
        },
        {
          "lineNumber": 581,
          "text": "                $(this).data(\"leader\", false);"
        },
        {
          "lineNumber": 582,
          "text": "                addUserDropdown($(this));"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 580,
      "text": "            if ($(this).data(\"leader\")) {",
      "context": [
        {
          "lineNumber": 575,
          "text": "    },"
        },
        {
          "lineNumber": 576,
          "text": ""
        },
        {
          "lineNumber": 577,
          "text": "    setLeader: function (name) {"
        },
        {
          "lineNumber": 578,
          "text": "        $(\".userlist_item\").each(function () {"
        },
        {
          "lineNumber": 579,
          "text": "            $(this).find(\".glyphicon-star-empty\").remove();"
        },
        {
          "lineNumber": 580,
          "text": "            if ($(this).data(\"leader\")) {"
        },
        {
          "lineNumber": 581,
          "text": "                $(this).data(\"leader\", false);"
        },
        {
          "lineNumber": 582,
          "text": "                addUserDropdown($(this));"
        },
        {
          "lineNumber": 583,
          "text": "            }"
        },
        {
          "lineNumber": 584,
          "text": "        });"
        },
        {
          "lineNumber": 585,
          "text": "        if (name === \"\") {"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 581,
      "text": "                $(this).data(\"leader\", false);",
      "context": [
        {
          "lineNumber": 576,
          "text": ""
        },
        {
          "lineNumber": 577,
          "text": "    setLeader: function (name) {"
        },
        {
          "lineNumber": 578,
          "text": "        $(\".userlist_item\").each(function () {"
        },
        {
          "lineNumber": 579,
          "text": "            $(this).find(\".glyphicon-star-empty\").remove();"
        },
        {
          "lineNumber": 580,
          "text": "            if ($(this).data(\"leader\")) {"
        },
        {
          "lineNumber": 581,
          "text": "                $(this).data(\"leader\", false);"
        },
        {
          "lineNumber": 582,
          "text": "                addUserDropdown($(this));"
        },
        {
          "lineNumber": 583,
          "text": "            }"
        },
        {
          "lineNumber": 584,
          "text": "        });"
        },
        {
          "lineNumber": 585,
          "text": "        if (name === \"\") {"
        },
        {
          "lineNumber": 586,
          "text": "            CLIENT.leader = false;"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 586,
      "text": "            CLIENT.leader = false;",
      "context": [
        {
          "lineNumber": 581,
          "text": "                $(this).data(\"leader\", false);"
        },
        {
          "lineNumber": 582,
          "text": "                addUserDropdown($(this));"
        },
        {
          "lineNumber": 583,
          "text": "            }"
        },
        {
          "lineNumber": 584,
          "text": "        });"
        },
        {
          "lineNumber": 585,
          "text": "        if (name === \"\") {"
        },
        {
          "lineNumber": 586,
          "text": "            CLIENT.leader = false;"
        },
        {
          "lineNumber": 587,
          "text": "            if(LEADTMR)"
        },
        {
          "lineNumber": 588,
          "text": "                clearInterval(LEADTMR);"
        },
        {
          "lineNumber": 589,
          "text": "            LEADTMR = false;"
        },
        {
          "lineNumber": 590,
          "text": "            return;"
        },
        {
          "lineNumber": 591,
          "text": "        }"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 594,
      "text": "            user.data(\"leader\", true);",
      "context": [
        {
          "lineNumber": 589,
          "text": "            LEADTMR = false;"
        },
        {
          "lineNumber": 590,
          "text": "            return;"
        },
        {
          "lineNumber": 591,
          "text": "        }"
        },
        {
          "lineNumber": 592,
          "text": "        var user = findUserlistItem(name);"
        },
        {
          "lineNumber": 593,
          "text": "        if (user) {"
        },
        {
          "lineNumber": 594,
          "text": "            user.data(\"leader\", true);"
        },
        {
          "lineNumber": 595,
          "text": "            formatUserlistItem(user);"
        },
        {
          "lineNumber": 596,
          "text": "            addUserDropdown(user);"
        },
        {
          "lineNumber": 597,
          "text": "        }"
        },
        {
          "lineNumber": 598,
          "text": "        if (name === CLIENT.name) {"
        },
        {
          "lineNumber": 599,
          "text": "            CLIENT.leader = true;"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 599,
      "text": "            CLIENT.leader = true;",
      "context": [
        {
          "lineNumber": 594,
          "text": "            user.data(\"leader\", true);"
        },
        {
          "lineNumber": 595,
          "text": "            formatUserlistItem(user);"
        },
        {
          "lineNumber": 596,
          "text": "            addUserDropdown(user);"
        },
        {
          "lineNumber": 597,
          "text": "        }"
        },
        {
          "lineNumber": 598,
          "text": "        if (name === CLIENT.name) {"
        },
        {
          "lineNumber": 599,
          "text": "            CLIENT.leader = true;"
        },
        {
          "lineNumber": 600,
          "text": "            // I'm a leader!  Set up sync function"
        },
        {
          "lineNumber": 601,
          "text": "            if(LEADTMR)"
        },
        {
          "lineNumber": 602,
          "text": "                clearInterval(LEADTMR);"
        },
        {
          "lineNumber": 603,
          "text": "            LEADTMR = setInterval(sendVideoUpdate, 5000);"
        },
        {
          "lineNumber": 604,
          "text": "            handlePermissionChange();"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 600,
      "text": "            // I'm a leader!  Set up sync function",
      "context": [
        {
          "lineNumber": 595,
          "text": "            formatUserlistItem(user);"
        },
        {
          "lineNumber": 596,
          "text": "            addUserDropdown(user);"
        },
        {
          "lineNumber": 597,
          "text": "        }"
        },
        {
          "lineNumber": 598,
          "text": "        if (name === CLIENT.name) {"
        },
        {
          "lineNumber": 599,
          "text": "            CLIENT.leader = true;"
        },
        {
          "lineNumber": 600,
          "text": "            // I'm a leader!  Set up sync function"
        },
        {
          "lineNumber": 601,
          "text": "            if(LEADTMR)"
        },
        {
          "lineNumber": 602,
          "text": "                clearInterval(LEADTMR);"
        },
        {
          "lineNumber": 603,
          "text": "            LEADTMR = setInterval(sendVideoUpdate, 5000);"
        },
        {
          "lineNumber": 604,
          "text": "            handlePermissionChange();"
        },
        {
          "lineNumber": 605,
          "text": "        } else if (CLIENT.leader) {"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 604,
      "text": "            handlePermissionChange();",
      "context": [
        {
          "lineNumber": 599,
          "text": "            CLIENT.leader = true;"
        },
        {
          "lineNumber": 600,
          "text": "            // I'm a leader!  Set up sync function"
        },
        {
          "lineNumber": 601,
          "text": "            if(LEADTMR)"
        },
        {
          "lineNumber": 602,
          "text": "                clearInterval(LEADTMR);"
        },
        {
          "lineNumber": 603,
          "text": "            LEADTMR = setInterval(sendVideoUpdate, 5000);"
        },
        {
          "lineNumber": 604,
          "text": "            handlePermissionChange();"
        },
        {
          "lineNumber": 605,
          "text": "        } else if (CLIENT.leader) {"
        },
        {
          "lineNumber": 606,
          "text": "            CLIENT.leader = false;"
        },
        {
          "lineNumber": 607,
          "text": "            handlePermissionChange();"
        },
        {
          "lineNumber": 608,
          "text": "            if(LEADTMR)"
        },
        {
          "lineNumber": 609,
          "text": "                clearInterval(LEADTMR);"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 605,
      "text": "        } else if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 600,
          "text": "            // I'm a leader!  Set up sync function"
        },
        {
          "lineNumber": 601,
          "text": "            if(LEADTMR)"
        },
        {
          "lineNumber": 602,
          "text": "                clearInterval(LEADTMR);"
        },
        {
          "lineNumber": 603,
          "text": "            LEADTMR = setInterval(sendVideoUpdate, 5000);"
        },
        {
          "lineNumber": 604,
          "text": "            handlePermissionChange();"
        },
        {
          "lineNumber": 605,
          "text": "        } else if (CLIENT.leader) {"
        },
        {
          "lineNumber": 606,
          "text": "            CLIENT.leader = false;"
        },
        {
          "lineNumber": 607,
          "text": "            handlePermissionChange();"
        },
        {
          "lineNumber": 608,
          "text": "            if(LEADTMR)"
        },
        {
          "lineNumber": 609,
          "text": "                clearInterval(LEADTMR);"
        },
        {
          "lineNumber": 610,
          "text": "            LEADTMR = false;"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 606,
      "text": "            CLIENT.leader = false;",
      "context": [
        {
          "lineNumber": 601,
          "text": "            if(LEADTMR)"
        },
        {
          "lineNumber": 602,
          "text": "                clearInterval(LEADTMR);"
        },
        {
          "lineNumber": 603,
          "text": "            LEADTMR = setInterval(sendVideoUpdate, 5000);"
        },
        {
          "lineNumber": 604,
          "text": "            handlePermissionChange();"
        },
        {
          "lineNumber": 605,
          "text": "        } else if (CLIENT.leader) {"
        },
        {
          "lineNumber": 606,
          "text": "            CLIENT.leader = false;"
        },
        {
          "lineNumber": 607,
          "text": "            handlePermissionChange();"
        },
        {
          "lineNumber": 608,
          "text": "            if(LEADTMR)"
        },
        {
          "lineNumber": 609,
          "text": "                clearInterval(LEADTMR);"
        },
        {
          "lineNumber": 610,
          "text": "            LEADTMR = false;"
        },
        {
          "lineNumber": 611,
          "text": "        }"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 607,
      "text": "            handlePermissionChange();",
      "context": [
        {
          "lineNumber": 602,
          "text": "                clearInterval(LEADTMR);"
        },
        {
          "lineNumber": 603,
          "text": "            LEADTMR = setInterval(sendVideoUpdate, 5000);"
        },
        {
          "lineNumber": 604,
          "text": "            handlePermissionChange();"
        },
        {
          "lineNumber": 605,
          "text": "        } else if (CLIENT.leader) {"
        },
        {
          "lineNumber": 606,
          "text": "            CLIENT.leader = false;"
        },
        {
          "lineNumber": 607,
          "text": "            handlePermissionChange();"
        },
        {
          "lineNumber": 608,
          "text": "            if(LEADTMR)"
        },
        {
          "lineNumber": 609,
          "text": "                clearInterval(LEADTMR);"
        },
        {
          "lineNumber": 610,
          "text": "            LEADTMR = false;"
        },
        {
          "lineNumber": 611,
          "text": "        }"
        },
        {
          "lineNumber": 612,
          "text": "    },"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 614,
      "text": "    setUserRank: function (data) {",
      "context": [
        {
          "lineNumber": 609,
          "text": "                clearInterval(LEADTMR);"
        },
        {
          "lineNumber": 610,
          "text": "            LEADTMR = false;"
        },
        {
          "lineNumber": 611,
          "text": "        }"
        },
        {
          "lineNumber": 612,
          "text": "    },"
        },
        {
          "lineNumber": 613,
          "text": ""
        },
        {
          "lineNumber": 614,
          "text": "    setUserRank: function (data) {"
        },
        {
          "lineNumber": 615,
          "text": "        data.name = data.name.toLowerCase();"
        },
        {
          "lineNumber": 616,
          "text": "        var entries = $(\"#cs-chanranks table\").data(\"entries\") || [];"
        },
        {
          "lineNumber": 617,
          "text": "        var found = false;"
        },
        {
          "lineNumber": 618,
          "text": "        for (var i = 0; i < entries.length; i++) {"
        },
        {
          "lineNumber": 619,
          "text": "            if (entries[i].name.toLowerCase() === data.name) {"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 640,
      "text": "            handlePermissionChange();",
      "context": [
        {
          "lineNumber": 635,
          "text": "        }"
        },
        {
          "lineNumber": 636,
          "text": ""
        },
        {
          "lineNumber": 637,
          "text": "        user.data(\"rank\", data.rank);"
        },
        {
          "lineNumber": 638,
          "text": "        if (data.name === CLIENT.name) {"
        },
        {
          "lineNumber": 639,
          "text": "            CLIENT.rank = data.rank;"
        },
        {
          "lineNumber": 640,
          "text": "            handlePermissionChange();"
        },
        {
          "lineNumber": 641,
          "text": "        }"
        },
        {
          "lineNumber": 642,
          "text": "        formatUserlistItem(user);"
        },
        {
          "lineNumber": 643,
          "text": "        addUserDropdown(user);"
        },
        {
          "lineNumber": 644,
          "text": "        if (USEROPTS.sort_rank) {"
        },
        {
          "lineNumber": 645,
          "text": "            sortUserlist();"
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 866,
      "text": "        handlePermissionChange();",
      "context": [
        {
          "lineNumber": 861,
          "text": "        }"
        },
        {
          "lineNumber": 862,
          "text": "    },"
        },
        {
          "lineNumber": 863,
          "text": ""
        },
        {
          "lineNumber": 864,
          "text": "    setPlaylistLocked: function (locked) {"
        },
        {
          "lineNumber": 865,
          "text": "        CHANNEL.openqueue = !locked;"
        },
        {
          "lineNumber": 866,
          "text": "        handlePermissionChange();"
        },
        {
          "lineNumber": 867,
          "text": "        if(CHANNEL.openqueue) {"
        },
        {
          "lineNumber": 868,
          "text": "            $(\"#qlockbtn\").removeClass(\"btn-danger\")"
        },
        {
          "lineNumber": 869,
          "text": "                .addClass(\"btn-success\")"
        },
        {
          "lineNumber": 870,
          "text": "                .attr(\"title\", \"Playlist Unlocked\");"
        },
        {
          "lineNumber": 871,
          "text": "            $(\"#qlockbtn\").find(\"span\")"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 101,
      "text": "        leader: div.data(\"leader\") || false,",
      "context": [
        {
          "lineNumber": 96,
          "text": "function formatUserlistItem(div) {"
        },
        {
          "lineNumber": 97,
          "text": "    var data = {"
        },
        {
          "lineNumber": 98,
          "text": "        name: div.data(\"name\") || \"\","
        },
        {
          "lineNumber": 99,
          "text": "        rank: div.data(\"rank\"),"
        },
        {
          "lineNumber": 100,
          "text": "        profile: div.data(\"profile\") || { image: \"\", text: \"\"},"
        },
        {
          "lineNumber": 101,
          "text": "        leader: div.data(\"leader\") || false,"
        },
        {
          "lineNumber": 102,
          "text": "        icon: div.data(\"icon\") || false,"
        },
        {
          "lineNumber": 103,
          "text": "    };"
        },
        {
          "lineNumber": 104,
          "text": "    var name = $(div.children()[1]);"
        },
        {
          "lineNumber": 105,
          "text": "    name.removeClass();"
        },
        {
          "lineNumber": 106,
          "text": "    name.css(\"font-style\", \"\");"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 185,
      "text": "    // denote current leader with a star",
      "context": [
        {
          "lineNumber": 180,
          "text": "    name.on('mouseleave', function() {"
        },
        {
          "lineNumber": 181,
          "text": "        profile.remove();"
        },
        {
          "lineNumber": 182,
          "text": "    });"
        },
        {
          "lineNumber": 183,
          "text": "    var icon = div.children()[0];"
        },
        {
          "lineNumber": 184,
          "text": "    icon.innerHTML = \"\";"
        },
        {
          "lineNumber": 185,
          "text": "    // denote current leader with a star"
        },
        {
          "lineNumber": 186,
          "text": "    if(data.leader) {"
        },
        {
          "lineNumber": 187,
          "text": "        $(\"<span/>\").addClass(\"glyphicon glyphicon-star-empty\").appendTo(icon);"
        },
        {
          "lineNumber": 188,
          "text": "    }"
        },
        {
          "lineNumber": 189,
          "text": "    if(div.data().meta.afk) {"
        },
        {
          "lineNumber": 190,
          "text": "        name.css(\"font-style\", \"italic\");"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 186,
      "text": "    if(data.leader) {",
      "context": [
        {
          "lineNumber": 181,
          "text": "        profile.remove();"
        },
        {
          "lineNumber": 182,
          "text": "    });"
        },
        {
          "lineNumber": 183,
          "text": "    var icon = div.children()[0];"
        },
        {
          "lineNumber": 184,
          "text": "    icon.innerHTML = \"\";"
        },
        {
          "lineNumber": 185,
          "text": "    // denote current leader with a star"
        },
        {
          "lineNumber": 186,
          "text": "    if(data.leader) {"
        },
        {
          "lineNumber": 187,
          "text": "        $(\"<span/>\").addClass(\"glyphicon glyphicon-star-empty\").appendTo(icon);"
        },
        {
          "lineNumber": 188,
          "text": "    }"
        },
        {
          "lineNumber": 189,
          "text": "    if(div.data().meta.afk) {"
        },
        {
          "lineNumber": 190,
          "text": "        name.css(\"font-style\", \"italic\");"
        },
        {
          "lineNumber": 191,
          "text": "        $(\"<span/>\").addClass(\"glyphicon glyphicon-time\").appendTo(icon);"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 214,
      "text": "        leader = entry.data(\"leader\"),",
      "context": [
        {
          "lineNumber": 209,
          "text": "}"
        },
        {
          "lineNumber": 210,
          "text": ""
        },
        {
          "lineNumber": 211,
          "text": "function addUserDropdown(entry) {"
        },
        {
          "lineNumber": 212,
          "text": "    var name = entry.data(\"name\"),"
        },
        {
          "lineNumber": 213,
          "text": "        rank = entry.data(\"rank\"),"
        },
        {
          "lineNumber": 214,
          "text": "        leader = entry.data(\"leader\"),"
        },
        {
          "lineNumber": 215,
          "text": "        meta = entry.data(\"meta\") || {};"
        },
        {
          "lineNumber": 216,
          "text": "    entry.find(\".user-dropdown\").remove();"
        },
        {
          "lineNumber": 217,
          "text": "    var menu = $(\"<div/>\")"
        },
        {
          "lineNumber": 218,
          "text": "        .addClass(\"user-dropdown\")"
        },
        {
          "lineNumber": 219,
          "text": "        .appendTo(entry)"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 263,
      "text": "    /* give/remove leader (moderator+ only) */",
      "context": [
        {
          "lineNumber": 258,
          "text": "                initPm(name).find(\".panel-heading\").click();"
        },
        {
          "lineNumber": 259,
          "text": "                menu.hide();"
        },
        {
          "lineNumber": 260,
          "text": "            });"
        },
        {
          "lineNumber": 261,
          "text": "    }"
        },
        {
          "lineNumber": 262,
          "text": ""
        },
        {
          "lineNumber": 263,
          "text": "    /* give/remove leader (moderator+ only) */"
        },
        {
          "lineNumber": 264,
          "text": "    if (hasPermission(\"leaderctl\")) {"
        },
        {
          "lineNumber": 265,
          "text": "        var ldr = $(\"<button/>\").addClass(\"btn btn-xs btn-default\")"
        },
        {
          "lineNumber": 266,
          "text": "            .appendTo(btngroup);"
        },
        {
          "lineNumber": 267,
          "text": "        if(leader) {"
        },
        {
          "lineNumber": 268,
          "text": "            ldr.text(\"Remove Leader\");"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 264,
      "text": "    if (hasPermission(\"leaderctl\")) {",
      "context": [
        {
          "lineNumber": 259,
          "text": "                menu.hide();"
        },
        {
          "lineNumber": 260,
          "text": "            });"
        },
        {
          "lineNumber": 261,
          "text": "    }"
        },
        {
          "lineNumber": 262,
          "text": ""
        },
        {
          "lineNumber": 263,
          "text": "    /* give/remove leader (moderator+ only) */"
        },
        {
          "lineNumber": 264,
          "text": "    if (hasPermission(\"leaderctl\")) {"
        },
        {
          "lineNumber": 265,
          "text": "        var ldr = $(\"<button/>\").addClass(\"btn btn-xs btn-default\")"
        },
        {
          "lineNumber": 266,
          "text": "            .appendTo(btngroup);"
        },
        {
          "lineNumber": 267,
          "text": "        if(leader) {"
        },
        {
          "lineNumber": 268,
          "text": "            ldr.text(\"Remove Leader\");"
        },
        {
          "lineNumber": 269,
          "text": "            ldr.on('click', function () {"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 267,
      "text": "        if(leader) {",
      "context": [
        {
          "lineNumber": 262,
          "text": ""
        },
        {
          "lineNumber": 263,
          "text": "    /* give/remove leader (moderator+ only) */"
        },
        {
          "lineNumber": 264,
          "text": "    if (hasPermission(\"leaderctl\")) {"
        },
        {
          "lineNumber": 265,
          "text": "        var ldr = $(\"<button/>\").addClass(\"btn btn-xs btn-default\")"
        },
        {
          "lineNumber": 266,
          "text": "            .appendTo(btngroup);"
        },
        {
          "lineNumber": 267,
          "text": "        if(leader) {"
        },
        {
          "lineNumber": 268,
          "text": "            ldr.text(\"Remove Leader\");"
        },
        {
          "lineNumber": 269,
          "text": "            ldr.on('click', function () {"
        },
        {
          "lineNumber": 270,
          "text": "                socket.emit(\"assignLeader\", {"
        },
        {
          "lineNumber": 271,
          "text": "                    name: \"\""
        },
        {
          "lineNumber": 272,
          "text": "                });"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 268,
      "text": "            ldr.text(\"Remove Leader\");",
      "context": [
        {
          "lineNumber": 263,
          "text": "    /* give/remove leader (moderator+ only) */"
        },
        {
          "lineNumber": 264,
          "text": "    if (hasPermission(\"leaderctl\")) {"
        },
        {
          "lineNumber": 265,
          "text": "        var ldr = $(\"<button/>\").addClass(\"btn btn-xs btn-default\")"
        },
        {
          "lineNumber": 266,
          "text": "            .appendTo(btngroup);"
        },
        {
          "lineNumber": 267,
          "text": "        if(leader) {"
        },
        {
          "lineNumber": 268,
          "text": "            ldr.text(\"Remove Leader\");"
        },
        {
          "lineNumber": 269,
          "text": "            ldr.on('click', function () {"
        },
        {
          "lineNumber": 270,
          "text": "                socket.emit(\"assignLeader\", {"
        },
        {
          "lineNumber": 271,
          "text": "                    name: \"\""
        },
        {
          "lineNumber": 272,
          "text": "                });"
        },
        {
          "lineNumber": 273,
          "text": "            });"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 270,
      "text": "                socket.emit(\"assignLeader\", {",
      "context": [
        {
          "lineNumber": 265,
          "text": "        var ldr = $(\"<button/>\").addClass(\"btn btn-xs btn-default\")"
        },
        {
          "lineNumber": 266,
          "text": "            .appendTo(btngroup);"
        },
        {
          "lineNumber": 267,
          "text": "        if(leader) {"
        },
        {
          "lineNumber": 268,
          "text": "            ldr.text(\"Remove Leader\");"
        },
        {
          "lineNumber": 269,
          "text": "            ldr.on('click', function () {"
        },
        {
          "lineNumber": 270,
          "text": "                socket.emit(\"assignLeader\", {"
        },
        {
          "lineNumber": 271,
          "text": "                    name: \"\""
        },
        {
          "lineNumber": 272,
          "text": "                });"
        },
        {
          "lineNumber": 273,
          "text": "            });"
        },
        {
          "lineNumber": 274,
          "text": "        } else {"
        },
        {
          "lineNumber": 275,
          "text": "            ldr.text(\"Give Leader\");"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 275,
      "text": "            ldr.text(\"Give Leader\");",
      "context": [
        {
          "lineNumber": 270,
          "text": "                socket.emit(\"assignLeader\", {"
        },
        {
          "lineNumber": 271,
          "text": "                    name: \"\""
        },
        {
          "lineNumber": 272,
          "text": "                });"
        },
        {
          "lineNumber": 273,
          "text": "            });"
        },
        {
          "lineNumber": 274,
          "text": "        } else {"
        },
        {
          "lineNumber": 275,
          "text": "            ldr.text(\"Give Leader\");"
        },
        {
          "lineNumber": 276,
          "text": "            ldr.on('click', function () {"
        },
        {
          "lineNumber": 277,
          "text": "                socket.emit(\"assignLeader\", {"
        },
        {
          "lineNumber": 278,
          "text": "                    name: name"
        },
        {
          "lineNumber": 279,
          "text": "                });"
        },
        {
          "lineNumber": 280,
          "text": "            });"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 277,
      "text": "                socket.emit(\"assignLeader\", {",
      "context": [
        {
          "lineNumber": 272,
          "text": "                });"
        },
        {
          "lineNumber": 273,
          "text": "            });"
        },
        {
          "lineNumber": 274,
          "text": "        } else {"
        },
        {
          "lineNumber": 275,
          "text": "            ldr.text(\"Give Leader\");"
        },
        {
          "lineNumber": 276,
          "text": "            ldr.on('click', function () {"
        },
        {
          "lineNumber": 277,
          "text": "                socket.emit(\"assignLeader\", {"
        },
        {
          "lineNumber": 278,
          "text": "                    name: name"
        },
        {
          "lineNumber": 279,
          "text": "                });"
        },
        {
          "lineNumber": 280,
          "text": "            });"
        },
        {
          "lineNumber": 281,
          "text": "        }"
        },
        {
          "lineNumber": 282,
          "text": "    }"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 1011,
      "text": "function handlePermissionChange() {",
      "context": [
        {
          "lineNumber": 1006,
          "text": "    setParentVisible(\"a[href='#cs-chanlog']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1007,
          "text": "    $(\"#cs-chatfilters-import\").attr(\"disabled\", !hasPermission(\"filterimport\"));"
        },
        {
          "lineNumber": 1008,
          "text": "    $(\"#cs-emotes-import\").attr(\"disabled\", !hasPermission(\"filterimport\"));"
        },
        {
          "lineNumber": 1009,
          "text": "}"
        },
        {
          "lineNumber": 1010,
          "text": ""
        },
        {
          "lineNumber": 1011,
          "text": "function handlePermissionChange() {"
        },
        {
          "lineNumber": 1012,
          "text": "    if(CLIENT.rank >= 2) {"
        },
        {
          "lineNumber": 1013,
          "text": "        handleModPermissions();"
        },
        {
          "lineNumber": 1014,
          "text": "    }"
        },
        {
          "lineNumber": 1015,
          "text": ""
        },
        {
          "lineNumber": 1016,
          "text": "    $(\"#qlockbtn\").attr(\"disabled\", !hasPermission(\"playlistlock\"));"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 1463,
      "text": "    if (!CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 1458,
          "text": "    throw indeterminable();"
        },
        {
          "lineNumber": 1459,
          "text": "}"
        },
        {
          "lineNumber": 1460,
          "text": ""
        },
        {
          "lineNumber": 1461,
          "text": ""
        },
        {
          "lineNumber": 1462,
          "text": "function sendVideoUpdate() {"
        },
        {
          "lineNumber": 1463,
          "text": "    if (!CLIENT.leader) {"
        },
        {
          "lineNumber": 1464,
          "text": "        return;"
        },
        {
          "lineNumber": 1465,
          "text": "    }"
        },
        {
          "lineNumber": 1466,
          "text": "    if (!PLAYER || !PLAYER.mediaType || !PLAYER.mediaId) {"
        },
        {
          "lineNumber": 1467,
          "text": "        return;"
        },
        {
          "lineNumber": 1468,
          "text": "    }"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 1967,
      "text": "        [\"Leader\"       , \"1.5\"],",
      "context": [
        {
          "lineNumber": 1962,
          "text": ""
        },
        {
          "lineNumber": 1963,
          "text": "    var standard = ["
        },
        {
          "lineNumber": 1964,
          "text": "        [\"Anonymous\"    , \"-1\"],"
        },
        {
          "lineNumber": 1965,
          "text": "        [\"Guest\"        , \"0\"],"
        },
        {
          "lineNumber": 1966,
          "text": "        [\"Registered\"   , \"1\"],"
        },
        {
          "lineNumber": 1967,
          "text": "        [\"Leader\"       , \"1.5\"],"
        },
        {
          "lineNumber": 1968,
          "text": "        [\"Moderator\"    , \"2\"],"
        },
        {
          "lineNumber": 1969,
          "text": "        [\"Channel Admin\", \"3\"],"
        },
        {
          "lineNumber": 1970,
          "text": "        [\"Nobody\"       , \"1000000\"]"
        },
        {
          "lineNumber": 1971,
          "text": "    ];"
        },
        {
          "lineNumber": 1972,
          "text": ""
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 1976,
      "text": "        [\"Leader\"       , \"1.5\"],",
      "context": [
        {
          "lineNumber": 1971,
          "text": "    ];"
        },
        {
          "lineNumber": 1972,
          "text": ""
        },
        {
          "lineNumber": 1973,
          "text": "    var noanon = ["
        },
        {
          "lineNumber": 1974,
          "text": "        [\"Guest\"        , \"0\"],"
        },
        {
          "lineNumber": 1975,
          "text": "        [\"Registered\"   , \"1\"],"
        },
        {
          "lineNumber": 1976,
          "text": "        [\"Leader\"       , \"1.5\"],"
        },
        {
          "lineNumber": 1977,
          "text": "        [\"Moderator\"    , \"2\"],"
        },
        {
          "lineNumber": 1978,
          "text": "        [\"Channel Admin\", \"3\"],"
        },
        {
          "lineNumber": 1979,
          "text": "        [\"Nobody\"       , \"1000000\"]"
        },
        {
          "lineNumber": 1980,
          "text": "    ];"
        },
        {
          "lineNumber": 1981,
          "text": ""
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 1982,
      "text": "    var modleader = [",
      "context": [
        {
          "lineNumber": 1977,
          "text": "        [\"Moderator\"    , \"2\"],"
        },
        {
          "lineNumber": 1978,
          "text": "        [\"Channel Admin\", \"3\"],"
        },
        {
          "lineNumber": 1979,
          "text": "        [\"Nobody\"       , \"1000000\"]"
        },
        {
          "lineNumber": 1980,
          "text": "    ];"
        },
        {
          "lineNumber": 1981,
          "text": ""
        },
        {
          "lineNumber": 1982,
          "text": "    var modleader = ["
        },
        {
          "lineNumber": 1983,
          "text": "        [\"Leader\"       , \"1.5\"],"
        },
        {
          "lineNumber": 1984,
          "text": "        [\"Moderator\"    , \"2\"],"
        },
        {
          "lineNumber": 1985,
          "text": "        [\"Channel Admin\", \"3\"],"
        },
        {
          "lineNumber": 1986,
          "text": "        [\"Nobody\"       , \"1000000\"]"
        },
        {
          "lineNumber": 1987,
          "text": "    ];"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 1983,
      "text": "        [\"Leader\"       , \"1.5\"],",
      "context": [
        {
          "lineNumber": 1978,
          "text": "        [\"Channel Admin\", \"3\"],"
        },
        {
          "lineNumber": 1979,
          "text": "        [\"Nobody\"       , \"1000000\"]"
        },
        {
          "lineNumber": 1980,
          "text": "    ];"
        },
        {
          "lineNumber": 1981,
          "text": ""
        },
        {
          "lineNumber": 1982,
          "text": "    var modleader = ["
        },
        {
          "lineNumber": 1983,
          "text": "        [\"Leader\"       , \"1.5\"],"
        },
        {
          "lineNumber": 1984,
          "text": "        [\"Moderator\"    , \"2\"],"
        },
        {
          "lineNumber": 1985,
          "text": "        [\"Channel Admin\", \"3\"],"
        },
        {
          "lineNumber": 1986,
          "text": "        [\"Nobody\"       , \"1000000\"]"
        },
        {
          "lineNumber": 1987,
          "text": "    ];"
        },
        {
          "lineNumber": 1988,
          "text": ""
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2019,
      "text": "    makeOption(\"Lock/unlock playlist\", \"playlistlock\", modleader, CHANNEL.perms.playlistlock+\"\");",
      "context": [
        {
          "lineNumber": 2014,
          "text": "    makeOption(\"Exceed maximum media length\", \"exceedmaxlength\", standard, CHANNEL.perms.exceedmaxlength+\"\");"
        },
        {
          "lineNumber": 2015,
          "text": "    makeOption(\"Exceed maximum total media length\", \"exceedmaxdurationperuser\", standard, CHANNEL.perms.exceedmaxdurationperuser+\"\");"
        },
        {
          "lineNumber": 2016,
          "text": "    makeOption(\"Exceed maximum number of videos per user\", \"exceedmaxitems\", standard, CHANNEL.perms.exceedmaxitems+\"\");"
        },
        {
          "lineNumber": 2017,
          "text": "    makeOption(\"Add nontemporary media\", \"addnontemp\", standard, CHANNEL.perms.addnontemp+\"\");"
        },
        {
          "lineNumber": 2018,
          "text": "    makeOption(\"Temp/untemp playlist item\", \"settemp\", standard, CHANNEL.perms.settemp+\"\");"
        },
        {
          "lineNumber": 2019,
          "text": "    makeOption(\"Lock/unlock playlist\", \"playlistlock\", modleader, CHANNEL.perms.playlistlock+\"\");"
        },
        {
          "lineNumber": 2020,
          "text": "    makeOption(\"Shuffle playlist\", \"playlistshuffle\", standard, CHANNEL.perms.playlistshuffle+\"\");"
        },
        {
          "lineNumber": 2021,
          "text": "    makeOption(\"Clear playlist\", \"playlistclear\", standard, CHANNEL.perms.playlistclear+\"\");"
        },
        {
          "lineNumber": 2022,
          "text": "    makeOption(\"Delete from channel library\", \"deletefromchannellib\", standard, CHANNEL.perms.deletefromchannellib+\"\");"
        },
        {
          "lineNumber": 2023,
          "text": ""
        },
        {
          "lineNumber": 2024,
          "text": "    addDivider(\"Polls\");"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2025,
      "text": "    makeOption(\"Open/Close poll\", \"pollctl\", modleader, CHANNEL.perms.pollctl+\"\");",
      "context": [
        {
          "lineNumber": 2020,
          "text": "    makeOption(\"Shuffle playlist\", \"playlistshuffle\", standard, CHANNEL.perms.playlistshuffle+\"\");"
        },
        {
          "lineNumber": 2021,
          "text": "    makeOption(\"Clear playlist\", \"playlistclear\", standard, CHANNEL.perms.playlistclear+\"\");"
        },
        {
          "lineNumber": 2022,
          "text": "    makeOption(\"Delete from channel library\", \"deletefromchannellib\", standard, CHANNEL.perms.deletefromchannellib+\"\");"
        },
        {
          "lineNumber": 2023,
          "text": ""
        },
        {
          "lineNumber": 2024,
          "text": "    addDivider(\"Polls\");"
        },
        {
          "lineNumber": 2025,
          "text": "    makeOption(\"Open/Close poll\", \"pollctl\", modleader, CHANNEL.perms.pollctl+\"\");"
        },
        {
          "lineNumber": 2026,
          "text": "    makeOption(\"Vote\", \"pollvote\", standard, CHANNEL.perms.pollvote+\"\");"
        },
        {
          "lineNumber": 2027,
          "text": "    makeOption(\"View hidden poll results\", \"viewhiddenpoll\", standard, CHANNEL.perms.viewhiddenpoll+\"\");"
        },
        {
          "lineNumber": 2028,
          "text": "    makeOption(\"Voteskip\", \"voteskip\", standard, CHANNEL.perms.voteskip+\"\");"
        },
        {
          "lineNumber": 2029,
          "text": "    makeOption(\"View voteskip results\", \"viewvoteskip\", standard, CHANNEL.perms.viewvoteskip+\"\");"
        },
        {
          "lineNumber": 2030,
          "text": ""
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2032,
      "text": "    makeOption(\"Assign/Remove leader\", \"leaderctl\", modplus, CHANNEL.perms.leaderctl+\"\");",
      "context": [
        {
          "lineNumber": 2027,
          "text": "    makeOption(\"View hidden poll results\", \"viewhiddenpoll\", standard, CHANNEL.perms.viewhiddenpoll+\"\");"
        },
        {
          "lineNumber": 2028,
          "text": "    makeOption(\"Voteskip\", \"voteskip\", standard, CHANNEL.perms.voteskip+\"\");"
        },
        {
          "lineNumber": 2029,
          "text": "    makeOption(\"View voteskip results\", \"viewvoteskip\", standard, CHANNEL.perms.viewvoteskip+\"\");"
        },
        {
          "lineNumber": 2030,
          "text": ""
        },
        {
          "lineNumber": 2031,
          "text": "    addDivider(\"Moderation\");"
        },
        {
          "lineNumber": 2032,
          "text": "    makeOption(\"Assign/Remove leader\", \"leaderctl\", modplus, CHANNEL.perms.leaderctl+\"\");"
        },
        {
          "lineNumber": 2033,
          "text": "    makeOption(\"Mute users\", \"mute\", modleader, CHANNEL.perms.mute+\"\");"
        },
        {
          "lineNumber": 2034,
          "text": "    makeOption(\"Kick users\", \"kick\", modleader, CHANNEL.perms.kick+\"\");"
        },
        {
          "lineNumber": 2035,
          "text": "    makeOption(\"Ban users\", \"ban\", modplus, CHANNEL.perms.ban+\"\");"
        },
        {
          "lineNumber": 2036,
          "text": "    makeOption(\"Edit MOTD\", \"motdedit\", modplus, CHANNEL.perms.motdedit+\"\");"
        },
        {
          "lineNumber": 2037,
          "text": "    makeOption(\"Edit chat filters\", \"filteredit\", modplus, CHANNEL.perms.filteredit+\"\");"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2033,
      "text": "    makeOption(\"Mute users\", \"mute\", modleader, CHANNEL.perms.mute+\"\");",
      "context": [
        {
          "lineNumber": 2028,
          "text": "    makeOption(\"Voteskip\", \"voteskip\", standard, CHANNEL.perms.voteskip+\"\");"
        },
        {
          "lineNumber": 2029,
          "text": "    makeOption(\"View voteskip results\", \"viewvoteskip\", standard, CHANNEL.perms.viewvoteskip+\"\");"
        },
        {
          "lineNumber": 2030,
          "text": ""
        },
        {
          "lineNumber": 2031,
          "text": "    addDivider(\"Moderation\");"
        },
        {
          "lineNumber": 2032,
          "text": "    makeOption(\"Assign/Remove leader\", \"leaderctl\", modplus, CHANNEL.perms.leaderctl+\"\");"
        },
        {
          "lineNumber": 2033,
          "text": "    makeOption(\"Mute users\", \"mute\", modleader, CHANNEL.perms.mute+\"\");"
        },
        {
          "lineNumber": 2034,
          "text": "    makeOption(\"Kick users\", \"kick\", modleader, CHANNEL.perms.kick+\"\");"
        },
        {
          "lineNumber": 2035,
          "text": "    makeOption(\"Ban users\", \"ban\", modplus, CHANNEL.perms.ban+\"\");"
        },
        {
          "lineNumber": 2036,
          "text": "    makeOption(\"Edit MOTD\", \"motdedit\", modplus, CHANNEL.perms.motdedit+\"\");"
        },
        {
          "lineNumber": 2037,
          "text": "    makeOption(\"Edit chat filters\", \"filteredit\", modplus, CHANNEL.perms.filteredit+\"\");"
        },
        {
          "lineNumber": 2038,
          "text": "    makeOption(\"Import chat filters\", \"filterimport\", modplus, CHANNEL.perms.filterimport+\"\");"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2034,
      "text": "    makeOption(\"Kick users\", \"kick\", modleader, CHANNEL.perms.kick+\"\");",
      "context": [
        {
          "lineNumber": 2029,
          "text": "    makeOption(\"View voteskip results\", \"viewvoteskip\", standard, CHANNEL.perms.viewvoteskip+\"\");"
        },
        {
          "lineNumber": 2030,
          "text": ""
        },
        {
          "lineNumber": 2031,
          "text": "    addDivider(\"Moderation\");"
        },
        {
          "lineNumber": 2032,
          "text": "    makeOption(\"Assign/Remove leader\", \"leaderctl\", modplus, CHANNEL.perms.leaderctl+\"\");"
        },
        {
          "lineNumber": 2033,
          "text": "    makeOption(\"Mute users\", \"mute\", modleader, CHANNEL.perms.mute+\"\");"
        },
        {
          "lineNumber": 2034,
          "text": "    makeOption(\"Kick users\", \"kick\", modleader, CHANNEL.perms.kick+\"\");"
        },
        {
          "lineNumber": 2035,
          "text": "    makeOption(\"Ban users\", \"ban\", modplus, CHANNEL.perms.ban+\"\");"
        },
        {
          "lineNumber": 2036,
          "text": "    makeOption(\"Edit MOTD\", \"motdedit\", modplus, CHANNEL.perms.motdedit+\"\");"
        },
        {
          "lineNumber": 2037,
          "text": "    makeOption(\"Edit chat filters\", \"filteredit\", modplus, CHANNEL.perms.filteredit+\"\");"
        },
        {
          "lineNumber": 2038,
          "text": "    makeOption(\"Import chat filters\", \"filterimport\", modplus, CHANNEL.perms.filterimport+\"\");"
        },
        {
          "lineNumber": 2039,
          "text": "    makeOption(\"Edit chat emotes\", \"emoteedit\", modplus, CHANNEL.perms.emoteedit+\"\");"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2043,
      "text": "    makeOption(\"Drink calls\", \"drink\", modleader, CHANNEL.perms.drink+\"\");",
      "context": [
        {
          "lineNumber": 2038,
          "text": "    makeOption(\"Import chat filters\", \"filterimport\", modplus, CHANNEL.perms.filterimport+\"\");"
        },
        {
          "lineNumber": 2039,
          "text": "    makeOption(\"Edit chat emotes\", \"emoteedit\", modplus, CHANNEL.perms.emoteedit+\"\");"
        },
        {
          "lineNumber": 2040,
          "text": "    makeOption(\"Import chat emotes\", \"emoteimport\", modplus, CHANNEL.perms.emoteimport+\"\");"
        },
        {
          "lineNumber": 2041,
          "text": ""
        },
        {
          "lineNumber": 2042,
          "text": "    addDivider(\"Misc\");"
        },
        {
          "lineNumber": 2043,
          "text": "    makeOption(\"Drink calls\", \"drink\", modleader, CHANNEL.perms.drink+\"\");"
        },
        {
          "lineNumber": 2044,
          "text": "    makeOption(\"Chat\", \"chat\", noanon, CHANNEL.perms.chat+\"\");"
        },
        {
          "lineNumber": 2045,
          "text": "    makeOption(\"Clear Chat\", \"chatclear\", modleader, CHANNEL.perms.chatclear+\"\");"
        },
        {
          "lineNumber": 2046,
          "text": ""
        },
        {
          "lineNumber": 2047,
          "text": "    var sgroup = $(\"<div/>\").addClass(\"form-group\").appendTo(form);"
        },
        {
          "lineNumber": 2048,
          "text": "    var sgroupinner = $(\"<div/>\").addClass(\"col-sm-8 col-sm-offset-4\").appendTo(sgroup);"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2045,
      "text": "    makeOption(\"Clear Chat\", \"chatclear\", modleader, CHANNEL.perms.chatclear+\"\");",
      "context": [
        {
          "lineNumber": 2040,
          "text": "    makeOption(\"Import chat emotes\", \"emoteimport\", modplus, CHANNEL.perms.emoteimport+\"\");"
        },
        {
          "lineNumber": 2041,
          "text": ""
        },
        {
          "lineNumber": 2042,
          "text": "    addDivider(\"Misc\");"
        },
        {
          "lineNumber": 2043,
          "text": "    makeOption(\"Drink calls\", \"drink\", modleader, CHANNEL.perms.drink+\"\");"
        },
        {
          "lineNumber": 2044,
          "text": "    makeOption(\"Chat\", \"chat\", noanon, CHANNEL.perms.chat+\"\");"
        },
        {
          "lineNumber": 2045,
          "text": "    makeOption(\"Clear Chat\", \"chatclear\", modleader, CHANNEL.perms.chatclear+\"\");"
        },
        {
          "lineNumber": 2046,
          "text": ""
        },
        {
          "lineNumber": 2047,
          "text": "    var sgroup = $(\"<div/>\").addClass(\"form-group\").appendTo(form);"
        },
        {
          "lineNumber": 2048,
          "text": "    var sgroupinner = $(\"<div/>\").addClass(\"col-sm-8 col-sm-offset-4\").appendTo(sgroup);"
        },
        {
          "lineNumber": 2049,
          "text": "    var submit = $(\"<button/>\").addClass(\"btn btn-primary\").appendTo(sgroupinner);"
        },
        {
          "lineNumber": 2050,
          "text": "    submit.text(\"Save\");"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2056,
      "text": "        socket.emit(\"setPermissions\", perms);",
      "context": [
        {
          "lineNumber": 2051,
          "text": "    submit.on('click', function() {"
        },
        {
          "lineNumber": 2052,
          "text": "        var perms = {};"
        },
        {
          "lineNumber": 2053,
          "text": "        form.find(\"select\").each(function() {"
        },
        {
          "lineNumber": 2054,
          "text": "            perms[$(this).data(\"key\")] = parseFloat($(this).val());"
        },
        {
          "lineNumber": 2055,
          "text": "        });"
        },
        {
          "lineNumber": 2056,
          "text": "        socket.emit(\"setPermissions\", perms);"
        },
        {
          "lineNumber": 2057,
          "text": "    });"
        },
        {
          "lineNumber": 2058,
          "text": ""
        },
        {
          "lineNumber": 2059,
          "text": "    var msggroup = $(\"<div/>\").addClass(\"form-group\").insertAfter(sgroup);"
        },
        {
          "lineNumber": 2060,
          "text": "    var msginner = $(\"<div/>\").addClass(\"col-sm-8 col-sm-offset-4\").appendTo(msggroup);"
        },
        {
          "lineNumber": 2061,
          "text": "    var text = $(\"<span/>\").addClass(\"text-info\").text(\"Permissions updated\")"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 3489,
      "text": "    div.data(\"leader\", Boolean(data.leader));",
      "context": [
        {
          "lineNumber": 3484,
          "text": "        .addClass(\"userlist_item\");"
        },
        {
          "lineNumber": 3485,
          "text": "    var icon = $(\"<span/>\").appendTo(div);"
        },
        {
          "lineNumber": 3486,
          "text": "    var nametag = $(\"<span/>\").text(data.name).appendTo(div);"
        },
        {
          "lineNumber": 3487,
          "text": "    div.data(\"name\", data.name);"
        },
        {
          "lineNumber": 3488,
          "text": "    div.data(\"rank\", data.rank);"
        },
        {
          "lineNumber": 3489,
          "text": "    div.data(\"leader\", Boolean(data.leader));"
        },
        {
          "lineNumber": 3490,
          "text": "    div.data(\"profile\", data.profile);"
        },
        {
          "lineNumber": 3491,
          "text": "    div.data(\"meta\", data.meta);"
        },
        {
          "lineNumber": 3492,
          "text": "    if (data.meta.muted || data.meta.smuted) {"
        },
        {
          "lineNumber": 3493,
          "text": "        div.data(\"icon\", \"glyphicon-volume-off\");"
        },
        {
          "lineNumber": 3494,
          "text": "    } else {"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 93,
      "text": "              if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 88,
          "text": "            params: params"
        },
        {
          "lineNumber": 89,
          "text": "          });"
        },
        {
          "lineNumber": 90,
          "text": "          return _this.dm.addEventListener('apiready', function() {"
        },
        {
          "lineNumber": 91,
          "text": "            _this.dmReady = true;"
        },
        {
          "lineNumber": 92,
          "text": "            _this.dm.addEventListener('ended', function() {"
        },
        {
          "lineNumber": 93,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 94,
          "text": "                return socket.emit('playNext');"
        },
        {
          "lineNumber": 95,
          "text": "              }"
        },
        {
          "lineNumber": 96,
          "text": "            });"
        },
        {
          "lineNumber": 97,
          "text": "            _this.dm.addEventListener('pause', function() {"
        },
        {
          "lineNumber": 98,
          "text": "              _this.paused = true;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 99,
      "text": "              if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 94,
          "text": "                return socket.emit('playNext');"
        },
        {
          "lineNumber": 95,
          "text": "              }"
        },
        {
          "lineNumber": 96,
          "text": "            });"
        },
        {
          "lineNumber": 97,
          "text": "            _this.dm.addEventListener('pause', function() {"
        },
        {
          "lineNumber": 98,
          "text": "              _this.paused = true;"
        },
        {
          "lineNumber": 99,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 100,
          "text": "                return sendVideoUpdate();"
        },
        {
          "lineNumber": 101,
          "text": "              }"
        },
        {
          "lineNumber": 102,
          "text": "            });"
        },
        {
          "lineNumber": 103,
          "text": "            _this.dm.addEventListener('playing', function() {"
        },
        {
          "lineNumber": 104,
          "text": "              _this.paused = false;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 105,
      "text": "              if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 100,
          "text": "                return sendVideoUpdate();"
        },
        {
          "lineNumber": 101,
          "text": "              }"
        },
        {
          "lineNumber": 102,
          "text": "            });"
        },
        {
          "lineNumber": 103,
          "text": "            _this.dm.addEventListener('playing', function() {"
        },
        {
          "lineNumber": 104,
          "text": "              _this.paused = false;"
        },
        {
          "lineNumber": 105,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 106,
          "text": "                sendVideoUpdate();"
        },
        {
          "lineNumber": 107,
          "text": "              }"
        },
        {
          "lineNumber": 108,
          "text": "              if (!_this.initialVolumeSet) {"
        },
        {
          "lineNumber": 109,
          "text": "                _this.setVolume(VOLUME);"
        },
        {
          "lineNumber": 110,
          "text": "                return _this.initialVolumeSet = true;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 243,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 238,
          "text": "            playerId: 'ytapiplayer',"
        },
        {
          "lineNumber": 239,
          "text": "            videoId: data.id"
        },
        {
          "lineNumber": 240,
          "text": "          });"
        },
        {
          "lineNumber": 241,
          "text": "          removeOld($(_this.nico.iframe));"
        },
        {
          "lineNumber": 242,
          "text": "          _this.nico.on('ended', function() {"
        },
        {
          "lineNumber": 243,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 244,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 245,
          "text": "            }"
        },
        {
          "lineNumber": 246,
          "text": "          });"
        },
        {
          "lineNumber": 247,
          "text": "          _this.nico.on('pause', function() {"
        },
        {
          "lineNumber": 248,
          "text": "            _this.paused = true;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 249,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 244,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 245,
          "text": "            }"
        },
        {
          "lineNumber": 246,
          "text": "          });"
        },
        {
          "lineNumber": 247,
          "text": "          _this.nico.on('pause', function() {"
        },
        {
          "lineNumber": 248,
          "text": "            _this.paused = true;"
        },
        {
          "lineNumber": 249,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 250,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 251,
          "text": "            }"
        },
        {
          "lineNumber": 252,
          "text": "          });"
        },
        {
          "lineNumber": 253,
          "text": "          _this.nico.on('play', function() {"
        },
        {
          "lineNumber": 254,
          "text": "            _this.paused = false;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 255,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 250,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 251,
          "text": "            }"
        },
        {
          "lineNumber": 252,
          "text": "          });"
        },
        {
          "lineNumber": 253,
          "text": "          _this.nico.on('play', function() {"
        },
        {
          "lineNumber": 254,
          "text": "            _this.paused = false;"
        },
        {
          "lineNumber": 255,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 256,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 257,
          "text": "            }"
        },
        {
          "lineNumber": 258,
          "text": "          });"
        },
        {
          "lineNumber": 259,
          "text": "          return _this.nico.on('ready', function() {"
        },
        {
          "lineNumber": 260,
          "text": "            _this.play();"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 364,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 359,
          "text": "            allow: 'autoplay; fullscreen'"
        },
        {
          "lineNumber": 360,
          "text": "          });"
        },
        {
          "lineNumber": 361,
          "text": "          _this.peertube = new PeerTubePlayer(video[0]);"
        },
        {
          "lineNumber": 362,
          "text": "          _this.peertube.addEventListener('playbackStatusChange', function(status) {"
        },
        {
          "lineNumber": 363,
          "text": "            _this.paused = status === 'paused';"
        },
        {
          "lineNumber": 364,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 365,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 366,
          "text": "            }"
        },
        {
          "lineNumber": 367,
          "text": "          });"
        },
        {
          "lineNumber": 368,
          "text": "          _this.peertube.addEventListener('playbackStatusUpdate', function(status) {"
        },
        {
          "lineNumber": 369,
          "text": "            _this.peertube.currentTime = status.position;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 370,
      "text": "            if (status.playbackState === \"ended\" && CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 365,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 366,
          "text": "            }"
        },
        {
          "lineNumber": 367,
          "text": "          });"
        },
        {
          "lineNumber": 368,
          "text": "          _this.peertube.addEventListener('playbackStatusUpdate', function(status) {"
        },
        {
          "lineNumber": 369,
          "text": "            _this.peertube.currentTime = status.position;"
        },
        {
          "lineNumber": 370,
          "text": "            if (status.playbackState === \"ended\" && CLIENT.leader) {"
        },
        {
          "lineNumber": 371,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 372,
          "text": "            }"
        },
        {
          "lineNumber": 373,
          "text": "          });"
        },
        {
          "lineNumber": 374,
          "text": "          _this.peertube.addEventListener('volumeChange', function(volume) {"
        },
        {
          "lineNumber": 375,
          "text": "            var VOLUME;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 481,
      "text": "              if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 476,
          "text": "            _this.soundcloud.ready = true;"
        },
        {
          "lineNumber": 477,
          "text": "            _this.setVolume(VOLUME);"
        },
        {
          "lineNumber": 478,
          "text": "            _this.play();"
        },
        {
          "lineNumber": 479,
          "text": "            _this.soundcloud.bind(SC.Widget.Events.PAUSE, function() {"
        },
        {
          "lineNumber": 480,
          "text": "              _this.paused = true;"
        },
        {
          "lineNumber": 481,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 482,
          "text": "                return sendVideoUpdate();"
        },
        {
          "lineNumber": 483,
          "text": "              }"
        },
        {
          "lineNumber": 484,
          "text": "            });"
        },
        {
          "lineNumber": 485,
          "text": "            _this.soundcloud.bind(SC.Widget.Events.PLAY, function() {"
        },
        {
          "lineNumber": 486,
          "text": "              _this.paused = false;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 487,
      "text": "              if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 482,
          "text": "                return sendVideoUpdate();"
        },
        {
          "lineNumber": 483,
          "text": "              }"
        },
        {
          "lineNumber": 484,
          "text": "            });"
        },
        {
          "lineNumber": 485,
          "text": "            _this.soundcloud.bind(SC.Widget.Events.PLAY, function() {"
        },
        {
          "lineNumber": 486,
          "text": "              _this.paused = false;"
        },
        {
          "lineNumber": 487,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 488,
          "text": "                return sendVideoUpdate();"
        },
        {
          "lineNumber": 489,
          "text": "              }"
        },
        {
          "lineNumber": 490,
          "text": "            });"
        },
        {
          "lineNumber": 491,
          "text": "            return _this.soundcloud.bind(SC.Widget.Events.FINISH, function() {"
        },
        {
          "lineNumber": 492,
          "text": "              if (CLIENT.leader) {"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 492,
      "text": "              if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 487,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 488,
          "text": "                return sendVideoUpdate();"
        },
        {
          "lineNumber": 489,
          "text": "              }"
        },
        {
          "lineNumber": 490,
          "text": "            });"
        },
        {
          "lineNumber": 491,
          "text": "            return _this.soundcloud.bind(SC.Widget.Events.FINISH, function() {"
        },
        {
          "lineNumber": 492,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 493,
          "text": "                return socket.emit('playNext');"
        },
        {
          "lineNumber": 494,
          "text": "              }"
        },
        {
          "lineNumber": 495,
          "text": "            });"
        },
        {
          "lineNumber": 496,
          "text": "          });"
        },
        {
          "lineNumber": 497,
          "text": "        };"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 618,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 613,
          "text": "        return function() {"
        },
        {
          "lineNumber": 614,
          "text": "          _this.setVolume(VOLUME);"
        },
        {
          "lineNumber": 615,
          "text": "          _this.twitch.setQuality(_this.mapQuality(USEROPTS.default_quality));"
        },
        {
          "lineNumber": 616,
          "text": "          _this.twitch.addEventListener(Twitch.Player.PLAY, function() {"
        },
        {
          "lineNumber": 617,
          "text": "            _this.paused = false;"
        },
        {
          "lineNumber": 618,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 619,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 620,
          "text": "            }"
        },
        {
          "lineNumber": 621,
          "text": "          });"
        },
        {
          "lineNumber": 622,
          "text": "          _this.twitch.addEventListener(Twitch.Player.PAUSE, function() {"
        },
        {
          "lineNumber": 623,
          "text": "            _this.paused = true;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 624,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 619,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 620,
          "text": "            }"
        },
        {
          "lineNumber": 621,
          "text": "          });"
        },
        {
          "lineNumber": 622,
          "text": "          _this.twitch.addEventListener(Twitch.Player.PAUSE, function() {"
        },
        {
          "lineNumber": 623,
          "text": "            _this.paused = true;"
        },
        {
          "lineNumber": 624,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 625,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 626,
          "text": "            }"
        },
        {
          "lineNumber": 627,
          "text": "          });"
        },
        {
          "lineNumber": 628,
          "text": "          return _this.twitch.addEventListener(Twitch.Player.ENDED, function() {"
        },
        {
          "lineNumber": 629,
          "text": "            if (CLIENT.leader) {"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 629,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 624,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 625,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 626,
          "text": "            }"
        },
        {
          "lineNumber": 627,
          "text": "          });"
        },
        {
          "lineNumber": 628,
          "text": "          return _this.twitch.addEventListener(Twitch.Player.ENDED, function() {"
        },
        {
          "lineNumber": 629,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 630,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 631,
          "text": "            }"
        },
        {
          "lineNumber": 632,
          "text": "          });"
        },
        {
          "lineNumber": 633,
          "text": "        };"
        },
        {
          "lineNumber": 634,
          "text": "      })(this));"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 767,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 762,
          "text": "            src: \"https://player.vimeo.com/video/\" + data.id,"
        },
        {
          "lineNumber": 763,
          "text": "            allow: 'autoplay; fullscreen'"
        },
        {
          "lineNumber": 764,
          "text": "          });"
        },
        {
          "lineNumber": 765,
          "text": "          _this.vimeo = new Vimeo.Player(video[0]);"
        },
        {
          "lineNumber": 766,
          "text": "          _this.vimeo.on('ended', function() {"
        },
        {
          "lineNumber": 767,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 768,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 769,
          "text": "            }"
        },
        {
          "lineNumber": 770,
          "text": "          });"
        },
        {
          "lineNumber": 771,
          "text": "          _this.vimeo.on('pause', function() {"
        },
        {
          "lineNumber": 772,
          "text": "            _this.paused = true;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 773,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 768,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 769,
          "text": "            }"
        },
        {
          "lineNumber": 770,
          "text": "          });"
        },
        {
          "lineNumber": 771,
          "text": "          _this.vimeo.on('pause', function() {"
        },
        {
          "lineNumber": 772,
          "text": "            _this.paused = true;"
        },
        {
          "lineNumber": 773,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 774,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 775,
          "text": "            }"
        },
        {
          "lineNumber": 776,
          "text": "          });"
        },
        {
          "lineNumber": 777,
          "text": "          _this.vimeo.on('play', function() {"
        },
        {
          "lineNumber": 778,
          "text": "            _this.paused = false;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 779,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 774,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 775,
          "text": "            }"
        },
        {
          "lineNumber": 776,
          "text": "          });"
        },
        {
          "lineNumber": 777,
          "text": "          _this.vimeo.on('play', function() {"
        },
        {
          "lineNumber": 778,
          "text": "            _this.paused = false;"
        },
        {
          "lineNumber": 779,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 780,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 781,
          "text": "            }"
        },
        {
          "lineNumber": 782,
          "text": "          });"
        },
        {
          "lineNumber": 783,
          "text": "          _this.play();"
        },
        {
          "lineNumber": 784,
          "text": "          return _this.setVolume(VOLUME);"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 904,
      "text": "        if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 899,
          "text": "        this.pause();"
        },
        {
          "lineNumber": 900,
          "text": "        this.pauseSeekRaceCondition = false;"
        },
        {
          "lineNumber": 901,
          "text": "      }"
        },
        {
          "lineNumber": 902,
          "text": "      if ((ev.data === YT.PlayerState.PAUSED && !this.paused) || (ev.data === YT.PlayerState.PLAYING && this.paused)) {"
        },
        {
          "lineNumber": 903,
          "text": "        this.paused = ev.data === YT.PlayerState.PAUSED;"
        },
        {
          "lineNumber": 904,
          "text": "        if (CLIENT.leader) {"
        },
        {
          "lineNumber": 905,
          "text": "          sendVideoUpdate();"
        },
        {
          "lineNumber": 906,
          "text": "        }"
        },
        {
          "lineNumber": 907,
          "text": "      }"
        },
        {
          "lineNumber": 908,
          "text": "      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {"
        },
        {
          "lineNumber": 909,
          "text": "        return socket.emit('playNext');"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 908,
      "text": "      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 903,
          "text": "        this.paused = ev.data === YT.PlayerState.PAUSED;"
        },
        {
          "lineNumber": 904,
          "text": "        if (CLIENT.leader) {"
        },
        {
          "lineNumber": 905,
          "text": "          sendVideoUpdate();"
        },
        {
          "lineNumber": 906,
          "text": "        }"
        },
        {
          "lineNumber": 907,
          "text": "      }"
        },
        {
          "lineNumber": 908,
          "text": "      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {"
        },
        {
          "lineNumber": 909,
          "text": "        return socket.emit('playNext');"
        },
        {
          "lineNumber": 910,
          "text": "      }"
        },
        {
          "lineNumber": 911,
          "text": "    };"
        },
        {
          "lineNumber": 912,
          "text": ""
        },
        {
          "lineNumber": 913,
          "text": "    YouTubePlayer.prototype.play = function() {"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1005,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 1000,
          "text": "        return function() {"
        },
        {
          "lineNumber": 1001,
          "text": "          _this.player.on('error', function(error) {"
        },
        {
          "lineNumber": 1002,
          "text": "            return console.error('PlayerJS error', error.stack);"
        },
        {
          "lineNumber": 1003,
          "text": "          });"
        },
        {
          "lineNumber": 1004,
          "text": "          _this.player.on('ended', function() {"
        },
        {
          "lineNumber": 1005,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 1006,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 1007,
          "text": "            }"
        },
        {
          "lineNumber": 1008,
          "text": "          });"
        },
        {
          "lineNumber": 1009,
          "text": "          _this.player.on('play', function() {"
        },
        {
          "lineNumber": 1010,
          "text": "            this.paused = false;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1011,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 1006,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 1007,
          "text": "            }"
        },
        {
          "lineNumber": 1008,
          "text": "          });"
        },
        {
          "lineNumber": 1009,
          "text": "          _this.player.on('play', function() {"
        },
        {
          "lineNumber": 1010,
          "text": "            this.paused = false;"
        },
        {
          "lineNumber": 1011,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 1012,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 1013,
          "text": "            }"
        },
        {
          "lineNumber": 1014,
          "text": "          });"
        },
        {
          "lineNumber": 1015,
          "text": "          _this.player.on('pause', function() {"
        },
        {
          "lineNumber": 1016,
          "text": "            this.paused = true;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1017,
      "text": "            if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 1012,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 1013,
          "text": "            }"
        },
        {
          "lineNumber": 1014,
          "text": "          });"
        },
        {
          "lineNumber": 1015,
          "text": "          _this.player.on('pause', function() {"
        },
        {
          "lineNumber": 1016,
          "text": "            this.paused = true;"
        },
        {
          "lineNumber": 1017,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 1018,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 1019,
          "text": "            }"
        },
        {
          "lineNumber": 1020,
          "text": "          });"
        },
        {
          "lineNumber": 1021,
          "text": "          _this.player.setVolume(VOLUME * 100);"
        },
        {
          "lineNumber": 1022,
          "text": "          if (!_this.paused) {"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1182,
      "text": "                  if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 1177,
          "text": "          _this.setupPlayer(iframe[0]);"
        },
        {
          "lineNumber": 1178,
          "text": "          return _this.player.on('ready', function() {"
        },
        {
          "lineNumber": 1179,
          "text": "            return _this.player.on('timeupdate', function(time) {"
        },
        {
          "lineNumber": 1180,
          "text": "              if (time.duration - time.seconds < 1 && !_this.finishing) {"
        },
        {
          "lineNumber": 1181,
          "text": "                setTimeout(function() {"
        },
        {
          "lineNumber": 1182,
          "text": "                  if (CLIENT.leader) {"
        },
        {
          "lineNumber": 1183,
          "text": "                    socket.emit('playNext');"
        },
        {
          "lineNumber": 1184,
          "text": "                  }"
        },
        {
          "lineNumber": 1185,
          "text": "                  return _this.pause();"
        },
        {
          "lineNumber": 1186,
          "text": "                }, (time.duration - time.seconds) * 1000);"
        },
        {
          "lineNumber": 1187,
          "text": "                return _this.finishing = true;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1555,
      "text": "              if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 1550,
          "text": "                }"
        },
        {
          "lineNumber": 1551,
          "text": "              }"
        },
        {
          "lineNumber": 1552,
          "text": "            });"
        },
        {
          "lineNumber": 1553,
          "text": "            _this.setVolume(VOLUME);"
        },
        {
          "lineNumber": 1554,
          "text": "            _this.player.on('ended', function() {"
        },
        {
          "lineNumber": 1555,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 1556,
          "text": "                return socket.emit('playNext');"
        },
        {
          "lineNumber": 1557,
          "text": "              }"
        },
        {
          "lineNumber": 1558,
          "text": "            });"
        },
        {
          "lineNumber": 1559,
          "text": "            _this.player.on('pause', function() {"
        },
        {
          "lineNumber": 1560,
          "text": "              _this.paused = true;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1561,
      "text": "              if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 1556,
          "text": "                return socket.emit('playNext');"
        },
        {
          "lineNumber": 1557,
          "text": "              }"
        },
        {
          "lineNumber": 1558,
          "text": "            });"
        },
        {
          "lineNumber": 1559,
          "text": "            _this.player.on('pause', function() {"
        },
        {
          "lineNumber": 1560,
          "text": "              _this.paused = true;"
        },
        {
          "lineNumber": 1561,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 1562,
          "text": "                return sendVideoUpdate();"
        },
        {
          "lineNumber": 1563,
          "text": "              }"
        },
        {
          "lineNumber": 1564,
          "text": "            });"
        },
        {
          "lineNumber": 1565,
          "text": "            _this.player.on('play', function() {"
        },
        {
          "lineNumber": 1566,
          "text": "              _this.paused = false;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1567,
      "text": "              if (CLIENT.leader) {",
      "context": [
        {
          "lineNumber": 1562,
          "text": "                return sendVideoUpdate();"
        },
        {
          "lineNumber": 1563,
          "text": "              }"
        },
        {
          "lineNumber": 1564,
          "text": "            });"
        },
        {
          "lineNumber": 1565,
          "text": "            _this.player.on('play', function() {"
        },
        {
          "lineNumber": 1566,
          "text": "              _this.paused = false;"
        },
        {
          "lineNumber": 1567,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 1568,
          "text": "                return sendVideoUpdate();"
        },
        {
          "lineNumber": 1569,
          "text": "              }"
        },
        {
          "lineNumber": 1570,
          "text": "            });"
        },
        {
          "lineNumber": 1571,
          "text": "            _this.player.on('seeked', function() {"
        },
        {
          "lineNumber": 1572,
          "text": "              return $('.vjs-waiting').removeClass('vjs-waiting');"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1954,
      "text": "    if (CLIENT.leader || !USEROPTS.synch) {",
      "context": [
        {
          "lineNumber": 1949,
          "text": "      }"
        },
        {
          "lineNumber": 1950,
          "text": "      return;"
        },
        {
          "lineNumber": 1951,
          "text": "    } else if (PLAYER instanceof YouTubePlayer) {"
        },
        {
          "lineNumber": 1952,
          "text": "      PLAYER.pauseSeekRaceCondition = false;"
        },
        {
          "lineNumber": 1953,
          "text": "    }"
        },
        {
          "lineNumber": 1954,
          "text": "    if (CLIENT.leader || !USEROPTS.synch) {"
        },
        {
          "lineNumber": 1955,
          "text": "      return;"
        },
        {
          "lineNumber": 1956,
          "text": "    }"
        },
        {
          "lineNumber": 1957,
          "text": "    if (data.paused && !PLAYER.paused) {"
        },
        {
          "lineNumber": 1958,
          "text": "      PLAYER.seekTo(data.currentTime);"
        },
        {
          "lineNumber": 1959,
          "text": "      PLAYER.pause();"
        }
      ]
    }
  ],
  "emitContexts": [
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 450,
      "emitLine": "                        socket.emit(\"borrow-rank\", r);",
      "context": [
        {
          "lineNumber": 445,
          "text": "            function addRank(r, disp) {"
        },
        {
          "lineNumber": 446,
          "text": "                var li = $(\"<li/>\").appendTo(menu);"
        },
        {
          "lineNumber": 447,
          "text": "                $(\"<a/>\").attr(\"href\", \"javascript:void(0)\")"
        },
        {
          "lineNumber": 448,
          "text": "                    .html(disp)"
        },
        {
          "lineNumber": 449,
          "text": "                    .on('click', function() {"
        },
        {
          "lineNumber": 450,
          "text": "                        socket.emit(\"borrow-rank\", r);"
        },
        {
          "lineNumber": 451,
          "text": "                    })"
        },
        {
          "lineNumber": 452,
          "text": "                    .appendTo(li);"
        },
        {
          "lineNumber": 453,
          "text": "            }"
        },
        {
          "lineNumber": 454,
          "text": ""
        },
        {
          "lineNumber": 455,
          "text": "            addRank(0, \"<span class='userlist_guest'>Guest</span>\");"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 270,
      "emitLine": "                socket.emit(\"assignLeader\", {",
      "context": [
        {
          "lineNumber": 265,
          "text": "        var ldr = $(\"<button/>\").addClass(\"btn btn-xs btn-default\")"
        },
        {
          "lineNumber": 266,
          "text": "            .appendTo(btngroup);"
        },
        {
          "lineNumber": 267,
          "text": "        if(leader) {"
        },
        {
          "lineNumber": 268,
          "text": "            ldr.text(\"Remove Leader\");"
        },
        {
          "lineNumber": 269,
          "text": "            ldr.on('click', function () {"
        },
        {
          "lineNumber": 270,
          "text": "                socket.emit(\"assignLeader\", {"
        },
        {
          "lineNumber": 271,
          "text": "                    name: \"\""
        },
        {
          "lineNumber": 272,
          "text": "                });"
        },
        {
          "lineNumber": 273,
          "text": "            });"
        },
        {
          "lineNumber": 274,
          "text": "        } else {"
        },
        {
          "lineNumber": 275,
          "text": "            ldr.text(\"Give Leader\");"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 277,
      "emitLine": "                socket.emit(\"assignLeader\", {",
      "context": [
        {
          "lineNumber": 272,
          "text": "                });"
        },
        {
          "lineNumber": 273,
          "text": "            });"
        },
        {
          "lineNumber": 274,
          "text": "        } else {"
        },
        {
          "lineNumber": 275,
          "text": "            ldr.text(\"Give Leader\");"
        },
        {
          "lineNumber": 276,
          "text": "            ldr.on('click', function () {"
        },
        {
          "lineNumber": 277,
          "text": "                socket.emit(\"assignLeader\", {"
        },
        {
          "lineNumber": 278,
          "text": "                    name: name"
        },
        {
          "lineNumber": 279,
          "text": "                });"
        },
        {
          "lineNumber": 280,
          "text": "            });"
        },
        {
          "lineNumber": 281,
          "text": "        }"
        },
        {
          "lineNumber": 282,
          "text": "    }"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 1470,
      "emitLine": "        socket.emit(\"mediaUpdate\", {",
      "context": [
        {
          "lineNumber": 1465,
          "text": "    }"
        },
        {
          "lineNumber": 1466,
          "text": "    if (!PLAYER || !PLAYER.mediaType || !PLAYER.mediaId) {"
        },
        {
          "lineNumber": 1467,
          "text": "        return;"
        },
        {
          "lineNumber": 1468,
          "text": "    }"
        },
        {
          "lineNumber": 1469,
          "text": "    PLAYER.getTime(function (seconds) {"
        },
        {
          "lineNumber": 1470,
          "text": "        socket.emit(\"mediaUpdate\", {"
        },
        {
          "lineNumber": 1471,
          "text": "            id: PLAYER.mediaId,"
        },
        {
          "lineNumber": 1472,
          "text": "            currentTime: seconds,"
        },
        {
          "lineNumber": 1473,
          "text": "            paused: PLAYER.paused,"
        },
        {
          "lineNumber": 1474,
          "text": "            type: PLAYER.mediaType"
        },
        {
          "lineNumber": 1475,
          "text": "        });"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2056,
      "emitLine": "        socket.emit(\"setPermissions\", perms);",
      "context": [
        {
          "lineNumber": 2051,
          "text": "    submit.on('click', function() {"
        },
        {
          "lineNumber": 2052,
          "text": "        var perms = {};"
        },
        {
          "lineNumber": 2053,
          "text": "        form.find(\"select\").each(function() {"
        },
        {
          "lineNumber": 2054,
          "text": "            perms[$(this).data(\"key\")] = parseFloat($(this).val());"
        },
        {
          "lineNumber": 2055,
          "text": "        });"
        },
        {
          "lineNumber": 2056,
          "text": "        socket.emit(\"setPermissions\", perms);"
        },
        {
          "lineNumber": 2057,
          "text": "    });"
        },
        {
          "lineNumber": 2058,
          "text": ""
        },
        {
          "lineNumber": 2059,
          "text": "    var msggroup = $(\"<div/>\").addClass(\"form-group\").insertAfter(sgroup);"
        },
        {
          "lineNumber": 2060,
          "text": "    var msginner = $(\"<div/>\").addClass(\"col-sm-8 col-sm-offset-4\").appendTo(msggroup);"
        },
        {
          "lineNumber": 2061,
          "text": "    var text = $(\"<span/>\").addClass(\"text-info\").text(\"Permissions updated\")"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 94,
      "emitLine": "                return socket.emit('playNext');",
      "context": [
        {
          "lineNumber": 89,
          "text": "          });"
        },
        {
          "lineNumber": 90,
          "text": "          return _this.dm.addEventListener('apiready', function() {"
        },
        {
          "lineNumber": 91,
          "text": "            _this.dmReady = true;"
        },
        {
          "lineNumber": 92,
          "text": "            _this.dm.addEventListener('ended', function() {"
        },
        {
          "lineNumber": 93,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 94,
          "text": "                return socket.emit('playNext');"
        },
        {
          "lineNumber": 95,
          "text": "              }"
        },
        {
          "lineNumber": 96,
          "text": "            });"
        },
        {
          "lineNumber": 97,
          "text": "            _this.dm.addEventListener('pause', function() {"
        },
        {
          "lineNumber": 98,
          "text": "              _this.paused = true;"
        },
        {
          "lineNumber": 99,
          "text": "              if (CLIENT.leader) {"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 244,
      "emitLine": "              return socket.emit('playNext');",
      "context": [
        {
          "lineNumber": 239,
          "text": "            videoId: data.id"
        },
        {
          "lineNumber": 240,
          "text": "          });"
        },
        {
          "lineNumber": 241,
          "text": "          removeOld($(_this.nico.iframe));"
        },
        {
          "lineNumber": 242,
          "text": "          _this.nico.on('ended', function() {"
        },
        {
          "lineNumber": 243,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 244,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 245,
          "text": "            }"
        },
        {
          "lineNumber": 246,
          "text": "          });"
        },
        {
          "lineNumber": 247,
          "text": "          _this.nico.on('pause', function() {"
        },
        {
          "lineNumber": 248,
          "text": "            _this.paused = true;"
        },
        {
          "lineNumber": 249,
          "text": "            if (CLIENT.leader) {"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 371,
      "emitLine": "              return socket.emit('playNext');",
      "context": [
        {
          "lineNumber": 366,
          "text": "            }"
        },
        {
          "lineNumber": 367,
          "text": "          });"
        },
        {
          "lineNumber": 368,
          "text": "          _this.peertube.addEventListener('playbackStatusUpdate', function(status) {"
        },
        {
          "lineNumber": 369,
          "text": "            _this.peertube.currentTime = status.position;"
        },
        {
          "lineNumber": 370,
          "text": "            if (status.playbackState === \"ended\" && CLIENT.leader) {"
        },
        {
          "lineNumber": 371,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 372,
          "text": "            }"
        },
        {
          "lineNumber": 373,
          "text": "          });"
        },
        {
          "lineNumber": 374,
          "text": "          _this.peertube.addEventListener('volumeChange', function(volume) {"
        },
        {
          "lineNumber": 375,
          "text": "            var VOLUME;"
        },
        {
          "lineNumber": 376,
          "text": "            VOLUME = volume;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 493,
      "emitLine": "                return socket.emit('playNext');",
      "context": [
        {
          "lineNumber": 488,
          "text": "                return sendVideoUpdate();"
        },
        {
          "lineNumber": 489,
          "text": "              }"
        },
        {
          "lineNumber": 490,
          "text": "            });"
        },
        {
          "lineNumber": 491,
          "text": "            return _this.soundcloud.bind(SC.Widget.Events.FINISH, function() {"
        },
        {
          "lineNumber": 492,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 493,
          "text": "                return socket.emit('playNext');"
        },
        {
          "lineNumber": 494,
          "text": "              }"
        },
        {
          "lineNumber": 495,
          "text": "            });"
        },
        {
          "lineNumber": 496,
          "text": "          });"
        },
        {
          "lineNumber": 497,
          "text": "        };"
        },
        {
          "lineNumber": 498,
          "text": "      })(this));"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 630,
      "emitLine": "              return socket.emit('playNext');",
      "context": [
        {
          "lineNumber": 625,
          "text": "              return sendVideoUpdate();"
        },
        {
          "lineNumber": 626,
          "text": "            }"
        },
        {
          "lineNumber": 627,
          "text": "          });"
        },
        {
          "lineNumber": 628,
          "text": "          return _this.twitch.addEventListener(Twitch.Player.ENDED, function() {"
        },
        {
          "lineNumber": 629,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 630,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 631,
          "text": "            }"
        },
        {
          "lineNumber": 632,
          "text": "          });"
        },
        {
          "lineNumber": 633,
          "text": "        };"
        },
        {
          "lineNumber": 634,
          "text": "      })(this));"
        },
        {
          "lineNumber": 635,
          "text": "    };"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 768,
      "emitLine": "              return socket.emit('playNext');",
      "context": [
        {
          "lineNumber": 763,
          "text": "            allow: 'autoplay; fullscreen'"
        },
        {
          "lineNumber": 764,
          "text": "          });"
        },
        {
          "lineNumber": 765,
          "text": "          _this.vimeo = new Vimeo.Player(video[0]);"
        },
        {
          "lineNumber": 766,
          "text": "          _this.vimeo.on('ended', function() {"
        },
        {
          "lineNumber": 767,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 768,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 769,
          "text": "            }"
        },
        {
          "lineNumber": 770,
          "text": "          });"
        },
        {
          "lineNumber": 771,
          "text": "          _this.vimeo.on('pause', function() {"
        },
        {
          "lineNumber": 772,
          "text": "            _this.paused = true;"
        },
        {
          "lineNumber": 773,
          "text": "            if (CLIENT.leader) {"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 909,
      "emitLine": "        return socket.emit('playNext');",
      "context": [
        {
          "lineNumber": 904,
          "text": "        if (CLIENT.leader) {"
        },
        {
          "lineNumber": 905,
          "text": "          sendVideoUpdate();"
        },
        {
          "lineNumber": 906,
          "text": "        }"
        },
        {
          "lineNumber": 907,
          "text": "      }"
        },
        {
          "lineNumber": 908,
          "text": "      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {"
        },
        {
          "lineNumber": 909,
          "text": "        return socket.emit('playNext');"
        },
        {
          "lineNumber": 910,
          "text": "      }"
        },
        {
          "lineNumber": 911,
          "text": "    };"
        },
        {
          "lineNumber": 912,
          "text": ""
        },
        {
          "lineNumber": 913,
          "text": "    YouTubePlayer.prototype.play = function() {"
        },
        {
          "lineNumber": 914,
          "text": "      this.paused = false;"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1006,
      "emitLine": "              return socket.emit('playNext');",
      "context": [
        {
          "lineNumber": 1001,
          "text": "          _this.player.on('error', function(error) {"
        },
        {
          "lineNumber": 1002,
          "text": "            return console.error('PlayerJS error', error.stack);"
        },
        {
          "lineNumber": 1003,
          "text": "          });"
        },
        {
          "lineNumber": 1004,
          "text": "          _this.player.on('ended', function() {"
        },
        {
          "lineNumber": 1005,
          "text": "            if (CLIENT.leader) {"
        },
        {
          "lineNumber": 1006,
          "text": "              return socket.emit('playNext');"
        },
        {
          "lineNumber": 1007,
          "text": "            }"
        },
        {
          "lineNumber": 1008,
          "text": "          });"
        },
        {
          "lineNumber": 1009,
          "text": "          _this.player.on('play', function() {"
        },
        {
          "lineNumber": 1010,
          "text": "            this.paused = false;"
        },
        {
          "lineNumber": 1011,
          "text": "            if (CLIENT.leader) {"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1183,
      "emitLine": "                    socket.emit('playNext');",
      "context": [
        {
          "lineNumber": 1178,
          "text": "          return _this.player.on('ready', function() {"
        },
        {
          "lineNumber": 1179,
          "text": "            return _this.player.on('timeupdate', function(time) {"
        },
        {
          "lineNumber": 1180,
          "text": "              if (time.duration - time.seconds < 1 && !_this.finishing) {"
        },
        {
          "lineNumber": 1181,
          "text": "                setTimeout(function() {"
        },
        {
          "lineNumber": 1182,
          "text": "                  if (CLIENT.leader) {"
        },
        {
          "lineNumber": 1183,
          "text": "                    socket.emit('playNext');"
        },
        {
          "lineNumber": 1184,
          "text": "                  }"
        },
        {
          "lineNumber": 1185,
          "text": "                  return _this.pause();"
        },
        {
          "lineNumber": 1186,
          "text": "                }, (time.duration - time.seconds) * 1000);"
        },
        {
          "lineNumber": 1187,
          "text": "                return _this.finishing = true;"
        },
        {
          "lineNumber": 1188,
          "text": "              }"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1556,
      "emitLine": "                return socket.emit('playNext');",
      "context": [
        {
          "lineNumber": 1551,
          "text": "              }"
        },
        {
          "lineNumber": 1552,
          "text": "            });"
        },
        {
          "lineNumber": 1553,
          "text": "            _this.setVolume(VOLUME);"
        },
        {
          "lineNumber": 1554,
          "text": "            _this.player.on('ended', function() {"
        },
        {
          "lineNumber": 1555,
          "text": "              if (CLIENT.leader) {"
        },
        {
          "lineNumber": 1556,
          "text": "                return socket.emit('playNext');"
        },
        {
          "lineNumber": 1557,
          "text": "              }"
        },
        {
          "lineNumber": 1558,
          "text": "            });"
        },
        {
          "lineNumber": 1559,
          "text": "            _this.player.on('pause', function() {"
        },
        {
          "lineNumber": 1560,
          "text": "              _this.paused = true;"
        },
        {
          "lineNumber": 1561,
          "text": "              if (CLIENT.leader) {"
        }
      ]
    }
  ],
  "domControls": [
    {
      "index": 508,
      "tag": "LI",
      "id": null,
      "className": "queue_entry pluid-507",
      "name": null,
      "value": null,
      "title": "Added by: DoodooButtchump",
      "ariaLabel": null,
      "text": "American Dad! - S09E03 - Can I Be Frank (With You)21:37",
      "hidden": false,
      "rect": {
        "x": 14.997441291809082,
        "y": -571.1104125976562,
        "width": 861.2816162109375,
        "height": 26.9580020904541
      }
    },
    {
      "index": 509,
      "tag": "A",
      "id": null,
      "className": "qe_title",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "American Dad! - S09E03 - Can I Be Frank (With You)",
      "hidden": false,
      "rect": {
        "x": 17.963579177856445,
        "y": -569.114501953125,
        "width": 242.6624298095703,
        "height": 21.99591064453125
      }
    },
    {
      "index": 880,
      "tag": "LI",
      "id": null,
      "className": "queue_entry pluid-693",
      "name": null,
      "value": null,
      "title": "Added by: DoodooButtchump",
      "ariaLabel": null,
      "text": "American Dad! - S18E22 - Steve's Franken Out21:03",
      "hidden": false,
      "rect": {
        "x": 14.997441291809082,
        "y": 4463.9267578125,
        "width": 861.2816162109375,
        "height": 26.9580020904541
      }
    },
    {
      "index": 881,
      "tag": "A",
      "id": null,
      "className": "qe_title",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "American Dad! - S18E22 - Steve's Franken Out",
      "hidden": false,
      "rect": {
        "x": 17.963579177856445,
        "y": 4465.9228515625,
        "width": 215.18397521972656,
        "height": 21.99591064453125
      }
    },
    {
      "index": 1045,
      "tag": "LI",
      "id": null,
      "className": "",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1046,
      "tag": "A",
      "id": null,
      "className": "",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1077,
      "tag": "INPUT",
      "id": "us-sort-rank",
      "className": "",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1159,
      "tag": "LI",
      "id": null,
      "className": "",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "Admin Settings",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1160,
      "tag": "A",
      "id": null,
      "className": "",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "Admin Settings",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1161,
      "tag": "LI",
      "id": null,
      "className": "dropdown",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "EditChat FiltersEmotesMOTDCSSJavascriptPermissionsModerators",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1173,
      "tag": "LI",
      "id": null,
      "className": "",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "Permissions",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1174,
      "tag": "A",
      "id": null,
      "className": "",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "Permissions",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1175,
      "tag": "LI",
      "id": null,
      "className": "",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "Moderators",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1176,
      "tag": "A",
      "id": null,
      "className": "",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "Moderators",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1207,
      "tag": "INPUT",
      "id": "cs-chanranks-name",
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1208,
      "tag": "BUTTON",
      "id": "cs-chanranks-mod",
      "className": "btn btn-success",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "+Mod",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1209,
      "tag": "BUTTON",
      "id": "cs-chanranks-adm",
      "className": "btn btn-info",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "+Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1210,
      "tag": "BUTTON",
      "id": "cs-chanranks-owner",
      "className": "btn btn-info",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "+Owner",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1211,
      "tag": "TR",
      "id": null,
      "className": "",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "NameRank",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1375,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1379,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1380,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1381,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1383,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1387,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1388,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1389,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1391,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1395,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1396,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1397,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1399,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1403,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1404,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1405,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1407,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1411,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1412,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1413,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1415,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1419,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1420,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1421,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1423,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1427,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1428,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1429,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1431,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1435,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1436,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1437,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1439,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1443,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1444,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1445,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1447,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1451,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1452,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1453,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1455,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1459,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1460,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1461,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1463,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1467,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1468,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1469,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1471,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1475,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1476,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1477,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1479,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1483,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1484,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1485,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1487,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1491,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1492,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1493,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1495,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1499,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1500,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1501,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1503,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1507,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1508,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1509,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1511,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1515,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1516,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1517,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1519,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1523,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1524,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1525,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1527,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1531,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1532,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1533,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1535,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1539,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1540,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1541,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1543,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "LeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1544,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1545,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1546,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1548,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1552,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1553,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1554,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1556,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1560,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1561,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1562,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1564,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1568,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1569,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1570,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1572,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "LeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1573,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1574,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1575,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1577,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1581,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1582,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1583,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1585,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1589,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1590,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1591,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1593,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1597,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1598,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1599,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1601,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "AnonymousGuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1605,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1606,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1607,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1609,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "ModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1610,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1611,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1613,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "LeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1614,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1615,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1616,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1618,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "LeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1619,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1620,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1621,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1623,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "ModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1624,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1625,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1627,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "ModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1628,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1629,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1631,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "ModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1632,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1633,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1635,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "ModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1636,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1637,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1639,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "ModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1640,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1641,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1643,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "ModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1644,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1645,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1647,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "LeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1648,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1649,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1650,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1652,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "GuestRegisteredLeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1655,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1656,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1657,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1659,
      "tag": "SELECT",
      "id": null,
      "className": "form-control",
      "name": null,
      "value": null,
      "title": null,
      "ariaLabel": null,
      "text": "LeaderModeratorChannel AdminNobody",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1660,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "1.5",
      "title": null,
      "ariaLabel": null,
      "text": "Leader",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1661,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "2",
      "title": null,
      "ariaLabel": null,
      "text": "Moderator",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    },
    {
      "index": 1662,
      "tag": "OPTION",
      "id": null,
      "className": "",
      "name": null,
      "value": "3",
      "title": null,
      "ariaLabel": null,
      "text": "Channel Admin",
      "hidden": true,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      }
    }
  ],
  "errors": [],
  "summary": {
    "fileCount": 4,
    "sourceMatchCount": 73,
    "leaderRelatedMatchCount": 61,
    "permissionRelatedMatchCount": 14,
    "emitContextCount": 15,
    "emitEventNames": [
      "borrow-rank",
      "assignLeader",
      "mediaUpdate",
      "setPermissions",
      "playNext"
    ],
    "domControlCount": 180,
    "inlineScriptCount": 1
  },
  "completed": "2026-09-07T18:45:54.376Z"
}
