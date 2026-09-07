/**
 * ============================================================================
 * WS-071 — CYTUBE LEADER / PERMISSION CONTROL SOURCE SCAN TEST
 * ============================================================================
 *
 * TEST CLASS
 * --------------------------------------------------------------------------
 * PASSIVE / READ-ONLY / LIVE SOURCE INTROSPECTION
 *
 * PURPOSE
 * --------------------------------------------------------------------------
 * WS-067 established that media-end handling uses:
 *
 *     if (CLIENT.leader) socket.emit("playNext")
 *
 * WS-069 established that CLIENT.leader is a separate runtime state from
 * CLIENT.rank, and that the live client contains leader-assignment logic.
 * WS-070 then observed two separate 60-second runtime windows without seeing
 * an inbound setLeader event.
 *
 * The important correction is that LEADER IS NOT SIMPLY A RANK VALUE.
 *
 * In CyTube, channel ownership / permissions determine who is allowed to
 * administer ranks and leader-related capabilities.  Therefore the next
 * question is not merely:
 *
 *     "When does setLeader arrive?"
 *
 * It is:
 *
 *     "HOW DOES THE CHANNEL PERMISSION / RANK ADMINISTRATION PATH CONTROL
 *      LEADER ASSIGNMENT?"
 *
 * This test performs a focused read-only scan of the live CyTube client source
 * for the complete browser-side control path surrounding:
 *
 *     leaderctl
 *     assignLeader
 *     setLeader
 *     CLIENT.leader
 *     channel rank administration
 *     permission editing
 *     handlePermissionChange
 *     setPermissions
 *     channel ranks
 *     setUserRank
 *     borrow-rank
 *
 * The goal is to find the actual UI/function callsites and the socket event
 * names used when an authorized user changes rank/leader-related state.
 *
 * IMPORTANT DISTINCTION
 * --------------------------------------------------------------------------
 * This is SOURCE EVIDENCE, not server-side authorization proof.
 *
 * We are deliberately not clicking the controls and not emitting any
 * administrative event.  We first want to understand the browser's intended
 * protocol from the live source.
 *
 * QUESTIONS
 * --------------------------------------------------------------------------
 * 1. Where is leader assignment exposed in the channel UI?
 * 2. Which permission controls whether that UI is available?
 * 3. What function handles leader administration?
 * 4. Does the browser emit assignLeader, setUserRank, borrow-rank, or another
 *    event when leadership is changed?
 * 5. How does channel rank administration relate to leader administration?
 * 6. Does changing permissions affect leader controls directly?
 * 7. Where is CLIENT.leader changed after the server responds?
 * 8. Is there an identifiable end-to-end client path such as:
 *
 *       channel owner/moderator UI
 *          -> permission/rank check
 *          -> socket.emit(...)
 *          -> server
 *          -> inbound setLeader
 *          -> CLIENT.leader
 *
 * SOURCE FILES
 * --------------------------------------------------------------------------
 * The scan fetches the current live versions of the four core client files:
 *
 *     /js/callbacks.js
 *     /js/ui.js
 *     /js/util.js
 *     /js/player.js
 *
 * It also scans inline script text already present in the document.
 *
 * WHY LIVE SOURCE?
 * --------------------------------------------------------------------------
 * This project is reverse-engineering the actual Cytube runtime, not a stale
 * copy of source code.  Fetching the scripts from the current page keeps the
 * observation tied to the exact client being tested.
 *
 * OUTPUT
 * --------------------------------------------------------------------------
 * The complete structured result is stored in:
 *
 *     window.__WS071_DATA__
 *
 * The result contains:
 *   - runtime identity and rank/permission state
 *   - matching source lines
 *   - surrounding source context
 *   - socket.emit callsites near leader/rank matches
 *   - relevant DOM controls currently present in the page
 *
 * The output is intentionally structured so the resulting artifact can use
 * the established project format:
 *
 *     WS-071-CYTUBE-LEADER-PERMISSION-CONTROL-SOURCE-SCAN-TEST.js
 *     [actual runtime output pasted below the script]
 *
 * MOBILE WORKFLOW NOTE
 * --------------------------------------------------------------------------
 * This script does not depend on asynchronous clipboard APIs.  It stores the
 * finished object globally so the result can be copied synchronously from the
 * DevTools console using the project's established copy() workflow.
 *
 * SAFETY
 * --------------------------------------------------------------------------
 * This test:
 *   - does NOT socket.emit()
 *   - does NOT click anything
 *   - does NOT change ranks
 *   - does NOT change permissions
 *   - does NOT assign or clear leader
 *   - does NOT modify the playlist
 *   - does NOT modify player state
 *   - does NOT disconnect the socket
 *   - does NOT permanently replace any application function
 *
 * ============================================================================
 */

