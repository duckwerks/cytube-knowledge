/* WS-069-CYTUBE-LEADER-ASSIGNMENT-SOURCE-SCAN-TEST.js

/*****************************************************************************************
 * WS-069 — CYTUBE LEADER ASSIGNMENT SOURCE SCAN
 *
 * TEST CLASS
 * ----------
 * READ-ONLY / SOURCE INSPECTION
 *
 * PURPOSE
 * -------
 * Determine how CyTube assigns, changes, and represents CLIENT.leader.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * WS-067 established that the player detects media completion and that the
 * client emits playNext only when CLIENT.leader is true:
 *
 *     if (CLIENT.leader)
 *         socket.emit("playNext");
 *
 * WS-068 then established that rank and leadership are separate runtime
 * concepts.  In that observation CLIENT.rank was 1 while CLIENT.leader was
 * false, and the channel's playlist modification permissions required rank
 * 1.5.
 *
 * Therefore the next question is not simply "what is the user's rank?".
 * We need to determine how CyTube decides WHO is the leader and how that
 * state reaches the browser.
 *
 * QUESTIONS THIS TEST INVESTIGATES
 * ---------------------------------
 * 1. Where is CLIENT.leader read or written?
 * 2. What is the implementation of Callbacks.setLeader, if present?
 * 3. What code emits assignLeader?
 * 4. What code emits borrow-rank?
 * 5. Where is leader-related state initialized?
 * 6. Does the user-list metadata contain leader information?
 * 7. Are leader changes server-driven through inbound Socket.IO callbacks?
 * 8. Are there client-side controls associated with leader assignment?
 *
 * THIS TEST DOES
 * --------------
 * - Fetch the live CyTube core JavaScript files from the current page.
 * - Inspect callbacks.js, ui.js, util.js, and player.js.
 * - Search for leader/rank-related source terms.
 * - Preserve source context around every relevant match.
 * - Identify likely Socket.IO emit call sites involving leadership.
 * - Capture the live CLIENT.leader value for context.
 * - Capture the live CLIENT.rank value for context.
 * - Capture any obvious current leader fields exposed by the user list.
 * - Store all results in window.__WS069_DATA__.
 *
 * THIS TEST DOES NOT
 * ------------------
 * - Emit any Socket.IO event.
 * - Change CLIENT.leader.
 * - Change rank or permissions.
 * - Click any page controls.
 * - Modify the playlist.
 * - Modify the player.
 * - Modify the DOM.
 *
 * IMPORTANT: SOURCE SCAN VS RUNTIME PROOF
 * ----------------------------------------
 * Finding a string such as socket.emit("assignLeader") in source proves
 * that the application contains that call site.  It does NOT prove that the
 * call occurred during this test.  Runtime behavior must be tested separately.
 *
 * OUTPUT / MOBILE CLIPBOARD DESIGN
 * ---------------------------------
 * This test intentionally does NOT attempt an asynchronous clipboard write.
 * Kiwi Android DevTools has previously demonstrated that delayed clipboard
 * writes are unreliable.
 *
 * Instead, after the asynchronous source scan finishes, the complete result
 * is stored in:
 *
 *     window.__WS069_DATA__
 *
 * A separate synchronous DevTools command will then copy that exact object.
 *
 * EXPECTED NEXT STEP
 * ------------------
 * After the output is captured, we will determine whether a controlled
 * runtime leader-transition test is warranted.  We will not infer runtime
 * behavior from source matches alone.
 *****************************************************************************************/

