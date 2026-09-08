/*****************************************************************************************
 * WS-073 — P2P MEDIA LOADER RUNTIME DISCOVERY TEST
 * -----------------------------------------------------------------------------
 * PURPOSE
 * -----------------------------------------------------------------------------
 * This is a deliberately small reconnaissance test.
 *
 * We are investigating the architectural boundary:
 *
 *     local segment bytes
 *          ↓
 *     SegmentStorage
 *          ↓
 *     Core / HybridLoader
 *          ↓
 *     P2PLoader
 *          ↓
 *     WebRTC P2P
 *
 * Before attempting to construct a synthetic Stream and inject synthetic segment
 * bytes, we first need to know whether the p2p-media-loader library is already
 * available in the current browser runtime.
 *
 * IMPORTANT:
 *   - This test does NOT download anything.
 *   - This test does NOT modify the Cytube playlist.
 *   - This test does NOT create a torrent.
 *   - This test does NOT open a WebRTC connection.
 *   - This test does NOT alter the page.
 *   - This test does NOT install anything.
 *
 * It is purely a runtime discovery test.
 *
 * The reason for doing this first is that p2p-media-loader may be:
 *
 *   A) exposed as a global object,
 *   B) hidden inside a bundled player,
 *   C) available through a module/webpack runtime,
 *   D) not present at all on this page.
 *
 * We need to distinguish those cases before designing the next experiment.
 *
 * EVIDENCE CLASSIFICATION
 * -----------------------------------------------------------------------------
 * RUNTIME PROVEN:
 *   Whether recognizable p2p-media-loader objects/functions are exposed
 *   directly in the current page runtime.
 *
 * UNPROVEN / OPEN:
 *   Whether we can instantiate Core.
 *   Whether we can provide custom SegmentStorage.
 *   Whether locally injected bytes can activate P2PLoader.
 *   Whether WebRTC peers receive a SegmentsAnnouncement.
 *
 * This test intentionally does not answer those questions yet.
 *****************************************************************************************/

