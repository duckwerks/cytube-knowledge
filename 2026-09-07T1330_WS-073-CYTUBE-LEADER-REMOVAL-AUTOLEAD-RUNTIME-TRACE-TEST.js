/*****************************************************************************************
 * WS-073 — CYTUBE LEADER REMOVAL + AUTOLEAD RUNTIME TRACE TEST
 *
 * PURPOSE
 * -------
 * WS-072 established the controlled "Give Leader" path:
 *
 *     UI
 *      ↓
 *     socket.emit("assignLeader", { name: USER })
 *      ↓
 *     CYTUBE SERVER
 *      ↓
 *     setLeader(USER)
 *      ↓
 *     CLIENT.leader = true
 *      ↓
 *     leader mediaUpdate timer begins
 *
 *
 * WS-073 tests the reverse lifecycle:
 *
 *     UI
 *      ↓
 *     socket.emit("assignLeader", { name: "" })
 *      ↓
 *     CYTUBE SERVER
 *      ↓
 *     setLeader("")
 *      ↓
 *     CLIENT.leader = false
 *      ↓
 *     server resumes AUTOLEAD
 *
 *
 * IMPORTANT
 * ---------
 * This test DOES NOT automatically remove the leader.
 *
 * The user must manually perform ONE:
 *
 *     "Remove Leader"
 *
 * while the current user is the active leader.
 *
 *
 * WHY THIS TEST MATTERS
 * ---------------------
 * The CyTube server source in calzoneman/sync shows that when the current
 * leader disappears or is removed, the PlaylistModule can call:
 *
 *     resumeAutolead()
 *
 * That server-side path:
 *
 *     broadcasts setLeader("")
 *     restores the server-controlled playback state
 *     sends a media update
 *     starts the server-side lead loop
 *
 * We already have source evidence for this behavior.
 *
 * WS-073 attempts to correlate that source behavior with the live runtime.
 *
 *
 * EVIDENCE WE WANT
 * ----------------
 *
 * 1. Outbound:
 *       assignLeader({ name: "" })
 *
 * 2. Inbound:
 *       setLeader("")
 *
 * 3. Client state:
 *       CLIENT.leader: true → false
 *
 * 4. Timing:
 *       outbound assignLeader
 *       → inbound setLeader
 *
 * 5. Follow-up:
 *       mediaUpdate traffic after leader removal
 *
 * 6. Whether another leader assignment occurs during the observation
 *
 *
 * IMPORTANT INTERPRETATION RULE
 * -----------------------------
 * Seeing setLeader("") proves the client received the leader-clear command.
 *
 * Seeing subsequent mediaUpdate traffic is consistent with the server
 * resuming playback synchronization, but this test alone does NOT prove
 * every internal server operation unless the exact server implementation
 * can be correlated with the observed sequence.
 *
 * The source/runtime combination is therefore stronger than runtime alone.
 *
 *
 * MOBILE DEVTOOLS DESIGN
 * ----------------------
 * This test follows the project's established mobile workflow:
 *
 *     ASYNC TEST
 *         ↓
 *     window.__WS073_DATA__
 *         ↓
 *     synchronous copy(...) command
 *
 * DO NOT rely on navigator.clipboard.writeText().
 *****************************************************************************************/

