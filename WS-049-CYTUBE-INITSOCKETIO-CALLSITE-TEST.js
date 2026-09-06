/*
============================================================
WS-049 — CYTUBE INITSOCKETIO CALL-SITE TEST
PASSIVE / READ-ONLY / MOBILE
============================================================

PURPOSE
-------
WS-048 searched globally exposed functions for a caller of
initSocketIO() and found no matches.

WS-049 changes strategy: inspect the currently loaded inline
<script> elements for a real initSocketIO(...) call site.

This test does NOT invoke initSocketIO(), socket methods, or
change any runtime state.

OUTPUT
------
Returns a compact JSON object suitable for the established
browser-console -> copy -> paste -> analysis workflow.

NOTE
----
The copy() call is guarded because copy() is a DevTools helper
and is not guaranteed to exist in every console environment.
*/

(()=>{
    const T = "WS-049";
    const out = {
        test: T,
        timestamp: new Date().toISOString(),
        scriptCount: document.scripts.length,
        matches: []
    };

    [...document.scripts].forEach((script, index) => {
        if (script.src) return;

        const source = script.textContent || "";
        if (!source || !/\binitSocketIO\b/.test(source)) return;

        const lines = source.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
            if (!/\binitSocketIO\s*\(/.test(lines[i])) continue;

            // Exclude the function declaration itself.
            if (/^\s*function\s+initSocketIO\s*\(/.test(lines[i])) continue;

            out.matches.push({
                scriptIndex: index,
                scriptSrc: "(inline)",
                line: i + 1,
                context: lines.slice(
                    Math.max(0, i - 4),
                    Math.min(lines.length, i + 5)
                ).join("\n")
            });
        }
    });

    out.completed = new Date().toISOString();

    const output = JSON.stringify(out, null, 2);
    console.log(output);

    if (typeof copy === "function") {
        copy(output);
        console.log("=== WS-049 COMPLETE OUTPUT COPIED ===");
    } else {
        console.log("=== WS-049 COMPLETE OUTPUT ===");
        console.log("DevTools copy() unavailable; output remains in console.");
    }
})();
