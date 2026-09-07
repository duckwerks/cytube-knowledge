/**
 * ============================================================================
 * WS-070 — CYTUBE LEADER RUNTIME ASSIGNMENT OBSERVATION TEST
 * ============================================================================
 *
 * TEST CLASS
 * --------------------------------------------------------------------------
 * PASSIVE / READ-ONLY / RUNTIME OBSERVATION
 *
 * PURPOSE
 * --------------------------------------------------------------------------
 * WS-069 established from live source that CLIENT.leader is changed by
 * leader-related callback logic.  WS-067 established that CLIENT.leader is
 * the gate used before the client emits playNext when media ends.
 *
 * The next question is narrower:
 *
 *   WHAT INBOUND RUNTIME EVENT ACTUALLY ASSIGNS / CLEARS LEADERSHIP?
 *
 * This test observes the existing Socket.IO callback path for "setLeader"
 * without sending any event and without changing any Cytube state.
 *
 * QUESTIONS
 * --------------------------------------------------------------------------
 * 1. Does the live runtime receive a setLeader callback?
 * 2. What arguments/payload does setLeader receive?
 * 3. What is CLIENT.leader before and after the callback?
 * 4. What is CLIENT.name when the callback arrives?
 * 5. Does setLeader directly produce CLIENT.leader=true/false?
 * 6. Are there other leader-related inbound callbacks around the same time?
 * 7. Does the runtime reveal whether the leader identity is represented as a
 *    username/string, object, null, or some other structure?
 *
 * IMPORTANT LIMITATIONS
 * --------------------------------------------------------------------------
 * This is NOT a server-authorization test.
 *
 * It observes the browser's already-existing callback machinery.  It does
 * not prove why the server chose a leader, who is authorized to assign one,
 * or what server-side rank checks occur.
 *
 * It also does not force a leader change.  We want naturally occurring
 * runtime evidence first, because synthetic assignment could obscure the
 * real protocol.
 *
 * OBSERVATION WINDOW
 * --------------------------------------------------------------------------
 * The test arms immediately and watches for 60 seconds.  During that time
 * the user should simply remain in the channel.  If a natural setLeader,
 * reconnect, leader reassignment, or related event occurs, it is recorded.
 *
 * We also capture the Socket.IO event registration wrapper at the callback
 * level rather than replacing socket.emit.  This is important because
 * setLeader is an INBOUND event.
 *
 * OUTPUT / MOBILE CLIPBOARD
 * --------------------------------------------------------------------------
 * Kiwi mobile DevTools reliably accepts copy() when executed synchronously
 * as a direct console command.  Delayed/asynchronous clipboard writes have
 * previously failed to replace the clipboard.
 *
 * Therefore the test stores its complete result in:
 *
 *     window.__WS070_DATA__
 *
 * After the test reports COMPLETE, execute the separate synchronous copy
 * command supplied with this artifact.
 *
 * SAFETY
 * --------------------------------------------------------------------------
 * This test:
 *   - does NOT socket.emit()
 *   - does NOT click anything
 *   - does NOT alter CLIENT.leader
 *   - does NOT alter rank
 *   - does NOT alter playlist
 *   - does NOT alter player state
 *   - does NOT disconnect the socket
 *   - does NOT replace the application's callback permanently
 *
 * It temporarily wraps Callbacks.setLeader only long enough to observe calls,
 * then restores the original function automatically when the window ends.
 *
 * EXPECTED VALUE
 * --------------------------------------------------------------------------
 * If a natural setLeader event occurs, we should obtain the exact runtime
 * payload and can correlate it with CLIENT.name and CLIENT.leader.
 *
 * If no setLeader event occurs during the window, that is still useful: it
 * means we need a different controlled trigger (likely reconnect/leader
 * election observation) rather than guessing at the protocol.
 *
 * ============================================================================
 */