(async () => {

    const TEST_NAME = "WS-073";

    const startedAt = new Date().toISOString();

    /*************************************************************************************
     * RESULT OBJECT
     *
     * Everything important is stored here so that the separate synchronous
     * copy command can retrieve it later.
     *************************************************************************************/
    const result = {
        test: TEST_NAME,
        status: "RUNNING",

        startedAt: startedAt,
        completedAt: null,

        page: {
            url: location.href,
            title: document.title,
            readyState: document.readyState
        },

        runtime: {
            channelName: null,
            clientName: null,
            clientRank: null,
            clientLeader: null,

            socketExists: false,
            socketConnected: false,

            callbacksExists: false,
            setLeaderExists: false
        },

        initialState: {
            clientLeader: null,
            currentLeaderName: null
        },

        events: [],

        eventCounts: {
            assignLeader: 0,
            setLeader: 0,
            mediaUpdate: 0,
            otherOutbound: 0
        },

        leaderTransitions: [],

        timing: {
            assignLeaderToSetLeaderMs: null
        },

        finalState: {
            clientLeader: null,
            currentLeaderName: null
        },

        summary: {
            outboundRemovalObserved: false,
            inboundLeaderClearObserved: false,
            clientLeaderChangedToFalse: false,

            endToEndRemovalPathObserved: false,

            postRemovalMediaUpdateObserved: false,

            serverAcceptanceInferred: false,

            serverSourceCodeProven: true,

            autoleadRuntimeBehaviorObserved: false
        },

        errors: [],

        restored: false
    };


    /*************************************************************************************
     * BASIC RUNTIME CHECKS
     *************************************************************************************/

    try {

        result.runtime.socketExists =
            !!window.socket;

        result.runtime.socketConnected =
            !!window.socket?.connected;

        result.runtime.callbacksExists =
            !!window.Callbacks;

        result.runtime.setLeaderExists =
            typeof window.Callbacks?.setLeader === "function";

        result.runtime.channelName =
            window.CHANNEL?.name ?? null;

        result.runtime.clientName =
            window.CLIENT?.name ?? null;

        result.runtime.clientRank =
            window.CLIENT?.rank ?? null;

        result.runtime.clientLeader =
            window.CLIENT?.leader ?? null;

        result.initialState.clientLeader =
            window.CLIENT?.leader ?? null;

    } catch (e) {

        result.errors.push({
            phase: "initial-runtime-check",
            error: String(e),
            stack: e.stack || null
        });
    }


    /*************************************************************************************
     * FIND THE CURRENT LEADER NAME IF THE PAGE EXPOSES IT THROUGH THE USER LIST.
     *
     * This is intentionally best-effort.
     *
     * The authoritative runtime value for THIS CLIENT is CLIENT.leader.
     *
     * We do not treat DOM inspection as authoritative server state.
     *************************************************************************************/

    try {

        const leaderElements = Array.from(
            document.querySelectorAll(
                "#userlist li, #userlist .userlist_item, #userlist .userlist_item_name"
            )
        );

        for (const el of leaderElements) {

            const text = el.innerText || "";

            if (/leader/i.test(text)) {
                result.initialState.currentLeaderName = text.trim();
                break;
            }
        }

    } catch (e) {

        result.errors.push({
            phase: "initial-leader-dom-scan",
            error: String(e)
        });
    }


    /*************************************************************************************
     * REFUSE TO RUN IF THE REQUIRED SOCKET/CALLBACK INFRASTRUCTURE DOES NOT EXIST.
     *************************************************************************************/

    if (!result.runtime.socketExists ||
        !result.runtime.socketConnected ||
        !result.runtime.callbacksExists ||
        !result.runtime.setLeaderExists) {

        result.status = "ABORTED";

        result.errors.push({
            phase: "preflight",
            error:
                "Required CyTube runtime objects were not available."
        });

        result.completedAt = new Date().toISOString();

        window.__WS073_DATA__ = result;

        console.log(
            "=== WS-073 ABORTED ==="
        );

        console.log(
            JSON.stringify(result, null, 2)
        );

        return;
    }


    /*************************************************************************************
     * TIMESTAMP HELPER
     *************************************************************************************/

    function now() {
        return new Date().toISOString();
    }


    /*************************************************************************************
     * RECORD OUTBOUND SOCKET EVENTS
     *
     * WS-072 established that wrapping window.socket.emit captures actual
     * application-generated Socket.IO traffic.
     *
     * We specifically care about:
     *
     *     assignLeader
     *
     * especially:
     *
     *     { name: "" }
     *
     * which is the CyTube client command for removing the leader.
     *************************************************************************************/

    const originalSocketEmit =
        window.socket.emit;

    function WS073_socket_emit_wrapper(...args) {

        try {

            const eventName =
                args[0];

            const eventRecord = {
                direction: "outbound",
                timestamp: now(),
                event: eventName,
                args: args
            };

            if (eventName === "assignLeader") {

                result.eventCounts.assignLeader++;

                eventRecord.clientLeader =
                    window.CLIENT?.leader ?? null;

                eventRecord.clientName =
                    window.CLIENT?.name ?? null;

                eventRecord.removalRequested =
                    !!(
                        args[1] &&
                        args[1].name === ""
                    );

                if (eventRecord.removalRequested) {

                    result.summary.outboundRemovalObserved = true;

                    eventRecord.note =
                        "assignLeader with empty name — leader removal request";
                }
            }
            else if (eventName === "mediaUpdate") {

                result.eventCounts.mediaUpdate++;

                /*
                 * Media updates are particularly useful here because WS-071
                 * source analysis established that an active client leader
                 * sends mediaUpdate approximately every 5 seconds.
                 *
                 * Therefore we record them separately so we can compare
                 * traffic before and after the leader is removed.
                 */
            }
            else {

                result.eventCounts.otherOutbound++;
            }

            result.events.push(eventRecord);

        } catch (e) {

            result.errors.push({
                phase: "outbound-capture",
                error: String(e),
                stack: e.stack || null
            });
        }

        return originalSocketEmit.apply(this, args);
    }


    /*************************************************************************************
     * WRAP THE SOCKET EMIT FUNCTION
     *************************************************************************************/

    window.socket.emit =
        WS073_socket_emit_wrapper;


    /*************************************************************************************
     * CAPTURE THE INBOUND setLeader CALLBACK
     *
     * This is the most important observation point.
     *
     * We capture:
     *
     *     value before callback
     *     callback argument
     *     value after callback
     *
     * We are specifically looking for:
     *
     *     setLeader("")
     *
     * followed by:
     *
     *     CLIENT.leader === false
     *************************************************************************************/

    const originalSetLeader =
        window.Callbacks.setLeader;

    function WS073_setLeader_wrapper(...args) {

        const before =
            window.CLIENT?.leader ?? null;

        const leaderArgument =
            args.length > 0
                ? args[0]
                : undefined;

        const eventRecord = {
            direction: "inbound-callback",
            timestamp: now(),

            callback: "setLeader",

            args: args,

            CLIENT_leader_before: before,
            CLIENT_name: window.CLIENT?.name ?? null,
            CLIENT_rank: window.CLIENT?.rank ?? null,

            leaderArgument: leaderArgument,

            removalSignal:
                leaderArgument === ""
        };

        /*
         * Calculate latency from the most recent outbound assignLeader
         * removal request to this inbound setLeader callback.
         */
        const removalRequest =
            [...result.events]
                .reverse()
                .find(
                    e =>
                        e.direction === "outbound" &&
                        e.event === "assignLeader" &&
                        e.removalRequested === true
                );

        if (removalRequest) {

            const t0 =
                Date.parse(removalRequest.timestamp);

            const t1 =
                Date.parse(eventRecord.timestamp);

            if (!Number.isNaN(t0) && !Number.isNaN(t1)) {

                eventRecord.latencyFromRemovalRequestMs =
                    t1 - t0;

                result.timing.assignLeaderToSetLeaderMs =
                    t1 - t0;
            }
        }

        try {

            const returnValue =
                originalSetLeader.apply(this, args);

            const after =
                window.CLIENT?.leader ?? null;

            eventRecord.CLIENT_leader_after =
                after;

            result.events.push(eventRecord);

            result.eventCounts.setLeader++;

            if (leaderArgument === "") {

                result.summary.inboundLeaderClearObserved = true;
            }

            if (before === true && after === false) {

                result.leaderTransitions.push({
                    timestamp: eventRecord.timestamp,

                    from: true,
                    to: false,

                    callback: "setLeader",

                    args: args
                });

                result.summary.clientLeaderChangedToFalse = true;
            }

            return returnValue;

        } catch (e) {

            eventRecord.callbackError = String(e);

            result.events.push(eventRecord);

            result.errors.push({
                phase: "setLeader-callback",
                error: String(e),
                stack: e.stack || null
            });

            throw e;
        }
    }


    /*************************************************************************************
     * WRAP setLeader
     *************************************************************************************/

    window.Callbacks.setLeader =
        WS073_setLeader_wrapper;


    /*************************************************************************************
     * OBSERVATION PERIOD
     *
     * The user should now manually perform ONE:
     *
     *     Remove Leader
     *
     * Do NOT click Give Leader.
     *
     * Do NOT click Queue Next.
     *
     * Do NOT click Play.
     *
     * We want a clean causal trace.
     *************************************************************************************/

    const OBSERVATION_MS = 60000;

    console.log(
        "============================================================"
    );

    console.log(
        "WS-073 — CYTUBE LEADER REMOVAL + AUTOLEAD RUNTIME TRACE"
    );

    console.log(
        "============================================================"
    );

    console.log(
        "Initial CLIENT.leader:",
        window.CLIENT?.leader
    );

    console.log(
        "Current client:",
        window.CLIENT?.name
    );

    console.log(
        ""
    );

    console.log(
        "TEST ACTION:"
    );

    console.log(
        "Manually click REMOVE LEADER exactly once."
    );

    console.log(
        "Do not perform any other CyTube actions during the test."
    );

    console.log(
        "Observation window:",
        OBSERVATION_MS / 1000,
        "seconds"
    );


    /*************************************************************************************
     * WAIT
     *************************************************************************************/

    await new Promise(resolve =>
        setTimeout(resolve, OBSERVATION_MS)
    );


    /*************************************************************************************
     * FINAL STATE
     *************************************************************************************/

    result.finalState.clientLeader =
        window.CLIENT?.leader ?? null;

    result.finalState.currentLeaderName =
        null;


    /*************************************************************************************
     * DETERMINE WHETHER MEDIA UPDATES OCCURRED AFTER THE LEADER REMOVAL.
     *************************************************************************************/

    const removalEvent =
        result.events.find(
            e =>
                e.direction === "outbound" &&
                e.event === "assignLeader" &&
                e.removalRequested === true
        );

    if (removalEvent) {

        const removalTime =
            Date.parse(removalEvent.timestamp);

        const postRemovalMediaUpdates =
            result.events.filter(
                e =>
                    e.direction === "outbound" &&
                    e.event === "mediaUpdate" &&
                    Date.parse(e.timestamp) > removalTime
            );

        if (postRemovalMediaUpdates.length > 0) {

            result.summary.postRemovalMediaUpdateObserved =
                true;
        }
    }


    /*************************************************************************************
     * FINAL INTERPRETATION FLAGS
     *************************************************************************************/

    result.summary.endToEndRemovalPathObserved =
        result.summary.outboundRemovalObserved &&
        result.summary.inboundLeaderClearObserved &&
        result.summary.clientLeaderChangedToFalse;


    /*
     * The runtime sequence strongly supports server acceptance because:
     *
     *     client → assignLeader("")
     *                ↓
     *             server
     *                ↓
     *          setLeader("")
     *
     * But we continue to use the word "inferred" rather than claiming
     * that a server function was directly observed over the network.
     */
    result.summary.serverAcceptanceInferred =
        result.summary.outboundRemovalObserved &&
        result.summary.inboundLeaderClearObserved;


    /*
     * Autolead runtime behavior is treated cautiously.
     *
     * The server source proves resumeAutolead() exists and is invoked
     * when appropriate.
     *
     * If mediaUpdate traffic follows the removal, that gives us useful
     * runtime correlation, but it does not expose the server's internal
     * one-second lead loop directly.
     */
    result.summary.autoleadRuntimeBehaviorObserved =
        result.summary.inboundLeaderClearObserved &&
        result.summary.postRemovalMediaUpdateObserved;


    /*************************************************************************************
     * RESTORE ORIGINAL FUNCTIONS
     *
     * IMPORTANT:
     * Only restore our wrappers if they are still the active functions.
     *
     * This prevents accidentally overwriting another script's replacement
     * if something else changed the functions during the test.
     *************************************************************************************/

    try {

        if (window.socket.emit === WS073_socket_emit_wrapper) {

            window.socket.emit =
                originalSocketEmit;
        }

        if (window.Callbacks.setLeader === WS073_setLeader_wrapper) {

            window.Callbacks.setLeader =
                originalSetLeader;
        }

        result.restored = true;

    } catch (e) {

        result.errors.push({
            phase: "restore",
            error: String(e),
            stack: e.stack || null
        });
    }


    /*************************************************************************************
     * COMPLETE
     *************************************************************************************/

    result.status =
        result.errors.length === 0
            ? "COMPLETE"
            : "COMPLETE_WITH_ERRORS";

    result.completedAt =
        new Date().toISOString();


    /*************************************************************************************
     * SAVE GLOBAL RESULT
     *
     * This is deliberately done AFTER all asynchronous observation work.
     *************************************************************************************/

    window.__WS073_DATA__ =
        result;


    /*************************************************************************************
     * CONSOLE SUMMARY
     *************************************************************************************/

    console.log(
        "============================================================"
    );

    console.log(
        "WS-073 COMPLETE"
    );

    console.log(
        "============================================================"
    );

    console.log(
        "Outbound removal observed:",
        result.summary.outboundRemovalObserved
    );

    console.log(
        "Inbound setLeader(\"\") observed:",
        result.summary.inboundLeaderClearObserved
    );

    console.log(
        "CLIENT.leader changed true → false:",
        result.summary.clientLeaderChangedToFalse
    );

    console.log(
        "End-to-end removal path observed:",
        result.summary.endToEndRemovalPathObserved
    );

    console.log(
        "Post-removal mediaUpdate observed:",
        result.summary.postRemovalMediaUpdateObserved
    );

    console.log(
        "Autolead runtime behavior observed:",
        result.summary.autoleadRuntimeBehaviorObserved
    );

    console.log(
        "Server acceptance inferred:",
        result.summary.serverAcceptanceInferred
    );

    console.log(
        "============================================================"
    );

    console.log(
        JSON.stringify(result, null, 2)
    );

})();