(async function WS071() {
    const TEST = "WS-071";
    const started = new Date().toISOString();

    // Focused vocabulary.  These terms are deliberately narrow so that the
    // resulting output is useful for protocol reconstruction rather than
    // producing another enormous generic source dump.
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

    const CORE_FILES = [
        "/js/callbacks.js",
        "/js/ui.js",
        "/js/util.js",
        "/js/player.js"
    ];

    const CONTEXT_RADIUS = 5;

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
            channelPerms: window.CHANNEL?.perms ?? null
        },
        files: [],
        sourceMatches: [],
        emitContexts: [],
        domControls: [],
        errors: [],
        summary: null,
        completed: null
    };

    window.__WS071_DATA__ = data;

    function addContext(lines, index) {
        const start = Math.max(0, index - CONTEXT_RADIUS);
        const end = Math.min(lines.length, index + CONTEXT_RADIUS + 1);
        return lines.slice(start, end).map(function(text, offset) {
            return {
                lineNumber: start + offset + 1,
                text
            };
        });
    }

    function interesting(text) {
        return PATTERNS.some(function(pattern) {
            return text.toLowerCase().includes(pattern.toLowerCase());
        });
    }

    function hasEmit(text) {
        return /\bsocket\.emit\s*\(/i.test(text) ||
               /\bwindow\.socket\.emit\s*\(/i.test(text);
    }

    async function fetchSource(path) {
        const url = location.origin + path;
        try {
            const response = await fetch(url, { credentials: "same-origin" });
            if (!response.ok) {
                throw new Error("HTTP " + response.status);
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
                error: String(error && (error.stack || error))
            });
            return null;
        }
    }

    // ------------------------------------------------------------------------
    // 1. Fetch the exact live core client files.
    // ------------------------------------------------------------------------
    for (const path of CORE_FILES) {
        const result = await fetchSource(path);
        if (!result) continue;

        const lines = result.source.split(/\r?\n/);
        data.files.push({
            path,
            url: result.url,
            lineCount: lines.length,
            sourceLength: result.source.length
        });

        // Record every focused source match with enough surrounding context
        // to reconstruct the browser-side control flow.
        lines.forEach(function(text, index) {
            if (!interesting(text)) return;

            data.sourceMatches.push({
                path,
                url: result.url,
                lineNumber: index + 1,
                text,
                context: addContext(lines, index)
            });
        });

        // A second pass isolates source lines that actually emit Socket.IO
        // application events and are near the leader/rank vocabulary.
        lines.forEach(function(text, index) {
            if (!hasEmit(text)) return;

            const nearby = lines.slice(
                Math.max(0, index - 8),
                Math.min(lines.length, index + 9)
            ).join("\n");

            if (!interesting(nearby)) return;

            data.emitContexts.push({
                path,
                url: result.url,
                lineNumber: index + 1,
                emitLine: text,
                context: addContext(lines, index)
            });
        });
    }

    // ------------------------------------------------------------------------
    // 2. Scan inline scripts as well.
    // ------------------------------------------------------------------------
    const inlineScripts = Array.from(document.scripts)
        .filter(function(script) {
            return !script.src && script.textContent;
        });

    inlineScripts.forEach(function(script, scriptIndex) {
        const lines = script.textContent.split(/\r?\n/);
        lines.forEach(function(text, index) {
            if (!interesting(text)) return;

            data.sourceMatches.push({
                path: "[inline-script-" + scriptIndex + "]",
                url: location.href,
                lineNumber: index + 1,
                text,
                context: addContext(lines, index)
            });
        });
    });

    // ------------------------------------------------------------------------
    // 3. Inspect the current DOM for leader/rank/permission controls.
    // ------------------------------------------------------------------------
    // This is observational only.  We do not click or mutate these elements.
    const allElements = Array.from(document.querySelectorAll("button, a, input, select, option, li, tr, td"));
    allElements.forEach(function(el, index) {
        const text = [
            el.textContent || "",
            el.getAttribute("title") || "",
            el.getAttribute("aria-label") || "",
            el.getAttribute("id") || "",
            el.getAttribute("class") || "",
            el.getAttribute("name") || "",
            el.getAttribute("value") || ""
        ].join(" ").trim();

        if (!/leader|rank|permission|moderator|owner|admin/i.test(text)) return;

        const rect = typeof el.getBoundingClientRect === "function"
            ? el.getBoundingClientRect()
            : null;

        data.domControls.push({
            index,
            tag: el.tagName,
            id: el.id || null,
            className: typeof el.className === "string" ? el.className : null,
            name: el.getAttribute("name"),
            value: el.getAttribute("value"),
            title: el.getAttribute("title"),
            ariaLabel: el.getAttribute("aria-label"),
            text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 300),
            hidden: !!(el.offsetParent === null && !rect?.width),
            rect: rect ? {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
            } : null
        });
    });

    // ------------------------------------------------------------------------
    // 4. Produce a compact summary for quick analysis while retaining the
    //    detailed contexts above for archival reverse-engineering.
    // ------------------------------------------------------------------------
    const leaderSource = data.sourceMatches.filter(function(m) {
        return /leader|assignLeader|setLeader|borrow-rank|borrowRank/i.test(m.text);
    }).length;

    const permissionSource = data.sourceMatches.filter(function(m) {
        return /permission|setPermissions|handlePermissionChange|leaderctl|setUserRank|channelRanks/i.test(m.text);
    }).length;

    const emitNames = data.emitContexts.map(function(item) {
        const match = item.context
            .map(function(line) { return line.text; })
            .join("\n")
            .match(/socket\.emit\s*\(\s*["']([^"']+)["']/i);
        return match ? match[1] : null;
    }).filter(Boolean);

    data.summary = {
        fileCount: data.files.length,
        sourceMatchCount: data.sourceMatches.length,
        leaderRelatedMatchCount: leaderSource,
        permissionRelatedMatchCount: permissionSource,
        emitContextCount: data.emitContexts.length,
        emitEventNames: Array.from(new Set(emitNames)),
        domControlCount: data.domControls.length,
        inlineScriptCount: inlineScripts.length
    };

    data.status = "COMPLETE";
    data.completed = new Date().toISOString();

    console.log("WS-071 COMPLETE — leader/permission source scan finished");
    console.log(data.summary);
    console.log("Full result stored in window.__WS071_DATA__");
})();