(async () => {

    const result = {
        test: "WS-073",
        title: "P2P Media Loader Runtime Discovery Test",
        timestamp: new Date().toISOString(),

        page: {
            url: location.href,
            title: document.title,
            readyState: document.readyState
        },

        globals: {},
        candidates: [],
        scripts: [],
        clues: []
    };

    /**************************************************************************
     * 1. BASIC GLOBAL DISCOVERY
     *
     * We cannot assume a particular global name.
     *
     * Common possibilities include:
     *
     *   p2pMediaLoader
     *   P2PMediaLoader
     *   HlsJsP2PEngine
     *   Core
     *   p2p
     *
     * We check them without modifying anything.
     **************************************************************************/

    const candidateNames = [
        "p2pMediaLoader",
        "P2PMediaLoader",
        "p2pMediaLoaderCore",
        "P2P",
        "Core",
        "HlsJsP2PEngine",
        "P2PEngine",
        "SegmentStorage",
        "IndexedDbStorage"
    ];

    for (const name of candidateNames) {

        let exists = false;
        let type = null;
        let constructorName = null;

        try {
            exists = typeof window[name] !== "undefined";

            if (exists) {
                type = typeof window[name];

                if (
                    window[name] !== null &&
                    typeof window[name] === "object" &&
                    window[name].constructor
                ) {
                    constructorName = window[name].constructor.name;
                }
            }
        } catch (e) {
            result.clues.push({
                type: "global-read-error",
                name,
                error: String(e)
            });
        }

        result.globals[name] = {
            exists,
            type,
            constructorName
        };

        if (exists) {
            result.candidates.push({
                source: "window",
                name,
                type,
                constructorName
            });
        }
    }

    /**************************************************************************
     * 2. INSPECT SCRIPT TAGS
     *
     * Even if the library isn't exposed as window.P2PMediaLoader, the page
     * may have loaded a bundle containing it.
     *
     * We therefore inspect script URLs for recognizable names.
     *
     * This is still passive. We are only reading the DOM.
     **************************************************************************/

    const scriptNodes = Array.from(document.scripts);

    result.scripts = scriptNodes.map((script, index) => ({
        index,
        src: script.src || null,
        type: script.type || null,
        async: !!script.async,
        defer: !!script.defer
    }));

    const interestingScriptTerms = [
        "p2p-media-loader",
        "p2pmedialoader",
        "p2p",
        "webrtc",
        "webtorrent",
        "hls"
    ];

    for (const script of result.scripts) {

        const haystack = (
            (script.src || "") + " " +
            (script.type || "")
        ).toLowerCase();

        const matches = interestingScriptTerms.filter(term =>
            haystack.includes(term)
        );

        if (matches.length) {
            result.clues.push({
                type: "interesting-script",
                src: script.src,
                matches
            });
        }
    }

    /**************************************************************************
     * 3. SEARCH COMMON GLOBAL NAMESPACE CONTAINERS
     *
     * Some bundles expose a namespace rather than the exact class name.
     *
     * We only inspect enumerable own properties.
     *
     * We deliberately avoid recursively walking the entire window because
     * that would be noisy and potentially expensive on a mobile browser.
     **************************************************************************/

    const namespaceCandidates = [
        "window",
        "globalThis"
    ];

    for (const namespaceName of namespaceCandidates) {

        try {

            const namespace = namespaceName === "window"
                ? window
                : globalThis;

            const names = Object.getOwnPropertyNames(namespace);

            const matches = names.filter(name => {

                const lower = name.toLowerCase();

                return (
                    lower.includes("p2p") ||
                    lower.includes("torrent") ||
                    lower.includes("webrtc") ||
                    lower.includes("segmentstorage") ||
                    lower.includes("p2ploader")
                );
            });

            result.clues.push({
                type: "namespace-property-scan",
                namespace: namespaceName,
                matches
            });

        } catch (e) {

            result.clues.push({
                type: "namespace-scan-error",
                namespace: namespaceName,
                error: String(e)
            });
        }
    }

    /**************************************************************************
     * 4. CHECK COMMON HLS / PLAYER OBJECTS
     *
     * PeerTube's integration uses HlsJsP2PEngine internally.
     *
     * Cytube itself may not expose that engine globally, but checking for
     * HLS-related runtime objects helps us understand whether the current
     * page is carrying another player's P2P machinery.
     **************************************************************************/

    const playerCandidates = [
        "Hls",
        "hls",
        "HLS",
        "player",
        "videojs"
    ];

    for (const name of playerCandidates) {

        try {

            const value = window[name];

            if (typeof value !== "undefined") {

                result.candidates.push({
                    source: "player-candidate",
                    name,
                    type: typeof value,
                    constructorName:
                        value && value.constructor
                            ? value.constructor.name
                            : null
                });
            }

        } catch (e) {

            result.clues.push({
                type: "player-read-error",
                name,
                error: String(e)
            });
        }
    }

    /**************************************************************************
     * 5. SUMMARY
     **************************************************************************/

    result.summary = {
        windowCandidateCount: result.candidates.length,

        recognizableGlobals: Object.keys(result.globals)
            .filter(name => result.globals[name].exists),

        interestingScriptCount:
            result.clues.filter(c =>
                c.type === "interesting-script"
            ).length,

        namespaceMatchCount:
            result.clues
                .filter(c => c.type === "namespace-property-scan")
                .reduce(
                    (total, c) => total + c.matches.length,
                    0
                )
    };

    /**************************************************************************
     * 6. STORE THE RESULT
     *
     * IMPORTANT FOR THE MOBILE WORKFLOW:
     *
     * We store the complete result globally so that a SECOND, synchronous
     * console command can copy it to the clipboard.
     *
     * We intentionally do NOT call copy() here because this test is async.
     **************************************************************************/

    window.__WS073_DATA__ = result;

    console.log("============================================================");
    console.log("WS-073 — P2P MEDIA LOADER RUNTIME DISCOVERY");
    console.log("============================================================");
    console.log(JSON.stringify(result, null, 2));
    console.log("============================================================");
    console.log("RESULT STORED IN window.__WS073_DATA__");
    console.log("Run the separate synchronous copy command.");
    console.log("============================================================");

})();

//////////// Test Output ////////////

