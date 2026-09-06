/*
 * WS-056 — CYTUBE CONTROLLED RUNTIME OUTBOUND EVENT CAPTURE TEST
 *
 * PURPOSE
 * -------
 * Determine whether wrapping window.socket.emit captures a known CyTube
 * application event when the user deliberately performs the corresponding
 * normal UI action.
 *
 * WS-055 proved that the passive observer works and restores socket.emit,
 * but captured zero events during a 30-second idle observation window.
 * WS-056 therefore separates "no event happened" from "emit interception
 * cannot see application traffic" by installing the observer and waiting
 * for one controlled normal action.
 *
 * IMPORTANT
 * ---------
 * This test does NOT call socket.emit itself and does NOT synthesize an
 * application event. The user must perform one ordinary CyTube action after
 * the observer is installed.
 *
 * RECOMMENDED ACTION
 * ------------------
 * Send one ordinary chat message using the CyTube chat UI.
 * The expected outbound Socket.IO event is "chatMsg".
 *
 * OUTPUT / MOBILE CLIPBOARD
 * -------------------------
 * Because delayed clipboard writes are unreliable in this mobile DevTools
 * environment, the completed JSON is retained in window.__WS056_OUTPUT__.
 * After the test completes, copy that value with a separate synchronous
 * console command.
 *
 * CAPTURE WINDOW
 * --------------
 * 60 seconds. This gives the user enough time to perform exactly one normal
 * action without requiring the test to generate traffic itself.
 */

(() => {
    const TEST = "WS-056";
    const EXPECTED_EVENT = "chatMsg";
    const CAPTURE_MS = 60000;

    if (typeof window.__WS056_RESTORE__ === "function") {
        try { window.__WS056_RESTORE__(); } catch (e) {}
    }

    const socket = window.socket;
    const out = {
        test: TEST,
        status: "STARTED",
        timestamp: new Date().toISOString(),
        channelName: window.CHANNEL?.name ?? null,
        expectedEvent: EXPECTED_EVENT,
        captureWindowMs: CAPTURE_MS,
        instructions: "Perform exactly ONE ordinary chat send using the CyTube UI.",
        runtime: {
            socketExists: !!socket,
            connectedAtStart: !!socket?.connected,
            socketIdAtStart: socket?.id ?? null
        },
        capturedCount: 0,
        eventCounts: {},
        events: [],
        errors: [],
        restored: false
    };

    function safeValue(value, depth = 0, seen = new WeakSet()) {
        if (depth > 6) return "[MAX_DEPTH]";
        if (value === null || value === undefined) return value;
        const type = typeof value;
        if (type === "string" || type === "number" || type === "boolean") return value;
        if (type === "bigint") return String(value) + "n";
        if (type === "function") return "[Function]";
        if (type === "symbol") return String(value);

        if (type === "object") {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);
            if (value instanceof Error) {
                return { name: value.name, message: value.message, stack: value.stack ?? null };
            }
            if (Array.isArray(value)) {
                return value.map(v => safeValue(v, depth + 1, seen));
            }
            const result = {};
            for (const key of Object.keys(value)) {
                try { result[key] = safeValue(value[key], depth + 1, seen); }
                catch (e) { result[key] = "[Unreadable]"; }
            }
            return result;
        }
        return String(value);
    }

    function stackForCapture() {
        try {
            return (new Error().stack || "").split("\n").slice(2, 12).join("\n");
        } catch (e) {
            return null;
        }
    }

    function restore() {
        if (!window.__WS056_ACTIVE__) return;
        window.__WS056_ACTIVE__ = false;
        if (window.__WS056_TIMER__) clearTimeout(window.__WS056_TIMER__);
        try {
            if (socket && socket.emit === window.__WS056_WRAPPED_EMIT__) {
                socket.emit = window.__WS056_ORIGINAL_EMIT__;
                out.restored = socket.emit === window.__WS056_ORIGINAL_EMIT__;
            } else if (socket && socket.emit === window.__WS056_ORIGINAL_EMIT__) {
                out.restored = true;
            } else {
                out.errors.push({ type: "restore", error: "socket.emit changed unexpectedly" });
            }
        } catch (e) {
            out.errors.push({ type: "restore", error: String(e) });
        }
    }

    function finish(reason) {
        restore();
        out.status = "COMPLETE";
        out.finishReason = reason;
        out.captureEnded = new Date().toISOString();
        out.runtime.connectedAtEnd = !!window.socket?.connected;
        out.runtime.socketIdAtEnd = window.socket?.id ?? null;
        out.uniqueEventNames = Object.keys(out.eventCounts);
        out.expectedEventCaptured = !!out.eventCounts[EXPECTED_EVENT];
        out.completed = new Date().toISOString();
        window.__WS056_OUTPUT__ = JSON.stringify(out, null, 2);
        console.log(window.__WS056_OUTPUT__);
        console.log("=== WS-056 COMPLETE — COPY window.__WS056_OUTPUT__ SYNCHRONOUSLY ===");
    }

    if (!socket || typeof socket.emit !== "function") {
        out.status = "ABORTED";
        out.errors.push("window.socket.emit is unavailable");
        out.completed = new Date().toISOString();
        window.__WS056_OUTPUT__ = JSON.stringify(out, null, 2);
        console.log(window.__WS056_OUTPUT__);
        return;
    }

    window.__WS056_ORIGINAL_EMIT__ = socket.emit;
    window.__WS056_ACTIVE__ = true;

    socket.emit = function (...args) {
        if (window.__WS056_ACTIVE__) {
            try {
                const eventName = typeof args[0] === "string" ? args[0] : String(args[0]);
                out.events.push({
                    timestamp: new Date().toISOString(),
                    event: eventName,
                    argCount: args.length,
                    args: safeValue(args),
                    stack: stackForCapture()
                });
                out.capturedCount++;
                out.eventCounts[eventName] = (out.eventCounts[eventName] || 0) + 1;
            } catch (e) {
                out.errors.push({ type: "capture", error: String(e) });
            }
        }
        return window.__WS056_ORIGINAL_EMIT__.apply(this, args);
    };

    window.__WS056_WRAPPED_EMIT__ = socket.emit;
    window.__WS056_RESTORE__ = restore;
    out.status = "ARMED";
    out.captureStarted = new Date().toISOString();

    console.log(JSON.stringify({
        test: TEST,
        status: "ARMED",
        expectedEvent: EXPECTED_EVENT,
        captureWindowMs: CAPTURE_MS,
        instruction: "Now perform EXACTLY ONE ordinary chat send using the CyTube UI. Do not run another console command until finished."
    }, null, 2));

    window.__WS056_TIMER__ = setTimeout(() => {
        try {
            finish("timer");
        } catch (e) {
            out.errors.push({ type: "finalize", error: String(e), stack: e?.stack ?? null });
            out.status = "FINALIZATION_ERROR";
            out.completed = new Date().toISOString();
            window.__WS056_OUTPUT__ = JSON.stringify(out, null, 2);
            console.log(window.__WS056_OUTPUT__);
        } finally {
            try {
                delete window.__WS056_RESTORE__;
                delete window.__WS056_WRAPPED_EMIT__;
                delete window.__WS056_ORIGINAL_EMIT__;
                delete window.__WS056_TIMER__;
            } catch (e) {}
        }
    }, CAPTURE_MS);
})();
