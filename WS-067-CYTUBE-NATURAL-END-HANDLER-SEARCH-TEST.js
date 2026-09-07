/**
 * WS-067 — CYTUBE NATURAL END-OF-MEDIA HANDLER SEARCH TEST
 *
 * PURPOSE
 * -------
 * WS-066 proved the runtime transition:
 *
 *   current media ends
 *       -> Callbacks.setCurrent(next UID)
 *       -> Callbacks.changeMedia(next media)
 *
 * WS-066 did NOT prove what causes that transition.
 *
 * This test searches the LIVE loaded CyTube JavaScript sources for the
 * end-of-media/completion handler. We specifically want to determine whether
 * the browser:
 *
 *   1. emits "playNext" when media ends,
 *   2. calls another local function which eventually causes the transition,
 *   3. merely reports completion/player state while the server independently
 *      advances the playlist, or
 *   4. uses some other end-of-media mechanism.
 *
 * IMPORTANT
 * ---------
 * - PASSIVE / READ-ONLY.
 * - Does NOT emit Socket.IO events.
 * - Does NOT click anything.
 * - Does NOT alter playlist/player state.
 * - Fetches the currently loaded external JS files from the same origin.
 *
 * MOBILE CLIPBOARD WORKFLOW
 * -------------------------
 * The asynchronous test stores its result in window.__WS067_DATA__.
 * Because delayed clipboard writes are unreliable in this mobile DevTools
 * environment, copy the final result with a SEPARATE synchronous command:
 *
 *   copy(JSON.stringify(window.__WS067_DATA__,null,2))
 *
 * Then paste that output into the chat.
 */

(async()=>{
    const TEST = "WS-067";
    const started = new Date().toISOString();

    const data = {
        test: TEST,
        status: "RUNNING",
        started,
        channelName: window.CHANNEL?.name || null,
        scripts: [],
        matches: [],
        errors: []
    };

    window.__WS067_DATA__ = data;

    // Search terms are deliberately broad enough to catch event handlers,
    // while the result is later filtered/annotated for the important terms.
    const patterns = [
        "ended",
        "onended",
        "mediaEnd",
        "mediaEnded",
        "endMedia",
        "playNext",
        "nextMedia",
        "advance",
        "finished",
        "complete"
    ];

    function recordMatches(source, url) {
        const lines = source.split(/\\r?\\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lower = line.toLowerCase();
            const hit = patterns.find(p => lower.includes(p.toLowerCase()));
            if (!hit) continue;

            // Keep a small context window. This is much more useful than
            // dumping entire minified/large source files to the clipboard.
            const from = Math.max(0, i - 2);
            const to = Math.min(lines.length, i + 3);

            data.matches.push({
                url,
                pattern: hit,
                lineNumber: i + 1,
                context: lines.slice(from, to)
            });
        }
    }

    try {
        const scriptEls = Array.from(document.scripts)
            .map(s => s.src)
            .filter(Boolean);

        const uniqueUrls = [...new Set(scriptEls)];
        data.scriptCount = uniqueUrls.length;

        for (const url of uniqueUrls) {
            const entry = { url, status: null, bytes: null };
            data.scripts.push(entry);

            try {
                const response = await fetch(url, {
                    credentials: "include",
                    cache: "no-store"
                });

                entry.status = response.status;

                if (!response.ok) {
                    entry.error = "HTTP " + response.status;
                    continue;
                }

                const source = await response.text();
                entry.bytes = source.length;
                recordMatches(source, url);
            } catch (e) {
                entry.error = String(e);
                data.errors.push({url, error: String(e)});
            }
        }

        // Also inspect inline scripts. Some builds place player handlers in
        // inline code, so excluding them could create a false negative.
        const inlineScripts = Array.from(document.scripts)
            .filter(s => !s.src && s.textContent)
            .map((s, i) => ({index: i, source: s.textContent}));

        data.inlineScriptCount = inlineScripts.length;
        for (const item of inlineScripts) {
            recordMatches(item.source, "INLINE_SCRIPT_" + item.index);
        }

        // Deduplicate exact URL/pattern/line combinations.
        const seen = new Set();
        data.matches = data.matches.filter(m => {
            const key = [m.url, m.pattern, m.lineNumber].join("|");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Compact classification to make the eventual clipboard output useful.
        const interesting = data.matches.filter(m =>
            /playNext|ended|onended|mediaEnd|mediaEnded|nextMedia/i.test(
                m.context.join("\\n")
            )
        );

        data.summary = {
            scriptCount: data.scriptCount,
            inlineScriptCount: data.inlineScriptCount,
            matchCount: data.matches.length,
            interestingMatchCount: interesting.length,
            filesWithInterestingMatches: [...new Set(interesting.map(m => m.url))]
        };

        data.status = "COMPLETE";
        data.completed = new Date().toISOString();
    } catch (e) {
        data.status = "ERROR";
        data.errors.push({error: String(e), stack: e?.stack || null});
        data.completed = new Date().toISOString();
    }

    console.log("WS-067 COMPLETE", data.summary || data.errors);
    console.log("FINAL DATA STORED IN window.__WS067_DATA__");
    console.log("Run: copy(JSON.stringify(window.__WS067_DATA__,null,2))");
})();