/*------------------------------------------------------------
/*ACTUAL RUNTIME OUTPUT
/*------------------------------------------------------------

{
  "test": "WS-071",
  "status": "COMPLETE",
  "started": "2026-09-07T18:34:03.381Z",
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
      "index": 506,
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
      "index": 507,
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
      "index": 878,
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
      "index": 879,
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
      "index": 1043,
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
      "index": 1044,
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
      "index": 1075,
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
      "index": 1157,
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
      "index": 1158,
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
      "index": 1159,
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
      "index": 1171,
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
      "index": 1172,
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
      "index": 1173,
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
      "index": 1174,
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
      "index": 1205,
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
      "index": 1206,
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
      "index": 1207,
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
      "index": 1208,
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
      "index": 1209,
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
      "index": 1373,
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
      "index": 1377,
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
      "index": 1378,
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
      "index": 1379,
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
      "index": 1381,
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
      "index": 1385,
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
      "index": 1386,
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
      "index": 1387,
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
      "index": 1389,
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
      "index": 1393,
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
      "index": 1394,
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
      "index": 1395,
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
      "index": 1397,
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
      "index": 1401,
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
      "index": 1402,
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
      "index": 1403,
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
      "index": 1405,
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
      "index": 1409,
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
      "index": 1410,
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
      "index": 1411,
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
      "index": 1413,
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
      "index": 1417,
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
      "index": 1418,
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
      "index": 1419,
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
      "index": 1421,
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
      "index": 1425,
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
      "index": 1426,
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
      "index": 1427,
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
      "index": 1429,
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
      "index": 1433,
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
      "index": 1434,
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
      "index": 1435,
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
      "index": 1437,
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
      "index": 1441,
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
      "index": 1442,
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
      "index": 1443,
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
      "index": 1445,
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
      "index": 1449,
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
      "index": 1450,
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
      "index": 1451,
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
      "index": 1453,
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
      "index": 1457,
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
      "index": 1458,
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
      "index": 1459,
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
      "index": 1461,
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
      "index": 1465,
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
      "index": 1466,
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
      "index": 1467,
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
      "index": 1469,
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
      "index": 1473,
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
      "index": 1474,
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
      "index": 1475,
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
      "index": 1477,
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
      "index": 1481,
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
      "index": 1482,
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
      "index": 1483,
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
      "index": 1485,
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
      "index": 1489,
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
      "index": 1490,
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
      "index": 1491,
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
      "index": 1493,
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
      "index": 1497,
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
      "index": 1498,
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
      "index": 1499,
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
      "index": 1501,
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
      "index": 1505,
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
      "index": 1506,
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
      "index": 1507,
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
      "index": 1509,
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
      "index": 1513,
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
      "index": 1514,
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
      "index": 1515,
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
      "index": 1517,
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
      "index": 1521,
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
      "index": 1522,
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
      "index": 1523,
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
      "index": 1525,
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
      "index": 1529,
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
      "index": 1530,
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
      "index": 1531,
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
      "index": 1533,
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
      "index": 1537,
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
      "index": 1538,
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
      "index": 1539,
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
      "index": 1541,
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
      "index": 1542,
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
      "index": 1543,
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
      "index": 1544,
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
      "index": 1546,
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
      "index": 1550,
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
      "index": 1551,
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
      "index": 1552,
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
      "index": 1554,
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
      "index": 1558,
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
      "index": 1559,
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
      "index": 1560,
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
      "index": 1562,
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
      "index": 1566,
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
      "index": 1567,
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
      "index": 1568,
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
      "index": 1570,
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
      "index": 1571,
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
      "index": 1572,
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
      "index": 1573,
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
      "index": 1575,
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
      "index": 1579,
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
      "index": 1580,
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
      "index": 1581,
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
      "index": 1583,
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
      "index": 1587,
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
      "index": 1588,
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
      "index": 1589,
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
      "index": 1591,
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
      "index": 1595,
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
      "index": 1596,
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
      "index": 1597,
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
      "index": 1599,
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
      "index": 1603,
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
      "index": 1604,
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
      "index": 1605,
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
      "index": 1607,
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
      "index": 1608,
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
      "index": 1609,
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
      "index": 1611,
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
      "index": 1612,
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
      "index": 1613,
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
      "index": 1614,
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
      "index": 1616,
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
      "index": 1617,
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
      "index": 1618,
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
      "index": 1619,
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
      "index": 1621,
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
      "index": 1622,
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
      "index": 1623,
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
      "index": 1625,
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
      "index": 1626,
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
      "index": 1627,
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
      "index": 1629,
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
      "index": 1630,
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
      "index": 1631,
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
      "index": 1633,
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
      "index": 1634,
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
      "index": 1635,
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
      "index": 1637,
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
      "index": 1638,
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
      "index": 1639,
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
      "index": 1641,
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
      "index": 1642,
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
      "index": 1643,
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
      "index": 1645,
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
      "index": 1646,
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
      "index": 1647,
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
      "index": 1648,
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
      "index": 1650,
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
      "index": 1653,
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
      "index": 1654,
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
      "index": 1655,
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
      "index": 1657,
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
      "index": 1658,
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
      "index": 1659,
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
      "index": 1660,
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
  "completed": "2026-09-07T18:34:03.820Z"
}
