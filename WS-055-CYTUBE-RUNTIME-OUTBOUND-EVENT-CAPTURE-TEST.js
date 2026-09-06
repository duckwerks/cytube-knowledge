/*
 * WS-055 — CYTUBE RUNTIME OUTBOUND SOCKET.IO EVENT CAPTURE TEST
 *
 * PURPOSE
 * -------
 * Observe actual runtime calls to window.socket.emit(...) without generating
 * any test traffic ourselves.
 *
 * This follows WS-054, which mapped literal socket.emit() call sites in the
 * loaded CyTube source. WS-055 answers the next question:
 *
 *   "Which outbound events are actually emitted during normal operation,
 *    and what payloads do they carry?"
 *
 * SAFETY / SCOPE
 * --------------
 * - Does NOT call socket.emit() itself.
 * - Does NOT reconnect.
 * - Does NOT send chat, playlist, rank, moderation, or other commands.
 * - Temporarily wraps the existing socket.emit method so normal application
 *   calls continue through the original method unchanged.
 * - Automatically restores the original socket.emit after the capture window.
 * - Captures only calls made after this test installs the observer.
 *
 * The capture window is intentionally finite so the observer does not remain
 * installed after the test finishes.
 */

(async () => {
    const TEST = "WS-055";
    const CAPTURE_MS = 30000;

    const out = {
        test: TEST,
        timestamp: new Date().toISOString(),
        channelName: window.CHANNEL?.name ?? null,
        runtime: {
            socketExists: !!window.socket,
            connectedAtStart: !!window.socket?.connected,
            socketId: window.socket?.id ?? null
        },
        captureWindowMs: CAPTURE_MS,
        capturedCount: 0,
        eventCounts: {},
        events: [],
        errors: [],
        restored: false
    };

    if (!window.socket || typeof window.socket.emit !== "function") {
        out.errors.push("window.socket.emit is unavailable");
        out.completed = new Date().toISOString();
        const o = JSON.stringify(out, null, 2);
        window.__WS055_OUTPUT__ = o;
        try { if (typeof copy === "function") copy(o); } catch (e) {}
        console.log(o);
        console.log("=== WS-055 ABORTED — NO SOCKET.EMIT ===");
        return;
    }

    const socket = window.socket;
    const originalEmit = socket.emit;
    let active = true;

    function safeValue(value, depth = 0, seen = new WeakSet()) {
        if (depth > 6) return "[MAX_DEPTH]";
        if (value === null || value === undefined) return value;

        const type = typeof value;
        if (type === "string" || type === "number" || type === "boolean") {
            return value;
        }
        if (type === "bigint") return String(value) + "n";
        if (type === "function") return "[Function]";
        if (type === "symbol") return String(value);

        if (type === "object") {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);

            if (value instanceof Error) {
                return {
                    name: value.name,
                    message: value.message,
                    stack: value.stack ?? null
                };
            }

            if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) {
                return {
                    type: value.constructor?.name ?? "TypedArray",
                    values: Array.from(value).slice(0, 256)
                };
            }

            if (value instanceof ArrayBuffer) {
                return {
                    type: "ArrayBuffer",
                    byteLength: value.byteLength
                };
            }

            if (Array.isArray(value)) {
                return value.map(v => safeValue(v, depth + 1, seen));
            }

            const result = {};
            for (const key of Object.keys(value)) {
                try {
                    result[key] = safeValue(value[key], depth + 1, seen);
                } catch (e) {
                    result[key] = "[Unreadable]";
                }
            }
            return result;
        }

        return String(value);
    }

    function stackForCapture() {
        try {
            const stack = new Error().stack || "";
            return stack.split("\n").slice(2, 12).join("\n");
        } catch (e) {
            return null;
        }
    }

    socket.emit = function (...args) {
        if (active) {
            try {
                const eventName = typeof args[0] === "string"
                    ? args[0]
                    : String(args[0]);

                const payloadArgs = args.slice(1);

                const record = {
                    timestamp: new Date().toISOString(),
                    event: eventName,
                    argCount: args.length,
                    args: safeValue(args),
                    stack: stackForCapture()
                };

                out.events.push(record);
                out.capturedCount++;
                out.eventCounts[eventName] = (out.eventCounts[eventName] || 0) + 1;
            } catch (e) {
                out.errors.push({
                    type: "capture",
                    error: String(e)
                });
            }
        }

        // CRITICAL: preserve normal CyTube behavior exactly.
        return originalEmit.apply(this, args);
    };

    out.captureStarted = new Date().toISOString();

    console.log("WS-055 observer installed. Capturing normal outbound socket.emit() traffic for 30 seconds. No test event will be emitted by this script.");

    await new Promise(resolve => setTimeout(resolve, CAPTURE_MS));

    active = false;

    try {
        if (socket.emit === originalEmit || socket.emit) {
            socket.emit = originalEmit;
            out.restored = socket.emit === originalEmit;
        }
    } catch (e) {
        out.errors.push({
            type: "restore",
            error: String(e)
        });
    }

    out.captureEnded = new Date().toISOString();
    out.runtime.connectedAtEnd = !!socket.connected;
    out.runtime.socketIdAtEnd = socket.id ?? null;
    out.uniqueEventNames = Object.keys(out.eventCounts);
    out.completed = new Date().toISOString();

    const o = JSON.stringify(out, null, 2);
    window.__WS055_OUTPUT__ = o;

    let copied = false;
    try {
        if (typeof copy === "function") {
            copy(o);
            copied = true;
        }
    } catch (e) {}

    if (!copied) {
        try {
            const ta = document.createElement("textarea");
            ta.value = o;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, ta.value.length);
            copied = document.execCommand("copy");
            ta.remove();
        } catch (e) {}
    }

    console.log(o);
    console.log(
        copied
            ? "=== WS-055 COMPLETE OUTPUT COPIED ==="
            : "=== WS-055 CLIPBOARD FAILED — OUTPUT RETAINED IN window.__WS055_OUTPUT__ ==="
    );
})();