(async function WS070() {
    const TEST = "WS-070";
    const started = new Date().toISOString();
    const WINDOW_MS = 60000;

    // Clean up a previous accidental run if one exists.
    if (window.__WS070_RESTORE__) {
        try { window.__WS070_RESTORE__(); } catch (e) {}
    }

    const data = {
        test: TEST,
        status: "ARMING",
        started,
        windowMs: WINDOW_MS,
        channelName: window.CHANNEL?.name ?? null,
        runtime: {
            socketExists: !!window.socket,
            socketConnected: !!window.socket?.connected,
            socketId: window.socket?.id ?? null,
            clientName: window.CLIENT?.name ?? null,
            clientRank: window.CLIENT?.rank ?? null,
            clientLeader: window.CLIENT?.leader ?? null,
            callbacksExists: !!window.Callbacks,
            setLeaderExists: typeof window.Callbacks?.setLeader === "function"
        },
        events: [],
        errors: [],
        restored: false,
        completed: null
    };

    window.__WS070_DATA__ = data;

    if (!window.Callbacks || typeof window.Callbacks.setLeader !== "function") {
        data.status = "ABORTED";
        data.errors.push("Callbacks.setLeader is not available");
        data.completed = new Date().toISOString();
        console.log("WS-070 ABORTED — no Callbacks.setLeader function");
        return;
    }

    const originalSetLeader = window.Callbacks.setLeader;
    let restored = false;
    let timer = null;

    function snapshot() {
        return {
            clientName: window.CLIENT?.name ?? null,
            clientRank: window.CLIENT?.rank ?? null,
            clientLeader: window.CLIENT?.leader ?? null
        };
    }

    function restore() {
        if (restored) return;
        restored = true;
        try {
            window.Callbacks.setLeader = originalSetLeader;
        } catch (e) {
            data.errors.push("Restore error: " + String(e));
        }
        if (timer) clearTimeout(timer);
        data.restored = true;
    }

    window.__WS070_RESTORE__ = restore;

    window.Callbacks.setLeader = function () {
        const args = Array.from(arguments);
        const before = snapshot();

        let result;
        let thrown = null;

        try {
            result = originalSetLeader.apply(this, args);
        } catch (e) {
            thrown = String(e && (e.stack || e));
        }

        const after = snapshot();

        data.events.push({
            timestamp: new Date().toISOString(),
            event: "setLeader",
            argCount: args.length,
            args,
            before,
            after,
            leaderChanged: before.clientLeader !== after.clientLeader,
            error: thrown
        });

        if (thrown) data.errors.push(thrown);

        console.log("WS-070 observed setLeader", {
            args,
            beforeLeader: before.clientLeader,
            afterLeader: after.clientLeader,
            clientName: after.clientName
        });

        return result;
    };

    data.status = "CAPTURING";
    console.log("WS-070 ARMED — passively observing inbound setLeader for 60 seconds");
    console.log("Do not click anything for this test.");

    timer = setTimeout(function () {
        restore();
        data.status = "COMPLETE";
        data.ended = new Date().toISOString();
        data.completed = data.ended;
        data.finalRuntime = snapshot();

        console.log("WS-070 COMPLETE — result stored in window.__WS070_DATA__");
        console.log({
            setLeaderEvents: data.events.length,
            leaderChanges: data.events.filter(e => e.leaderChanged).length,
            errors: data.errors.length,
            finalLeader: data.finalRuntime.clientLeader,
            restored: data.restored
        });
    }, WINDOW_MS);
})();

{
  "test": "WS-070",
  "status": "COMPLETE",
  "started": "2026-09-07T18:15:45.166Z",
  "windowMs": 60000,
  "channelName": "American-Dad",
  "runtime": {
    "socketExists": true,
    "socketConnected": true,
    "socketId": "Oij-9wUn3ra3Mli4nF6R",
    "clientName": "heytheirturbo",
    "clientRank": 1,
    "clientLeader": false,
    "callbacksExists": true,
    "setLeaderExists": true
  },
  "events": [],
  "errors": [],
  "restored": true,
  "completed": "2026-09-07T18:16:45.172Z",
  "ended": "2026-09-07T18:16:45.172Z",
  "finalRuntime": {
    "clientName": "heytheirturbo",
    "clientRank": 1,
    "clientLeader": false
  }
}

