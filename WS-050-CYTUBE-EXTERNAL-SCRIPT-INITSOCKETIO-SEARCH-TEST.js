/*
============================================================
WS-050 — CYTUBE EXTERNAL SCRIPT INITSOCKETIO SEARCH TEST
PASSIVE / READ-ONLY / MOBILE
============================================================

PURPOSE
-------
WS-049 found no initSocketIO(...) call site in inline scripts.
WS-050 therefore examines the external JavaScript resources
actually loaded by the current page and searches their source
for initSocketIO(...) call sites.

No function is invoked and no runtime state is modified.

OUTPUT
------
Compact JSON for the established console -> copy -> paste
workflow. Each external script is fetched independently so one
failed/CORS-blocked resource does not abort the test.
*/

(async()=>{
    const T = "WS-050";
    const out = {
        test: T,
        timestamp: new Date().toISOString(),
        scriptCount: document.scripts.length,
        externalScripts: [],
        matches: [],
        fetchErrors: []
    };

    const urls = [...document.scripts]
        .map(s => s.src)
        .filter(Boolean);

    out.externalScripts = [...new Set(urls)];

    for (const url of out.externalScripts) {
        try {
            const response = await fetch(url, {credentials:"same-origin"});
            if (!response.ok) {
                out.fetchErrors.push({url, error:`HTTP ${response.status}`});
                continue;
            }

            const source = await response.text();
            if (!/\binitSocketIO\b/.test(source)) continue;

            const lines = source.split(/\r?\n/);

            for (let i = 0; i < lines.length; i++) {
                if (!/\binitSocketIO\s*\(/.test(lines[i])) continue;
                if (/^\s*function\s+initSocketIO\s*\(/.test(lines[i])) continue;

                out.matches.push({
                    url,
                    line: i + 1,
                    context: lines.slice(
                        Math.max(0, i - 5),
                        Math.min(lines.length, i + 6)
                    ).join("\n")
                });
            }
        } catch (e) {
            out.fetchErrors.push({
                url,
                error: String(e)
            });
        }
    }

    out.completed = new Date().toISOString();

    const output = JSON.stringify(out, null, 2);
    console.log(output);

    if (typeof copy === "function") {
        copy(output);
        console.log("=== WS-050 COMPLETE OUTPUT COPIED ===");
    } else {
        console.log("=== WS-050 COMPLETE OUTPUT ===");
    }
})();
