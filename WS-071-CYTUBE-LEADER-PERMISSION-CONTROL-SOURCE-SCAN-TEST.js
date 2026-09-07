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