/*
================================================================================
WS-066 — CYTUBE AUTO-ADVANCE CAPTURE TEST
PASSIVE / CONTROLLED / MOBILE
================================================================================

PURPOSE
-------
Observe what CyTube does when the currently playing playlist item reaches its
natural end and the playlist automatically advances.

WS-065 established the controlled manual Play transition:

    Play click
        -> Callbacks.setCurrent(nextUid)
        -> Callbacks.changeMedia(media descriptor)
        -> Callbacks.mediaUpdate(...)

WS-066 asks whether natural media completion follows the same transition and,
if possible, whether an outbound Socket.IO application event is generated.

IMPORTANT MOBILE CLIPBOARD DESIGN
---------------------------------
Do NOT attempt to copy delayed output automatically.

1. Execute this command to ARM the test.
2. Let the CURRENT media item finish naturally. Do not click Play, Queue Next,
   vote-skip, refresh, or otherwise interact with the playlist while armed.
3. Execute the separate FINALIZE/COPY command after the transition occurs.

The final result is stored in window.__WS066_DATA__.

SAFETY
------
This test does not emit any Socket.IO event itself. It only wraps existing
Callbacks and socket.emit so real application traffic can be observed.
All original functions are called unchanged.

RESTORE
-------
window.__WS066_RESTORE__() restores the original callbacks, socket.emit, and
removes the document click listener.
================================================================================
*/

(function () {
    var d = window.__WS066_DATA__ = {
        test: "WS-066",
        status: "ARMED",
        timestamp: new Date().toISOString(),
        channelName: window.CHANNEL && window.CHANNEL.name || null,
        initial: {
            PL_CURRENT: window.PL_CURRENT,
            currentDomUid: null
        },
        transition: null,
        callbacks: [],
        outbound: [],
        errors: []
    };

    function currentDomUid() {
        try {
            var el = document.querySelector("#queue li.queue_active");
            if (!el) return null;
            var m = String(el.className).match(/(?:^|\s)pluid-([^\s]+)/);
            return m ? m[1] : null;
        } catch (e) {
            return null;
        }
    }

    function clone(x) {
        try { return JSON.parse(JSON.stringify(x)); }
        catch (e) { return String(x); }
    }

    d.initial.currentDomUid = currentDomUid();

    var originals = {
        setCurrent: window.Callbacks && window.Callbacks.setCurrent,
        changeMedia: window.Callbacks && window.Callbacks.changeMedia,
        mediaUpdate: window.Callbacks && window.Callbacks.mediaUpdate,
        emit: window.socket && window.socket.emit
    };

    if (!window.Callbacks) {
        d.status = "ERROR";
        d.errors.push("window.Callbacks unavailable");
        return;
    }

    if (!window.socket || typeof window.socket.emit !== "function") {
        d.status = "ERROR";
        d.errors.push("window.socket.emit unavailable");
        return;
    }

    window.__WS066_RESTORE__ = function () {
        try {
            if (window.Callbacks.setCurrent === wrappedSetCurrent) window.Callbacks.setCurrent = originals.setCurrent;
            if (window.Callbacks.changeMedia === wrappedChangeMedia) window.Callbacks.changeMedia = originals.changeMedia;
            if (window.Callbacks.mediaUpdate === wrappedMediaUpdate) window.Callbacks.mediaUpdate = originals.mediaUpdate;
            if (window.socket && window.socket.emit === wrappedEmit) window.socket.emit = originals.emit;
            if (clickHandlerInstalled) document.removeEventListener("click", clickHandler, true);
            d.restored = true;
        } catch (e) {
            d.errors.push("restore: " + String(e));
        }
    };

    var clickHandlerInstalled = false;

    function recordCallback(name, fn) {
        return function () {
            var args = [].slice.call(arguments);
            var rec = {
                timestamp: new Date().toISOString(),
                callback: name,
                PL_CURRENT_before: window.PL_CURRENT,
                currentDomUid_before: currentDomUid(),
                args: args.map(clone)
            };
            try {
                var result = fn.apply(this, arguments);
                rec.PL_CURRENT_after = window.PL_CURRENT;
                rec.currentDomUid_after = currentDomUid();
                d.callbacks.push(rec);
                return result;
            } catch (e) {
                rec.error = String(e);
                rec.stack = e && e.stack ? e.stack : null;
                rec.PL_CURRENT_after = window.PL_CURRENT;
                rec.currentDomUid_after = currentDomUid();
                d.callbacks.push(rec);
                throw e;
            }
        };
    }

    var wrappedSetCurrent = recordCallback("setCurrent", originals.setCurrent);
    var wrappedChangeMedia = recordCallback("changeMedia", originals.changeMedia);
    var wrappedMediaUpdate = recordCallback("mediaUpdate", originals.mediaUpdate);

    if (typeof originals.setCurrent === "function") window.Callbacks.setCurrent = wrappedSetCurrent;
    else d.errors.push("Callbacks.setCurrent is not a function");

    if (typeof originals.changeMedia === "function") window.Callbacks.changeMedia = wrappedChangeMedia;
    else d.errors.push("Callbacks.changeMedia is not a function");

    if (typeof originals.mediaUpdate === "function") window.Callbacks.mediaUpdate = wrappedMediaUpdate;
    else d.errors.push("Callbacks.mediaUpdate is not a function");

    var wrappedEmit = function () {
        var args = [].slice.call(arguments);
        var eventName = args.length ? args[0] : null;
        var rec = {
            timestamp: new Date().toISOString(),
            event: eventName,
            argCount: args.length,
            args: args.map(clone)
        };
        try {
            var e = new Error();
            rec.stack = e.stack || null;
        } catch (ignore) {}
        d.outbound.push(rec);
        return originals.emit.apply(this, arguments);
    };
    window.socket.emit = wrappedEmit;

    var clickHandler = function (e) {
        try {
            var n = e.target && e.target.closest ? e.target.closest("button") : null;
            if (!n) return;
            var text = (n.innerText || n.textContent || "").trim();
            if (text !== "Play") return;
            var li = n.closest("li.queue_entry");
            d.errors.push("UNEXPECTED PLAY CLICK WHILE WS-066 ARMED");
            d.transition = {
                type: "unexpected-play-click",
                timestamp: new Date().toISOString(),
                playlistUid: li ? $(li).data("uid") : null,
                PL_CURRENT_atClick: window.PL_CURRENT
            };
        } catch (e) {
            d.errors.push("click capture: " + String(e));
        }
    };
    document.addEventListener("click", clickHandler, true);
    clickHandlerInstalled = true;

    d.status = "CAPTURING";

    console.log(JSON.stringify(d, null, 2));
    console.log("=== WS-066 ARMED ===");
    console.log("Let the CURRENT video finish naturally.");
    console.log("Do not click Play, Queue Next, vote-skip, refresh, or interact with the playlist.");
    console.log("After the automatic transition occurs, run the separate FINALIZE/COPY command.");
})();