{
  "test": "WS-073",
  "title": "P2P Media Loader Runtime Discovery Test",
  "timestamp": "2026-09-08T03:03:52.786Z",
  "page": {
    "url": "https://cytu.be/r/Turbo",
    "title": "Turbo",
    "readyState": "complete"
  },
  "globals": {
    "p2pMediaLoader": {
      "exists": false,
      "type": null,
      "constructorName": null
    },
    "P2PMediaLoader": {
      "exists": false,
      "type": null,
      "constructorName": null
    },
    "p2pMediaLoaderCore": {
      "exists": false,
      "type": null,
      "constructorName": null
    },
    "P2P": {
      "exists": false,
      "type": null,
      "constructorName": null
    },
    "Core": {
      "exists": false,
      "type": null,
      "constructorName": null
    },
    "HlsJsP2PEngine": {
      "exists": false,
      "type": null,
      "constructorName": null
    },
    "P2PEngine": {
      "exists": false,
      "type": null,
      "constructorName": null
    },
    "SegmentStorage": {
      "exists": false,
      "type": null,
      "constructorName": null
    },
    "IndexedDbStorage": {
      "exists": false,
      "type": null,
      "constructorName": null
    }
  },
  "candidates": [
    {
      "source": "player-candidate",
      "name": "videojs",
      "type": "function",
      "constructorName": "Function"
    }
  ],
  "scripts": [
    {
      "index": 0,
      "src": "https://www.youtube.com/s/player/f572e43c/www-widgetapi.vflset/www-widgetapi.js",
      "type": "text/javascript",
      "async": true,
      "defer": false
    },
    {
      "index": 1,
      "src": null,
      "type": "text/javascript",
      "async": false,
      "defer": false
    },
    {
      "index": 2,
      "src": "https://cytu.be/js/theme.js",
      "type": null,
      "async": false,
      "defer": false
    },
    {
      "index": 3,
      "src": "https://cytu.be/js/jquery-1.12.4.min.js",
      "type": null,
      "async": false,
      "defer": false
    },
    {
      "index": 4,
      "src": "https://cytu.be/js/jquery-ui.js",
      "type": null,
      "async": false,
      "defer": false
    },
    {
      "index": 5,
      "src": "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.1/js/bootstrap.min.js",
      "type": null,
      "async": false,
      "defer": false
    },
    {
      "index": 6,
      "src": "https://cytu.be/socket.io/socket.io.js",
      "type": null,
      "async": false,
      "defer": false
    },
    {
      "index": 7,
      "src": "https://cytu.be/js/data.js",
      "type": null,
      "async": false,
      "defer": false
    },
    {
      "index": 8,
      "src": "https://cytu.be/js/util.js",
      "type": null,
      "async": false,
      "defer": false
    },
    {
      "index": 9,
      "src": "https://cytu.be/js/tabcomplete.js",
      "type": null,
      "async": false,
      "defer": false
    },
    {
      "index": 10,
      "src": "https://cytu.be/js/player.js",
      "type": null,
      "async": false,
      "defer": false
    },
    {
      "index": 11,
      "src": "https://cytu.be/js/paginator.js",
      "type": null,
      "async": false,
      "defer": false
    },
    {
      "index": 12,
      "src": "https://cytu.be/js/ui.js",
      "type": null,
      "async": false,
      "defer": false
    },
    {
      "index": 13,
      "src": "https://cytu.be/js/callbacks.js",
      "type": null,
      "async": false,
      "defer": false
    },
    {
      "index": 14,
      "src": "https://cytu.be/js/vjs/dash.all.min.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 15,
      "src": "https://cytu.be/js/vjs/video.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 16,
      "src": "https://cytu.be/js/vjs/videojs-dash.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 17,
      "src": "https://cytu.be/js/vjs/videojs-hlsjs-plugin.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 18,
      "src": "https://cytu.be/js/vjs/videojs-resolution-switcher.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 19,
      "src": "https://cytu.be/js/vjs/videojs-audio-switcher.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 20,
      "src": "https://cytu.be/js/octopus/subtitles-octopus.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 21,
      "src": "https://cytu.be/js/playerjs-0.0.12.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 22,
      "src": "https://cytu.be/js/niconico.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 23,
      "src": "https://cytu.be/js/peertube.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 24,
      "src": "https://cytu.be/js/sc.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 25,
      "src": "https://www.youtube.com/iframe_api",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 26,
      "src": "https://api.dmcdn.net/all.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 27,
      "src": "https://player.vimeo.com/api/player.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 28,
      "src": "https://player.twitch.tv/js/embed/v1.js",
      "type": null,
      "async": false,
      "defer": true
    },
    {
      "index": 29,
      "src": "https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495",
      "type": "module",
      "async": false,
      "defer": false
    }
  ],
  "clues": [
    {
      "type": "interesting-script",
      "src": "https://cytu.be/js/vjs/videojs-hlsjs-plugin.js",
      "matches": [
        "hls"
      ]
    },
    {
      "type": "namespace-property-scan",
      "namespace": "window",
      "matches": []
    },
    {
      "type": "namespace-property-scan",
      "namespace": "globalThis",
      "matches": []
    }
  ],
  "summary": {
    "windowCandidateCount": 1,
    "recognizableGlobals": [],
    "interestingScriptCount": 1,
    "namespaceMatchCount": 0
  }
}