(async function WS070() {
    const TEST = "WS-070";
    const started = new Date().toISOString();
    const WINDOW_MS = 60000;

    // Clean up a previous accidental run if one exists.
    if (window.__WS070_RESTORE__) {
        try { window.__WS070_RESTORE__(); } catch (e) {}
    }

    const data = {
        test: TEST,
        status: "ARMING",
        started,
        windowMs: WINDOW_MS,
        channelName: window.CHANNEL?.name ?? null,
        runtime: {
            socketExists: !!window.socket,
            socketConnected: !!window.socket?.connected,
            socketId: window.socket?.id ?? null,
            clientName: window.CLIENT?.name ?? null,
            clientRank: window.CLIENT?.rank ?? null,
            clientLeader: window.CLIENT?.leader ?? null,
            callbacksExists: !!window.Callbacks,
            setLeaderExists: typeof window.Callbacks?.setLeader === "function"
        },
        events: [],
        errors: [],
        restored: false,
        completed: null
    };

    window.__WS070_DATA__ = data;

    if (!window.Callbacks || typeof window.Callbacks.setLeader !== "function") {
        data.status = "ABORTED";
        data.errors.push("Callbacks.setLeader is not available");
        data.completed = new Date().toISOString();
        console.log("WS-070 ABORTED — no Callbacks.setLeader function");
        return;
    }

    const originalSetLeader = window.Callbacks.setLeader;
    let restored = false;
    let timer = null;

    function snapshot() {
        return {
            clientName: window.CLIENT?.name ?? null,
            clientRank: window.CLIENT?.rank ?? null,
            clientLeader: window.CLIENT?.leader ?? null
        };
    }

    function restore() {
        if (restored) return;
        restored = true;

        try {
            window.Callbacks.setLeader = originalSetLeader;
        } catch (e) {
            data.errors.push("Restore error: " + String(e));
        }

        if (timer) clearTimeout(timer);
        data.restored = true;
    }

    window.__WS070_RESTORE__ = restore;

    /*
     * Wrap ONLY the existing inbound setLeader callback.
     *
     * We call the original function unchanged, so this is observational:
     *
     *     Socket.IO inbound setLeader
     *              ↓
     *       our observation wrapper
     *              ↓
     *       original setLeader
     *              ↓
     *       normal Cytube behavior
     *
     * No socket.emit() is performed.
     */
    window.Callbacks.setLeader = function () {
        const args = Array.from(arguments);
        const before = snapshot();

        let result;
        let thrown = null;

        try {
            result = originalSetLeader.apply(this, args);
        } catch (e) {
            thrown = String(e && (e.stack || e));
        }

        const after = snapshot();

        data.events.push({
            timestamp: new Date().toISOString(),
            event: "setLeader",
            argCount: args.length,
            args,
            before,
            after,
            leaderChanged: before.clientLeader !== after.clientLeader,
            error: thrown
        });

        if (thrown) data.errors.push(thrown);

        console.log("WS-070 observed setLeader", {
            args,
            beforeLeader: before.clientLeader,
            afterLeader: after.clientLeader,
            clientName: after.clientName
        });

        return result;
    };

    data.status = "CAPTURING";

    console.log(
        "WS-070 ARMED — passively observing inbound setLeader for 60 seconds"
    );
    console.log("Do not click anything for this test.");

    timer = setTimeout(function () {
        restore();

        data.status = "COMPLETE";
        data.ended = new Date().toISOString();
        data.completed = data.ended;
        data.finalRuntime = snapshot();

        console.log(
            "WS-070 COMPLETE — result stored in window.__WS070_DATA__"
        );

        console.log({
            setLeaderEvents: data.events.length,
            leaderChanges: data.events.filter(e => e.leaderChanged).length,
            errors: data.errors.length,
            finalLeader: data.finalRuntime.clientLeader,
            restored: data.restored
        });
    }, WINDOW_MS);
})();

{
  "test": "WS-070",
  "status": "COMPLETE",
  "started": "2026-09-07T18:20:29.381Z",
  "windowMs": 60000,
  "channelName": "American-Dad",
  "runtime": {
    "socketExists": true,
    "socketConnected": true,
    "socketId": "OpuNHamraPUdEPVonF8P",
    "clientName": "heytheirturbo",
    "clientRank": 1,
    "clientLeader": false,
    "callbacksExists": true,
    "setLeaderExists": true
  },
  "events": [],
  "errors": [],
  "restored": true,
  "completed": "2026-09-07T18:21:29.399Z",
  "ended": "2026-09-07T18:21:29.399Z",
  "finalRuntime": {
    "clientName": "heytheirturbo",
    "clientRank": 1,
    "clientLeader": false
  }
}
