/*
WS-065 — CYTUBE INBOUND CURRENT/MEDIA CORRELATION TEST
PASSIVE CAPTURE + ONE CONTROLLED PLAY ACTION

Purpose:
  Determine the runtime relationship between the inbound Socket.IO callbacks:
    - Callbacks.setCurrent(uid)
    - Callbacks.changeMedia(data)
    - Callbacks.mediaUpdate(data)

  Also correlate the callbacks with the user's single playlist Play action and
  the client-side PL_CURRENT value.

Important:
  This test does NOT call socket.emit().
  It wraps existing callback functions so real server-delivered events can be
  observed while preserving normal application behavior.

Mobile clipboard rule:
  Collection may be asynchronous, but final copy MUST be a separate synchronous
  console command because delayed copy() does not reliably replace the clipboard
  in the mobile DevTools environment.
*/

window.__WS065_DATA__ = {
    test: "WS-065",
    status: "ARMED",
    timestamp: new Date().toISOString(),
    channelName: window.CHANNEL && window.CHANNEL.name || null,
    initial: {
        PL_CURRENT: window.PL_CURRENT,
        currentDomUid: null
    },
    click: null,
    callbacks: [],
    errors: []
};

(function () {
    var d = window.__WS065_DATA__;

    function currentDomUid() {
        try {
            var el = document.querySelector("#queue li.queue_active");
            if (!el) return null;
            var m = String(el.className).match(/(?:^|\\s)pluid-([^\\s]+)/);
            return m ? m[1] : null;
        } catch (e) {
            return null;
        }
    }

    d.initial.currentDomUid = currentDomUid();

    /* Capture whichever playlist Play button the user actually clicks. */
    var clickHandler = function (e) {
        try {
            var n = e.target && e.target.closest ? e.target.closest("button") : null;
            if (!n) return;
            var text = (n.innerText || n.textContent || "").trim();
            if (text !== "Play") return;

            var li = n.closest("li.queue_entry");
            d.click = {
                timestamp: new Date().toISOString(),
                buttonText: text,
                tag: n.tagName,
                className: n.className || "",
                playlistUid: li ? $(li).data("uid") : null,
                parentText: n.parentElement ? (n.parentElement.innerText || "").trim().slice(0, 300) : null,
                PL_CURRENT_atClick: window.PL_CURRENT
            };
        } catch (e) {
            d.errors.push("click capture: " + String(e));
        }
    };

    document.addEventListener("click", clickHandler, true);
    d.clickHandlerInstalled = true;

    if (!window.Callbacks) {
        d.status = "ERROR";
        d.errors.push("window.Callbacks unavailable");
        return;
    }

    ["setCurrent", "changeMedia", "mediaUpdate"].forEach(function (key) {
        try {
            var original = window.Callbacks[key];
            if (typeof original !== "function") {
                d.errors.push("Callbacks." + key + " is not a function");
                return;
            }

            function makeWrapper(name, fn) {
                return function () {
                    var args = [].slice.call(arguments);
                    var rec = {
                        timestamp: new Date().toISOString(),
                        callback: name,
                        PL_CURRENT_before: window.PL_CURRENT,
                        args: args.map(function (x) {
                            try { return JSON.parse(JSON.stringify(x)); }
                            catch (e) { return String(x); }
                        })
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
                        d.callbacks.push(rec);
                        throw e;
                    }
                };
            }

            var wrapped = makeWrapper(key, original);
            window.Callbacks[key] = wrapped;

            if (!window.__WS065_RESTORE__) window.__WS065_RESTORE__ = {};
            window.__WS065_RESTORE__[key] = function () {
                if (window.Callbacks[key] === wrapped) {
                    window.Callbacks[key] = original;
                }
            };
        } catch (e) {
            d.errors.push("wrap " + key + ": " + String(e));
        }
    });

    d.status = "CAPTURING";
    console.log(JSON.stringify(d, null, 2));
    console.log("=== WS-065 ARMED: CLICK EXACTLY ONE VISIBLE PLAY BUTTON IN THE PLAYLIST ===");
    console.log("Do not click anything else before finalizing.");
})();
