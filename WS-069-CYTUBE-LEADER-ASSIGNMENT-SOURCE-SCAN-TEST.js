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