(async()=>{

    // =========================================================================
    // TEST IDENTITY
    // =========================================================================

    const TEST_ID = "WS-069";
    const started = new Date().toISOString();

    // =========================================================================
    // SEARCH TERMS
    // =========================================================================
    // These terms cover both the public-facing concept (leader) and the
    // Socket.IO/application vocabulary already observed in earlier tests.

    const patterns = [
        "CLIENT.leader",
        "setLeader",
        "assignLeader",
        "leaderctl",
        "borrow-rank",
        "borrowRank",
        "leader",
        "rank"
    ];

    // =========================================================================
    // CORE FILES
    // =========================================================================
    // We deliberately restrict the scan to CyTube's main application files.
    // Third-party player libraries can contain unrelated uses of the word
    // "leader" and would add noise without answering our question.

    const wanted = [
        "/js/callbacks.js",
        "/js/ui.js",
        "/js/util.js",
        "/js/player.js"
    ];

    const errors = [];
    const files = [];
    const matches = [];

    // =========================================================================
    // LIVE RUNTIME CONTEXT
    // =========================================================================

    const runtime = {
        channelName: window.CHANNEL?.name ?? null,
        clientRank: window.CLIENT?.rank ?? null,
        clientLeader: window.CLIENT?.leader ?? null,
        clientExists: !!window.CLIENT,
        channelExists: !!window.CHANNEL,
        socketExists: !!window.socket,
        socketConnected: !!window.socket?.connected
    };

    // =========================================================================
    // OPTIONAL USER-LIST LEADER SNAPSHOT
    // =========================================================================
    // WS-068 showed that userlist entries can expose rank and leader.  We do
    // not assume a particular DOM structure here.  Instead we inspect likely
    // global containers without changing them.

    let userlistSnapshot = null;

    try {
        const candidates = [
            window.USERS,
            window.USERLIST,
            window.userlist,
            window.Users
        ];

        for (const candidate of candidates) {
            if (candidate && typeof candidate === "object") {
                userlistSnapshot = {
                    sourceType: Array.isArray(candidate) ? "array" : "object",
                    keys: Object.keys(candidate).slice(0,100)
                };
                break;
            }
        }
    } catch (e) {
        errors.push({stage:"userlistSnapshot",error:String(e)});
    }

    // =========================================================================
    // FETCH + SCAN LIVE CORE SOURCE
    // =========================================================================

    for (const wantedPath of wanted) {
        try {
            const script = [...document.scripts].find(s => {
                try {
                    return new URL(s.src, location.href).pathname === wantedPath;
                } catch (_) {
                    return false;
                }
            });

            if (!script || !script.src) {
                errors.push({
                    stage:"locateScript",
                    path:wantedPath,
                    error:"Script tag not found on current page"
                });
                continue;
            }

            const url = new URL(script.src, location.href).href;
            const response = await fetch(url, {
                credentials:"include",
                cache:"no-store"
            });

            if (!response.ok) {
                errors.push({
                    stage:"fetch",
                    url,
                    status:response.status,
                    statusText:response.statusText
                });
                continue;
            }

            const source = await response.text();
            const lines = source.split(/\r?\n/);

            files.push({
                path:wantedPath,
                url,
                lineCount:lines.length,
                sourceLength:source.length
            });

            // -------------------------------------------------------------
            // Search every requested pattern.
            // -------------------------------------------------------------

            for (const pattern of patterns) {
                for (let i=0; i<lines.length; i++) {
                    if (!lines[i].toLowerCase().includes(pattern.toLowerCase())) {
                        continue;
                    }

                    const context = [];
                    const start = Math.max(0, i-4);
                    const end = Math.min(lines.length-1, i+4);

                    for (let j=start; j<=end; j++) {
                        context.push({
                            lineNumber:j+1,
                            text:lines[j]
                        });
                    }

                    matches.push({
                        url,
                        path:wantedPath,
                        pattern,
                        lineNumber:i+1,
                        line:lines[i],
                        context
                    });
                }
            }

        } catch (e) {
            errors.push({
                stage:"scan",
                path:wantedPath,
                error:String(e),
                stack:e?.stack || null
            });
        }
    }

    // =========================================================================
    // EXTRACT HIGH-VALUE SOURCE DETAILS
    // =========================================================================
    // Rather than making the next investigator manually hunt through all
    // matches, we also preserve source snippets for likely implementation
    // points.  These are still source observations, not runtime observations.

    const highValue = matches.filter(m => {
        const text = m.context.map(x=>x.text).join("\n");
        return /CLIENT\.leader|setLeader|assignLeader|leaderctl|borrow-rank|borrowRank|socket\.emit\s*\(/i.test(text);
    });

    // =========================================================================
    // SOURCE-LEVEL EMIT CALL SITES
    // =========================================================================

    const emitMatches = matches.filter(m => /socket\.emit\s*\(/i.test(m.context.map(x=>x.text).join("\n")))
        .map(m => ({
            path:m.path,
            url:m.url,
            lineNumber:m.lineNumber,
            pattern:m.pattern,
            context:m.context
        }));

    // =========================================================================
    // FINAL RESULT
    // =========================================================================

    window.__WS069_DATA__ = {
        test:TEST_ID,
        status:"COMPLETE",
        started,
        completed:new Date().toISOString(),
        page:{
            url:location.href,
            title:document.title,
            readyState:document.readyState
        },
        runtime,
        userlistSnapshot,
        files,
        summary:{
            fileCount:files.length,
            matchCount:matches.length,
            highValueMatchCount:highValue.length,
            emitContextCount:emitMatches.length,
            patterns
        },
        highValue,
        emitMatches,
        matches,
        errors
    };

    // Keep the console message intentionally short.  The complete result is
    // available globally and will be copied by the next synchronous command.
    console.log("WS-069 COMPLETE — result stored in window.__WS069_DATA__");
    console.log({
        fileCount:files.length,
        matchCount:matches.length,
        highValueMatchCount:highValue.length,
        emitContextCount:emitMatches.length,
        errors:errors.length
    });

})();

{
  "test": "WS-069",
  "status": "COMPLETE",
  "started": "2026-09-07T17:58:26.276Z",
  "completed": "2026-09-07T17:58:26.690Z",
  "page": {
    "url": "https://cytu.be/r/American-Dad",
    "title": "❌❌❌ AMERICAN DAD ❌❌ WATCH THE HILARIOUS SHOW IN ITS ENTIRETY!!!! ❌❌❌",
    "readyState": "complete"
  },
  "runtime": {
    "channelName": "American-Dad",
    "clientRank": 1,
    "clientLeader": false,
    "clientExists": true,
    "channelExists": true,
    "socketExists": true,
    "socketConnected": true
  },
  "userlistSnapshot": {
    "sourceType": "object",
    "keys": []
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
  "summary": {
    "fileCount": 4,
    "matchCount": 205,
    "highValueMatchCount": 96,
    "emitContextCount": 40,
    "patterns": [
      "CLIENT.leader",
      "setLeader",
      "assignLeader",
      "leaderctl",
      "borrow-rank",
      "borrowRank",
      "leader",
      "rank"
    ]
  },
  "highValue": [
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 586,
      "line": "            CLIENT.leader = false;",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 599,
      "line": "            CLIENT.leader = true;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 605,
      "line": "        } else if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 606,
      "line": "            CLIENT.leader = false;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "setLeader",
      "lineNumber": 577,
      "line": "    setLeader: function (name) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "borrow-rank",
      "lineNumber": 450,
      "line": "                        socket.emit(\"borrow-rank\", r);",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 577,
      "line": "    setLeader: function (name) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 580,
      "line": "            if ($(this).data(\"leader\")) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 581,
      "line": "                $(this).data(\"leader\", false);",
      "context": [
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
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 586,
      "line": "            CLIENT.leader = false;",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 599,
      "line": "            CLIENT.leader = true;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 600,
      "line": "            // I'm a leader!  Set up sync function",
      "context": [
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
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 605,
      "line": "        } else if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 606,
      "line": "            CLIENT.leader = false;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 450,
      "line": "                        socket.emit(\"borrow-rank\", r);",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 185,
      "line": "                meta.modflair = CLIENT.rank;",
      "context": [
        {
          "lineNumber": 181,
          "text": "            }"
        },
        {
          "lineNumber": 182,
          "text": ""
        },
        {
          "lineNumber": 183,
          "text": "            // The /m command no longer exists, so emulate it clientside"
        },
        {
          "lineNumber": 184,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 185,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 186,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 187,
          "text": "            }"
        },
        {
          "lineNumber": 188,
          "text": ""
        },
        {
          "lineNumber": 189,
          "text": "            socket.emit(\"chatMsg\", {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 597,
      "line": "/* channel ranks stuff */",
      "context": [
        {
          "lineNumber": 593,
          "text": "        socket.emit(\"shufflePlaylist\");"
        },
        {
          "lineNumber": 594,
          "text": "    }"
        },
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 598,
      "line": "function chanrankSubmit(rank) {",
      "context": [
        {
          "lineNumber": 594,
          "text": "    }"
        },
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 599,
      "line": "    var name = $(\"#cs-chanranks-name\").val();",
      "context": [
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 600,
      "line": "    socket.emit(\"setChannelRank\", {",
      "context": [
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 602,
      "line": "        rank: rank",
      "context": [
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        },
        {
          "lineNumber": 605,
          "text": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));"
        },
        {
          "lineNumber": 606,
          "text": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1463,
      "line": "    if (!CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "assignLeader",
      "lineNumber": 270,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "assignLeader",
      "lineNumber": 277,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leaderctl",
      "lineNumber": 264,
      "line": "    if (hasPermission(\"leaderctl\")) {",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leaderctl",
      "lineNumber": 2032,
      "line": "    makeOption(\"Assign/Remove leader\", \"leaderctl\", modplus, CHANNEL.perms.leaderctl+\"\");",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 263,
      "line": "    /* give/remove leader (moderator+ only) */",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 264,
      "line": "    if (hasPermission(\"leaderctl\")) {",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 267,
      "line": "        if(leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 268,
      "line": "            ldr.text(\"Remove Leader\");",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 270,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 275,
      "line": "            ldr.text(\"Give Leader\");",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 277,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 1463,
      "line": "    if (!CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2032,
      "line": "    makeOption(\"Assign/Remove leader\", \"leaderctl\", modplus, CHANNEL.perms.leaderctl+\"\");",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2033,
      "line": "    makeOption(\"Mute users\", \"mute\", modleader, CHANNEL.perms.mute+\"\");",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2034,
      "line": "    makeOption(\"Kick users\", \"kick\", modleader, CHANNEL.perms.kick+\"\");",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2358,
      "line": "            if (r.rank !== entry.rank) {",
      "context": [
        {
          "lineNumber": 2354,
          "text": "                .addClass(getNameColor(r.rank))"
        },
        {
          "lineNumber": 2355,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        },
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2360,
      "line": "                    socket.emit(\"setChannelRank\", {",
      "context": [
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        },
        {
          "lineNumber": 2363,
          "text": "                    });"
        },
        {
          "lineNumber": 2364,
          "text": "                });"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2362,
      "line": "                        rank: r.rank",
      "context": [
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        },
        {
          "lineNumber": 2363,
          "text": "                    });"
        },
        {
          "lineNumber": 2364,
          "text": "                });"
        },
        {
          "lineNumber": 2365,
          "text": "            } else {"
        },
        {
          "lineNumber": 2366,
          "text": "                $(\"<span/>\").addClass(\"glyphicon glyphicon-ok\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2798,
      "line": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {",
      "context": [
        {
          "lineNumber": 2794,
          "text": "            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2800,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 2801,
          "text": "            }"
        },
        {
          "lineNumber": 2802,
          "text": "            socket.emit(\"pm\", {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2799,
      "line": "                meta.modflair = CLIENT.rank;",
      "context": [
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2800,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 2801,
          "text": "            }"
        },
        {
          "lineNumber": 2802,
          "text": "            socket.emit(\"pm\", {"
        },
        {
          "lineNumber": 2803,
          "text": "                to: user,"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 93,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 99,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 105,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 243,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 249,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 255,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 364,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 370,
      "line": "            if (status.playbackState === \"ended\" && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 481,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 487,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 492,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 618,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 624,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 629,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 767,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 773,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 779,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 904,
      "line": "        if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 908,
      "line": "      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1005,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1011,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1017,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1182,
      "line": "                  if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1555,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1561,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1567,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1954,
      "line": "    if (CLIENT.leader || !USEROPTS.synch) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 93,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 99,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 105,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 243,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 249,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 255,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 364,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 370,
      "line": "            if (status.playbackState === \"ended\" && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 481,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 487,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 492,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 618,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 624,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 629,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 767,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 773,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 779,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 904,
      "line": "        if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 908,
      "line": "      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1005,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1011,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1017,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1182,
      "line": "                  if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1555,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1561,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1567,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1954,
      "line": "    if (CLIENT.leader || !USEROPTS.synch) {",
      "context": [
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
        }
      ]
    }
  ],
  "emitMatches": [
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 450,
      "pattern": "borrow-rank",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 450,
      "pattern": "rank",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineNumber": 185,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 181,
          "text": "            }"
        },
        {
          "lineNumber": 182,
          "text": ""
        },
        {
          "lineNumber": 183,
          "text": "            // The /m command no longer exists, so emulate it clientside"
        },
        {
          "lineNumber": 184,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 185,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 186,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 187,
          "text": "            }"
        },
        {
          "lineNumber": 188,
          "text": ""
        },
        {
          "lineNumber": 189,
          "text": "            socket.emit(\"chatMsg\", {"
        }
      ]
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineNumber": 597,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 593,
          "text": "        socket.emit(\"shufflePlaylist\");"
        },
        {
          "lineNumber": 594,
          "text": "    }"
        },
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        }
      ]
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineNumber": 598,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 594,
          "text": "    }"
        },
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        }
      ]
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineNumber": 599,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        }
      ]
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineNumber": 600,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        }
      ]
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineNumber": 602,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        },
        {
          "lineNumber": 605,
          "text": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));"
        },
        {
          "lineNumber": 606,
          "text": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 270,
      "pattern": "assignLeader",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 277,
      "pattern": "assignLeader",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 267,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 268,
      "pattern": "leader",
      "context": [
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
      "lineNumber": 270,
      "pattern": "leader",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 275,
      "pattern": "leader",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 277,
      "pattern": "leader",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2358,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 2354,
          "text": "                .addClass(getNameColor(r.rank))"
        },
        {
          "lineNumber": 2355,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        },
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2360,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        },
        {
          "lineNumber": 2363,
          "text": "                    });"
        },
        {
          "lineNumber": 2364,
          "text": "                });"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2362,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        },
        {
          "lineNumber": 2363,
          "text": "                    });"
        },
        {
          "lineNumber": 2364,
          "text": "                });"
        },
        {
          "lineNumber": 2365,
          "text": "            } else {"
        },
        {
          "lineNumber": 2366,
          "text": "                $(\"<span/>\").addClass(\"glyphicon glyphicon-ok\")"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2798,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 2794,
          "text": "            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2800,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 2801,
          "text": "            }"
        },
        {
          "lineNumber": 2802,
          "text": "            socket.emit(\"pm\", {"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2799,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2800,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 2801,
          "text": "            }"
        },
        {
          "lineNumber": 2802,
          "text": "            socket.emit(\"pm\", {"
        },
        {
          "lineNumber": 2803,
          "text": "                to: user,"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 93,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 243,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 370,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 492,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 629,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 767,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 908,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1005,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1182,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1555,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 93,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 243,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 370,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 492,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 629,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 767,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 908,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1005,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1182,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1555,
      "pattern": "leader",
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
        }
      ]
    }
  ],
  "matches": [
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 586,
      "line": "            CLIENT.leader = false;",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 599,
      "line": "            CLIENT.leader = true;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 605,
      "line": "        } else if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 606,
      "line": "            CLIENT.leader = false;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "setLeader",
      "lineNumber": 577,
      "line": "    setLeader: function (name) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "borrow-rank",
      "lineNumber": 450,
      "line": "                        socket.emit(\"borrow-rank\", r);",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 577,
      "line": "    setLeader: function (name) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 580,
      "line": "            if ($(this).data(\"leader\")) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 581,
      "line": "                $(this).data(\"leader\", false);",
      "context": [
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
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 586,
      "line": "            CLIENT.leader = false;",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 594,
      "line": "            user.data(\"leader\", true);",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 599,
      "line": "            CLIENT.leader = true;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 600,
      "line": "            // I'm a leader!  Set up sync function",
      "context": [
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
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 605,
      "line": "        } else if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 606,
      "line": "            CLIENT.leader = false;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 386,
      "line": "    channelRanks: function(entries) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 387,
      "line": "        var tbl = $(\"#cs-chanranks table\");",
      "context": [
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
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 392,
      "line": "    channelRankFail: function (data) {",
      "context": [
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
        },
        {
          "lineNumber": 392,
          "text": "    channelRankFail: function (data) {"
        },
        {
          "lineNumber": 393,
          "text": "        if ($(\"#cs-chanranks\").is(\":visible\")) {"
        },
        {
          "lineNumber": 394,
          "text": "            makeAlert(\"Error\", data.msg, \"alert-danger\")"
        },
        {
          "lineNumber": 395,
          "text": "                .removeClass().addClass(\"vertical-spacer\")"
        },
        {
          "lineNumber": 396,
          "text": "                .insertAfter($(\"#cs-chanranks form\"));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 393,
      "line": "        if ($(\"#cs-chanranks\").is(\":visible\")) {",
      "context": [
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
        },
        {
          "lineNumber": 392,
          "text": "    channelRankFail: function (data) {"
        },
        {
          "lineNumber": 393,
          "text": "        if ($(\"#cs-chanranks\").is(\":visible\")) {"
        },
        {
          "lineNumber": 394,
          "text": "            makeAlert(\"Error\", data.msg, \"alert-danger\")"
        },
        {
          "lineNumber": 395,
          "text": "                .removeClass().addClass(\"vertical-spacer\")"
        },
        {
          "lineNumber": 396,
          "text": "                .insertAfter($(\"#cs-chanranks form\"));"
        },
        {
          "lineNumber": 397,
          "text": "        } else {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 396,
      "line": "                .insertAfter($(\"#cs-chanranks form\"));",
      "context": [
        {
          "lineNumber": 392,
          "text": "    channelRankFail: function (data) {"
        },
        {
          "lineNumber": 393,
          "text": "        if ($(\"#cs-chanranks\").is(\":visible\")) {"
        },
        {
          "lineNumber": 394,
          "text": "            makeAlert(\"Error\", data.msg, \"alert-danger\")"
        },
        {
          "lineNumber": 395,
          "text": "                .removeClass().addClass(\"vertical-spacer\")"
        },
        {
          "lineNumber": 396,
          "text": "                .insertAfter($(\"#cs-chanranks form\"));"
        },
        {
          "lineNumber": 397,
          "text": "        } else {"
        },
        {
          "lineNumber": 398,
          "text": "            Callbacks.noflood({ action: \"/rank\", msg: data.msg });"
        },
        {
          "lineNumber": 399,
          "text": "        }"
        },
        {
          "lineNumber": 400,
          "text": "    },"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 398,
      "line": "            Callbacks.noflood({ action: \"/rank\", msg: data.msg });",
      "context": [
        {
          "lineNumber": 394,
          "text": "            makeAlert(\"Error\", data.msg, \"alert-danger\")"
        },
        {
          "lineNumber": 395,
          "text": "                .removeClass().addClass(\"vertical-spacer\")"
        },
        {
          "lineNumber": 396,
          "text": "                .insertAfter($(\"#cs-chanranks form\"));"
        },
        {
          "lineNumber": 397,
          "text": "        } else {"
        },
        {
          "lineNumber": 398,
          "text": "            Callbacks.noflood({ action: \"/rank\", msg: data.msg });"
        },
        {
          "lineNumber": 399,
          "text": "        }"
        },
        {
          "lineNumber": 400,
          "text": "    },"
        },
        {
          "lineNumber": 401,
          "text": ""
        },
        {
          "lineNumber": 402,
          "text": "    readChanLog: function (data) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 426,
      "line": "    /* REGION Rank Stuff */",
      "context": [
        {
          "lineNumber": 422,
          "text": ""
        },
        {
          "lineNumber": 423,
          "text": "        icon.prependTo($(\"#voteskip\"));"
        },
        {
          "lineNumber": 424,
          "text": "    },"
        },
        {
          "lineNumber": 425,
          "text": ""
        },
        {
          "lineNumber": 426,
          "text": "    /* REGION Rank Stuff */"
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 428,
      "line": "    rank: function(r) {",
      "context": [
        {
          "lineNumber": 424,
          "text": "    },"
        },
        {
          "lineNumber": 425,
          "text": ""
        },
        {
          "lineNumber": 426,
          "text": "    /* REGION Rank Stuff */"
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 431,
      "line": "        CLIENT.rank = r;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 433,
      "line": "        if(SUPERADMIN && $(\"#setrank\").length == 0) {",
      "context": [
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
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 435,
      "line": "                .attr(\"id\", \"setrank\")",
      "context": [
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
        },
        {
          "lineNumber": 438,
          "text": "                .attr(\"data-toggle\", \"dropdown\")"
        },
        {
          "lineNumber": 439,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 440,
      "line": "                .html(\"Set Rank <b class='caret'></b>\")",
      "context": [
        {
          "lineNumber": 436,
          "text": "                .appendTo($(\".nav\")[0]);"
        },
        {
          "lineNumber": 437,
          "text": "            $(\"<a/>\").addClass(\"dropdown-toggle\")"
        },
        {
          "lineNumber": 438,
          "text": "                .attr(\"data-toggle\", \"dropdown\")"
        },
        {
          "lineNumber": 439,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        },
        {
          "lineNumber": 440,
          "text": "                .html(\"Set Rank <b class='caret'></b>\")"
        },
        {
          "lineNumber": 441,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 442,
          "text": "            var menu = $(\"<ul/>\").addClass(\"dropdown-menu\")"
        },
        {
          "lineNumber": 443,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 444,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 445,
      "line": "            function addRank(r, disp) {",
      "context": [
        {
          "lineNumber": 441,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 442,
          "text": "            var menu = $(\"<ul/>\").addClass(\"dropdown-menu\")"
        },
        {
          "lineNumber": 443,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 444,
          "text": ""
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 450,
      "line": "                        socket.emit(\"borrow-rank\", r);",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 455,
      "line": "            addRank(0, \"<span class='userlist_guest'>Guest</span>\");",
      "context": [
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
        },
        {
          "lineNumber": 456,
          "text": "            addRank(1, \"<span>Registered</span>\");"
        },
        {
          "lineNumber": 457,
          "text": "            addRank(2, \"<span class='userlist_op'>Moderator</span>\");"
        },
        {
          "lineNumber": 458,
          "text": "            addRank(3, \"<span class='userlist_owner'>Admin</span>\");"
        },
        {
          "lineNumber": 459,
          "text": "            addRank(255, \"<span class='userlist_siteadmin'>Superadmin</span>\");"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 456,
      "line": "            addRank(1, \"<span>Registered</span>\");",
      "context": [
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
        },
        {
          "lineNumber": 456,
          "text": "            addRank(1, \"<span>Registered</span>\");"
        },
        {
          "lineNumber": 457,
          "text": "            addRank(2, \"<span class='userlist_op'>Moderator</span>\");"
        },
        {
          "lineNumber": 458,
          "text": "            addRank(3, \"<span class='userlist_owner'>Admin</span>\");"
        },
        {
          "lineNumber": 459,
          "text": "            addRank(255, \"<span class='userlist_siteadmin'>Superadmin</span>\");"
        },
        {
          "lineNumber": 460,
          "text": "        }"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 457,
      "line": "            addRank(2, \"<span class='userlist_op'>Moderator</span>\");",
      "context": [
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
        },
        {
          "lineNumber": 456,
          "text": "            addRank(1, \"<span>Registered</span>\");"
        },
        {
          "lineNumber": 457,
          "text": "            addRank(2, \"<span class='userlist_op'>Moderator</span>\");"
        },
        {
          "lineNumber": 458,
          "text": "            addRank(3, \"<span class='userlist_owner'>Admin</span>\");"
        },
        {
          "lineNumber": 459,
          "text": "            addRank(255, \"<span class='userlist_siteadmin'>Superadmin</span>\");"
        },
        {
          "lineNumber": 460,
          "text": "        }"
        },
        {
          "lineNumber": 461,
          "text": "    },"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 458,
      "line": "            addRank(3, \"<span class='userlist_owner'>Admin</span>\");",
      "context": [
        {
          "lineNumber": 454,
          "text": ""
        },
        {
          "lineNumber": 455,
          "text": "            addRank(0, \"<span class='userlist_guest'>Guest</span>\");"
        },
        {
          "lineNumber": 456,
          "text": "            addRank(1, \"<span>Registered</span>\");"
        },
        {
          "lineNumber": 457,
          "text": "            addRank(2, \"<span class='userlist_op'>Moderator</span>\");"
        },
        {
          "lineNumber": 458,
          "text": "            addRank(3, \"<span class='userlist_owner'>Admin</span>\");"
        },
        {
          "lineNumber": 459,
          "text": "            addRank(255, \"<span class='userlist_siteadmin'>Superadmin</span>\");"
        },
        {
          "lineNumber": 460,
          "text": "        }"
        },
        {
          "lineNumber": 461,
          "text": "    },"
        },
        {
          "lineNumber": 462,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 459,
      "line": "            addRank(255, \"<span class='userlist_siteadmin'>Superadmin</span>\");",
      "context": [
        {
          "lineNumber": 455,
          "text": "            addRank(0, \"<span class='userlist_guest'>Guest</span>\");"
        },
        {
          "lineNumber": 456,
          "text": "            addRank(1, \"<span>Registered</span>\");"
        },
        {
          "lineNumber": 457,
          "text": "            addRank(2, \"<span class='userlist_op'>Moderator</span>\");"
        },
        {
          "lineNumber": 458,
          "text": "            addRank(3, \"<span class='userlist_owner'>Admin</span>\");"
        },
        {
          "lineNumber": 459,
          "text": "            addRank(255, \"<span class='userlist_siteadmin'>Superadmin</span>\");"
        },
        {
          "lineNumber": 460,
          "text": "        }"
        },
        {
          "lineNumber": 461,
          "text": "    },"
        },
        {
          "lineNumber": 462,
          "text": ""
        },
        {
          "lineNumber": 463,
          "text": "    login: function(data) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 614,
      "line": "    setUserRank: function (data) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 616,
      "line": "        var entries = $(\"#cs-chanranks table\").data(\"entries\") || [];",
      "context": [
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
        },
        {
          "lineNumber": 620,
          "text": "                entries[i].rank = data.rank;"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 620,
      "line": "                entries[i].rank = data.rank;",
      "context": [
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
        },
        {
          "lineNumber": 620,
          "text": "                entries[i].rank = data.rank;"
        },
        {
          "lineNumber": 621,
          "text": "                found = i;"
        },
        {
          "lineNumber": 622,
          "text": "                break;"
        },
        {
          "lineNumber": 623,
          "text": "            }"
        },
        {
          "lineNumber": 624,
          "text": "        }"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 627,
      "line": "        } else if (entries[found].rank < 2) {",
      "context": [
        {
          "lineNumber": 623,
          "text": "            }"
        },
        {
          "lineNumber": 624,
          "text": "        }"
        },
        {
          "lineNumber": 625,
          "text": "        if (found === false) {"
        },
        {
          "lineNumber": 626,
          "text": "            entries.push(data);"
        },
        {
          "lineNumber": 627,
          "text": "        } else if (entries[found].rank < 2) {"
        },
        {
          "lineNumber": 628,
          "text": "            entries.splice(found, 1);"
        },
        {
          "lineNumber": 629,
          "text": "        }"
        },
        {
          "lineNumber": 630,
          "text": "        formatCSModList();"
        },
        {
          "lineNumber": 631,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 637,
      "line": "        user.data(\"rank\", data.rank);",
      "context": [
        {
          "lineNumber": 633,
          "text": "        if (user === null) {"
        },
        {
          "lineNumber": 634,
          "text": "            return;"
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 639,
      "line": "            CLIENT.rank = data.rank;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 644,
      "line": "        if (USEROPTS.sort_rank) {",
      "context": [
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
        },
        {
          "lineNumber": 646,
          "text": "        }"
        },
        {
          "lineNumber": 647,
          "text": "    },"
        },
        {
          "lineNumber": 648,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 177,
      "line": "            if (USEROPTS.adminhat && CLIENT.rank >= 255) {",
      "context": [
        {
          "lineNumber": 173,
          "text": "        }"
        },
        {
          "lineNumber": 174,
          "text": "        var msg = $(\"#chatline\").val();"
        },
        {
          "lineNumber": 175,
          "text": "        if(msg.trim()) {"
        },
        {
          "lineNumber": 176,
          "text": "            var meta = {};"
        },
        {
          "lineNumber": 177,
          "text": "            if (USEROPTS.adminhat && CLIENT.rank >= 255) {"
        },
        {
          "lineNumber": 178,
          "text": "                msg = \"/a \" + msg;"
        },
        {
          "lineNumber": 179,
          "text": "            } else if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 180,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 181,
          "text": "            }"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 179,
      "line": "            } else if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {",
      "context": [
        {
          "lineNumber": 175,
          "text": "        if(msg.trim()) {"
        },
        {
          "lineNumber": 176,
          "text": "            var meta = {};"
        },
        {
          "lineNumber": 177,
          "text": "            if (USEROPTS.adminhat && CLIENT.rank >= 255) {"
        },
        {
          "lineNumber": 178,
          "text": "                msg = \"/a \" + msg;"
        },
        {
          "lineNumber": 179,
          "text": "            } else if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 180,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 181,
          "text": "            }"
        },
        {
          "lineNumber": 182,
          "text": ""
        },
        {
          "lineNumber": 183,
          "text": "            // The /m command no longer exists, so emulate it clientside"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 180,
      "line": "                meta.modflair = CLIENT.rank;",
      "context": [
        {
          "lineNumber": 176,
          "text": "            var meta = {};"
        },
        {
          "lineNumber": 177,
          "text": "            if (USEROPTS.adminhat && CLIENT.rank >= 255) {"
        },
        {
          "lineNumber": 178,
          "text": "                msg = \"/a \" + msg;"
        },
        {
          "lineNumber": 179,
          "text": "            } else if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 180,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 181,
          "text": "            }"
        },
        {
          "lineNumber": 182,
          "text": ""
        },
        {
          "lineNumber": 183,
          "text": "            // The /m command no longer exists, so emulate it clientside"
        },
        {
          "lineNumber": 184,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 184,
      "line": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {",
      "context": [
        {
          "lineNumber": 180,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 181,
          "text": "            }"
        },
        {
          "lineNumber": 182,
          "text": ""
        },
        {
          "lineNumber": 183,
          "text": "            // The /m command no longer exists, so emulate it clientside"
        },
        {
          "lineNumber": 184,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 185,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 186,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 187,
          "text": "            }"
        },
        {
          "lineNumber": 188,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 185,
      "line": "                meta.modflair = CLIENT.rank;",
      "context": [
        {
          "lineNumber": 181,
          "text": "            }"
        },
        {
          "lineNumber": 182,
          "text": ""
        },
        {
          "lineNumber": 183,
          "text": "            // The /m command no longer exists, so emulate it clientside"
        },
        {
          "lineNumber": 184,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 185,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 186,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 187,
          "text": "            }"
        },
        {
          "lineNumber": 188,
          "text": ""
        },
        {
          "lineNumber": 189,
          "text": "            socket.emit(\"chatMsg\", {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 597,
      "line": "/* channel ranks stuff */",
      "context": [
        {
          "lineNumber": 593,
          "text": "        socket.emit(\"shufflePlaylist\");"
        },
        {
          "lineNumber": 594,
          "text": "    }"
        },
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 598,
      "line": "function chanrankSubmit(rank) {",
      "context": [
        {
          "lineNumber": 594,
          "text": "    }"
        },
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 599,
      "line": "    var name = $(\"#cs-chanranks-name\").val();",
      "context": [
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 600,
      "line": "    socket.emit(\"setChannelRank\", {",
      "context": [
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 602,
      "line": "        rank: rank",
      "context": [
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        },
        {
          "lineNumber": 605,
          "text": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));"
        },
        {
          "lineNumber": 606,
          "text": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 605,
      "line": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));",
      "context": [
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        },
        {
          "lineNumber": 605,
          "text": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));"
        },
        {
          "lineNumber": 606,
          "text": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));"
        },
        {
          "lineNumber": 607,
          "text": "$(\"#cs-chanranks-owner\").on('click', chanrankSubmit.bind(this, 4));"
        },
        {
          "lineNumber": 608,
          "text": ""
        },
        {
          "lineNumber": 609,
          "text": "[\"#showmediaurl\", \"#showsearch\", \"#showcustomembed\", \"#showplaylistmanager\"]"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 606,
      "line": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));",
      "context": [
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        },
        {
          "lineNumber": 605,
          "text": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));"
        },
        {
          "lineNumber": 606,
          "text": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));"
        },
        {
          "lineNumber": 607,
          "text": "$(\"#cs-chanranks-owner\").on('click', chanrankSubmit.bind(this, 4));"
        },
        {
          "lineNumber": 608,
          "text": ""
        },
        {
          "lineNumber": 609,
          "text": "[\"#showmediaurl\", \"#showsearch\", \"#showcustomembed\", \"#showplaylistmanager\"]"
        },
        {
          "lineNumber": 610,
          "text": "    .forEach(function (id) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 607,
      "line": "$(\"#cs-chanranks-owner\").on('click', chanrankSubmit.bind(this, 4));",
      "context": [
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        },
        {
          "lineNumber": 605,
          "text": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));"
        },
        {
          "lineNumber": 606,
          "text": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));"
        },
        {
          "lineNumber": 607,
          "text": "$(\"#cs-chanranks-owner\").on('click', chanrankSubmit.bind(this, 4));"
        },
        {
          "lineNumber": 608,
          "text": ""
        },
        {
          "lineNumber": 609,
          "text": "[\"#showmediaurl\", \"#showsearch\", \"#showcustomembed\", \"#showplaylistmanager\"]"
        },
        {
          "lineNumber": 610,
          "text": "    .forEach(function (id) {"
        },
        {
          "lineNumber": 611,
          "text": "    $(id).on('click', function () {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1463,
      "line": "    if (!CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "assignLeader",
      "lineNumber": 270,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "assignLeader",
      "lineNumber": 277,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leaderctl",
      "lineNumber": 264,
      "line": "    if (hasPermission(\"leaderctl\")) {",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leaderctl",
      "lineNumber": 2032,
      "line": "    makeOption(\"Assign/Remove leader\", \"leaderctl\", modplus, CHANNEL.perms.leaderctl+\"\");",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 101,
      "line": "        leader: div.data(\"leader\") || false,",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 185,
      "line": "    // denote current leader with a star",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 186,
      "line": "    if(data.leader) {",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 214,
      "line": "        leader = entry.data(\"leader\"),",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 263,
      "line": "    /* give/remove leader (moderator+ only) */",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 264,
      "line": "    if (hasPermission(\"leaderctl\")) {",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 267,
      "line": "        if(leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 268,
      "line": "            ldr.text(\"Remove Leader\");",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 270,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 275,
      "line": "            ldr.text(\"Give Leader\");",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 277,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 1463,
      "line": "    if (!CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 1967,
      "line": "        [\"Leader\"       , \"1.5\"],",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 1976,
      "line": "        [\"Leader\"       , \"1.5\"],",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 1982,
      "line": "    var modleader = [",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 1983,
      "line": "        [\"Leader\"       , \"1.5\"],",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2019,
      "line": "    makeOption(\"Lock/unlock playlist\", \"playlistlock\", modleader, CHANNEL.perms.playlistlock+\"\");",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2025,
      "line": "    makeOption(\"Open/Close poll\", \"pollctl\", modleader, CHANNEL.perms.pollctl+\"\");",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2032,
      "line": "    makeOption(\"Assign/Remove leader\", \"leaderctl\", modplus, CHANNEL.perms.leaderctl+\"\");",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2033,
      "line": "    makeOption(\"Mute users\", \"mute\", modleader, CHANNEL.perms.mute+\"\");",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2034,
      "line": "    makeOption(\"Kick users\", \"kick\", modleader, CHANNEL.perms.kick+\"\");",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2043,
      "line": "    makeOption(\"Drink calls\", \"drink\", modleader, CHANNEL.perms.drink+\"\");",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2045,
      "line": "    makeOption(\"Clear Chat\", \"chatclear\", modleader, CHANNEL.perms.chatclear+\"\");",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 3489,
      "line": "    div.data(\"leader\", Boolean(data.leader));",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 99,
      "line": "        rank: div.data(\"rank\"),",
      "context": [
        {
          "lineNumber": 95,
          "text": ""
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 107,
      "line": "    name.addClass(getNameColor(data.rank));",
      "context": [
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
        },
        {
          "lineNumber": 107,
          "text": "    name.addClass(getNameColor(data.rank));"
        },
        {
          "lineNumber": 108,
          "text": "    div.find(\".profile-box\").remove();"
        },
        {
          "lineNumber": 109,
          "text": ""
        },
        {
          "lineNumber": 110,
          "text": "    var meta = div.data().meta || {}; // Not sure how this could happen."
        },
        {
          "lineNumber": 111,
          "text": "    if (meta.afk) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 198,
      "line": "function getNameColor(rank) {",
      "context": [
        {
          "lineNumber": 194,
          "text": "        $(\"<span/>\").addClass(\"glyphicon \" + data.icon).prependTo(icon);"
        },
        {
          "lineNumber": 195,
          "text": "    }"
        },
        {
          "lineNumber": 196,
          "text": "}"
        },
        {
          "lineNumber": 197,
          "text": ""
        },
        {
          "lineNumber": 198,
          "text": "function getNameColor(rank) {"
        },
        {
          "lineNumber": 199,
          "text": "    if(rank >= Rank.Siteadmin)"
        },
        {
          "lineNumber": 200,
          "text": "        return \"userlist_siteadmin\";"
        },
        {
          "lineNumber": 201,
          "text": "    else if(rank >= Rank.Admin)"
        },
        {
          "lineNumber": 202,
          "text": "        return \"userlist_owner\";"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 199,
      "line": "    if(rank >= Rank.Siteadmin)",
      "context": [
        {
          "lineNumber": 195,
          "text": "    }"
        },
        {
          "lineNumber": 196,
          "text": "}"
        },
        {
          "lineNumber": 197,
          "text": ""
        },
        {
          "lineNumber": 198,
          "text": "function getNameColor(rank) {"
        },
        {
          "lineNumber": 199,
          "text": "    if(rank >= Rank.Siteadmin)"
        },
        {
          "lineNumber": 200,
          "text": "        return \"userlist_siteadmin\";"
        },
        {
          "lineNumber": 201,
          "text": "    else if(rank >= Rank.Admin)"
        },
        {
          "lineNumber": 202,
          "text": "        return \"userlist_owner\";"
        },
        {
          "lineNumber": 203,
          "text": "    else if(rank >= Rank.Moderator)"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 201,
      "line": "    else if(rank >= Rank.Admin)",
      "context": [
        {
          "lineNumber": 197,
          "text": ""
        },
        {
          "lineNumber": 198,
          "text": "function getNameColor(rank) {"
        },
        {
          "lineNumber": 199,
          "text": "    if(rank >= Rank.Siteadmin)"
        },
        {
          "lineNumber": 200,
          "text": "        return \"userlist_siteadmin\";"
        },
        {
          "lineNumber": 201,
          "text": "    else if(rank >= Rank.Admin)"
        },
        {
          "lineNumber": 202,
          "text": "        return \"userlist_owner\";"
        },
        {
          "lineNumber": 203,
          "text": "    else if(rank >= Rank.Moderator)"
        },
        {
          "lineNumber": 204,
          "text": "        return \"userlist_op\";"
        },
        {
          "lineNumber": 205,
          "text": "    else if(rank == Rank.Guest)"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 203,
      "line": "    else if(rank >= Rank.Moderator)",
      "context": [
        {
          "lineNumber": 199,
          "text": "    if(rank >= Rank.Siteadmin)"
        },
        {
          "lineNumber": 200,
          "text": "        return \"userlist_siteadmin\";"
        },
        {
          "lineNumber": 201,
          "text": "    else if(rank >= Rank.Admin)"
        },
        {
          "lineNumber": 202,
          "text": "        return \"userlist_owner\";"
        },
        {
          "lineNumber": 203,
          "text": "    else if(rank >= Rank.Moderator)"
        },
        {
          "lineNumber": 204,
          "text": "        return \"userlist_op\";"
        },
        {
          "lineNumber": 205,
          "text": "    else if(rank == Rank.Guest)"
        },
        {
          "lineNumber": 206,
          "text": "        return \"userlist_guest\";"
        },
        {
          "lineNumber": 207,
          "text": "    else"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 205,
      "line": "    else if(rank == Rank.Guest)",
      "context": [
        {
          "lineNumber": 201,
          "text": "    else if(rank >= Rank.Admin)"
        },
        {
          "lineNumber": 202,
          "text": "        return \"userlist_owner\";"
        },
        {
          "lineNumber": 203,
          "text": "    else if(rank >= Rank.Moderator)"
        },
        {
          "lineNumber": 204,
          "text": "        return \"userlist_op\";"
        },
        {
          "lineNumber": 205,
          "text": "    else if(rank == Rank.Guest)"
        },
        {
          "lineNumber": 206,
          "text": "        return \"userlist_guest\";"
        },
        {
          "lineNumber": 207,
          "text": "    else"
        },
        {
          "lineNumber": 208,
          "text": "        return \"\";"
        },
        {
          "lineNumber": 209,
          "text": "}"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 213,
      "line": "        rank = entry.data(\"rank\"),",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 405,
      "line": "            rank: $(item).data(\"rank\")",
      "context": [
        {
          "lineNumber": 401,
          "text": "    };"
        },
        {
          "lineNumber": 402,
          "text": "    var total = 0;"
        },
        {
          "lineNumber": 403,
          "text": "    $(\"#userlist .userlist_item\").each(function (index, item) {"
        },
        {
          "lineNumber": 404,
          "text": "        var data = {"
        },
        {
          "lineNumber": 405,
          "text": "            rank: $(item).data(\"rank\")"
        },
        {
          "lineNumber": 406,
          "text": "        };"
        },
        {
          "lineNumber": 407,
          "text": ""
        },
        {
          "lineNumber": 408,
          "text": "        if(data.rank >= 255)"
        },
        {
          "lineNumber": 409,
          "text": "            breakdown[\"Site Admins\"]++;"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 408,
      "line": "        if(data.rank >= 255)",
      "context": [
        {
          "lineNumber": 404,
          "text": "        var data = {"
        },
        {
          "lineNumber": 405,
          "text": "            rank: $(item).data(\"rank\")"
        },
        {
          "lineNumber": 406,
          "text": "        };"
        },
        {
          "lineNumber": 407,
          "text": ""
        },
        {
          "lineNumber": 408,
          "text": "        if(data.rank >= 255)"
        },
        {
          "lineNumber": 409,
          "text": "            breakdown[\"Site Admins\"]++;"
        },
        {
          "lineNumber": 410,
          "text": "        else if(data.rank >= 3)"
        },
        {
          "lineNumber": 411,
          "text": "            breakdown[\"Channel Admins\"]++;"
        },
        {
          "lineNumber": 412,
          "text": "        else if(data.rank == 2)"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 410,
      "line": "        else if(data.rank >= 3)",
      "context": [
        {
          "lineNumber": 406,
          "text": "        };"
        },
        {
          "lineNumber": 407,
          "text": ""
        },
        {
          "lineNumber": 408,
          "text": "        if(data.rank >= 255)"
        },
        {
          "lineNumber": 409,
          "text": "            breakdown[\"Site Admins\"]++;"
        },
        {
          "lineNumber": 410,
          "text": "        else if(data.rank >= 3)"
        },
        {
          "lineNumber": 411,
          "text": "            breakdown[\"Channel Admins\"]++;"
        },
        {
          "lineNumber": 412,
          "text": "        else if(data.rank == 2)"
        },
        {
          "lineNumber": 413,
          "text": "            breakdown[\"Moderators\"]++;"
        },
        {
          "lineNumber": 414,
          "text": "        else if(data.rank >= 1)"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 412,
      "line": "        else if(data.rank == 2)",
      "context": [
        {
          "lineNumber": 408,
          "text": "        if(data.rank >= 255)"
        },
        {
          "lineNumber": 409,
          "text": "            breakdown[\"Site Admins\"]++;"
        },
        {
          "lineNumber": 410,
          "text": "        else if(data.rank >= 3)"
        },
        {
          "lineNumber": 411,
          "text": "            breakdown[\"Channel Admins\"]++;"
        },
        {
          "lineNumber": 412,
          "text": "        else if(data.rank == 2)"
        },
        {
          "lineNumber": 413,
          "text": "            breakdown[\"Moderators\"]++;"
        },
        {
          "lineNumber": 414,
          "text": "        else if(data.rank >= 1)"
        },
        {
          "lineNumber": 415,
          "text": "            breakdown[\"Regular Users\"]++;"
        },
        {
          "lineNumber": 416,
          "text": "        else"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 414,
      "line": "        else if(data.rank >= 1)",
      "context": [
        {
          "lineNumber": 410,
          "text": "        else if(data.rank >= 3)"
        },
        {
          "lineNumber": 411,
          "text": "            breakdown[\"Channel Admins\"]++;"
        },
        {
          "lineNumber": 412,
          "text": "        else if(data.rank == 2)"
        },
        {
          "lineNumber": 413,
          "text": "            breakdown[\"Moderators\"]++;"
        },
        {
          "lineNumber": 414,
          "text": "        else if(data.rank >= 1)"
        },
        {
          "lineNumber": 415,
          "text": "            breakdown[\"Regular Users\"]++;"
        },
        {
          "lineNumber": 416,
          "text": "        else"
        },
        {
          "lineNumber": 417,
          "text": "            breakdown[\"Guests\"]++;"
        },
        {
          "lineNumber": 418,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 434,
      "line": "        var r1 = $(a).data(\"rank\");",
      "context": [
        {
          "lineNumber": 430,
          "text": "function sortUserlist() {"
        },
        {
          "lineNumber": 431,
          "text": "    var slice = Array.prototype.slice;"
        },
        {
          "lineNumber": 432,
          "text": "    var list = slice.call($(\"#userlist .userlist_item\"));"
        },
        {
          "lineNumber": 433,
          "text": "    list.sort(function (a, b) {"
        },
        {
          "lineNumber": 434,
          "text": "        var r1 = $(a).data(\"rank\");"
        },
        {
          "lineNumber": 435,
          "text": "        var r2 = $(b).data(\"rank\");"
        },
        {
          "lineNumber": 436,
          "text": "        var afk1 = $(a).find(\".glyphicon-time\").length > 0;"
        },
        {
          "lineNumber": 437,
          "text": "        var afk2 = $(b).find(\".glyphicon-time\").length > 0;"
        },
        {
          "lineNumber": 438,
          "text": "        var name1 = a.children[1].innerHTML.toLowerCase();"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 435,
      "line": "        var r2 = $(b).data(\"rank\");",
      "context": [
        {
          "lineNumber": 431,
          "text": "    var slice = Array.prototype.slice;"
        },
        {
          "lineNumber": 432,
          "text": "    var list = slice.call($(\"#userlist .userlist_item\"));"
        },
        {
          "lineNumber": 433,
          "text": "    list.sort(function (a, b) {"
        },
        {
          "lineNumber": 434,
          "text": "        var r1 = $(a).data(\"rank\");"
        },
        {
          "lineNumber": 435,
          "text": "        var r2 = $(b).data(\"rank\");"
        },
        {
          "lineNumber": 436,
          "text": "        var afk1 = $(a).find(\".glyphicon-time\").length > 0;"
        },
        {
          "lineNumber": 437,
          "text": "        var afk2 = $(b).find(\".glyphicon-time\").length > 0;"
        },
        {
          "lineNumber": 438,
          "text": "        var name1 = a.children[1].innerHTML.toLowerCase();"
        },
        {
          "lineNumber": 439,
          "text": "        var name2 = b.children[1].innerHTML.toLowerCase();"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 448,
      "line": "        if(USEROPTS.sort_rank) {",
      "context": [
        {
          "lineNumber": 444,
          "text": "            if(!afk1 && afk2)"
        },
        {
          "lineNumber": 445,
          "text": "                return -1;"
        },
        {
          "lineNumber": 446,
          "text": "        }"
        },
        {
          "lineNumber": 447,
          "text": ""
        },
        {
          "lineNumber": 448,
          "text": "        if(USEROPTS.sort_rank) {"
        },
        {
          "lineNumber": 449,
          "text": "            if(r1 < r2)"
        },
        {
          "lineNumber": 450,
          "text": "                return 1;"
        },
        {
          "lineNumber": 451,
          "text": "            if(r1 > r2)"
        },
        {
          "lineNumber": 452,
          "text": "                return -1;"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 639,
      "line": "    if (CLIENT.rank < 2) {",
      "context": [
        {
          "lineNumber": 635,
          "text": "/* menus */"
        },
        {
          "lineNumber": 636,
          "text": ""
        },
        {
          "lineNumber": 637,
          "text": "/* user settings menu */"
        },
        {
          "lineNumber": 638,
          "text": "function showUserOptions() {"
        },
        {
          "lineNumber": 639,
          "text": "    if (CLIENT.rank < 2) {"
        },
        {
          "lineNumber": 640,
          "text": "        $(\"a[href='#us-mod']\").parent().hide();"
        },
        {
          "lineNumber": 641,
          "text": "    } else {"
        },
        {
          "lineNumber": 642,
          "text": "        $(\"a[href='#us-mod']\").parent().show();"
        },
        {
          "lineNumber": 643,
          "text": "    }"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 659,
      "line": "    $(\"#us-sort-rank\").prop(\"checked\", USEROPTS.sort_rank);",
      "context": [
        {
          "lineNumber": 655,
          "text": "    $(\"#us-default-quality\").val(USEROPTS.default_quality || \"auto\");"
        },
        {
          "lineNumber": 656,
          "text": "    $(\"#us-peertube\").prop(\"checked\", USEROPTS.peertube_risk);"
        },
        {
          "lineNumber": 657,
          "text": ""
        },
        {
          "lineNumber": 658,
          "text": "    $(\"#us-chat-timestamp\").prop(\"checked\", USEROPTS.show_timestamps);"
        },
        {
          "lineNumber": 659,
          "text": "    $(\"#us-sort-rank\").prop(\"checked\", USEROPTS.sort_rank);"
        },
        {
          "lineNumber": 660,
          "text": "    $(\"#us-sort-afk\").prop(\"checked\", USEROPTS.sort_afk);"
        },
        {
          "lineNumber": 661,
          "text": "    $(\"#us-blink-title\").val(USEROPTS.blink_title);"
        },
        {
          "lineNumber": 662,
          "text": "    $(\"#us-ping-sound\").val(USEROPTS.boop);"
        },
        {
          "lineNumber": 663,
          "text": "    $(\"#us-notifications\").val(USEROPTS.notifications);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 696,
      "line": "    USEROPTS.sort_rank            = $(\"#us-sort-rank\").prop(\"checked\");",
      "context": [
        {
          "lineNumber": 692,
          "text": "    USEROPTS.default_quality      = $(\"#us-default-quality\").val();"
        },
        {
          "lineNumber": 693,
          "text": "    USEROPTS.peertube_risk        = $(\"#us-peertube\").prop(\"checked\");"
        },
        {
          "lineNumber": 694,
          "text": ""
        },
        {
          "lineNumber": 695,
          "text": "    USEROPTS.show_timestamps      = $(\"#us-chat-timestamp\").prop(\"checked\");"
        },
        {
          "lineNumber": 696,
          "text": "    USEROPTS.sort_rank            = $(\"#us-sort-rank\").prop(\"checked\");"
        },
        {
          "lineNumber": 697,
          "text": "    USEROPTS.sort_afk             = $(\"#us-sort-afk\").prop(\"checked\");"
        },
        {
          "lineNumber": 698,
          "text": "    USEROPTS.blink_title          = $(\"#us-blink-title\").val();"
        },
        {
          "lineNumber": 699,
          "text": "    USEROPTS.boop                 = $(\"#us-ping-sound\").val();"
        },
        {
          "lineNumber": 700,
          "text": "    USEROPTS.notifications        = $(\"#us-notifications\").val();"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 706,
      "line": "    if (CLIENT.rank >= 2) {",
      "context": [
        {
          "lineNumber": 702,
          "text": "    USEROPTS.no_emotes            = $(\"#us-no-emotes\").prop(\"checked\");"
        },
        {
          "lineNumber": 703,
          "text": "    USEROPTS.strip_image          = $(\"#us-strip-image\").prop(\"checked\");"
        },
        {
          "lineNumber": 704,
          "text": "    USEROPTS.chat_tab_method      = $(\"#us-chat-tab-method\").val();"
        },
        {
          "lineNumber": 705,
          "text": ""
        },
        {
          "lineNumber": 706,
          "text": "    if (CLIENT.rank >= 2) {"
        },
        {
          "lineNumber": 707,
          "text": "        USEROPTS.modhat      = $(\"#us-modflair\").prop(\"checked\");"
        },
        {
          "lineNumber": 708,
          "text": "        USEROPTS.show_shadowchat = $(\"#us-shadowchat\").prop(\"checked\");"
        },
        {
          "lineNumber": 709,
          "text": "    }"
        },
        {
          "lineNumber": 710,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 934,
      "line": "        if(typeof v == \"number\" && CLIENT.rank >= v) {",
      "context": [
        {
          "lineNumber": 930,
          "text": "function hasPermission(key) {"
        },
        {
          "lineNumber": 931,
          "text": "    if(key.indexOf(\"playlist\") == 0 && CHANNEL.openqueue) {"
        },
        {
          "lineNumber": 932,
          "text": "        var key2 = \"o\" + key;"
        },
        {
          "lineNumber": 933,
          "text": "        var v = CHANNEL.perms[key2];"
        },
        {
          "lineNumber": 934,
          "text": "        if(typeof v == \"number\" && CLIENT.rank >= v) {"
        },
        {
          "lineNumber": 935,
          "text": "            return true;"
        },
        {
          "lineNumber": 936,
          "text": "        }"
        },
        {
          "lineNumber": 937,
          "text": "    }"
        },
        {
          "lineNumber": 938,
          "text": "    var v = CHANNEL.perms[key];"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 942,
      "line": "    return CLIENT.rank >= v;",
      "context": [
        {
          "lineNumber": 938,
          "text": "    var v = CHANNEL.perms[key];"
        },
        {
          "lineNumber": 939,
          "text": "    if(typeof v != \"number\") {"
        },
        {
          "lineNumber": 940,
          "text": "        return false;"
        },
        {
          "lineNumber": 941,
          "text": "    }"
        },
        {
          "lineNumber": 942,
          "text": "    return CLIENT.rank >= v;"
        },
        {
          "lineNumber": 943,
          "text": "}"
        },
        {
          "lineNumber": 944,
          "text": ""
        },
        {
          "lineNumber": 945,
          "text": "function setVisible(selector, bool) {"
        },
        {
          "lineNumber": 946,
          "text": "    // I originally added this check because of a race condition"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 964,
      "line": "    $(\"#cs-chanranks-adm\").attr(\"disabled\", CLIENT.rank < 4);",
      "context": [
        {
          "lineNumber": 960,
          "text": "    $(selector).parent().css(\"display\", disp);"
        },
        {
          "lineNumber": 961,
          "text": "}"
        },
        {
          "lineNumber": 962,
          "text": ""
        },
        {
          "lineNumber": 963,
          "text": "function handleModPermissions() {"
        },
        {
          "lineNumber": 964,
          "text": "    $(\"#cs-chanranks-adm\").attr(\"disabled\", CLIENT.rank < 4);"
        },
        {
          "lineNumber": 965,
          "text": "    $(\"#cs-chanranks-owner\").attr(\"disabled\", CLIENT.rank < 4);"
        },
        {
          "lineNumber": 966,
          "text": "    /* update channel controls */"
        },
        {
          "lineNumber": 967,
          "text": "    $(\"#cs-pagetitle\").val(CHANNEL.opts.pagetitle);"
        },
        {
          "lineNumber": 968,
          "text": "    $(\"#cs-pagetitle\").attr(\"disabled\", CLIENT.rank < 3);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 965,
      "line": "    $(\"#cs-chanranks-owner\").attr(\"disabled\", CLIENT.rank < 4);",
      "context": [
        {
          "lineNumber": 961,
          "text": "}"
        },
        {
          "lineNumber": 962,
          "text": ""
        },
        {
          "lineNumber": 963,
          "text": "function handleModPermissions() {"
        },
        {
          "lineNumber": 964,
          "text": "    $(\"#cs-chanranks-adm\").attr(\"disabled\", CLIENT.rank < 4);"
        },
        {
          "lineNumber": 965,
          "text": "    $(\"#cs-chanranks-owner\").attr(\"disabled\", CLIENT.rank < 4);"
        },
        {
          "lineNumber": 966,
          "text": "    /* update channel controls */"
        },
        {
          "lineNumber": 967,
          "text": "    $(\"#cs-pagetitle\").val(CHANNEL.opts.pagetitle);"
        },
        {
          "lineNumber": 968,
          "text": "    $(\"#cs-pagetitle\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 969,
          "text": "    $(\"#cs-externalcss\").val(CHANNEL.opts.externalcss);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 968,
      "line": "    $(\"#cs-pagetitle\").attr(\"disabled\", CLIENT.rank < 3);",
      "context": [
        {
          "lineNumber": 964,
          "text": "    $(\"#cs-chanranks-adm\").attr(\"disabled\", CLIENT.rank < 4);"
        },
        {
          "lineNumber": 965,
          "text": "    $(\"#cs-chanranks-owner\").attr(\"disabled\", CLIENT.rank < 4);"
        },
        {
          "lineNumber": 966,
          "text": "    /* update channel controls */"
        },
        {
          "lineNumber": 967,
          "text": "    $(\"#cs-pagetitle\").val(CHANNEL.opts.pagetitle);"
        },
        {
          "lineNumber": 968,
          "text": "    $(\"#cs-pagetitle\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 969,
          "text": "    $(\"#cs-externalcss\").val(CHANNEL.opts.externalcss);"
        },
        {
          "lineNumber": 970,
          "text": "    $(\"#cs-externalcss\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 971,
          "text": "    $(\"#cs-externaljs\").val(CHANNEL.opts.externaljs);"
        },
        {
          "lineNumber": 972,
          "text": "    $(\"#cs-externaljs\").attr(\"disabled\", CLIENT.rank < 3);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 970,
      "line": "    $(\"#cs-externalcss\").attr(\"disabled\", CLIENT.rank < 3);",
      "context": [
        {
          "lineNumber": 966,
          "text": "    /* update channel controls */"
        },
        {
          "lineNumber": 967,
          "text": "    $(\"#cs-pagetitle\").val(CHANNEL.opts.pagetitle);"
        },
        {
          "lineNumber": 968,
          "text": "    $(\"#cs-pagetitle\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 969,
          "text": "    $(\"#cs-externalcss\").val(CHANNEL.opts.externalcss);"
        },
        {
          "lineNumber": 970,
          "text": "    $(\"#cs-externalcss\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 971,
          "text": "    $(\"#cs-externaljs\").val(CHANNEL.opts.externaljs);"
        },
        {
          "lineNumber": 972,
          "text": "    $(\"#cs-externaljs\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 973,
          "text": "    $(\"#cs-chat_antiflood\").prop(\"checked\", CHANNEL.opts.chat_antiflood);"
        },
        {
          "lineNumber": 974,
          "text": "    if (\"chat_antiflood_params\" in CHANNEL.opts) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 972,
      "line": "    $(\"#cs-externaljs\").attr(\"disabled\", CLIENT.rank < 3);",
      "context": [
        {
          "lineNumber": 968,
          "text": "    $(\"#cs-pagetitle\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 969,
          "text": "    $(\"#cs-externalcss\").val(CHANNEL.opts.externalcss);"
        },
        {
          "lineNumber": 970,
          "text": "    $(\"#cs-externalcss\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 971,
          "text": "    $(\"#cs-externaljs\").val(CHANNEL.opts.externaljs);"
        },
        {
          "lineNumber": 972,
          "text": "    $(\"#cs-externaljs\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 973,
          "text": "    $(\"#cs-chat_antiflood\").prop(\"checked\", CHANNEL.opts.chat_antiflood);"
        },
        {
          "lineNumber": 974,
          "text": "    if (\"chat_antiflood_params\" in CHANNEL.opts) {"
        },
        {
          "lineNumber": 975,
          "text": "        $(\"#cs-chat_antiflood_burst\").val(CHANNEL.opts.chat_antiflood_params.burst);"
        },
        {
          "lineNumber": 976,
          "text": "        $(\"#cs-chat_antiflood_sustained\").val(CHANNEL.opts.chat_antiflood_params.sustained);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 979,
      "line": "    $(\"#cs-show_public\").attr(\"disabled\", CLIENT.rank < 3);",
      "context": [
        {
          "lineNumber": 975,
          "text": "        $(\"#cs-chat_antiflood_burst\").val(CHANNEL.opts.chat_antiflood_params.burst);"
        },
        {
          "lineNumber": 976,
          "text": "        $(\"#cs-chat_antiflood_sustained\").val(CHANNEL.opts.chat_antiflood_params.sustained);"
        },
        {
          "lineNumber": 977,
          "text": "    }"
        },
        {
          "lineNumber": 978,
          "text": "    $(\"#cs-show_public\").prop(\"checked\", CHANNEL.opts.show_public);"
        },
        {
          "lineNumber": 979,
          "text": "    $(\"#cs-show_public\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 980,
          "text": "    $(\"#cs-password\").val(CHANNEL.opts.password || \"\");"
        },
        {
          "lineNumber": 981,
          "text": "    $(\"#cs-password\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 982,
          "text": "    $(\"#cs-enable_link_regex\").prop(\"checked\", CHANNEL.opts.enable_link_regex);"
        },
        {
          "lineNumber": 983,
          "text": "    $(\"#cs-afk_timeout\").val(CHANNEL.opts.afk_timeout);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 981,
      "line": "    $(\"#cs-password\").attr(\"disabled\", CLIENT.rank < 3);",
      "context": [
        {
          "lineNumber": 977,
          "text": "    }"
        },
        {
          "lineNumber": 978,
          "text": "    $(\"#cs-show_public\").prop(\"checked\", CHANNEL.opts.show_public);"
        },
        {
          "lineNumber": 979,
          "text": "    $(\"#cs-show_public\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 980,
          "text": "    $(\"#cs-password\").val(CHANNEL.opts.password || \"\");"
        },
        {
          "lineNumber": 981,
          "text": "    $(\"#cs-password\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 982,
          "text": "    $(\"#cs-enable_link_regex\").prop(\"checked\", CHANNEL.opts.enable_link_regex);"
        },
        {
          "lineNumber": 983,
          "text": "    $(\"#cs-afk_timeout\").val(CHANNEL.opts.afk_timeout);"
        },
        {
          "lineNumber": 984,
          "text": "    $(\"#cs-allow_voteskip\").prop(\"checked\", CHANNEL.opts.allow_voteskip);"
        },
        {
          "lineNumber": 985,
          "text": "    $(\"#cs-voteskip_ratio\").val(CHANNEL.opts.voteskip_ratio);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 999,
      "line": "    setParentVisible(\"a[href='#cs-permedit']\", CLIENT.rank >= 3);",
      "context": [
        {
          "lineNumber": 995,
          "text": "    $(\"#cs-csstext\").val(CHANNEL.css);"
        },
        {
          "lineNumber": 996,
          "text": "    $(\"#cs-jstext\").val(CHANNEL.js);"
        },
        {
          "lineNumber": 997,
          "text": "    $(\"#cs-motdtext\").val(CHANNEL.motd);"
        },
        {
          "lineNumber": 998,
          "text": "    setParentVisible(\"a[href='#cs-motdeditor']\", hasPermission(\"motdedit\"));"
        },
        {
          "lineNumber": 999,
          "text": "    setParentVisible(\"a[href='#cs-permedit']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1000,
          "text": "    setParentVisible(\"a[href='#cs-banlist']\", hasPermission(\"ban\"));"
        },
        {
          "lineNumber": 1001,
          "text": "    setParentVisible(\"a[href='#cs-csseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1002,
          "text": "    setParentVisible(\"a[href='#cs-jseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1003,
          "text": "    setParentVisible(\"a[href='#cs-chatfilters']\", hasPermission(\"filteredit\"));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1001,
      "line": "    setParentVisible(\"a[href='#cs-csseditor']\", CLIENT.rank >= 3);",
      "context": [
        {
          "lineNumber": 997,
          "text": "    $(\"#cs-motdtext\").val(CHANNEL.motd);"
        },
        {
          "lineNumber": 998,
          "text": "    setParentVisible(\"a[href='#cs-motdeditor']\", hasPermission(\"motdedit\"));"
        },
        {
          "lineNumber": 999,
          "text": "    setParentVisible(\"a[href='#cs-permedit']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1000,
          "text": "    setParentVisible(\"a[href='#cs-banlist']\", hasPermission(\"ban\"));"
        },
        {
          "lineNumber": 1001,
          "text": "    setParentVisible(\"a[href='#cs-csseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1002,
          "text": "    setParentVisible(\"a[href='#cs-jseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1003,
          "text": "    setParentVisible(\"a[href='#cs-chatfilters']\", hasPermission(\"filteredit\"));"
        },
        {
          "lineNumber": 1004,
          "text": "    setParentVisible(\"a[href='#cs-emotes']\", hasPermission(\"emoteedit\"));"
        },
        {
          "lineNumber": 1005,
          "text": "    setParentVisible(\"a[href='#cs-chanranks']\", CLIENT.rank >= 3);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1002,
      "line": "    setParentVisible(\"a[href='#cs-jseditor']\", CLIENT.rank >= 3);",
      "context": [
        {
          "lineNumber": 998,
          "text": "    setParentVisible(\"a[href='#cs-motdeditor']\", hasPermission(\"motdedit\"));"
        },
        {
          "lineNumber": 999,
          "text": "    setParentVisible(\"a[href='#cs-permedit']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1000,
          "text": "    setParentVisible(\"a[href='#cs-banlist']\", hasPermission(\"ban\"));"
        },
        {
          "lineNumber": 1001,
          "text": "    setParentVisible(\"a[href='#cs-csseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1002,
          "text": "    setParentVisible(\"a[href='#cs-jseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1003,
          "text": "    setParentVisible(\"a[href='#cs-chatfilters']\", hasPermission(\"filteredit\"));"
        },
        {
          "lineNumber": 1004,
          "text": "    setParentVisible(\"a[href='#cs-emotes']\", hasPermission(\"emoteedit\"));"
        },
        {
          "lineNumber": 1005,
          "text": "    setParentVisible(\"a[href='#cs-chanranks']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1006,
          "text": "    setParentVisible(\"a[href='#cs-chanlog']\", CLIENT.rank >= 3);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1005,
      "line": "    setParentVisible(\"a[href='#cs-chanranks']\", CLIENT.rank >= 3);",
      "context": [
        {
          "lineNumber": 1001,
          "text": "    setParentVisible(\"a[href='#cs-csseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1002,
          "text": "    setParentVisible(\"a[href='#cs-jseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1003,
          "text": "    setParentVisible(\"a[href='#cs-chatfilters']\", hasPermission(\"filteredit\"));"
        },
        {
          "lineNumber": 1004,
          "text": "    setParentVisible(\"a[href='#cs-emotes']\", hasPermission(\"emoteedit\"));"
        },
        {
          "lineNumber": 1005,
          "text": "    setParentVisible(\"a[href='#cs-chanranks']\", CLIENT.rank >= 3);"
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1006,
      "line": "    setParentVisible(\"a[href='#cs-chanlog']\", CLIENT.rank >= 3);",
      "context": [
        {
          "lineNumber": 1002,
          "text": "    setParentVisible(\"a[href='#cs-jseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1003,
          "text": "    setParentVisible(\"a[href='#cs-chatfilters']\", hasPermission(\"filteredit\"));"
        },
        {
          "lineNumber": 1004,
          "text": "    setParentVisible(\"a[href='#cs-emotes']\", hasPermission(\"emoteedit\"));"
        },
        {
          "lineNumber": 1005,
          "text": "    setParentVisible(\"a[href='#cs-chanranks']\", CLIENT.rank >= 3);"
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1012,
      "line": "    if(CLIENT.rank >= 2) {",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1017,
      "line": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);",
      "context": [
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
        },
        {
          "lineNumber": 1017,
          "text": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1018,
          "text": "    setVisible(\"#playlistmanagerwrap\", CLIENT.rank >= 1);"
        },
        {
          "lineNumber": 1019,
          "text": "    setVisible(\"#modflair\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1020,
          "text": "    setVisible(\"#guestlogin\", CLIENT.rank < 0);"
        },
        {
          "lineNumber": 1021,
          "text": "    setVisible(\"#chatline\", CLIENT.rank >= 0);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1018,
      "line": "    setVisible(\"#playlistmanagerwrap\", CLIENT.rank >= 1);",
      "context": [
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
        },
        {
          "lineNumber": 1017,
          "text": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1018,
          "text": "    setVisible(\"#playlistmanagerwrap\", CLIENT.rank >= 1);"
        },
        {
          "lineNumber": 1019,
          "text": "    setVisible(\"#modflair\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1020,
          "text": "    setVisible(\"#guestlogin\", CLIENT.rank < 0);"
        },
        {
          "lineNumber": 1021,
          "text": "    setVisible(\"#chatline\", CLIENT.rank >= 0);"
        },
        {
          "lineNumber": 1022,
          "text": "    setVisible(\"#queue\", hasPermission(\"seeplaylist\"));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1019,
      "line": "    setVisible(\"#modflair\", CLIENT.rank >= 2);",
      "context": [
        {
          "lineNumber": 1015,
          "text": ""
        },
        {
          "lineNumber": 1016,
          "text": "    $(\"#qlockbtn\").attr(\"disabled\", !hasPermission(\"playlistlock\"));"
        },
        {
          "lineNumber": 1017,
          "text": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1018,
          "text": "    setVisible(\"#playlistmanagerwrap\", CLIENT.rank >= 1);"
        },
        {
          "lineNumber": 1019,
          "text": "    setVisible(\"#modflair\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1020,
          "text": "    setVisible(\"#guestlogin\", CLIENT.rank < 0);"
        },
        {
          "lineNumber": 1021,
          "text": "    setVisible(\"#chatline\", CLIENT.rank >= 0);"
        },
        {
          "lineNumber": 1022,
          "text": "    setVisible(\"#queue\", hasPermission(\"seeplaylist\"));"
        },
        {
          "lineNumber": 1023,
          "text": "    setVisible(\"#plmeta\", hasPermission(\"seeplaylist\"));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1020,
      "line": "    setVisible(\"#guestlogin\", CLIENT.rank < 0);",
      "context": [
        {
          "lineNumber": 1016,
          "text": "    $(\"#qlockbtn\").attr(\"disabled\", !hasPermission(\"playlistlock\"));"
        },
        {
          "lineNumber": 1017,
          "text": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1018,
          "text": "    setVisible(\"#playlistmanagerwrap\", CLIENT.rank >= 1);"
        },
        {
          "lineNumber": 1019,
          "text": "    setVisible(\"#modflair\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1020,
          "text": "    setVisible(\"#guestlogin\", CLIENT.rank < 0);"
        },
        {
          "lineNumber": 1021,
          "text": "    setVisible(\"#chatline\", CLIENT.rank >= 0);"
        },
        {
          "lineNumber": 1022,
          "text": "    setVisible(\"#queue\", hasPermission(\"seeplaylist\"));"
        },
        {
          "lineNumber": 1023,
          "text": "    setVisible(\"#plmeta\", hasPermission(\"seeplaylist\"));"
        },
        {
          "lineNumber": 1024,
          "text": "    $(\"#getplaylist\").attr(\"disabled\", !hasPermission(\"seeplaylist\"));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1021,
      "line": "    setVisible(\"#chatline\", CLIENT.rank >= 0);",
      "context": [
        {
          "lineNumber": 1017,
          "text": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1018,
          "text": "    setVisible(\"#playlistmanagerwrap\", CLIENT.rank >= 1);"
        },
        {
          "lineNumber": 1019,
          "text": "    setVisible(\"#modflair\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1020,
          "text": "    setVisible(\"#guestlogin\", CLIENT.rank < 0);"
        },
        {
          "lineNumber": 1021,
          "text": "    setVisible(\"#chatline\", CLIENT.rank >= 0);"
        },
        {
          "lineNumber": 1022,
          "text": "    setVisible(\"#queue\", hasPermission(\"seeplaylist\"));"
        },
        {
          "lineNumber": 1023,
          "text": "    setVisible(\"#plmeta\", hasPermission(\"seeplaylist\"));"
        },
        {
          "lineNumber": 1024,
          "text": "    $(\"#getplaylist\").attr(\"disabled\", !hasPermission(\"seeplaylist\"));"
        },
        {
          "lineNumber": 1025,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1873,
      "line": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);",
      "context": [
        {
          "lineNumber": 1869,
          "text": "        .appendTo($(\"#chatheader\"))"
        },
        {
          "lineNumber": 1870,
          "text": "        .on('click', function () {"
        },
        {
          "lineNumber": 1871,
          "text": "            EMOTELISTMODAL.modal();"
        },
        {
          "lineNumber": 1872,
          "text": "        });"
        },
        {
          "lineNumber": 1873,
          "text": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1874,
          "text": ""
        },
        {
          "lineNumber": 1875,
          "text": "    $(\"body\").addClass(\"chatOnly\");"
        },
        {
          "lineNumber": 1876,
          "text": "    handleWindowResize();"
        },
        {
          "lineNumber": 1877,
          "text": "}"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2310,
      "line": "    var tbl = $(\"#cs-chanranks table\");",
      "context": [
        {
          "lineNumber": 2306,
          "text": "    return wrap;"
        },
        {
          "lineNumber": 2307,
          "text": "}"
        },
        {
          "lineNumber": 2308,
          "text": ""
        },
        {
          "lineNumber": 2309,
          "text": "function formatCSModList() {"
        },
        {
          "lineNumber": 2310,
          "text": "    var tbl = $(\"#cs-chanranks table\");"
        },
        {
          "lineNumber": 2311,
          "text": "    tbl.find(\"tbody\").remove();"
        },
        {
          "lineNumber": 2312,
          "text": "    var entries = tbl.data(\"entries\") || [];"
        },
        {
          "lineNumber": 2313,
          "text": "    entries.sort(function(a, b) {"
        },
        {
          "lineNumber": 2314,
          "text": "        if (a.rank === b.rank) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2314,
      "line": "        if (a.rank === b.rank) {",
      "context": [
        {
          "lineNumber": 2310,
          "text": "    var tbl = $(\"#cs-chanranks table\");"
        },
        {
          "lineNumber": 2311,
          "text": "    tbl.find(\"tbody\").remove();"
        },
        {
          "lineNumber": 2312,
          "text": "    var entries = tbl.data(\"entries\") || [];"
        },
        {
          "lineNumber": 2313,
          "text": "    entries.sort(function(a, b) {"
        },
        {
          "lineNumber": 2314,
          "text": "        if (a.rank === b.rank) {"
        },
        {
          "lineNumber": 2315,
          "text": "            var x = a.name.toLowerCase();"
        },
        {
          "lineNumber": 2316,
          "text": "            var y = b.name.toLowerCase();"
        },
        {
          "lineNumber": 2317,
          "text": "            return y == x ? 0 : (x < y ? -1 : 1);"
        },
        {
          "lineNumber": 2318,
          "text": "        }"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2320,
      "line": "        return b.rank - a.rank;",
      "context": [
        {
          "lineNumber": 2316,
          "text": "            var y = b.name.toLowerCase();"
        },
        {
          "lineNumber": 2317,
          "text": "            return y == x ? 0 : (x < y ? -1 : 1);"
        },
        {
          "lineNumber": 2318,
          "text": "        }"
        },
        {
          "lineNumber": 2319,
          "text": ""
        },
        {
          "lineNumber": 2320,
          "text": "        return b.rank - a.rank;"
        },
        {
          "lineNumber": 2321,
          "text": "    });"
        },
        {
          "lineNumber": 2322,
          "text": ""
        },
        {
          "lineNumber": 2323,
          "text": "    entries.forEach(function (entry) {"
        },
        {
          "lineNumber": 2324,
          "text": "        var tr = $(\"<tr/>\").addClass(\"cs-chanrank-tr-\" + entry.name);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2324,
      "line": "        var tr = $(\"<tr/>\").addClass(\"cs-chanrank-tr-\" + entry.name);",
      "context": [
        {
          "lineNumber": 2320,
          "text": "        return b.rank - a.rank;"
        },
        {
          "lineNumber": 2321,
          "text": "    });"
        },
        {
          "lineNumber": 2322,
          "text": ""
        },
        {
          "lineNumber": 2323,
          "text": "    entries.forEach(function (entry) {"
        },
        {
          "lineNumber": 2324,
          "text": "        var tr = $(\"<tr/>\").addClass(\"cs-chanrank-tr-\" + entry.name);"
        },
        {
          "lineNumber": 2325,
          "text": "        var name = $(\"<td/>\").text(entry.name).appendTo(tr);"
        },
        {
          "lineNumber": 2326,
          "text": "        name.addClass(getNameColor(entry.rank));"
        },
        {
          "lineNumber": 2327,
          "text": "        var rankwrap = $(\"<td/>\");"
        },
        {
          "lineNumber": 2328,
          "text": "        var rank = $(\"<span/>\").text(entry.rank).appendTo(rankwrap);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2326,
      "line": "        name.addClass(getNameColor(entry.rank));",
      "context": [
        {
          "lineNumber": 2322,
          "text": ""
        },
        {
          "lineNumber": 2323,
          "text": "    entries.forEach(function (entry) {"
        },
        {
          "lineNumber": 2324,
          "text": "        var tr = $(\"<tr/>\").addClass(\"cs-chanrank-tr-\" + entry.name);"
        },
        {
          "lineNumber": 2325,
          "text": "        var name = $(\"<td/>\").text(entry.name).appendTo(tr);"
        },
        {
          "lineNumber": 2326,
          "text": "        name.addClass(getNameColor(entry.rank));"
        },
        {
          "lineNumber": 2327,
          "text": "        var rankwrap = $(\"<td/>\");"
        },
        {
          "lineNumber": 2328,
          "text": "        var rank = $(\"<span/>\").text(entry.rank).appendTo(rankwrap);"
        },
        {
          "lineNumber": 2329,
          "text": "        var dd = $(\"<div/>\").addClass(\"btn-group\");"
        },
        {
          "lineNumber": 2330,
          "text": "        var toggle = $(\"<button/>\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2327,
      "line": "        var rankwrap = $(\"<td/>\");",
      "context": [
        {
          "lineNumber": 2323,
          "text": "    entries.forEach(function (entry) {"
        },
        {
          "lineNumber": 2324,
          "text": "        var tr = $(\"<tr/>\").addClass(\"cs-chanrank-tr-\" + entry.name);"
        },
        {
          "lineNumber": 2325,
          "text": "        var name = $(\"<td/>\").text(entry.name).appendTo(tr);"
        },
        {
          "lineNumber": 2326,
          "text": "        name.addClass(getNameColor(entry.rank));"
        },
        {
          "lineNumber": 2327,
          "text": "        var rankwrap = $(\"<td/>\");"
        },
        {
          "lineNumber": 2328,
          "text": "        var rank = $(\"<span/>\").text(entry.rank).appendTo(rankwrap);"
        },
        {
          "lineNumber": 2329,
          "text": "        var dd = $(\"<div/>\").addClass(\"btn-group\");"
        },
        {
          "lineNumber": 2330,
          "text": "        var toggle = $(\"<button/>\")"
        },
        {
          "lineNumber": 2331,
          "text": "            .addClass(\"btn btn-xs btn-default dropdown-toggle\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2328,
      "line": "        var rank = $(\"<span/>\").text(entry.rank).appendTo(rankwrap);",
      "context": [
        {
          "lineNumber": 2324,
          "text": "        var tr = $(\"<tr/>\").addClass(\"cs-chanrank-tr-\" + entry.name);"
        },
        {
          "lineNumber": 2325,
          "text": "        var name = $(\"<td/>\").text(entry.name).appendTo(tr);"
        },
        {
          "lineNumber": 2326,
          "text": "        name.addClass(getNameColor(entry.rank));"
        },
        {
          "lineNumber": 2327,
          "text": "        var rankwrap = $(\"<td/>\");"
        },
        {
          "lineNumber": 2328,
          "text": "        var rank = $(\"<span/>\").text(entry.rank).appendTo(rankwrap);"
        },
        {
          "lineNumber": 2329,
          "text": "        var dd = $(\"<div/>\").addClass(\"btn-group\");"
        },
        {
          "lineNumber": 2330,
          "text": "        var toggle = $(\"<button/>\")"
        },
        {
          "lineNumber": 2331,
          "text": "            .addClass(\"btn btn-xs btn-default dropdown-toggle\")"
        },
        {
          "lineNumber": 2332,
          "text": "            .attr(\"data-toggle\", \"dropdown\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2335,
      "line": "        if (CLIENT.rank <= entry.rank && !(CLIENT.rank === 4 && entry.rank === 4)) {",
      "context": [
        {
          "lineNumber": 2331,
          "text": "            .addClass(\"btn btn-xs btn-default dropdown-toggle\")"
        },
        {
          "lineNumber": 2332,
          "text": "            .attr(\"data-toggle\", \"dropdown\")"
        },
        {
          "lineNumber": 2333,
          "text": "            .html(\"Edit <span class=caret></span>\")"
        },
        {
          "lineNumber": 2334,
          "text": "            .appendTo(dd);"
        },
        {
          "lineNumber": 2335,
          "text": "        if (CLIENT.rank <= entry.rank && !(CLIENT.rank === 4 && entry.rank === 4)) {"
        },
        {
          "lineNumber": 2336,
          "text": "            toggle.addClass(\"disabled\");"
        },
        {
          "lineNumber": 2337,
          "text": "        }"
        },
        {
          "lineNumber": 2338,
          "text": ""
        },
        {
          "lineNumber": 2339,
          "text": "        var menu = $(\"<ul/>\").addClass(\"dropdown-menu\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2343,
      "line": "        var ranks = [",
      "context": [
        {
          "lineNumber": 2339,
          "text": "        var menu = $(\"<ul/>\").addClass(\"dropdown-menu\")"
        },
        {
          "lineNumber": 2340,
          "text": "            .attr(\"role\", \"menu\")"
        },
        {
          "lineNumber": 2341,
          "text": "            .appendTo(dd);"
        },
        {
          "lineNumber": 2342,
          "text": ""
        },
        {
          "lineNumber": 2343,
          "text": "        var ranks = ["
        },
        {
          "lineNumber": 2344,
          "text": "            { name: \"Remove Moderator\", rank: 1 },"
        },
        {
          "lineNumber": 2345,
          "text": "            { name: \"Moderator\", rank: 2 },"
        },
        {
          "lineNumber": 2346,
          "text": "            { name: \"Admin\", rank: 3 },"
        },
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2344,
      "line": "            { name: \"Remove Moderator\", rank: 1 },",
      "context": [
        {
          "lineNumber": 2340,
          "text": "            .attr(\"role\", \"menu\")"
        },
        {
          "lineNumber": 2341,
          "text": "            .appendTo(dd);"
        },
        {
          "lineNumber": 2342,
          "text": ""
        },
        {
          "lineNumber": 2343,
          "text": "        var ranks = ["
        },
        {
          "lineNumber": 2344,
          "text": "            { name: \"Remove Moderator\", rank: 1 },"
        },
        {
          "lineNumber": 2345,
          "text": "            { name: \"Moderator\", rank: 2 },"
        },
        {
          "lineNumber": 2346,
          "text": "            { name: \"Admin\", rank: 3 },"
        },
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        },
        {
          "lineNumber": 2348,
          "text": "            { name: \"Founder\", rank: 5 }"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2345,
      "line": "            { name: \"Moderator\", rank: 2 },",
      "context": [
        {
          "lineNumber": 2341,
          "text": "            .appendTo(dd);"
        },
        {
          "lineNumber": 2342,
          "text": ""
        },
        {
          "lineNumber": 2343,
          "text": "        var ranks = ["
        },
        {
          "lineNumber": 2344,
          "text": "            { name: \"Remove Moderator\", rank: 1 },"
        },
        {
          "lineNumber": 2345,
          "text": "            { name: \"Moderator\", rank: 2 },"
        },
        {
          "lineNumber": 2346,
          "text": "            { name: \"Admin\", rank: 3 },"
        },
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        },
        {
          "lineNumber": 2348,
          "text": "            { name: \"Founder\", rank: 5 }"
        },
        {
          "lineNumber": 2349,
          "text": "        ];"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2346,
      "line": "            { name: \"Admin\", rank: 3 },",
      "context": [
        {
          "lineNumber": 2342,
          "text": ""
        },
        {
          "lineNumber": 2343,
          "text": "        var ranks = ["
        },
        {
          "lineNumber": 2344,
          "text": "            { name: \"Remove Moderator\", rank: 1 },"
        },
        {
          "lineNumber": 2345,
          "text": "            { name: \"Moderator\", rank: 2 },"
        },
        {
          "lineNumber": 2346,
          "text": "            { name: \"Admin\", rank: 3 },"
        },
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        },
        {
          "lineNumber": 2348,
          "text": "            { name: \"Founder\", rank: 5 }"
        },
        {
          "lineNumber": 2349,
          "text": "        ];"
        },
        {
          "lineNumber": 2350,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2347,
      "line": "            { name: \"Owner\", rank: 4 },",
      "context": [
        {
          "lineNumber": 2343,
          "text": "        var ranks = ["
        },
        {
          "lineNumber": 2344,
          "text": "            { name: \"Remove Moderator\", rank: 1 },"
        },
        {
          "lineNumber": 2345,
          "text": "            { name: \"Moderator\", rank: 2 },"
        },
        {
          "lineNumber": 2346,
          "text": "            { name: \"Admin\", rank: 3 },"
        },
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        },
        {
          "lineNumber": 2348,
          "text": "            { name: \"Founder\", rank: 5 }"
        },
        {
          "lineNumber": 2349,
          "text": "        ];"
        },
        {
          "lineNumber": 2350,
          "text": ""
        },
        {
          "lineNumber": 2351,
          "text": "        ranks.forEach(function (r) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2348,
      "line": "            { name: \"Founder\", rank: 5 }",
      "context": [
        {
          "lineNumber": 2344,
          "text": "            { name: \"Remove Moderator\", rank: 1 },"
        },
        {
          "lineNumber": 2345,
          "text": "            { name: \"Moderator\", rank: 2 },"
        },
        {
          "lineNumber": 2346,
          "text": "            { name: \"Admin\", rank: 3 },"
        },
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        },
        {
          "lineNumber": 2348,
          "text": "            { name: \"Founder\", rank: 5 }"
        },
        {
          "lineNumber": 2349,
          "text": "        ];"
        },
        {
          "lineNumber": 2350,
          "text": ""
        },
        {
          "lineNumber": 2351,
          "text": "        ranks.forEach(function (r) {"
        },
        {
          "lineNumber": 2352,
          "text": "            var li = $(\"<li/>\").appendTo(menu);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2351,
      "line": "        ranks.forEach(function (r) {",
      "context": [
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        },
        {
          "lineNumber": 2348,
          "text": "            { name: \"Founder\", rank: 5 }"
        },
        {
          "lineNumber": 2349,
          "text": "        ];"
        },
        {
          "lineNumber": 2350,
          "text": ""
        },
        {
          "lineNumber": 2351,
          "text": "        ranks.forEach(function (r) {"
        },
        {
          "lineNumber": 2352,
          "text": "            var li = $(\"<li/>\").appendTo(menu);"
        },
        {
          "lineNumber": 2353,
          "text": "            var a = $(\"<a/>\")"
        },
        {
          "lineNumber": 2354,
          "text": "                .addClass(getNameColor(r.rank))"
        },
        {
          "lineNumber": 2355,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2354,
      "line": "                .addClass(getNameColor(r.rank))",
      "context": [
        {
          "lineNumber": 2350,
          "text": ""
        },
        {
          "lineNumber": 2351,
          "text": "        ranks.forEach(function (r) {"
        },
        {
          "lineNumber": 2352,
          "text": "            var li = $(\"<li/>\").appendTo(menu);"
        },
        {
          "lineNumber": 2353,
          "text": "            var a = $(\"<a/>\")"
        },
        {
          "lineNumber": 2354,
          "text": "                .addClass(getNameColor(r.rank))"
        },
        {
          "lineNumber": 2355,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        },
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2358,
      "line": "            if (r.rank !== entry.rank) {",
      "context": [
        {
          "lineNumber": 2354,
          "text": "                .addClass(getNameColor(r.rank))"
        },
        {
          "lineNumber": 2355,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        },
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2360,
      "line": "                    socket.emit(\"setChannelRank\", {",
      "context": [
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        },
        {
          "lineNumber": 2363,
          "text": "                    });"
        },
        {
          "lineNumber": 2364,
          "text": "                });"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2362,
      "line": "                        rank: r.rank",
      "context": [
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        },
        {
          "lineNumber": 2363,
          "text": "                    });"
        },
        {
          "lineNumber": 2364,
          "text": "                });"
        },
        {
          "lineNumber": 2365,
          "text": "            } else {"
        },
        {
          "lineNumber": 2366,
          "text": "                $(\"<span/>\").addClass(\"glyphicon glyphicon-ok\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2371,
      "line": "            if (r.rank > CLIENT.rank || (CLIENT.rank < 4 && r.rank === CLIENT.rank)) {",
      "context": [
        {
          "lineNumber": 2367,
          "text": "                    .appendTo(a);"
        },
        {
          "lineNumber": 2368,
          "text": "                li.addClass(\"disabled\");"
        },
        {
          "lineNumber": 2369,
          "text": "            }"
        },
        {
          "lineNumber": 2370,
          "text": ""
        },
        {
          "lineNumber": 2371,
          "text": "            if (r.rank > CLIENT.rank || (CLIENT.rank < 4 && r.rank === CLIENT.rank)) {"
        },
        {
          "lineNumber": 2372,
          "text": "                li.addClass(\"disabled\");"
        },
        {
          "lineNumber": 2373,
          "text": "            }"
        },
        {
          "lineNumber": 2374,
          "text": "        });"
        },
        {
          "lineNumber": 2375,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2376,
      "line": "        dd.css(\"margin-right\", \"10px\").prependTo(rankwrap);",
      "context": [
        {
          "lineNumber": 2372,
          "text": "                li.addClass(\"disabled\");"
        },
        {
          "lineNumber": 2373,
          "text": "            }"
        },
        {
          "lineNumber": 2374,
          "text": "        });"
        },
        {
          "lineNumber": 2375,
          "text": ""
        },
        {
          "lineNumber": 2376,
          "text": "        dd.css(\"margin-right\", \"10px\").prependTo(rankwrap);"
        },
        {
          "lineNumber": 2377,
          "text": "        rankwrap.appendTo(tr);"
        },
        {
          "lineNumber": 2378,
          "text": "        tr.appendTo(tbl);"
        },
        {
          "lineNumber": 2379,
          "text": "    });"
        },
        {
          "lineNumber": 2380,
          "text": "}"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2377,
      "line": "        rankwrap.appendTo(tr);",
      "context": [
        {
          "lineNumber": 2373,
          "text": "            }"
        },
        {
          "lineNumber": 2374,
          "text": "        });"
        },
        {
          "lineNumber": 2375,
          "text": ""
        },
        {
          "lineNumber": 2376,
          "text": "        dd.css(\"margin-right\", \"10px\").prependTo(rankwrap);"
        },
        {
          "lineNumber": 2377,
          "text": "        rankwrap.appendTo(tr);"
        },
        {
          "lineNumber": 2378,
          "text": "        tr.appendTo(tbl);"
        },
        {
          "lineNumber": 2379,
          "text": "    });"
        },
        {
          "lineNumber": 2380,
          "text": "}"
        },
        {
          "lineNumber": 2381,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2794,
      "line": "            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {",
      "context": [
        {
          "lineNumber": 2790,
          "text": "            if (msg.trim() === \"\") {"
        },
        {
          "lineNumber": 2791,
          "text": "                return;"
        },
        {
          "lineNumber": 2792,
          "text": "            }"
        },
        {
          "lineNumber": 2793,
          "text": ""
        },
        {
          "lineNumber": 2794,
          "text": "            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2795,
      "line": "                meta.modflair = CLIENT.rank;",
      "context": [
        {
          "lineNumber": 2791,
          "text": "                return;"
        },
        {
          "lineNumber": 2792,
          "text": "            }"
        },
        {
          "lineNumber": 2793,
          "text": ""
        },
        {
          "lineNumber": 2794,
          "text": "            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2798,
      "line": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {",
      "context": [
        {
          "lineNumber": 2794,
          "text": "            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2800,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 2801,
          "text": "            }"
        },
        {
          "lineNumber": 2802,
          "text": "            socket.emit(\"pm\", {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2799,
      "line": "                meta.modflair = CLIENT.rank;",
      "context": [
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2800,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 2801,
          "text": "            }"
        },
        {
          "lineNumber": 2802,
          "text": "            socket.emit(\"pm\", {"
        },
        {
          "lineNumber": 2803,
          "text": "                to: user,"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 3488,
      "line": "    div.data(\"rank\", data.rank);",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 93,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 99,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 105,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 243,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 249,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 255,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 364,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 370,
      "line": "            if (status.playbackState === \"ended\" && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 481,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 487,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 492,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 618,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 624,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 629,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 767,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 773,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 779,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 904,
      "line": "        if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 908,
      "line": "      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1005,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1011,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1017,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1182,
      "line": "                  if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1555,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1561,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1567,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1954,
      "line": "    if (CLIENT.leader || !USEROPTS.synch) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 93,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 99,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 105,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 243,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 249,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 255,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 364,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 370,
      "line": "            if (status.playbackState === \"ended\" && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 481,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 487,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 492,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 618,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 624,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 629,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 767,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 773,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 779,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 904,
      "line": "        if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 908,
      "line": "      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1005,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1011,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1017,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1182,
      "line": "                  if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1555,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1561,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1567,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1954,
      "line": "    if (CLIENT.leader || !USEROPTS.synch) {",
      "context": [
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
        }
      ]
    }
  ],
  "errors": []
}

(async()=>{/*
WS-069 — CYTUBE LEADER ASSIGNMENT SOURCE SCAN

READ-ONLY / SOURCE INSPECTION

The full richly-commented version of this test is archived as:
WS-069-CYTUBE-LEADER-ASSIGNMENT-SOURCE-SCAN-TEST.js

This execution:
- fetches the live CyTube core source files
- searches for leader/rank assignment mechanisms
- captures source context
- records current CLIENT.rank / CLIENT.leader
- performs NO Socket.IO emits
- changes nothing
- stores the complete result in window.__WS069_DATA__

After this finishes, we will use one separate synchronous command to
copy the actual result to the clipboard.
*/
const TEST_ID="WS-069";
const started=new Date().toISOString();
const patterns=["CLIENT.leader","setLeader","assignLeader","leaderctl","borrow-rank","borrowRank","leader","rank"];
const wanted=["/js/callbacks.js","/js/ui.js","/js/util.js","/js/player.js"];
const errors=[],files=[],matches=[];
const runtime={
 channelName:window.CHANNEL?.name??null,
 clientRank:window.CLIENT?.rank??null,
 clientLeader:window.CLIENT?.leader??null,
 clientExists:!!window.CLIENT,
 channelExists:!!window.CHANNEL,
 socketExists:!!window.socket,
 socketConnected:!!window.socket?.connected
};
let userlistSnapshot=null;
try{
 const candidates=[window.USERS,window.USERLIST,window.userlist,window.Users];
 for(const candidate of candidates){
  if(candidate&&typeof candidate==="object"){
   userlistSnapshot={
    sourceType:Array.isArray(candidate)?"array":"object",
    keys:Object.keys(candidate).slice(0,100)
   };
   break;
  }
 }
}catch(e){errors.push({stage:"userlistSnapshot",error:String(e)})}
for(const wantedPath of wanted){
 try{
  const script=[...document.scripts].find(s=>{
   try{return new URL(s.src,location.href).pathname===wantedPath}catch(_){return false}
  });
  if(!script||!script.src){
   errors.push({stage:"locateScript",path:wantedPath,error:"Script tag not found on current page"});
   continue;
  }
  const url=new URL(script.src,location.href).href;
  const response=await fetch(url,{credentials:"include",cache:"no-store"});
  if(!response.ok){
   errors.push({stage:"fetch",url,status:response.status,statusText:response.statusText});
   continue;
  }
  const source=await response.text();
  const lines=source.split(/\r?\n/);
  files.push({path:wantedPath,url,lineCount:lines.length,sourceLength:source.length});
  for(const pattern of patterns){
   for(let i=0;i<lines.length;i++){
    if(!lines[i].toLowerCase().includes(pattern.toLowerCase()))continue;
    const context=[];
    const start=Math.max(0,i-4),end=Math.min(lines.length-1,i+4);
    for(let j=start;j<=end;j++)context.push({lineNumber:j+1,text:lines[j]});
    matches.push({url,path:wantedPath,pattern,lineNumber:i+1,line:lines[i],context});
   }
  }
 }catch(e){
  errors.push({stage:"scan",path:wantedPath,error:String(e),stack:e?.stack||null});
 }
}
const highValue=matches.filter(m=>{
 const text=m.context.map(x=>x.text).join("\n");
 return /CLIENT\.leader|setLeader|assignLeader|leaderctl|borrow-rank|borrowRank|socket\.emit\s*\(/i.test(text);
});
const emitMatches=matches.filter(m=>/socket\.emit\s*\(/i.test(m.context.map(x=>x.text).join("\n"))).map(m=>({
 path:m.path,url:m.url,lineNumber:m.lineNumber,pattern:m.pattern,context:m.context
}));
window.__WS069_DATA__={
 test:TEST_ID,
 status:"COMPLETE",
 started,
 completed:new Date().toISOString(),
 page:{url:location.href,title:document.title,readyState:document.readyState},
 runtime,
 userlistSnapshot,
 files,
 summary:{
  fileCount:files.length,
  matchCount:matches.length,
  highValueMatchCount:highValue.length,
  emitContextCount:emitMatches.length,
  patterns
 },
 highValue,
 emitMatches,
 matches,
 errors
};
console.log("WS-069 COMPLETE — result stored in window.__WS069_DATA__");
console.log({
 fileCount:files.length,
 matchCount:matches.length,
 highValueMatchCount:highValue.length,
 emitContextCount:emitMatches.length,
 errors:errors.length
});
})();

{
  "test": "WS-069",
  "status": "COMPLETE",
  "started": "2026-09-07T18:02:48.513Z",
  "completed": "2026-09-07T18:02:49.669Z",
  "page": {
    "url": "https://cytu.be/r/American-Dad",
    "title": "❌❌❌ AMERICAN DAD ❌❌ WATCH THE HILARIOUS SHOW IN ITS ENTIRETY!!!! ❌❌❌",
    "readyState": "complete"
  },
  "runtime": {
    "channelName": "American-Dad",
    "clientRank": 1,
    "clientLeader": false,
    "clientExists": true,
    "channelExists": true,
    "socketExists": true,
    "socketConnected": true
  },
  "userlistSnapshot": {
    "sourceType": "object",
    "keys": []
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
  "summary": {
    "fileCount": 4,
    "matchCount": 205,
    "highValueMatchCount": 96,
    "emitContextCount": 40,
    "patterns": [
      "CLIENT.leader",
      "setLeader",
      "assignLeader",
      "leaderctl",
      "borrow-rank",
      "borrowRank",
      "leader",
      "rank"
    ]
  },
  "highValue": [
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 586,
      "line": "            CLIENT.leader = false;",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 599,
      "line": "            CLIENT.leader = true;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 605,
      "line": "        } else if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 606,
      "line": "            CLIENT.leader = false;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "setLeader",
      "lineNumber": 577,
      "line": "    setLeader: function (name) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "borrow-rank",
      "lineNumber": 450,
      "line": "                        socket.emit(\"borrow-rank\", r);",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 577,
      "line": "    setLeader: function (name) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 580,
      "line": "            if ($(this).data(\"leader\")) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 581,
      "line": "                $(this).data(\"leader\", false);",
      "context": [
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
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 586,
      "line": "            CLIENT.leader = false;",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 599,
      "line": "            CLIENT.leader = true;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 600,
      "line": "            // I'm a leader!  Set up sync function",
      "context": [
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
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 605,
      "line": "        } else if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 606,
      "line": "            CLIENT.leader = false;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 450,
      "line": "                        socket.emit(\"borrow-rank\", r);",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 185,
      "line": "                meta.modflair = CLIENT.rank;",
      "context": [
        {
          "lineNumber": 181,
          "text": "            }"
        },
        {
          "lineNumber": 182,
          "text": ""
        },
        {
          "lineNumber": 183,
          "text": "            // The /m command no longer exists, so emulate it clientside"
        },
        {
          "lineNumber": 184,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 185,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 186,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 187,
          "text": "            }"
        },
        {
          "lineNumber": 188,
          "text": ""
        },
        {
          "lineNumber": 189,
          "text": "            socket.emit(\"chatMsg\", {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 597,
      "line": "/* channel ranks stuff */",
      "context": [
        {
          "lineNumber": 593,
          "text": "        socket.emit(\"shufflePlaylist\");"
        },
        {
          "lineNumber": 594,
          "text": "    }"
        },
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 598,
      "line": "function chanrankSubmit(rank) {",
      "context": [
        {
          "lineNumber": 594,
          "text": "    }"
        },
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 599,
      "line": "    var name = $(\"#cs-chanranks-name\").val();",
      "context": [
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 600,
      "line": "    socket.emit(\"setChannelRank\", {",
      "context": [
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 602,
      "line": "        rank: rank",
      "context": [
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        },
        {
          "lineNumber": 605,
          "text": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));"
        },
        {
          "lineNumber": 606,
          "text": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1463,
      "line": "    if (!CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "assignLeader",
      "lineNumber": 270,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "assignLeader",
      "lineNumber": 277,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leaderctl",
      "lineNumber": 264,
      "line": "    if (hasPermission(\"leaderctl\")) {",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leaderctl",
      "lineNumber": 2032,
      "line": "    makeOption(\"Assign/Remove leader\", \"leaderctl\", modplus, CHANNEL.perms.leaderctl+\"\");",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 263,
      "line": "    /* give/remove leader (moderator+ only) */",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 264,
      "line": "    if (hasPermission(\"leaderctl\")) {",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 267,
      "line": "        if(leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 268,
      "line": "            ldr.text(\"Remove Leader\");",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 270,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 275,
      "line": "            ldr.text(\"Give Leader\");",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 277,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 1463,
      "line": "    if (!CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2032,
      "line": "    makeOption(\"Assign/Remove leader\", \"leaderctl\", modplus, CHANNEL.perms.leaderctl+\"\");",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2033,
      "line": "    makeOption(\"Mute users\", \"mute\", modleader, CHANNEL.perms.mute+\"\");",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2034,
      "line": "    makeOption(\"Kick users\", \"kick\", modleader, CHANNEL.perms.kick+\"\");",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2358,
      "line": "            if (r.rank !== entry.rank) {",
      "context": [
        {
          "lineNumber": 2354,
          "text": "                .addClass(getNameColor(r.rank))"
        },
        {
          "lineNumber": 2355,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        },
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2360,
      "line": "                    socket.emit(\"setChannelRank\", {",
      "context": [
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        },
        {
          "lineNumber": 2363,
          "text": "                    });"
        },
        {
          "lineNumber": 2364,
          "text": "                });"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2362,
      "line": "                        rank: r.rank",
      "context": [
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        },
        {
          "lineNumber": 2363,
          "text": "                    });"
        },
        {
          "lineNumber": 2364,
          "text": "                });"
        },
        {
          "lineNumber": 2365,
          "text": "            } else {"
        },
        {
          "lineNumber": 2366,
          "text": "                $(\"<span/>\").addClass(\"glyphicon glyphicon-ok\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2798,
      "line": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {",
      "context": [
        {
          "lineNumber": 2794,
          "text": "            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2800,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 2801,
          "text": "            }"
        },
        {
          "lineNumber": 2802,
          "text": "            socket.emit(\"pm\", {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2799,
      "line": "                meta.modflair = CLIENT.rank;",
      "context": [
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2800,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 2801,
          "text": "            }"
        },
        {
          "lineNumber": 2802,
          "text": "            socket.emit(\"pm\", {"
        },
        {
          "lineNumber": 2803,
          "text": "                to: user,"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 93,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 99,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 105,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 243,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 249,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 255,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 364,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 370,
      "line": "            if (status.playbackState === \"ended\" && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 481,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 487,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 492,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 618,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 624,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 629,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 767,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 773,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 779,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 904,
      "line": "        if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 908,
      "line": "      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1005,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1011,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1017,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1182,
      "line": "                  if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1555,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1561,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1567,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1954,
      "line": "    if (CLIENT.leader || !USEROPTS.synch) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 93,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 99,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 105,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 243,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 249,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 255,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 364,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 370,
      "line": "            if (status.playbackState === \"ended\" && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 481,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 487,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 492,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 618,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 624,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 629,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 767,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 773,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 779,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 904,
      "line": "        if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 908,
      "line": "      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1005,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1011,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1017,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1182,
      "line": "                  if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1555,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1561,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1567,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1954,
      "line": "    if (CLIENT.leader || !USEROPTS.synch) {",
      "context": [
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
        }
      ]
    }
  ],
  "emitMatches": [
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 450,
      "pattern": "borrow-rank",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/callbacks.js",
      "url": "https://cytu.be/js/callbacks.js",
      "lineNumber": 450,
      "pattern": "rank",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineNumber": 185,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 181,
          "text": "            }"
        },
        {
          "lineNumber": 182,
          "text": ""
        },
        {
          "lineNumber": 183,
          "text": "            // The /m command no longer exists, so emulate it clientside"
        },
        {
          "lineNumber": 184,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 185,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 186,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 187,
          "text": "            }"
        },
        {
          "lineNumber": 188,
          "text": ""
        },
        {
          "lineNumber": 189,
          "text": "            socket.emit(\"chatMsg\", {"
        }
      ]
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineNumber": 597,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 593,
          "text": "        socket.emit(\"shufflePlaylist\");"
        },
        {
          "lineNumber": 594,
          "text": "    }"
        },
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        }
      ]
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineNumber": 598,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 594,
          "text": "    }"
        },
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        }
      ]
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineNumber": 599,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        }
      ]
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineNumber": 600,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        }
      ]
    },
    {
      "path": "/js/ui.js",
      "url": "https://cytu.be/js/ui.js",
      "lineNumber": 602,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        },
        {
          "lineNumber": 605,
          "text": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));"
        },
        {
          "lineNumber": 606,
          "text": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 270,
      "pattern": "assignLeader",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 277,
      "pattern": "assignLeader",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 267,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 268,
      "pattern": "leader",
      "context": [
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
      "lineNumber": 270,
      "pattern": "leader",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 275,
      "pattern": "leader",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 277,
      "pattern": "leader",
      "context": [
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
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2358,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 2354,
          "text": "                .addClass(getNameColor(r.rank))"
        },
        {
          "lineNumber": 2355,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        },
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2360,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        },
        {
          "lineNumber": 2363,
          "text": "                    });"
        },
        {
          "lineNumber": 2364,
          "text": "                });"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2362,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        },
        {
          "lineNumber": 2363,
          "text": "                    });"
        },
        {
          "lineNumber": 2364,
          "text": "                });"
        },
        {
          "lineNumber": 2365,
          "text": "            } else {"
        },
        {
          "lineNumber": 2366,
          "text": "                $(\"<span/>\").addClass(\"glyphicon glyphicon-ok\")"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2798,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 2794,
          "text": "            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2800,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 2801,
          "text": "            }"
        },
        {
          "lineNumber": 2802,
          "text": "            socket.emit(\"pm\", {"
        }
      ]
    },
    {
      "path": "/js/util.js",
      "url": "https://cytu.be/js/util.js",
      "lineNumber": 2799,
      "pattern": "rank",
      "context": [
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2800,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 2801,
          "text": "            }"
        },
        {
          "lineNumber": 2802,
          "text": "            socket.emit(\"pm\", {"
        },
        {
          "lineNumber": 2803,
          "text": "                to: user,"
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 93,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 243,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 370,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 492,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 629,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 767,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 908,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1005,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1182,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1555,
      "pattern": "CLIENT.leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 93,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 243,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 370,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 492,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 629,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 767,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 908,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1005,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1182,
      "pattern": "leader",
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
        }
      ]
    },
    {
      "path": "/js/player.js",
      "url": "https://cytu.be/js/player.js",
      "lineNumber": 1555,
      "pattern": "leader",
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
        }
      ]
    }
  ],
  "matches": [
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 586,
      "line": "            CLIENT.leader = false;",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 599,
      "line": "            CLIENT.leader = true;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 605,
      "line": "        } else if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 606,
      "line": "            CLIENT.leader = false;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "setLeader",
      "lineNumber": 577,
      "line": "    setLeader: function (name) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "borrow-rank",
      "lineNumber": 450,
      "line": "                        socket.emit(\"borrow-rank\", r);",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 577,
      "line": "    setLeader: function (name) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 580,
      "line": "            if ($(this).data(\"leader\")) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 581,
      "line": "                $(this).data(\"leader\", false);",
      "context": [
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
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 586,
      "line": "            CLIENT.leader = false;",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 594,
      "line": "            user.data(\"leader\", true);",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 599,
      "line": "            CLIENT.leader = true;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 600,
      "line": "            // I'm a leader!  Set up sync function",
      "context": [
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
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 605,
      "line": "        } else if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "leader",
      "lineNumber": 606,
      "line": "            CLIENT.leader = false;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 386,
      "line": "    channelRanks: function(entries) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 387,
      "line": "        var tbl = $(\"#cs-chanranks table\");",
      "context": [
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
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 392,
      "line": "    channelRankFail: function (data) {",
      "context": [
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
        },
        {
          "lineNumber": 392,
          "text": "    channelRankFail: function (data) {"
        },
        {
          "lineNumber": 393,
          "text": "        if ($(\"#cs-chanranks\").is(\":visible\")) {"
        },
        {
          "lineNumber": 394,
          "text": "            makeAlert(\"Error\", data.msg, \"alert-danger\")"
        },
        {
          "lineNumber": 395,
          "text": "                .removeClass().addClass(\"vertical-spacer\")"
        },
        {
          "lineNumber": 396,
          "text": "                .insertAfter($(\"#cs-chanranks form\"));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 393,
      "line": "        if ($(\"#cs-chanranks\").is(\":visible\")) {",
      "context": [
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
        },
        {
          "lineNumber": 392,
          "text": "    channelRankFail: function (data) {"
        },
        {
          "lineNumber": 393,
          "text": "        if ($(\"#cs-chanranks\").is(\":visible\")) {"
        },
        {
          "lineNumber": 394,
          "text": "            makeAlert(\"Error\", data.msg, \"alert-danger\")"
        },
        {
          "lineNumber": 395,
          "text": "                .removeClass().addClass(\"vertical-spacer\")"
        },
        {
          "lineNumber": 396,
          "text": "                .insertAfter($(\"#cs-chanranks form\"));"
        },
        {
          "lineNumber": 397,
          "text": "        } else {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 396,
      "line": "                .insertAfter($(\"#cs-chanranks form\"));",
      "context": [
        {
          "lineNumber": 392,
          "text": "    channelRankFail: function (data) {"
        },
        {
          "lineNumber": 393,
          "text": "        if ($(\"#cs-chanranks\").is(\":visible\")) {"
        },
        {
          "lineNumber": 394,
          "text": "            makeAlert(\"Error\", data.msg, \"alert-danger\")"
        },
        {
          "lineNumber": 395,
          "text": "                .removeClass().addClass(\"vertical-spacer\")"
        },
        {
          "lineNumber": 396,
          "text": "                .insertAfter($(\"#cs-chanranks form\"));"
        },
        {
          "lineNumber": 397,
          "text": "        } else {"
        },
        {
          "lineNumber": 398,
          "text": "            Callbacks.noflood({ action: \"/rank\", msg: data.msg });"
        },
        {
          "lineNumber": 399,
          "text": "        }"
        },
        {
          "lineNumber": 400,
          "text": "    },"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 398,
      "line": "            Callbacks.noflood({ action: \"/rank\", msg: data.msg });",
      "context": [
        {
          "lineNumber": 394,
          "text": "            makeAlert(\"Error\", data.msg, \"alert-danger\")"
        },
        {
          "lineNumber": 395,
          "text": "                .removeClass().addClass(\"vertical-spacer\")"
        },
        {
          "lineNumber": 396,
          "text": "                .insertAfter($(\"#cs-chanranks form\"));"
        },
        {
          "lineNumber": 397,
          "text": "        } else {"
        },
        {
          "lineNumber": 398,
          "text": "            Callbacks.noflood({ action: \"/rank\", msg: data.msg });"
        },
        {
          "lineNumber": 399,
          "text": "        }"
        },
        {
          "lineNumber": 400,
          "text": "    },"
        },
        {
          "lineNumber": 401,
          "text": ""
        },
        {
          "lineNumber": 402,
          "text": "    readChanLog: function (data) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 426,
      "line": "    /* REGION Rank Stuff */",
      "context": [
        {
          "lineNumber": 422,
          "text": ""
        },
        {
          "lineNumber": 423,
          "text": "        icon.prependTo($(\"#voteskip\"));"
        },
        {
          "lineNumber": 424,
          "text": "    },"
        },
        {
          "lineNumber": 425,
          "text": ""
        },
        {
          "lineNumber": 426,
          "text": "    /* REGION Rank Stuff */"
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 428,
      "line": "    rank: function(r) {",
      "context": [
        {
          "lineNumber": 424,
          "text": "    },"
        },
        {
          "lineNumber": 425,
          "text": ""
        },
        {
          "lineNumber": 426,
          "text": "    /* REGION Rank Stuff */"
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 431,
      "line": "        CLIENT.rank = r;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 433,
      "line": "        if(SUPERADMIN && $(\"#setrank\").length == 0) {",
      "context": [
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
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 435,
      "line": "                .attr(\"id\", \"setrank\")",
      "context": [
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
        },
        {
          "lineNumber": 438,
          "text": "                .attr(\"data-toggle\", \"dropdown\")"
        },
        {
          "lineNumber": 439,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 440,
      "line": "                .html(\"Set Rank <b class='caret'></b>\")",
      "context": [
        {
          "lineNumber": 436,
          "text": "                .appendTo($(\".nav\")[0]);"
        },
        {
          "lineNumber": 437,
          "text": "            $(\"<a/>\").addClass(\"dropdown-toggle\")"
        },
        {
          "lineNumber": 438,
          "text": "                .attr(\"data-toggle\", \"dropdown\")"
        },
        {
          "lineNumber": 439,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        },
        {
          "lineNumber": 440,
          "text": "                .html(\"Set Rank <b class='caret'></b>\")"
        },
        {
          "lineNumber": 441,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 442,
          "text": "            var menu = $(\"<ul/>\").addClass(\"dropdown-menu\")"
        },
        {
          "lineNumber": 443,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 444,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 445,
      "line": "            function addRank(r, disp) {",
      "context": [
        {
          "lineNumber": 441,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 442,
          "text": "            var menu = $(\"<ul/>\").addClass(\"dropdown-menu\")"
        },
        {
          "lineNumber": 443,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 444,
          "text": ""
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 450,
      "line": "                        socket.emit(\"borrow-rank\", r);",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 455,
      "line": "            addRank(0, \"<span class='userlist_guest'>Guest</span>\");",
      "context": [
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
        },
        {
          "lineNumber": 456,
          "text": "            addRank(1, \"<span>Registered</span>\");"
        },
        {
          "lineNumber": 457,
          "text": "            addRank(2, \"<span class='userlist_op'>Moderator</span>\");"
        },
        {
          "lineNumber": 458,
          "text": "            addRank(3, \"<span class='userlist_owner'>Admin</span>\");"
        },
        {
          "lineNumber": 459,
          "text": "            addRank(255, \"<span class='userlist_siteadmin'>Superadmin</span>\");"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 456,
      "line": "            addRank(1, \"<span>Registered</span>\");",
      "context": [
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
        },
        {
          "lineNumber": 456,
          "text": "            addRank(1, \"<span>Registered</span>\");"
        },
        {
          "lineNumber": 457,
          "text": "            addRank(2, \"<span class='userlist_op'>Moderator</span>\");"
        },
        {
          "lineNumber": 458,
          "text": "            addRank(3, \"<span class='userlist_owner'>Admin</span>\");"
        },
        {
          "lineNumber": 459,
          "text": "            addRank(255, \"<span class='userlist_siteadmin'>Superadmin</span>\");"
        },
        {
          "lineNumber": 460,
          "text": "        }"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 457,
      "line": "            addRank(2, \"<span class='userlist_op'>Moderator</span>\");",
      "context": [
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
        },
        {
          "lineNumber": 456,
          "text": "            addRank(1, \"<span>Registered</span>\");"
        },
        {
          "lineNumber": 457,
          "text": "            addRank(2, \"<span class='userlist_op'>Moderator</span>\");"
        },
        {
          "lineNumber": 458,
          "text": "            addRank(3, \"<span class='userlist_owner'>Admin</span>\");"
        },
        {
          "lineNumber": 459,
          "text": "            addRank(255, \"<span class='userlist_siteadmin'>Superadmin</span>\");"
        },
        {
          "lineNumber": 460,
          "text": "        }"
        },
        {
          "lineNumber": 461,
          "text": "    },"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 458,
      "line": "            addRank(3, \"<span class='userlist_owner'>Admin</span>\");",
      "context": [
        {
          "lineNumber": 454,
          "text": ""
        },
        {
          "lineNumber": 455,
          "text": "            addRank(0, \"<span class='userlist_guest'>Guest</span>\");"
        },
        {
          "lineNumber": 456,
          "text": "            addRank(1, \"<span>Registered</span>\");"
        },
        {
          "lineNumber": 457,
          "text": "            addRank(2, \"<span class='userlist_op'>Moderator</span>\");"
        },
        {
          "lineNumber": 458,
          "text": "            addRank(3, \"<span class='userlist_owner'>Admin</span>\");"
        },
        {
          "lineNumber": 459,
          "text": "            addRank(255, \"<span class='userlist_siteadmin'>Superadmin</span>\");"
        },
        {
          "lineNumber": 460,
          "text": "        }"
        },
        {
          "lineNumber": 461,
          "text": "    },"
        },
        {
          "lineNumber": 462,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 459,
      "line": "            addRank(255, \"<span class='userlist_siteadmin'>Superadmin</span>\");",
      "context": [
        {
          "lineNumber": 455,
          "text": "            addRank(0, \"<span class='userlist_guest'>Guest</span>\");"
        },
        {
          "lineNumber": 456,
          "text": "            addRank(1, \"<span>Registered</span>\");"
        },
        {
          "lineNumber": 457,
          "text": "            addRank(2, \"<span class='userlist_op'>Moderator</span>\");"
        },
        {
          "lineNumber": 458,
          "text": "            addRank(3, \"<span class='userlist_owner'>Admin</span>\");"
        },
        {
          "lineNumber": 459,
          "text": "            addRank(255, \"<span class='userlist_siteadmin'>Superadmin</span>\");"
        },
        {
          "lineNumber": 460,
          "text": "        }"
        },
        {
          "lineNumber": 461,
          "text": "    },"
        },
        {
          "lineNumber": 462,
          "text": ""
        },
        {
          "lineNumber": 463,
          "text": "    login: function(data) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 614,
      "line": "    setUserRank: function (data) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 616,
      "line": "        var entries = $(\"#cs-chanranks table\").data(\"entries\") || [];",
      "context": [
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
        },
        {
          "lineNumber": 620,
          "text": "                entries[i].rank = data.rank;"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 620,
      "line": "                entries[i].rank = data.rank;",
      "context": [
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
        },
        {
          "lineNumber": 620,
          "text": "                entries[i].rank = data.rank;"
        },
        {
          "lineNumber": 621,
          "text": "                found = i;"
        },
        {
          "lineNumber": 622,
          "text": "                break;"
        },
        {
          "lineNumber": 623,
          "text": "            }"
        },
        {
          "lineNumber": 624,
          "text": "        }"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 627,
      "line": "        } else if (entries[found].rank < 2) {",
      "context": [
        {
          "lineNumber": 623,
          "text": "            }"
        },
        {
          "lineNumber": 624,
          "text": "        }"
        },
        {
          "lineNumber": 625,
          "text": "        if (found === false) {"
        },
        {
          "lineNumber": 626,
          "text": "            entries.push(data);"
        },
        {
          "lineNumber": 627,
          "text": "        } else if (entries[found].rank < 2) {"
        },
        {
          "lineNumber": 628,
          "text": "            entries.splice(found, 1);"
        },
        {
          "lineNumber": 629,
          "text": "        }"
        },
        {
          "lineNumber": 630,
          "text": "        formatCSModList();"
        },
        {
          "lineNumber": 631,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 637,
      "line": "        user.data(\"rank\", data.rank);",
      "context": [
        {
          "lineNumber": 633,
          "text": "        if (user === null) {"
        },
        {
          "lineNumber": 634,
          "text": "            return;"
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 639,
      "line": "            CLIENT.rank = data.rank;",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/callbacks.js",
      "path": "/js/callbacks.js",
      "pattern": "rank",
      "lineNumber": 644,
      "line": "        if (USEROPTS.sort_rank) {",
      "context": [
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
        },
        {
          "lineNumber": 646,
          "text": "        }"
        },
        {
          "lineNumber": 647,
          "text": "    },"
        },
        {
          "lineNumber": 648,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 177,
      "line": "            if (USEROPTS.adminhat && CLIENT.rank >= 255) {",
      "context": [
        {
          "lineNumber": 173,
          "text": "        }"
        },
        {
          "lineNumber": 174,
          "text": "        var msg = $(\"#chatline\").val();"
        },
        {
          "lineNumber": 175,
          "text": "        if(msg.trim()) {"
        },
        {
          "lineNumber": 176,
          "text": "            var meta = {};"
        },
        {
          "lineNumber": 177,
          "text": "            if (USEROPTS.adminhat && CLIENT.rank >= 255) {"
        },
        {
          "lineNumber": 178,
          "text": "                msg = \"/a \" + msg;"
        },
        {
          "lineNumber": 179,
          "text": "            } else if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 180,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 181,
          "text": "            }"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 179,
      "line": "            } else if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {",
      "context": [
        {
          "lineNumber": 175,
          "text": "        if(msg.trim()) {"
        },
        {
          "lineNumber": 176,
          "text": "            var meta = {};"
        },
        {
          "lineNumber": 177,
          "text": "            if (USEROPTS.adminhat && CLIENT.rank >= 255) {"
        },
        {
          "lineNumber": 178,
          "text": "                msg = \"/a \" + msg;"
        },
        {
          "lineNumber": 179,
          "text": "            } else if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 180,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 181,
          "text": "            }"
        },
        {
          "lineNumber": 182,
          "text": ""
        },
        {
          "lineNumber": 183,
          "text": "            // The /m command no longer exists, so emulate it clientside"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 180,
      "line": "                meta.modflair = CLIENT.rank;",
      "context": [
        {
          "lineNumber": 176,
          "text": "            var meta = {};"
        },
        {
          "lineNumber": 177,
          "text": "            if (USEROPTS.adminhat && CLIENT.rank >= 255) {"
        },
        {
          "lineNumber": 178,
          "text": "                msg = \"/a \" + msg;"
        },
        {
          "lineNumber": 179,
          "text": "            } else if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 180,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 181,
          "text": "            }"
        },
        {
          "lineNumber": 182,
          "text": ""
        },
        {
          "lineNumber": 183,
          "text": "            // The /m command no longer exists, so emulate it clientside"
        },
        {
          "lineNumber": 184,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 184,
      "line": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {",
      "context": [
        {
          "lineNumber": 180,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 181,
          "text": "            }"
        },
        {
          "lineNumber": 182,
          "text": ""
        },
        {
          "lineNumber": 183,
          "text": "            // The /m command no longer exists, so emulate it clientside"
        },
        {
          "lineNumber": 184,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 185,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 186,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 187,
          "text": "            }"
        },
        {
          "lineNumber": 188,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 185,
      "line": "                meta.modflair = CLIENT.rank;",
      "context": [
        {
          "lineNumber": 181,
          "text": "            }"
        },
        {
          "lineNumber": 182,
          "text": ""
        },
        {
          "lineNumber": 183,
          "text": "            // The /m command no longer exists, so emulate it clientside"
        },
        {
          "lineNumber": 184,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 185,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 186,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 187,
          "text": "            }"
        },
        {
          "lineNumber": 188,
          "text": ""
        },
        {
          "lineNumber": 189,
          "text": "            socket.emit(\"chatMsg\", {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 597,
      "line": "/* channel ranks stuff */",
      "context": [
        {
          "lineNumber": 593,
          "text": "        socket.emit(\"shufflePlaylist\");"
        },
        {
          "lineNumber": 594,
          "text": "    }"
        },
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 598,
      "line": "function chanrankSubmit(rank) {",
      "context": [
        {
          "lineNumber": 594,
          "text": "    }"
        },
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 599,
      "line": "    var name = $(\"#cs-chanranks-name\").val();",
      "context": [
        {
          "lineNumber": 595,
          "text": "});"
        },
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 600,
      "line": "    socket.emit(\"setChannelRank\", {",
      "context": [
        {
          "lineNumber": 596,
          "text": ""
        },
        {
          "lineNumber": 597,
          "text": "/* channel ranks stuff */"
        },
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 602,
      "line": "        rank: rank",
      "context": [
        {
          "lineNumber": 598,
          "text": "function chanrankSubmit(rank) {"
        },
        {
          "lineNumber": 599,
          "text": "    var name = $(\"#cs-chanranks-name\").val();"
        },
        {
          "lineNumber": 600,
          "text": "    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        },
        {
          "lineNumber": 605,
          "text": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));"
        },
        {
          "lineNumber": 606,
          "text": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 605,
      "line": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));",
      "context": [
        {
          "lineNumber": 601,
          "text": "        name: name,"
        },
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        },
        {
          "lineNumber": 605,
          "text": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));"
        },
        {
          "lineNumber": 606,
          "text": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));"
        },
        {
          "lineNumber": 607,
          "text": "$(\"#cs-chanranks-owner\").on('click', chanrankSubmit.bind(this, 4));"
        },
        {
          "lineNumber": 608,
          "text": ""
        },
        {
          "lineNumber": 609,
          "text": "[\"#showmediaurl\", \"#showsearch\", \"#showcustomembed\", \"#showplaylistmanager\"]"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 606,
      "line": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));",
      "context": [
        {
          "lineNumber": 602,
          "text": "        rank: rank"
        },
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        },
        {
          "lineNumber": 605,
          "text": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));"
        },
        {
          "lineNumber": 606,
          "text": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));"
        },
        {
          "lineNumber": 607,
          "text": "$(\"#cs-chanranks-owner\").on('click', chanrankSubmit.bind(this, 4));"
        },
        {
          "lineNumber": 608,
          "text": ""
        },
        {
          "lineNumber": 609,
          "text": "[\"#showmediaurl\", \"#showsearch\", \"#showcustomembed\", \"#showplaylistmanager\"]"
        },
        {
          "lineNumber": 610,
          "text": "    .forEach(function (id) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/ui.js",
      "path": "/js/ui.js",
      "pattern": "rank",
      "lineNumber": 607,
      "line": "$(\"#cs-chanranks-owner\").on('click', chanrankSubmit.bind(this, 4));",
      "context": [
        {
          "lineNumber": 603,
          "text": "    });"
        },
        {
          "lineNumber": 604,
          "text": "}"
        },
        {
          "lineNumber": 605,
          "text": "$(\"#cs-chanranks-mod\").on('click', chanrankSubmit.bind(this, 2));"
        },
        {
          "lineNumber": 606,
          "text": "$(\"#cs-chanranks-adm\").on('click', chanrankSubmit.bind(this, 3));"
        },
        {
          "lineNumber": 607,
          "text": "$(\"#cs-chanranks-owner\").on('click', chanrankSubmit.bind(this, 4));"
        },
        {
          "lineNumber": 608,
          "text": ""
        },
        {
          "lineNumber": 609,
          "text": "[\"#showmediaurl\", \"#showsearch\", \"#showcustomembed\", \"#showplaylistmanager\"]"
        },
        {
          "lineNumber": 610,
          "text": "    .forEach(function (id) {"
        },
        {
          "lineNumber": 611,
          "text": "    $(id).on('click', function () {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1463,
      "line": "    if (!CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "assignLeader",
      "lineNumber": 270,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "assignLeader",
      "lineNumber": 277,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leaderctl",
      "lineNumber": 264,
      "line": "    if (hasPermission(\"leaderctl\")) {",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leaderctl",
      "lineNumber": 2032,
      "line": "    makeOption(\"Assign/Remove leader\", \"leaderctl\", modplus, CHANNEL.perms.leaderctl+\"\");",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 101,
      "line": "        leader: div.data(\"leader\") || false,",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 185,
      "line": "    // denote current leader with a star",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 186,
      "line": "    if(data.leader) {",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 214,
      "line": "        leader = entry.data(\"leader\"),",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 263,
      "line": "    /* give/remove leader (moderator+ only) */",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 264,
      "line": "    if (hasPermission(\"leaderctl\")) {",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 267,
      "line": "        if(leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 268,
      "line": "            ldr.text(\"Remove Leader\");",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 270,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 275,
      "line": "            ldr.text(\"Give Leader\");",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 277,
      "line": "                socket.emit(\"assignLeader\", {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 1463,
      "line": "    if (!CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 1967,
      "line": "        [\"Leader\"       , \"1.5\"],",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 1976,
      "line": "        [\"Leader\"       , \"1.5\"],",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 1982,
      "line": "    var modleader = [",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 1983,
      "line": "        [\"Leader\"       , \"1.5\"],",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2019,
      "line": "    makeOption(\"Lock/unlock playlist\", \"playlistlock\", modleader, CHANNEL.perms.playlistlock+\"\");",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2025,
      "line": "    makeOption(\"Open/Close poll\", \"pollctl\", modleader, CHANNEL.perms.pollctl+\"\");",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2032,
      "line": "    makeOption(\"Assign/Remove leader\", \"leaderctl\", modplus, CHANNEL.perms.leaderctl+\"\");",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2033,
      "line": "    makeOption(\"Mute users\", \"mute\", modleader, CHANNEL.perms.mute+\"\");",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2034,
      "line": "    makeOption(\"Kick users\", \"kick\", modleader, CHANNEL.perms.kick+\"\");",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2043,
      "line": "    makeOption(\"Drink calls\", \"drink\", modleader, CHANNEL.perms.drink+\"\");",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 2045,
      "line": "    makeOption(\"Clear Chat\", \"chatclear\", modleader, CHANNEL.perms.chatclear+\"\");",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "leader",
      "lineNumber": 3489,
      "line": "    div.data(\"leader\", Boolean(data.leader));",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 99,
      "line": "        rank: div.data(\"rank\"),",
      "context": [
        {
          "lineNumber": 95,
          "text": ""
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 107,
      "line": "    name.addClass(getNameColor(data.rank));",
      "context": [
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
        },
        {
          "lineNumber": 107,
          "text": "    name.addClass(getNameColor(data.rank));"
        },
        {
          "lineNumber": 108,
          "text": "    div.find(\".profile-box\").remove();"
        },
        {
          "lineNumber": 109,
          "text": ""
        },
        {
          "lineNumber": 110,
          "text": "    var meta = div.data().meta || {}; // Not sure how this could happen."
        },
        {
          "lineNumber": 111,
          "text": "    if (meta.afk) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 198,
      "line": "function getNameColor(rank) {",
      "context": [
        {
          "lineNumber": 194,
          "text": "        $(\"<span/>\").addClass(\"glyphicon \" + data.icon).prependTo(icon);"
        },
        {
          "lineNumber": 195,
          "text": "    }"
        },
        {
          "lineNumber": 196,
          "text": "}"
        },
        {
          "lineNumber": 197,
          "text": ""
        },
        {
          "lineNumber": 198,
          "text": "function getNameColor(rank) {"
        },
        {
          "lineNumber": 199,
          "text": "    if(rank >= Rank.Siteadmin)"
        },
        {
          "lineNumber": 200,
          "text": "        return \"userlist_siteadmin\";"
        },
        {
          "lineNumber": 201,
          "text": "    else if(rank >= Rank.Admin)"
        },
        {
          "lineNumber": 202,
          "text": "        return \"userlist_owner\";"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 199,
      "line": "    if(rank >= Rank.Siteadmin)",
      "context": [
        {
          "lineNumber": 195,
          "text": "    }"
        },
        {
          "lineNumber": 196,
          "text": "}"
        },
        {
          "lineNumber": 197,
          "text": ""
        },
        {
          "lineNumber": 198,
          "text": "function getNameColor(rank) {"
        },
        {
          "lineNumber": 199,
          "text": "    if(rank >= Rank.Siteadmin)"
        },
        {
          "lineNumber": 200,
          "text": "        return \"userlist_siteadmin\";"
        },
        {
          "lineNumber": 201,
          "text": "    else if(rank >= Rank.Admin)"
        },
        {
          "lineNumber": 202,
          "text": "        return \"userlist_owner\";"
        },
        {
          "lineNumber": 203,
          "text": "    else if(rank >= Rank.Moderator)"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 201,
      "line": "    else if(rank >= Rank.Admin)",
      "context": [
        {
          "lineNumber": 197,
          "text": ""
        },
        {
          "lineNumber": 198,
          "text": "function getNameColor(rank) {"
        },
        {
          "lineNumber": 199,
          "text": "    if(rank >= Rank.Siteadmin)"
        },
        {
          "lineNumber": 200,
          "text": "        return \"userlist_siteadmin\";"
        },
        {
          "lineNumber": 201,
          "text": "    else if(rank >= Rank.Admin)"
        },
        {
          "lineNumber": 202,
          "text": "        return \"userlist_owner\";"
        },
        {
          "lineNumber": 203,
          "text": "    else if(rank >= Rank.Moderator)"
        },
        {
          "lineNumber": 204,
          "text": "        return \"userlist_op\";"
        },
        {
          "lineNumber": 205,
          "text": "    else if(rank == Rank.Guest)"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 203,
      "line": "    else if(rank >= Rank.Moderator)",
      "context": [
        {
          "lineNumber": 199,
          "text": "    if(rank >= Rank.Siteadmin)"
        },
        {
          "lineNumber": 200,
          "text": "        return \"userlist_siteadmin\";"
        },
        {
          "lineNumber": 201,
          "text": "    else if(rank >= Rank.Admin)"
        },
        {
          "lineNumber": 202,
          "text": "        return \"userlist_owner\";"
        },
        {
          "lineNumber": 203,
          "text": "    else if(rank >= Rank.Moderator)"
        },
        {
          "lineNumber": 204,
          "text": "        return \"userlist_op\";"
        },
        {
          "lineNumber": 205,
          "text": "    else if(rank == Rank.Guest)"
        },
        {
          "lineNumber": 206,
          "text": "        return \"userlist_guest\";"
        },
        {
          "lineNumber": 207,
          "text": "    else"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 205,
      "line": "    else if(rank == Rank.Guest)",
      "context": [
        {
          "lineNumber": 201,
          "text": "    else if(rank >= Rank.Admin)"
        },
        {
          "lineNumber": 202,
          "text": "        return \"userlist_owner\";"
        },
        {
          "lineNumber": 203,
          "text": "    else if(rank >= Rank.Moderator)"
        },
        {
          "lineNumber": 204,
          "text": "        return \"userlist_op\";"
        },
        {
          "lineNumber": 205,
          "text": "    else if(rank == Rank.Guest)"
        },
        {
          "lineNumber": 206,
          "text": "        return \"userlist_guest\";"
        },
        {
          "lineNumber": 207,
          "text": "    else"
        },
        {
          "lineNumber": 208,
          "text": "        return \"\";"
        },
        {
          "lineNumber": 209,
          "text": "}"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 213,
      "line": "        rank = entry.data(\"rank\"),",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 405,
      "line": "            rank: $(item).data(\"rank\")",
      "context": [
        {
          "lineNumber": 401,
          "text": "    };"
        },
        {
          "lineNumber": 402,
          "text": "    var total = 0;"
        },
        {
          "lineNumber": 403,
          "text": "    $(\"#userlist .userlist_item\").each(function (index, item) {"
        },
        {
          "lineNumber": 404,
          "text": "        var data = {"
        },
        {
          "lineNumber": 405,
          "text": "            rank: $(item).data(\"rank\")"
        },
        {
          "lineNumber": 406,
          "text": "        };"
        },
        {
          "lineNumber": 407,
          "text": ""
        },
        {
          "lineNumber": 408,
          "text": "        if(data.rank >= 255)"
        },
        {
          "lineNumber": 409,
          "text": "            breakdown[\"Site Admins\"]++;"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 408,
      "line": "        if(data.rank >= 255)",
      "context": [
        {
          "lineNumber": 404,
          "text": "        var data = {"
        },
        {
          "lineNumber": 405,
          "text": "            rank: $(item).data(\"rank\")"
        },
        {
          "lineNumber": 406,
          "text": "        };"
        },
        {
          "lineNumber": 407,
          "text": ""
        },
        {
          "lineNumber": 408,
          "text": "        if(data.rank >= 255)"
        },
        {
          "lineNumber": 409,
          "text": "            breakdown[\"Site Admins\"]++;"
        },
        {
          "lineNumber": 410,
          "text": "        else if(data.rank >= 3)"
        },
        {
          "lineNumber": 411,
          "text": "            breakdown[\"Channel Admins\"]++;"
        },
        {
          "lineNumber": 412,
          "text": "        else if(data.rank == 2)"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 410,
      "line": "        else if(data.rank >= 3)",
      "context": [
        {
          "lineNumber": 406,
          "text": "        };"
        },
        {
          "lineNumber": 407,
          "text": ""
        },
        {
          "lineNumber": 408,
          "text": "        if(data.rank >= 255)"
        },
        {
          "lineNumber": 409,
          "text": "            breakdown[\"Site Admins\"]++;"
        },
        {
          "lineNumber": 410,
          "text": "        else if(data.rank >= 3)"
        },
        {
          "lineNumber": 411,
          "text": "            breakdown[\"Channel Admins\"]++;"
        },
        {
          "lineNumber": 412,
          "text": "        else if(data.rank == 2)"
        },
        {
          "lineNumber": 413,
          "text": "            breakdown[\"Moderators\"]++;"
        },
        {
          "lineNumber": 414,
          "text": "        else if(data.rank >= 1)"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 412,
      "line": "        else if(data.rank == 2)",
      "context": [
        {
          "lineNumber": 408,
          "text": "        if(data.rank >= 255)"
        },
        {
          "lineNumber": 409,
          "text": "            breakdown[\"Site Admins\"]++;"
        },
        {
          "lineNumber": 410,
          "text": "        else if(data.rank >= 3)"
        },
        {
          "lineNumber": 411,
          "text": "            breakdown[\"Channel Admins\"]++;"
        },
        {
          "lineNumber": 412,
          "text": "        else if(data.rank == 2)"
        },
        {
          "lineNumber": 413,
          "text": "            breakdown[\"Moderators\"]++;"
        },
        {
          "lineNumber": 414,
          "text": "        else if(data.rank >= 1)"
        },
        {
          "lineNumber": 415,
          "text": "            breakdown[\"Regular Users\"]++;"
        },
        {
          "lineNumber": 416,
          "text": "        else"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 414,
      "line": "        else if(data.rank >= 1)",
      "context": [
        {
          "lineNumber": 410,
          "text": "        else if(data.rank >= 3)"
        },
        {
          "lineNumber": 411,
          "text": "            breakdown[\"Channel Admins\"]++;"
        },
        {
          "lineNumber": 412,
          "text": "        else if(data.rank == 2)"
        },
        {
          "lineNumber": 413,
          "text": "            breakdown[\"Moderators\"]++;"
        },
        {
          "lineNumber": 414,
          "text": "        else if(data.rank >= 1)"
        },
        {
          "lineNumber": 415,
          "text": "            breakdown[\"Regular Users\"]++;"
        },
        {
          "lineNumber": 416,
          "text": "        else"
        },
        {
          "lineNumber": 417,
          "text": "            breakdown[\"Guests\"]++;"
        },
        {
          "lineNumber": 418,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 434,
      "line": "        var r1 = $(a).data(\"rank\");",
      "context": [
        {
          "lineNumber": 430,
          "text": "function sortUserlist() {"
        },
        {
          "lineNumber": 431,
          "text": "    var slice = Array.prototype.slice;"
        },
        {
          "lineNumber": 432,
          "text": "    var list = slice.call($(\"#userlist .userlist_item\"));"
        },
        {
          "lineNumber": 433,
          "text": "    list.sort(function (a, b) {"
        },
        {
          "lineNumber": 434,
          "text": "        var r1 = $(a).data(\"rank\");"
        },
        {
          "lineNumber": 435,
          "text": "        var r2 = $(b).data(\"rank\");"
        },
        {
          "lineNumber": 436,
          "text": "        var afk1 = $(a).find(\".glyphicon-time\").length > 0;"
        },
        {
          "lineNumber": 437,
          "text": "        var afk2 = $(b).find(\".glyphicon-time\").length > 0;"
        },
        {
          "lineNumber": 438,
          "text": "        var name1 = a.children[1].innerHTML.toLowerCase();"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 435,
      "line": "        var r2 = $(b).data(\"rank\");",
      "context": [
        {
          "lineNumber": 431,
          "text": "    var slice = Array.prototype.slice;"
        },
        {
          "lineNumber": 432,
          "text": "    var list = slice.call($(\"#userlist .userlist_item\"));"
        },
        {
          "lineNumber": 433,
          "text": "    list.sort(function (a, b) {"
        },
        {
          "lineNumber": 434,
          "text": "        var r1 = $(a).data(\"rank\");"
        },
        {
          "lineNumber": 435,
          "text": "        var r2 = $(b).data(\"rank\");"
        },
        {
          "lineNumber": 436,
          "text": "        var afk1 = $(a).find(\".glyphicon-time\").length > 0;"
        },
        {
          "lineNumber": 437,
          "text": "        var afk2 = $(b).find(\".glyphicon-time\").length > 0;"
        },
        {
          "lineNumber": 438,
          "text": "        var name1 = a.children[1].innerHTML.toLowerCase();"
        },
        {
          "lineNumber": 439,
          "text": "        var name2 = b.children[1].innerHTML.toLowerCase();"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 448,
      "line": "        if(USEROPTS.sort_rank) {",
      "context": [
        {
          "lineNumber": 444,
          "text": "            if(!afk1 && afk2)"
        },
        {
          "lineNumber": 445,
          "text": "                return -1;"
        },
        {
          "lineNumber": 446,
          "text": "        }"
        },
        {
          "lineNumber": 447,
          "text": ""
        },
        {
          "lineNumber": 448,
          "text": "        if(USEROPTS.sort_rank) {"
        },
        {
          "lineNumber": 449,
          "text": "            if(r1 < r2)"
        },
        {
          "lineNumber": 450,
          "text": "                return 1;"
        },
        {
          "lineNumber": 451,
          "text": "            if(r1 > r2)"
        },
        {
          "lineNumber": 452,
          "text": "                return -1;"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 639,
      "line": "    if (CLIENT.rank < 2) {",
      "context": [
        {
          "lineNumber": 635,
          "text": "/* menus */"
        },
        {
          "lineNumber": 636,
          "text": ""
        },
        {
          "lineNumber": 637,
          "text": "/* user settings menu */"
        },
        {
          "lineNumber": 638,
          "text": "function showUserOptions() {"
        },
        {
          "lineNumber": 639,
          "text": "    if (CLIENT.rank < 2) {"
        },
        {
          "lineNumber": 640,
          "text": "        $(\"a[href='#us-mod']\").parent().hide();"
        },
        {
          "lineNumber": 641,
          "text": "    } else {"
        },
        {
          "lineNumber": 642,
          "text": "        $(\"a[href='#us-mod']\").parent().show();"
        },
        {
          "lineNumber": 643,
          "text": "    }"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 659,
      "line": "    $(\"#us-sort-rank\").prop(\"checked\", USEROPTS.sort_rank);",
      "context": [
        {
          "lineNumber": 655,
          "text": "    $(\"#us-default-quality\").val(USEROPTS.default_quality || \"auto\");"
        },
        {
          "lineNumber": 656,
          "text": "    $(\"#us-peertube\").prop(\"checked\", USEROPTS.peertube_risk);"
        },
        {
          "lineNumber": 657,
          "text": ""
        },
        {
          "lineNumber": 658,
          "text": "    $(\"#us-chat-timestamp\").prop(\"checked\", USEROPTS.show_timestamps);"
        },
        {
          "lineNumber": 659,
          "text": "    $(\"#us-sort-rank\").prop(\"checked\", USEROPTS.sort_rank);"
        },
        {
          "lineNumber": 660,
          "text": "    $(\"#us-sort-afk\").prop(\"checked\", USEROPTS.sort_afk);"
        },
        {
          "lineNumber": 661,
          "text": "    $(\"#us-blink-title\").val(USEROPTS.blink_title);"
        },
        {
          "lineNumber": 662,
          "text": "    $(\"#us-ping-sound\").val(USEROPTS.boop);"
        },
        {
          "lineNumber": 663,
          "text": "    $(\"#us-notifications\").val(USEROPTS.notifications);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 696,
      "line": "    USEROPTS.sort_rank            = $(\"#us-sort-rank\").prop(\"checked\");",
      "context": [
        {
          "lineNumber": 692,
          "text": "    USEROPTS.default_quality      = $(\"#us-default-quality\").val();"
        },
        {
          "lineNumber": 693,
          "text": "    USEROPTS.peertube_risk        = $(\"#us-peertube\").prop(\"checked\");"
        },
        {
          "lineNumber": 694,
          "text": ""
        },
        {
          "lineNumber": 695,
          "text": "    USEROPTS.show_timestamps      = $(\"#us-chat-timestamp\").prop(\"checked\");"
        },
        {
          "lineNumber": 696,
          "text": "    USEROPTS.sort_rank            = $(\"#us-sort-rank\").prop(\"checked\");"
        },
        {
          "lineNumber": 697,
          "text": "    USEROPTS.sort_afk             = $(\"#us-sort-afk\").prop(\"checked\");"
        },
        {
          "lineNumber": 698,
          "text": "    USEROPTS.blink_title          = $(\"#us-blink-title\").val();"
        },
        {
          "lineNumber": 699,
          "text": "    USEROPTS.boop                 = $(\"#us-ping-sound\").val();"
        },
        {
          "lineNumber": 700,
          "text": "    USEROPTS.notifications        = $(\"#us-notifications\").val();"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 706,
      "line": "    if (CLIENT.rank >= 2) {",
      "context": [
        {
          "lineNumber": 702,
          "text": "    USEROPTS.no_emotes            = $(\"#us-no-emotes\").prop(\"checked\");"
        },
        {
          "lineNumber": 703,
          "text": "    USEROPTS.strip_image          = $(\"#us-strip-image\").prop(\"checked\");"
        },
        {
          "lineNumber": 704,
          "text": "    USEROPTS.chat_tab_method      = $(\"#us-chat-tab-method\").val();"
        },
        {
          "lineNumber": 705,
          "text": ""
        },
        {
          "lineNumber": 706,
          "text": "    if (CLIENT.rank >= 2) {"
        },
        {
          "lineNumber": 707,
          "text": "        USEROPTS.modhat      = $(\"#us-modflair\").prop(\"checked\");"
        },
        {
          "lineNumber": 708,
          "text": "        USEROPTS.show_shadowchat = $(\"#us-shadowchat\").prop(\"checked\");"
        },
        {
          "lineNumber": 709,
          "text": "    }"
        },
        {
          "lineNumber": 710,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 934,
      "line": "        if(typeof v == \"number\" && CLIENT.rank >= v) {",
      "context": [
        {
          "lineNumber": 930,
          "text": "function hasPermission(key) {"
        },
        {
          "lineNumber": 931,
          "text": "    if(key.indexOf(\"playlist\") == 0 && CHANNEL.openqueue) {"
        },
        {
          "lineNumber": 932,
          "text": "        var key2 = \"o\" + key;"
        },
        {
          "lineNumber": 933,
          "text": "        var v = CHANNEL.perms[key2];"
        },
        {
          "lineNumber": 934,
          "text": "        if(typeof v == \"number\" && CLIENT.rank >= v) {"
        },
        {
          "lineNumber": 935,
          "text": "            return true;"
        },
        {
          "lineNumber": 936,
          "text": "        }"
        },
        {
          "lineNumber": 937,
          "text": "    }"
        },
        {
          "lineNumber": 938,
          "text": "    var v = CHANNEL.perms[key];"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 942,
      "line": "    return CLIENT.rank >= v;",
      "context": [
        {
          "lineNumber": 938,
          "text": "    var v = CHANNEL.perms[key];"
        },
        {
          "lineNumber": 939,
          "text": "    if(typeof v != \"number\") {"
        },
        {
          "lineNumber": 940,
          "text": "        return false;"
        },
        {
          "lineNumber": 941,
          "text": "    }"
        },
        {
          "lineNumber": 942,
          "text": "    return CLIENT.rank >= v;"
        },
        {
          "lineNumber": 943,
          "text": "}"
        },
        {
          "lineNumber": 944,
          "text": ""
        },
        {
          "lineNumber": 945,
          "text": "function setVisible(selector, bool) {"
        },
        {
          "lineNumber": 946,
          "text": "    // I originally added this check because of a race condition"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 964,
      "line": "    $(\"#cs-chanranks-adm\").attr(\"disabled\", CLIENT.rank < 4);",
      "context": [
        {
          "lineNumber": 960,
          "text": "    $(selector).parent().css(\"display\", disp);"
        },
        {
          "lineNumber": 961,
          "text": "}"
        },
        {
          "lineNumber": 962,
          "text": ""
        },
        {
          "lineNumber": 963,
          "text": "function handleModPermissions() {"
        },
        {
          "lineNumber": 964,
          "text": "    $(\"#cs-chanranks-adm\").attr(\"disabled\", CLIENT.rank < 4);"
        },
        {
          "lineNumber": 965,
          "text": "    $(\"#cs-chanranks-owner\").attr(\"disabled\", CLIENT.rank < 4);"
        },
        {
          "lineNumber": 966,
          "text": "    /* update channel controls */"
        },
        {
          "lineNumber": 967,
          "text": "    $(\"#cs-pagetitle\").val(CHANNEL.opts.pagetitle);"
        },
        {
          "lineNumber": 968,
          "text": "    $(\"#cs-pagetitle\").attr(\"disabled\", CLIENT.rank < 3);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 965,
      "line": "    $(\"#cs-chanranks-owner\").attr(\"disabled\", CLIENT.rank < 4);",
      "context": [
        {
          "lineNumber": 961,
          "text": "}"
        },
        {
          "lineNumber": 962,
          "text": ""
        },
        {
          "lineNumber": 963,
          "text": "function handleModPermissions() {"
        },
        {
          "lineNumber": 964,
          "text": "    $(\"#cs-chanranks-adm\").attr(\"disabled\", CLIENT.rank < 4);"
        },
        {
          "lineNumber": 965,
          "text": "    $(\"#cs-chanranks-owner\").attr(\"disabled\", CLIENT.rank < 4);"
        },
        {
          "lineNumber": 966,
          "text": "    /* update channel controls */"
        },
        {
          "lineNumber": 967,
          "text": "    $(\"#cs-pagetitle\").val(CHANNEL.opts.pagetitle);"
        },
        {
          "lineNumber": 968,
          "text": "    $(\"#cs-pagetitle\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 969,
          "text": "    $(\"#cs-externalcss\").val(CHANNEL.opts.externalcss);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 968,
      "line": "    $(\"#cs-pagetitle\").attr(\"disabled\", CLIENT.rank < 3);",
      "context": [
        {
          "lineNumber": 964,
          "text": "    $(\"#cs-chanranks-adm\").attr(\"disabled\", CLIENT.rank < 4);"
        },
        {
          "lineNumber": 965,
          "text": "    $(\"#cs-chanranks-owner\").attr(\"disabled\", CLIENT.rank < 4);"
        },
        {
          "lineNumber": 966,
          "text": "    /* update channel controls */"
        },
        {
          "lineNumber": 967,
          "text": "    $(\"#cs-pagetitle\").val(CHANNEL.opts.pagetitle);"
        },
        {
          "lineNumber": 968,
          "text": "    $(\"#cs-pagetitle\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 969,
          "text": "    $(\"#cs-externalcss\").val(CHANNEL.opts.externalcss);"
        },
        {
          "lineNumber": 970,
          "text": "    $(\"#cs-externalcss\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 971,
          "text": "    $(\"#cs-externaljs\").val(CHANNEL.opts.externaljs);"
        },
        {
          "lineNumber": 972,
          "text": "    $(\"#cs-externaljs\").attr(\"disabled\", CLIENT.rank < 3);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 970,
      "line": "    $(\"#cs-externalcss\").attr(\"disabled\", CLIENT.rank < 3);",
      "context": [
        {
          "lineNumber": 966,
          "text": "    /* update channel controls */"
        },
        {
          "lineNumber": 967,
          "text": "    $(\"#cs-pagetitle\").val(CHANNEL.opts.pagetitle);"
        },
        {
          "lineNumber": 968,
          "text": "    $(\"#cs-pagetitle\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 969,
          "text": "    $(\"#cs-externalcss\").val(CHANNEL.opts.externalcss);"
        },
        {
          "lineNumber": 970,
          "text": "    $(\"#cs-externalcss\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 971,
          "text": "    $(\"#cs-externaljs\").val(CHANNEL.opts.externaljs);"
        },
        {
          "lineNumber": 972,
          "text": "    $(\"#cs-externaljs\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 973,
          "text": "    $(\"#cs-chat_antiflood\").prop(\"checked\", CHANNEL.opts.chat_antiflood);"
        },
        {
          "lineNumber": 974,
          "text": "    if (\"chat_antiflood_params\" in CHANNEL.opts) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 972,
      "line": "    $(\"#cs-externaljs\").attr(\"disabled\", CLIENT.rank < 3);",
      "context": [
        {
          "lineNumber": 968,
          "text": "    $(\"#cs-pagetitle\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 969,
          "text": "    $(\"#cs-externalcss\").val(CHANNEL.opts.externalcss);"
        },
        {
          "lineNumber": 970,
          "text": "    $(\"#cs-externalcss\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 971,
          "text": "    $(\"#cs-externaljs\").val(CHANNEL.opts.externaljs);"
        },
        {
          "lineNumber": 972,
          "text": "    $(\"#cs-externaljs\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 973,
          "text": "    $(\"#cs-chat_antiflood\").prop(\"checked\", CHANNEL.opts.chat_antiflood);"
        },
        {
          "lineNumber": 974,
          "text": "    if (\"chat_antiflood_params\" in CHANNEL.opts) {"
        },
        {
          "lineNumber": 975,
          "text": "        $(\"#cs-chat_antiflood_burst\").val(CHANNEL.opts.chat_antiflood_params.burst);"
        },
        {
          "lineNumber": 976,
          "text": "        $(\"#cs-chat_antiflood_sustained\").val(CHANNEL.opts.chat_antiflood_params.sustained);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 979,
      "line": "    $(\"#cs-show_public\").attr(\"disabled\", CLIENT.rank < 3);",
      "context": [
        {
          "lineNumber": 975,
          "text": "        $(\"#cs-chat_antiflood_burst\").val(CHANNEL.opts.chat_antiflood_params.burst);"
        },
        {
          "lineNumber": 976,
          "text": "        $(\"#cs-chat_antiflood_sustained\").val(CHANNEL.opts.chat_antiflood_params.sustained);"
        },
        {
          "lineNumber": 977,
          "text": "    }"
        },
        {
          "lineNumber": 978,
          "text": "    $(\"#cs-show_public\").prop(\"checked\", CHANNEL.opts.show_public);"
        },
        {
          "lineNumber": 979,
          "text": "    $(\"#cs-show_public\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 980,
          "text": "    $(\"#cs-password\").val(CHANNEL.opts.password || \"\");"
        },
        {
          "lineNumber": 981,
          "text": "    $(\"#cs-password\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 982,
          "text": "    $(\"#cs-enable_link_regex\").prop(\"checked\", CHANNEL.opts.enable_link_regex);"
        },
        {
          "lineNumber": 983,
          "text": "    $(\"#cs-afk_timeout\").val(CHANNEL.opts.afk_timeout);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 981,
      "line": "    $(\"#cs-password\").attr(\"disabled\", CLIENT.rank < 3);",
      "context": [
        {
          "lineNumber": 977,
          "text": "    }"
        },
        {
          "lineNumber": 978,
          "text": "    $(\"#cs-show_public\").prop(\"checked\", CHANNEL.opts.show_public);"
        },
        {
          "lineNumber": 979,
          "text": "    $(\"#cs-show_public\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 980,
          "text": "    $(\"#cs-password\").val(CHANNEL.opts.password || \"\");"
        },
        {
          "lineNumber": 981,
          "text": "    $(\"#cs-password\").attr(\"disabled\", CLIENT.rank < 3);"
        },
        {
          "lineNumber": 982,
          "text": "    $(\"#cs-enable_link_regex\").prop(\"checked\", CHANNEL.opts.enable_link_regex);"
        },
        {
          "lineNumber": 983,
          "text": "    $(\"#cs-afk_timeout\").val(CHANNEL.opts.afk_timeout);"
        },
        {
          "lineNumber": 984,
          "text": "    $(\"#cs-allow_voteskip\").prop(\"checked\", CHANNEL.opts.allow_voteskip);"
        },
        {
          "lineNumber": 985,
          "text": "    $(\"#cs-voteskip_ratio\").val(CHANNEL.opts.voteskip_ratio);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 999,
      "line": "    setParentVisible(\"a[href='#cs-permedit']\", CLIENT.rank >= 3);",
      "context": [
        {
          "lineNumber": 995,
          "text": "    $(\"#cs-csstext\").val(CHANNEL.css);"
        },
        {
          "lineNumber": 996,
          "text": "    $(\"#cs-jstext\").val(CHANNEL.js);"
        },
        {
          "lineNumber": 997,
          "text": "    $(\"#cs-motdtext\").val(CHANNEL.motd);"
        },
        {
          "lineNumber": 998,
          "text": "    setParentVisible(\"a[href='#cs-motdeditor']\", hasPermission(\"motdedit\"));"
        },
        {
          "lineNumber": 999,
          "text": "    setParentVisible(\"a[href='#cs-permedit']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1000,
          "text": "    setParentVisible(\"a[href='#cs-banlist']\", hasPermission(\"ban\"));"
        },
        {
          "lineNumber": 1001,
          "text": "    setParentVisible(\"a[href='#cs-csseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1002,
          "text": "    setParentVisible(\"a[href='#cs-jseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1003,
          "text": "    setParentVisible(\"a[href='#cs-chatfilters']\", hasPermission(\"filteredit\"));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1001,
      "line": "    setParentVisible(\"a[href='#cs-csseditor']\", CLIENT.rank >= 3);",
      "context": [
        {
          "lineNumber": 997,
          "text": "    $(\"#cs-motdtext\").val(CHANNEL.motd);"
        },
        {
          "lineNumber": 998,
          "text": "    setParentVisible(\"a[href='#cs-motdeditor']\", hasPermission(\"motdedit\"));"
        },
        {
          "lineNumber": 999,
          "text": "    setParentVisible(\"a[href='#cs-permedit']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1000,
          "text": "    setParentVisible(\"a[href='#cs-banlist']\", hasPermission(\"ban\"));"
        },
        {
          "lineNumber": 1001,
          "text": "    setParentVisible(\"a[href='#cs-csseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1002,
          "text": "    setParentVisible(\"a[href='#cs-jseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1003,
          "text": "    setParentVisible(\"a[href='#cs-chatfilters']\", hasPermission(\"filteredit\"));"
        },
        {
          "lineNumber": 1004,
          "text": "    setParentVisible(\"a[href='#cs-emotes']\", hasPermission(\"emoteedit\"));"
        },
        {
          "lineNumber": 1005,
          "text": "    setParentVisible(\"a[href='#cs-chanranks']\", CLIENT.rank >= 3);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1002,
      "line": "    setParentVisible(\"a[href='#cs-jseditor']\", CLIENT.rank >= 3);",
      "context": [
        {
          "lineNumber": 998,
          "text": "    setParentVisible(\"a[href='#cs-motdeditor']\", hasPermission(\"motdedit\"));"
        },
        {
          "lineNumber": 999,
          "text": "    setParentVisible(\"a[href='#cs-permedit']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1000,
          "text": "    setParentVisible(\"a[href='#cs-banlist']\", hasPermission(\"ban\"));"
        },
        {
          "lineNumber": 1001,
          "text": "    setParentVisible(\"a[href='#cs-csseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1002,
          "text": "    setParentVisible(\"a[href='#cs-jseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1003,
          "text": "    setParentVisible(\"a[href='#cs-chatfilters']\", hasPermission(\"filteredit\"));"
        },
        {
          "lineNumber": 1004,
          "text": "    setParentVisible(\"a[href='#cs-emotes']\", hasPermission(\"emoteedit\"));"
        },
        {
          "lineNumber": 1005,
          "text": "    setParentVisible(\"a[href='#cs-chanranks']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1006,
          "text": "    setParentVisible(\"a[href='#cs-chanlog']\", CLIENT.rank >= 3);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1005,
      "line": "    setParentVisible(\"a[href='#cs-chanranks']\", CLIENT.rank >= 3);",
      "context": [
        {
          "lineNumber": 1001,
          "text": "    setParentVisible(\"a[href='#cs-csseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1002,
          "text": "    setParentVisible(\"a[href='#cs-jseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1003,
          "text": "    setParentVisible(\"a[href='#cs-chatfilters']\", hasPermission(\"filteredit\"));"
        },
        {
          "lineNumber": 1004,
          "text": "    setParentVisible(\"a[href='#cs-emotes']\", hasPermission(\"emoteedit\"));"
        },
        {
          "lineNumber": 1005,
          "text": "    setParentVisible(\"a[href='#cs-chanranks']\", CLIENT.rank >= 3);"
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1006,
      "line": "    setParentVisible(\"a[href='#cs-chanlog']\", CLIENT.rank >= 3);",
      "context": [
        {
          "lineNumber": 1002,
          "text": "    setParentVisible(\"a[href='#cs-jseditor']\", CLIENT.rank >= 3);"
        },
        {
          "lineNumber": 1003,
          "text": "    setParentVisible(\"a[href='#cs-chatfilters']\", hasPermission(\"filteredit\"));"
        },
        {
          "lineNumber": 1004,
          "text": "    setParentVisible(\"a[href='#cs-emotes']\", hasPermission(\"emoteedit\"));"
        },
        {
          "lineNumber": 1005,
          "text": "    setParentVisible(\"a[href='#cs-chanranks']\", CLIENT.rank >= 3);"
        },
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1012,
      "line": "    if(CLIENT.rank >= 2) {",
      "context": [
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
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1017,
      "line": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);",
      "context": [
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
        },
        {
          "lineNumber": 1017,
          "text": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1018,
          "text": "    setVisible(\"#playlistmanagerwrap\", CLIENT.rank >= 1);"
        },
        {
          "lineNumber": 1019,
          "text": "    setVisible(\"#modflair\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1020,
          "text": "    setVisible(\"#guestlogin\", CLIENT.rank < 0);"
        },
        {
          "lineNumber": 1021,
          "text": "    setVisible(\"#chatline\", CLIENT.rank >= 0);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1018,
      "line": "    setVisible(\"#playlistmanagerwrap\", CLIENT.rank >= 1);",
      "context": [
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
        },
        {
          "lineNumber": 1017,
          "text": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1018,
          "text": "    setVisible(\"#playlistmanagerwrap\", CLIENT.rank >= 1);"
        },
        {
          "lineNumber": 1019,
          "text": "    setVisible(\"#modflair\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1020,
          "text": "    setVisible(\"#guestlogin\", CLIENT.rank < 0);"
        },
        {
          "lineNumber": 1021,
          "text": "    setVisible(\"#chatline\", CLIENT.rank >= 0);"
        },
        {
          "lineNumber": 1022,
          "text": "    setVisible(\"#queue\", hasPermission(\"seeplaylist\"));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1019,
      "line": "    setVisible(\"#modflair\", CLIENT.rank >= 2);",
      "context": [
        {
          "lineNumber": 1015,
          "text": ""
        },
        {
          "lineNumber": 1016,
          "text": "    $(\"#qlockbtn\").attr(\"disabled\", !hasPermission(\"playlistlock\"));"
        },
        {
          "lineNumber": 1017,
          "text": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1018,
          "text": "    setVisible(\"#playlistmanagerwrap\", CLIENT.rank >= 1);"
        },
        {
          "lineNumber": 1019,
          "text": "    setVisible(\"#modflair\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1020,
          "text": "    setVisible(\"#guestlogin\", CLIENT.rank < 0);"
        },
        {
          "lineNumber": 1021,
          "text": "    setVisible(\"#chatline\", CLIENT.rank >= 0);"
        },
        {
          "lineNumber": 1022,
          "text": "    setVisible(\"#queue\", hasPermission(\"seeplaylist\"));"
        },
        {
          "lineNumber": 1023,
          "text": "    setVisible(\"#plmeta\", hasPermission(\"seeplaylist\"));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1020,
      "line": "    setVisible(\"#guestlogin\", CLIENT.rank < 0);",
      "context": [
        {
          "lineNumber": 1016,
          "text": "    $(\"#qlockbtn\").attr(\"disabled\", !hasPermission(\"playlistlock\"));"
        },
        {
          "lineNumber": 1017,
          "text": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1018,
          "text": "    setVisible(\"#playlistmanagerwrap\", CLIENT.rank >= 1);"
        },
        {
          "lineNumber": 1019,
          "text": "    setVisible(\"#modflair\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1020,
          "text": "    setVisible(\"#guestlogin\", CLIENT.rank < 0);"
        },
        {
          "lineNumber": 1021,
          "text": "    setVisible(\"#chatline\", CLIENT.rank >= 0);"
        },
        {
          "lineNumber": 1022,
          "text": "    setVisible(\"#queue\", hasPermission(\"seeplaylist\"));"
        },
        {
          "lineNumber": 1023,
          "text": "    setVisible(\"#plmeta\", hasPermission(\"seeplaylist\"));"
        },
        {
          "lineNumber": 1024,
          "text": "    $(\"#getplaylist\").attr(\"disabled\", !hasPermission(\"seeplaylist\"));"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1021,
      "line": "    setVisible(\"#chatline\", CLIENT.rank >= 0);",
      "context": [
        {
          "lineNumber": 1017,
          "text": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1018,
          "text": "    setVisible(\"#playlistmanagerwrap\", CLIENT.rank >= 1);"
        },
        {
          "lineNumber": 1019,
          "text": "    setVisible(\"#modflair\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1020,
          "text": "    setVisible(\"#guestlogin\", CLIENT.rank < 0);"
        },
        {
          "lineNumber": 1021,
          "text": "    setVisible(\"#chatline\", CLIENT.rank >= 0);"
        },
        {
          "lineNumber": 1022,
          "text": "    setVisible(\"#queue\", hasPermission(\"seeplaylist\"));"
        },
        {
          "lineNumber": 1023,
          "text": "    setVisible(\"#plmeta\", hasPermission(\"seeplaylist\"));"
        },
        {
          "lineNumber": 1024,
          "text": "    $(\"#getplaylist\").attr(\"disabled\", !hasPermission(\"seeplaylist\"));"
        },
        {
          "lineNumber": 1025,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 1873,
      "line": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);",
      "context": [
        {
          "lineNumber": 1869,
          "text": "        .appendTo($(\"#chatheader\"))"
        },
        {
          "lineNumber": 1870,
          "text": "        .on('click', function () {"
        },
        {
          "lineNumber": 1871,
          "text": "            EMOTELISTMODAL.modal();"
        },
        {
          "lineNumber": 1872,
          "text": "        });"
        },
        {
          "lineNumber": 1873,
          "text": "    setVisible(\"#showchansettings\", CLIENT.rank >= 2);"
        },
        {
          "lineNumber": 1874,
          "text": ""
        },
        {
          "lineNumber": 1875,
          "text": "    $(\"body\").addClass(\"chatOnly\");"
        },
        {
          "lineNumber": 1876,
          "text": "    handleWindowResize();"
        },
        {
          "lineNumber": 1877,
          "text": "}"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2310,
      "line": "    var tbl = $(\"#cs-chanranks table\");",
      "context": [
        {
          "lineNumber": 2306,
          "text": "    return wrap;"
        },
        {
          "lineNumber": 2307,
          "text": "}"
        },
        {
          "lineNumber": 2308,
          "text": ""
        },
        {
          "lineNumber": 2309,
          "text": "function formatCSModList() {"
        },
        {
          "lineNumber": 2310,
          "text": "    var tbl = $(\"#cs-chanranks table\");"
        },
        {
          "lineNumber": 2311,
          "text": "    tbl.find(\"tbody\").remove();"
        },
        {
          "lineNumber": 2312,
          "text": "    var entries = tbl.data(\"entries\") || [];"
        },
        {
          "lineNumber": 2313,
          "text": "    entries.sort(function(a, b) {"
        },
        {
          "lineNumber": 2314,
          "text": "        if (a.rank === b.rank) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2314,
      "line": "        if (a.rank === b.rank) {",
      "context": [
        {
          "lineNumber": 2310,
          "text": "    var tbl = $(\"#cs-chanranks table\");"
        },
        {
          "lineNumber": 2311,
          "text": "    tbl.find(\"tbody\").remove();"
        },
        {
          "lineNumber": 2312,
          "text": "    var entries = tbl.data(\"entries\") || [];"
        },
        {
          "lineNumber": 2313,
          "text": "    entries.sort(function(a, b) {"
        },
        {
          "lineNumber": 2314,
          "text": "        if (a.rank === b.rank) {"
        },
        {
          "lineNumber": 2315,
          "text": "            var x = a.name.toLowerCase();"
        },
        {
          "lineNumber": 2316,
          "text": "            var y = b.name.toLowerCase();"
        },
        {
          "lineNumber": 2317,
          "text": "            return y == x ? 0 : (x < y ? -1 : 1);"
        },
        {
          "lineNumber": 2318,
          "text": "        }"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2320,
      "line": "        return b.rank - a.rank;",
      "context": [
        {
          "lineNumber": 2316,
          "text": "            var y = b.name.toLowerCase();"
        },
        {
          "lineNumber": 2317,
          "text": "            return y == x ? 0 : (x < y ? -1 : 1);"
        },
        {
          "lineNumber": 2318,
          "text": "        }"
        },
        {
          "lineNumber": 2319,
          "text": ""
        },
        {
          "lineNumber": 2320,
          "text": "        return b.rank - a.rank;"
        },
        {
          "lineNumber": 2321,
          "text": "    });"
        },
        {
          "lineNumber": 2322,
          "text": ""
        },
        {
          "lineNumber": 2323,
          "text": "    entries.forEach(function (entry) {"
        },
        {
          "lineNumber": 2324,
          "text": "        var tr = $(\"<tr/>\").addClass(\"cs-chanrank-tr-\" + entry.name);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2324,
      "line": "        var tr = $(\"<tr/>\").addClass(\"cs-chanrank-tr-\" + entry.name);",
      "context": [
        {
          "lineNumber": 2320,
          "text": "        return b.rank - a.rank;"
        },
        {
          "lineNumber": 2321,
          "text": "    });"
        },
        {
          "lineNumber": 2322,
          "text": ""
        },
        {
          "lineNumber": 2323,
          "text": "    entries.forEach(function (entry) {"
        },
        {
          "lineNumber": 2324,
          "text": "        var tr = $(\"<tr/>\").addClass(\"cs-chanrank-tr-\" + entry.name);"
        },
        {
          "lineNumber": 2325,
          "text": "        var name = $(\"<td/>\").text(entry.name).appendTo(tr);"
        },
        {
          "lineNumber": 2326,
          "text": "        name.addClass(getNameColor(entry.rank));"
        },
        {
          "lineNumber": 2327,
          "text": "        var rankwrap = $(\"<td/>\");"
        },
        {
          "lineNumber": 2328,
          "text": "        var rank = $(\"<span/>\").text(entry.rank).appendTo(rankwrap);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2326,
      "line": "        name.addClass(getNameColor(entry.rank));",
      "context": [
        {
          "lineNumber": 2322,
          "text": ""
        },
        {
          "lineNumber": 2323,
          "text": "    entries.forEach(function (entry) {"
        },
        {
          "lineNumber": 2324,
          "text": "        var tr = $(\"<tr/>\").addClass(\"cs-chanrank-tr-\" + entry.name);"
        },
        {
          "lineNumber": 2325,
          "text": "        var name = $(\"<td/>\").text(entry.name).appendTo(tr);"
        },
        {
          "lineNumber": 2326,
          "text": "        name.addClass(getNameColor(entry.rank));"
        },
        {
          "lineNumber": 2327,
          "text": "        var rankwrap = $(\"<td/>\");"
        },
        {
          "lineNumber": 2328,
          "text": "        var rank = $(\"<span/>\").text(entry.rank).appendTo(rankwrap);"
        },
        {
          "lineNumber": 2329,
          "text": "        var dd = $(\"<div/>\").addClass(\"btn-group\");"
        },
        {
          "lineNumber": 2330,
          "text": "        var toggle = $(\"<button/>\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2327,
      "line": "        var rankwrap = $(\"<td/>\");",
      "context": [
        {
          "lineNumber": 2323,
          "text": "    entries.forEach(function (entry) {"
        },
        {
          "lineNumber": 2324,
          "text": "        var tr = $(\"<tr/>\").addClass(\"cs-chanrank-tr-\" + entry.name);"
        },
        {
          "lineNumber": 2325,
          "text": "        var name = $(\"<td/>\").text(entry.name).appendTo(tr);"
        },
        {
          "lineNumber": 2326,
          "text": "        name.addClass(getNameColor(entry.rank));"
        },
        {
          "lineNumber": 2327,
          "text": "        var rankwrap = $(\"<td/>\");"
        },
        {
          "lineNumber": 2328,
          "text": "        var rank = $(\"<span/>\").text(entry.rank).appendTo(rankwrap);"
        },
        {
          "lineNumber": 2329,
          "text": "        var dd = $(\"<div/>\").addClass(\"btn-group\");"
        },
        {
          "lineNumber": 2330,
          "text": "        var toggle = $(\"<button/>\")"
        },
        {
          "lineNumber": 2331,
          "text": "            .addClass(\"btn btn-xs btn-default dropdown-toggle\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2328,
      "line": "        var rank = $(\"<span/>\").text(entry.rank).appendTo(rankwrap);",
      "context": [
        {
          "lineNumber": 2324,
          "text": "        var tr = $(\"<tr/>\").addClass(\"cs-chanrank-tr-\" + entry.name);"
        },
        {
          "lineNumber": 2325,
          "text": "        var name = $(\"<td/>\").text(entry.name).appendTo(tr);"
        },
        {
          "lineNumber": 2326,
          "text": "        name.addClass(getNameColor(entry.rank));"
        },
        {
          "lineNumber": 2327,
          "text": "        var rankwrap = $(\"<td/>\");"
        },
        {
          "lineNumber": 2328,
          "text": "        var rank = $(\"<span/>\").text(entry.rank).appendTo(rankwrap);"
        },
        {
          "lineNumber": 2329,
          "text": "        var dd = $(\"<div/>\").addClass(\"btn-group\");"
        },
        {
          "lineNumber": 2330,
          "text": "        var toggle = $(\"<button/>\")"
        },
        {
          "lineNumber": 2331,
          "text": "            .addClass(\"btn btn-xs btn-default dropdown-toggle\")"
        },
        {
          "lineNumber": 2332,
          "text": "            .attr(\"data-toggle\", \"dropdown\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2335,
      "line": "        if (CLIENT.rank <= entry.rank && !(CLIENT.rank === 4 && entry.rank === 4)) {",
      "context": [
        {
          "lineNumber": 2331,
          "text": "            .addClass(\"btn btn-xs btn-default dropdown-toggle\")"
        },
        {
          "lineNumber": 2332,
          "text": "            .attr(\"data-toggle\", \"dropdown\")"
        },
        {
          "lineNumber": 2333,
          "text": "            .html(\"Edit <span class=caret></span>\")"
        },
        {
          "lineNumber": 2334,
          "text": "            .appendTo(dd);"
        },
        {
          "lineNumber": 2335,
          "text": "        if (CLIENT.rank <= entry.rank && !(CLIENT.rank === 4 && entry.rank === 4)) {"
        },
        {
          "lineNumber": 2336,
          "text": "            toggle.addClass(\"disabled\");"
        },
        {
          "lineNumber": 2337,
          "text": "        }"
        },
        {
          "lineNumber": 2338,
          "text": ""
        },
        {
          "lineNumber": 2339,
          "text": "        var menu = $(\"<ul/>\").addClass(\"dropdown-menu\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2343,
      "line": "        var ranks = [",
      "context": [
        {
          "lineNumber": 2339,
          "text": "        var menu = $(\"<ul/>\").addClass(\"dropdown-menu\")"
        },
        {
          "lineNumber": 2340,
          "text": "            .attr(\"role\", \"menu\")"
        },
        {
          "lineNumber": 2341,
          "text": "            .appendTo(dd);"
        },
        {
          "lineNumber": 2342,
          "text": ""
        },
        {
          "lineNumber": 2343,
          "text": "        var ranks = ["
        },
        {
          "lineNumber": 2344,
          "text": "            { name: \"Remove Moderator\", rank: 1 },"
        },
        {
          "lineNumber": 2345,
          "text": "            { name: \"Moderator\", rank: 2 },"
        },
        {
          "lineNumber": 2346,
          "text": "            { name: \"Admin\", rank: 3 },"
        },
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2344,
      "line": "            { name: \"Remove Moderator\", rank: 1 },",
      "context": [
        {
          "lineNumber": 2340,
          "text": "            .attr(\"role\", \"menu\")"
        },
        {
          "lineNumber": 2341,
          "text": "            .appendTo(dd);"
        },
        {
          "lineNumber": 2342,
          "text": ""
        },
        {
          "lineNumber": 2343,
          "text": "        var ranks = ["
        },
        {
          "lineNumber": 2344,
          "text": "            { name: \"Remove Moderator\", rank: 1 },"
        },
        {
          "lineNumber": 2345,
          "text": "            { name: \"Moderator\", rank: 2 },"
        },
        {
          "lineNumber": 2346,
          "text": "            { name: \"Admin\", rank: 3 },"
        },
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        },
        {
          "lineNumber": 2348,
          "text": "            { name: \"Founder\", rank: 5 }"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2345,
      "line": "            { name: \"Moderator\", rank: 2 },",
      "context": [
        {
          "lineNumber": 2341,
          "text": "            .appendTo(dd);"
        },
        {
          "lineNumber": 2342,
          "text": ""
        },
        {
          "lineNumber": 2343,
          "text": "        var ranks = ["
        },
        {
          "lineNumber": 2344,
          "text": "            { name: \"Remove Moderator\", rank: 1 },"
        },
        {
          "lineNumber": 2345,
          "text": "            { name: \"Moderator\", rank: 2 },"
        },
        {
          "lineNumber": 2346,
          "text": "            { name: \"Admin\", rank: 3 },"
        },
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        },
        {
          "lineNumber": 2348,
          "text": "            { name: \"Founder\", rank: 5 }"
        },
        {
          "lineNumber": 2349,
          "text": "        ];"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2346,
      "line": "            { name: \"Admin\", rank: 3 },",
      "context": [
        {
          "lineNumber": 2342,
          "text": ""
        },
        {
          "lineNumber": 2343,
          "text": "        var ranks = ["
        },
        {
          "lineNumber": 2344,
          "text": "            { name: \"Remove Moderator\", rank: 1 },"
        },
        {
          "lineNumber": 2345,
          "text": "            { name: \"Moderator\", rank: 2 },"
        },
        {
          "lineNumber": 2346,
          "text": "            { name: \"Admin\", rank: 3 },"
        },
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        },
        {
          "lineNumber": 2348,
          "text": "            { name: \"Founder\", rank: 5 }"
        },
        {
          "lineNumber": 2349,
          "text": "        ];"
        },
        {
          "lineNumber": 2350,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2347,
      "line": "            { name: \"Owner\", rank: 4 },",
      "context": [
        {
          "lineNumber": 2343,
          "text": "        var ranks = ["
        },
        {
          "lineNumber": 2344,
          "text": "            { name: \"Remove Moderator\", rank: 1 },"
        },
        {
          "lineNumber": 2345,
          "text": "            { name: \"Moderator\", rank: 2 },"
        },
        {
          "lineNumber": 2346,
          "text": "            { name: \"Admin\", rank: 3 },"
        },
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        },
        {
          "lineNumber": 2348,
          "text": "            { name: \"Founder\", rank: 5 }"
        },
        {
          "lineNumber": 2349,
          "text": "        ];"
        },
        {
          "lineNumber": 2350,
          "text": ""
        },
        {
          "lineNumber": 2351,
          "text": "        ranks.forEach(function (r) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2348,
      "line": "            { name: \"Founder\", rank: 5 }",
      "context": [
        {
          "lineNumber": 2344,
          "text": "            { name: \"Remove Moderator\", rank: 1 },"
        },
        {
          "lineNumber": 2345,
          "text": "            { name: \"Moderator\", rank: 2 },"
        },
        {
          "lineNumber": 2346,
          "text": "            { name: \"Admin\", rank: 3 },"
        },
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        },
        {
          "lineNumber": 2348,
          "text": "            { name: \"Founder\", rank: 5 }"
        },
        {
          "lineNumber": 2349,
          "text": "        ];"
        },
        {
          "lineNumber": 2350,
          "text": ""
        },
        {
          "lineNumber": 2351,
          "text": "        ranks.forEach(function (r) {"
        },
        {
          "lineNumber": 2352,
          "text": "            var li = $(\"<li/>\").appendTo(menu);"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2351,
      "line": "        ranks.forEach(function (r) {",
      "context": [
        {
          "lineNumber": 2347,
          "text": "            { name: \"Owner\", rank: 4 },"
        },
        {
          "lineNumber": 2348,
          "text": "            { name: \"Founder\", rank: 5 }"
        },
        {
          "lineNumber": 2349,
          "text": "        ];"
        },
        {
          "lineNumber": 2350,
          "text": ""
        },
        {
          "lineNumber": 2351,
          "text": "        ranks.forEach(function (r) {"
        },
        {
          "lineNumber": 2352,
          "text": "            var li = $(\"<li/>\").appendTo(menu);"
        },
        {
          "lineNumber": 2353,
          "text": "            var a = $(\"<a/>\")"
        },
        {
          "lineNumber": 2354,
          "text": "                .addClass(getNameColor(r.rank))"
        },
        {
          "lineNumber": 2355,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2354,
      "line": "                .addClass(getNameColor(r.rank))",
      "context": [
        {
          "lineNumber": 2350,
          "text": ""
        },
        {
          "lineNumber": 2351,
          "text": "        ranks.forEach(function (r) {"
        },
        {
          "lineNumber": 2352,
          "text": "            var li = $(\"<li/>\").appendTo(menu);"
        },
        {
          "lineNumber": 2353,
          "text": "            var a = $(\"<a/>\")"
        },
        {
          "lineNumber": 2354,
          "text": "                .addClass(getNameColor(r.rank))"
        },
        {
          "lineNumber": 2355,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        },
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2358,
      "line": "            if (r.rank !== entry.rank) {",
      "context": [
        {
          "lineNumber": 2354,
          "text": "                .addClass(getNameColor(r.rank))"
        },
        {
          "lineNumber": 2355,
          "text": "                .attr(\"href\", \"javascript:void(0)\")"
        },
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2360,
      "line": "                    socket.emit(\"setChannelRank\", {",
      "context": [
        {
          "lineNumber": 2356,
          "text": "                .text(r.name)"
        },
        {
          "lineNumber": 2357,
          "text": "                .appendTo(li);"
        },
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        },
        {
          "lineNumber": 2363,
          "text": "                    });"
        },
        {
          "lineNumber": 2364,
          "text": "                });"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2362,
      "line": "                        rank: r.rank",
      "context": [
        {
          "lineNumber": 2358,
          "text": "            if (r.rank !== entry.rank) {"
        },
        {
          "lineNumber": 2359,
          "text": "                a.on('click', function () {"
        },
        {
          "lineNumber": 2360,
          "text": "                    socket.emit(\"setChannelRank\", {"
        },
        {
          "lineNumber": 2361,
          "text": "                        name: entry.name,"
        },
        {
          "lineNumber": 2362,
          "text": "                        rank: r.rank"
        },
        {
          "lineNumber": 2363,
          "text": "                    });"
        },
        {
          "lineNumber": 2364,
          "text": "                });"
        },
        {
          "lineNumber": 2365,
          "text": "            } else {"
        },
        {
          "lineNumber": 2366,
          "text": "                $(\"<span/>\").addClass(\"glyphicon glyphicon-ok\")"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2371,
      "line": "            if (r.rank > CLIENT.rank || (CLIENT.rank < 4 && r.rank === CLIENT.rank)) {",
      "context": [
        {
          "lineNumber": 2367,
          "text": "                    .appendTo(a);"
        },
        {
          "lineNumber": 2368,
          "text": "                li.addClass(\"disabled\");"
        },
        {
          "lineNumber": 2369,
          "text": "            }"
        },
        {
          "lineNumber": 2370,
          "text": ""
        },
        {
          "lineNumber": 2371,
          "text": "            if (r.rank > CLIENT.rank || (CLIENT.rank < 4 && r.rank === CLIENT.rank)) {"
        },
        {
          "lineNumber": 2372,
          "text": "                li.addClass(\"disabled\");"
        },
        {
          "lineNumber": 2373,
          "text": "            }"
        },
        {
          "lineNumber": 2374,
          "text": "        });"
        },
        {
          "lineNumber": 2375,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2376,
      "line": "        dd.css(\"margin-right\", \"10px\").prependTo(rankwrap);",
      "context": [
        {
          "lineNumber": 2372,
          "text": "                li.addClass(\"disabled\");"
        },
        {
          "lineNumber": 2373,
          "text": "            }"
        },
        {
          "lineNumber": 2374,
          "text": "        });"
        },
        {
          "lineNumber": 2375,
          "text": ""
        },
        {
          "lineNumber": 2376,
          "text": "        dd.css(\"margin-right\", \"10px\").prependTo(rankwrap);"
        },
        {
          "lineNumber": 2377,
          "text": "        rankwrap.appendTo(tr);"
        },
        {
          "lineNumber": 2378,
          "text": "        tr.appendTo(tbl);"
        },
        {
          "lineNumber": 2379,
          "text": "    });"
        },
        {
          "lineNumber": 2380,
          "text": "}"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2377,
      "line": "        rankwrap.appendTo(tr);",
      "context": [
        {
          "lineNumber": 2373,
          "text": "            }"
        },
        {
          "lineNumber": 2374,
          "text": "        });"
        },
        {
          "lineNumber": 2375,
          "text": ""
        },
        {
          "lineNumber": 2376,
          "text": "        dd.css(\"margin-right\", \"10px\").prependTo(rankwrap);"
        },
        {
          "lineNumber": 2377,
          "text": "        rankwrap.appendTo(tr);"
        },
        {
          "lineNumber": 2378,
          "text": "        tr.appendTo(tbl);"
        },
        {
          "lineNumber": 2379,
          "text": "    });"
        },
        {
          "lineNumber": 2380,
          "text": "}"
        },
        {
          "lineNumber": 2381,
          "text": ""
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2794,
      "line": "            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {",
      "context": [
        {
          "lineNumber": 2790,
          "text": "            if (msg.trim() === \"\") {"
        },
        {
          "lineNumber": 2791,
          "text": "                return;"
        },
        {
          "lineNumber": 2792,
          "text": "            }"
        },
        {
          "lineNumber": 2793,
          "text": ""
        },
        {
          "lineNumber": 2794,
          "text": "            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2795,
      "line": "                meta.modflair = CLIENT.rank;",
      "context": [
        {
          "lineNumber": 2791,
          "text": "                return;"
        },
        {
          "lineNumber": 2792,
          "text": "            }"
        },
        {
          "lineNumber": 2793,
          "text": ""
        },
        {
          "lineNumber": 2794,
          "text": "            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2798,
      "line": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {",
      "context": [
        {
          "lineNumber": 2794,
          "text": "            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {"
        },
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2800,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 2801,
          "text": "            }"
        },
        {
          "lineNumber": 2802,
          "text": "            socket.emit(\"pm\", {"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 2799,
      "line": "                meta.modflair = CLIENT.rank;",
      "context": [
        {
          "lineNumber": 2795,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2796,
          "text": "            }"
        },
        {
          "lineNumber": 2797,
          "text": ""
        },
        {
          "lineNumber": 2798,
          "text": "            if (CLIENT.rank >= 2 && msg.indexOf(\"/m \") === 0) {"
        },
        {
          "lineNumber": 2799,
          "text": "                meta.modflair = CLIENT.rank;"
        },
        {
          "lineNumber": 2800,
          "text": "                msg = msg.substring(3);"
        },
        {
          "lineNumber": 2801,
          "text": "            }"
        },
        {
          "lineNumber": 2802,
          "text": "            socket.emit(\"pm\", {"
        },
        {
          "lineNumber": 2803,
          "text": "                to: user,"
        }
      ]
    },
    {
      "url": "https://cytu.be/js/util.js",
      "path": "/js/util.js",
      "pattern": "rank",
      "lineNumber": 3488,
      "line": "    div.data(\"rank\", data.rank);",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 93,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 99,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 105,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 243,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 249,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 255,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 364,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 370,
      "line": "            if (status.playbackState === \"ended\" && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 481,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 487,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 492,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 618,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 624,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 629,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 767,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 773,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 779,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 904,
      "line": "        if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 908,
      "line": "      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1005,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1011,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1017,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1182,
      "line": "                  if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1555,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1561,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1567,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "CLIENT.leader",
      "lineNumber": 1954,
      "line": "    if (CLIENT.leader || !USEROPTS.synch) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 93,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 99,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 105,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 243,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 249,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 255,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 364,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 370,
      "line": "            if (status.playbackState === \"ended\" && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 481,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 487,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 492,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 618,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 624,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 629,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 767,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 773,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 779,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 904,
      "line": "        if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 908,
      "line": "      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1005,
      "line": "            if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1011,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1017,
      "line": "            if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1182,
      "line": "                  if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1555,
      "line": "              if (CLIENT.leader) {",
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1561,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1567,
      "line": "              if (CLIENT.leader) {",
      "context": [
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
        }
      ]
    },
    {
      "url": "https://cytu.be/js/player.js",
      "path": "/js/player.js",
      "pattern": "leader",
      "lineNumber": 1954,
      "line": "    if (CLIENT.leader || !USEROPTS.synch) {",
      "context": [
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
        }
      ]
    }
  ],
  "errors": []
}