/////////////////// Test output ///////////////////

{
  "test": "WS-073",
  "status": "COMPLETE",
  "startedAt": "2026-09-07T20:42:15.899Z",
  "completedAt": "2026-09-07T20:43:15.918Z",
  "page": {
    "url": "https://cytu.be/r/Turbo",
    "title": "Turbo",
    "readyState": "complete"
  },
  "runtime": {
    "channelName": "Turbo",
    "clientName": "heytheirturbo",
    "clientRank": 5,
    "clientLeader": true,
    "socketExists": true,
    "socketConnected": true,
    "callbacksExists": true,
    "setLeaderExists": true
  },
  "initialState": {
    "clientLeader": true,
    "currentLeaderName": null
  },
  "events": [
    {
      "direction": "outbound",
      "timestamp": "2026-09-07T20:42:19.488Z",
      "event": "mediaUpdate",
      "args": [
        "mediaUpdate",
        {
          "id": "https://archive.org/download/00ifukedurmom_202306/s1e12.mp4",
          "currentTime": 603.494034,
          "paused": false,
          "type": "fi"
        }
      ]
    },
    {
      "direction": "outbound",
      "timestamp": "2026-09-07T20:42:24.495Z",
      "event": "mediaUpdate",
      "args": [
        "mediaUpdate",
        {
          "id": "https://archive.org/download/00ifukedurmom_202306/s1e12.mp4",
          "currentTime": 608.50173,
          "paused": false,
          "type": "fi"
        }
      ]
    },
    {
      "direction": "outbound",
      "timestamp": "2026-09-07T20:42:29.485Z",
      "event": "mediaUpdate",
      "args": [
        "mediaUpdate",
        {
          "id": "https://archive.org/download/00ifukedurmom_202306/s1e12.mp4",
          "currentTime": 613.492102,
          "paused": false,
          "type": "fi"
        }
      ]
    },
    {
      "direction": "outbound",
      "timestamp": "2026-09-07T20:42:34.494Z",
      "event": "mediaUpdate",
      "args": [
        "mediaUpdate",
        {
          "id": "https://archive.org/download/00ifukedurmom_202306/s1e12.mp4",
          "currentTime": 618.496887,
          "paused": false,
          "type": "fi"
        }
      ]
    },
    {
      "direction": "outbound",
      "timestamp": "2026-09-07T20:42:38.101Z",
      "event": "assignLeader",
      "args": [
        "assignLeader",
        {
          "name": ""
        }
      ],
      "clientLeader": true,
      "clientName": "heytheirturbo",
      "removalRequested": true,
      "note": "assignLeader with empty name — leader removal request"
    },
    {
      "direction": "inbound-callback",
      "timestamp": "2026-09-07T20:42:38.230Z",
      "callback": "setLeader",
      "args": [
        ""
      ],
      "CLIENT_leader_before": true,
      "CLIENT_name": "heytheirturbo",
      "CLIENT_rank": 5,
      "leaderArgument": "",
      "removalSignal": true,
      "latencyFromRemovalRequestMs": 129,
      "CLIENT_leader_after": false
    }
  ],
  "eventCounts": {
    "assignLeader": 1,
    "setLeader": 1,
    "mediaUpdate": 4,
    "otherOutbound": 0
  },
  "leaderTransitions": [
    {
      "timestamp": "2026-09-07T20:42:38.230Z",
      "from": true,
      "to": false,
      "callback": "setLeader",
      "args": [
        ""
      ]
    }
  ],
  "timing": {
    "assignLeaderToSetLeaderMs": 129
  },
  "finalState": {
    "clientLeader": false,
    "currentLeaderName": null
  },
  "summary": {
    "outboundRemovalObserved": true,
    "inboundLeaderClearObserved": true,
    "clientLeaderChangedToFalse": true,
    "endToEndRemovalPathObserved": true,
    "postRemovalMediaUpdateObserved": false,
    "serverAcceptanceInferred": true,
    "serverSourceCodeProven": true,
    "autoleadRuntimeBehaviorObserved": false
  },
  "errors": [],
  "restored": true
}
