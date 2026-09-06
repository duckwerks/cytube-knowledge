/*
 * WS-055 — CYTUBE RUNTIME OUTBOUND SOCKET.IO EVENT CAPTURE TEST
 *
 * PURPOSE
 * -------
 * Capture actual runtime calls to window.socket.emit(...) during normal
 * CyTube operation without generating any socket traffic ourselves.
 *
 * IMPORTANT CLIPBOARD DESIGN
 * --------------------------
 * This test deliberately does NOT use an async/await IIFE. The previous
 * version waited with await setTimeout(...), then attempted copy(o) after the
 * asynchronous continuation. That made it difficult to distinguish a capture
 * failure from a DevTools clipboard-context failure.
 *
 * This version:
 *   1. Installs the observer synchronously.
 *   2. Immediately copies a STARTED marker, proving the command executed.
 *   3. Uses a normal setTimeout for the capture window.
 *   4. Builds the final JSON only when the timer fires.
 *   5. Attempts to copy the FINAL JSON immediately from that timer callback.
 *   6. Retains the final JSON in window.__WS055_OUTPUT__ regardless of copy.
 *   7. Exposes window.__WS055_RESTORE__ so a stale observer can be removed.
 *
 * SAFETY / SCOPE
 * --------------
 * - Does NOT call socket.emit() itself.
 * - Does NOT reconnect.
 * - Does NOT send chat, playlist, rank, moderation, or other commands.
 * - Temporarily wraps the existing socket.emit method so normal application
 *   calls continue through the original method unchanged.
 * - Automatically restores the original socket.emit after the capture window.
 */

(() => {
    const TEST = "WS-055";
    const CAPTURE_MS = 30000;

    // Remove a previous WS-055 observer if one exists.
    if (typeof window.__WS055_RESTORE__ === "function") {
        try { window.__WS055_RESTORE__(); } catch (e) {}
    }

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

    function copyText(text) {
        try {
            if (typeof copy === "function") {
                copy(text);
                return true;
            }
        } catch (e) {}

        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, ta.value.length);
            const ok = document.execCommand("copy");
            ta.remove();
            return !!ok;
        } catch (e) {
            return false;
        }
    }

    function finishAndCopy(reason) {
        out.captureEnded = new Date().toISOString();
        out.runtime.connectedAtEnd = !!window.socket?.connected;
        out.runtime.socketIdAtEnd = window.socket?.id ?? null;
        out.uniqueEventNames = Object.keys(out.eventCounts);
        out.finishReason = reason;
        out.completed = new Date().toISOString();

        const text = JSON.stringify(out, null, 2);
        window.__WS055_OUTPUT__ = text;

        const copied = copyText(text);
        out.clipboard = {
            attempted: true,
            copied: copied
        };

        // Re-serialize because clipboard status is part of the final record.
        const finalText = JSON.stringify(out, null, 2);
        window.__WS055_OUTPUT__ = finalText;

        // One more copy attempt using the final serialization.
        if (!copied) copyText(finalText);

        console.log(finalText);
        console.log(
            copied
                ? "=== WS-055 COMPLETE OUTPUT COPIED ==="
                : "=== WS-055 CLIPBOARD FAILED — OUTPUT RETAINED IN window.__WS055_OUTPUT__ ==="
        );
    }

    if (!window.socket || typeof window.socket.emit !== "function") {
        out.errors.push("window.socket.emit is unavailable");
        window.__WS055_OUTPUT__ = JSON.stringify(out, null, 2);
        copyText(window.__WS055_OUTPUT__);
        console.log(window.__WS055_OUTPUT__);
        console.log("=== WS-055 ABORTED — NO SOCKET.EMIT ===");
        return;
    }

    const socket = window.socket;
    const originalEmit = socket.emit;
    let active = true;
    let timerId = null;

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

        // CRITICAL: preserve normal CyTube behavior exactly.
        return originalEmit.apply(this, args);
    };

    function restore() {
        if (!active) return;
        active = false;
        if (timerId !== null) clearTimeout(timerId);
        try {
            if (socket.emit === window.__WS055_WRAPPED_EMIT__) {
                socket.emit = originalEmit;
                out.restored = socket.emit === originalEmit;
            } else if (socket.emit === originalEmit) {
                out.restored = true;
            } else {
                out.errors.push({
                    type: "restore",
                    error: "socket.emit changed after observer installation; original not overwritten"
                });
            }
        } catch (e) {
            out.errors.push({ type: "restore", error: String(e) });
        }
    }

    window.__WS055_WRAPPED_EMIT__ = socket.emit;
    window.__WS055_RESTORE__ = restore;
    out.captureStarted = new Date().toISOString();

    // Immediate synchronous proof that the test executed and clipboard works.
    const startedMarker = JSON.stringify({
        test: TEST,
        phase: "STARTED",
        timestamp: out.captureStarted,
        channelName: out.channelName,
        socketExists: true,
        socketConnected: !!socket.connected,
        note: "WS-055 observer installed; final JSON will replace this clipboard contents when capture completes."
    }, null, 2);
    window.__WS055_STARTUP__ = startedMarker;
    const startupCopied = copyText(startedMarker);
    console.log(startedMarker);
    console.log(
        startupCopied
            ? "=== WS-055 STARTUP MARKER COPIED ==="
            : "=== WS-055 STARTUP MARKER COPY FAILED ==="
    );

    timerId = setTimeout(() => {
        try {
            restore();
            finishAndCopy("timer");
        } catch (e) {
            out.errors.push({ type: "finalize", error: String(e), stack: e?.stack ?? null });
            try { restore(); } catch (ignore) {}
            out.completed = new Date().toISOString();
            const emergency = JSON.stringify(out, null, 2);
            window.__WS055_OUTPUT__ = emergency;
            copyText(emergency);
            console.log(emergency);
            console.log("=== WS-055 FINALIZATION ERROR — OUTPUT COPIED/RETAINED ===");
        } finally {
            try {
                delete window.__WS055_RESTORE__;
                delete window.__WS055_WRAPPED_EMIT__;
            } catch (e) {}
        }
    }, CAPTURE_MS);

    console.log("WS-055 observer installed. No outbound test event was generated. Capture timer is active.");
})();
