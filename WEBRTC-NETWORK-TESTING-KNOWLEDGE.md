# WebRTC / STUN / TURN / WebTorrent Network Testing Knowledge

**Status:** Consolidated forensic record
**Created:** 2026-09-05
**Repository:** `duckwerks/cytube-knowledge`

> This document records what the historical tests actually demonstrate, what they do **not** demonstrate, and what should be tested next. It deliberately separates observations from architectural conclusions.

---

## 1. Purpose

This document consolidates the April 2026 network experiments relevant to HiveStream/CyTube P2P work:

- STUN/TURN relay tests on cellular and Wi-Fi/DSL.
- The same tests with and without VPN.
- A multi-TURN experiment.
- A large WebTorrent/WebRTC instrumentation log.

The objective is not merely to say whether a test passed. The objective is to preserve the conditions under which it passed or failed so future development does not accidentally turn a single-device observation into a universal networking assumption.

---

## 2. Source Artifacts

### TURN / relay tests

1. `2026-04-13T0350_WebRTC TURN Relay Tester - 01 - Mobile Data no VPN.txt`
2. `2026-04-13T0359_WebRTC TURN Relay Tester - 01 - Wifi DSL no VPN.txt`
3. `2026-04-13T0412_WebRTC TURN Relay Tester - 01 - WiFi DSL with VPN.txt`
4. `2026-04-13T0419_WebRTC TURN Relay Tester - 01 - Mobile Data with VPN.txt`
5. `2026-04-13T0500_WebRTC Multi TURN Tester (Advanced).txt`

### WebTorrent/WebRTC instrumentation

6. `2026-04-13_webtorrent.io test 001.txt`

The WebTorrent artifact is approximately 254 KB and contains substantially more event data than the connector can expose in one response. The beginning of that artifact has been independently inspected and is included below. The conclusions that depend on the unexposed remainder are explicitly marked as unresolved rather than guessed.

---

# 3. Executive Findings

## 3.1 TURN relay testing produced a consistent negative result

All four single-network TURN tests used forced relay mode:

```js
iceTransportPolicy: "relay"
```

with Google STUN and `openrelay.metered.ca` TURN servers.

The tested environments were:

| Network | VPN | Forced TURN result |
|---|---|---|
| Mobile data | No | ICE failed |
| Wi-Fi / DSL | No | ICE failed |
| Wi-Fi / DSL | Yes | ICE failed |
| Mobile data | Yes | ICE failed |

This is a strong historical observation: **the tested TURN configuration did not establish a working relay connection in any of the four tested network environments.**

It is **not** evidence that WebRTC generally fails on those networks, and it is not evidence that TURN itself is unusable. The test was specifically a test of the supplied TURN service/configuration/path.

---

## 3.2 The TURN logs are diagnostically weak

The relay tester repeatedly emitted output resembling:

```text
ICE: {}
ICE STATE: failed
```

That tells us the ICE attempt ultimately failed, but it does not establish whether the failure occurred during:

- TURN DNS resolution;
- TURN TCP/TLS connection establishment;
- TURN allocation;
- authentication;
- permission creation;
- candidate gathering;
- connectivity checks;
- consent checks; or
- final candidate-pair selection.

Therefore the historical tests should be treated as **valid negative integration tests but poor root-cause diagnostics**.

The next TURN test must expose candidate type, candidate pair, ICE gathering state, ICE connection state, connection state, and `getStats()` data.

---

## 3.3 The WebTorrent/WebRTC test demonstrates a materially different result

The large WebTorrent instrumentation artifact begins with real `RTCPeerConnection` creation and WebRTC DataChannel activity.

Observed configuration included:

```text
stun:stun.l.google.com:19302
stun:global.stun.twilio.com:3478
```

The instrumentation then added additional Google STUN servers and Twilio STUN:

```text
stun:stun.l.google.com:19302
stun:stun1.l.google.com:19302
stun:stun2.l.google.com:19302
stun:global.stun.twilio.com:3478
```

The log recorded multiple DataChannels, SDP offers, host candidates, server-reflexive candidates, and successful ICE/connection states.

Most importantly, after connection establishment, the instrumentation captured a binary send beginning with the BitTorrent protocol handshake string:

```text
BitTorrent protocol
```

That is much stronger evidence than merely observing an ICE candidate. It indicates that an actual WebTorrent/BEP-style protocol exchange was being sent over an established WebRTC DataChannel.

---

# 4. TURN Test Matrix

## 4.1 Mobile data, no VPN

Artifact:
`2026-04-13T0350_WebRTC TURN Relay Tester - 01 - Mobile Data no VPN.txt`

Configuration included:

```text
STUN: stun:stun.l.google.com:19302
TURN: turn:openrelay.metered.ca:80
TURN: turn:openrelay.metered.ca:443
username: openrelayproject
credential: openrelayproject
iceTransportPolicy: relay
```

Observed behavior:

```text
ICE: {}
ICE STATE: failed
```

### Interpretation

The forced relay path did not establish a usable ICE connection under this configuration.

This does **not** mean the mobile carrier blocked WebRTC generally, because the later WebTorrent artifact shows successful WebRTC connectivity under a different configuration.

---

## 4.2 Wi-Fi / DSL, no VPN

Artifact:
`2026-04-13T0359_WebRTC TURN Relay Tester - 01 - Wifi DSL no VPN.txt`

The same forced-relay architecture was used.

Observed behavior again ended in ICE failure.

### Interpretation

The failure reproduced on a non-cellular network. This makes a simple "cellular carrier blocks TURN" explanation inadequate.

---

## 4.3 Wi-Fi / DSL with VPN

Artifact:
`2026-04-13T0412_WebRTC TURN Relay Tester - 01 - WiFi DSL with VPN.txt`

The forced relay configuration again failed.

### Interpretation

The VPN did not turn the tested TURN configuration into a successful path. Because the same failure existed without the VPN, the VPN is not a sufficient explanation.

---

## 4.4 Mobile data with VPN

Artifact:
`2026-04-13T0419_WebRTC TURN Relay Tester - 01 - Mobile Data with VPN.txt`

Again, the forced relay configuration ended in ICE failure.

### Interpretation

The negative result reproduced across the combined cellular + VPN environment.

---

# 5. Multi-TURN Experiment

Artifact:
`2026-04-13T0500_WebRTC Multi TURN Tester (Advanced).txt`

The advanced tester exercised four environments:

- mobile data, no VPN;
- mobile data, VPN;
- Wi-Fi/DSL, VPN;
- Wi-Fi/DSL, no VPN.

The instrumentation reported four configured ICE servers in the test.

The experiment still recorded ICE failures for the configurations that produced attempts.

## What this establishes

Adding several ICE servers did not automatically convert the historical TURN configuration into a working relay path.

## What this does not establish

It does not tell us which server was tried first, which candidates were gathered, whether allocation succeeded, or whether one server failed while another was never reached.

A future multi-server test must identify every candidate by:

- candidate type (`host`, `srflx`, `relay`);
- protocol (`udp`, `tcp`, `tls` where available);
- related address/port where exposed;
- ICE server source where it can be correlated;
- selected candidate pair;
- candidate-pair state; and
- transport statistics.

---

# 6. WebTorrent/WebRTC Artifact — Confirmed Observations

Artifact:
`2026-04-13_webtorrent.io test 001.txt`

## 6.1 RTCPeerConnection interception worked

The artifact begins with:

```text
SCRIPT STARTED (early)
RTCPeerConnection FOUND — hooking
NEW PEER CONNECTION (original config)
```

This demonstrates that the test successfully intercepted WebRTC peer-connection creation early enough to inspect the configuration used by WebTorrent.

## 6.2 Original ICE configuration

The observed original configuration contained:

```text
stun:stun.l.google.com:19302
stun:global.stun.twilio.com:3478
```

with:

```text
sdpSemantics: unified-plan
```

## 6.3 Additional STUN configuration was injected

The test added Google `stun1` and `stun2` plus repeated Google/Twilio entries.

This means the artifact demonstrates successful operation with a STUN-rich configuration, but it does **not** prove which STUN server produced each candidate.

## 6.4 Multiple WebRTC DataChannels were created

The artifact records multiple outgoing DataChannel identifiers, including values resembling:

```text
bca48079f4349162abac6a191233f4cb3370c6f3
b2af8fd7c5dad20d797f22293a268a2816df1ec4
...
```

The important point is not the identifiers themselves; it is that multiple peer connections/DataChannels were active.

## 6.5 SDP confirms WebRTC DataChannel transport

Observed SDP included:

```text
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
```

and:

```text
a=ice-options:trickle
a=sctp-port:5000
a=max-message-size:1073741823
```

The SDP origin identifies Mozilla Firefox SDP implementation version 99.0.

This is historical evidence about the browser/runtime that generated the test, not a statement about current Firefox behavior.

---

# 7. ICE Candidate Findings from WebTorrent Test

The captured candidates included multiple host candidates using mDNS `.local` names, for example:

```text
941bae72-9efa-46fe-911b-b4fa31a8c4af.local
93b4547d-b627-48f3-ab59-31d20951becc.local
```

The test also produced server-reflexive candidates:

```text
172.77.160.188
```

with multiple ports.

## Candidate classes observed

### Host

Host candidates were present and used mDNS hostnames rather than exposing ordinary local LAN addresses.

### Server-reflexive (`srflx`)

Server-reflexive candidates were present, demonstrating that STUN-assisted public address discovery was functioning sufficiently to produce `srflx` candidates.

### Relay

**No relay candidate is visible in the inspected portion of the artifact.**

Therefore we must not claim that the successful WebTorrent connection used TURN.

The currently supported interpretation is:

> The successful connection observed in the WebTorrent test involved host and/or server-reflexive ICE candidates. The available evidence does not establish a TURN relay path.

---

# 8. Successful WebRTC Connection Evidence

The WebTorrent log contains the sequence:

```text
ICE STATE: checking
CONNECTION STATE: connecting
...
ICE STATE: connected
CONNECTION STATE: connected
```

The exact event ordering varies across the multiple connections, but successful `connected` states are clearly present.

This is important because it directly contrasts with the forced-relay tests.

The historical evidence therefore supports this narrower statement:

> **WebRTC connectivity worked in the tested WebTorrent environment even though the separately tested forced TURN relay configuration failed.**

It does **not** support the stronger statement:

> "TURN is broken and direct WebRTC always works."

The latter would require controlled candidate-pair and transport-statistics evidence.

---

# 9. BitTorrent Protocol Evidence

After connection establishment, the instrumentation captured a binary `SEND` payload beginning with:

```text
19, 66, 105, 116, 84, 111, 114, 114, 101, 110, 116, 32, 112, 114, 111, 116, 111, 99, 111, 108
```

The byte sequence contains:

```text
BitTorrent protocol
```

The leading `19` is consistent with the standard BitTorrent protocol-string length byte.

This is particularly valuable for HiveStream because it establishes a chain of evidence:

```text
RTCPeerConnection
    ↓
ICE candidate gathering
    ↓
ICE connected
    ↓
WebRTC DataChannel
    ↓
BitTorrent protocol bytes
```

That is direct evidence of the WebTorrent transport architecture reaching the actual protocol layer, rather than stopping at signaling or ICE discovery.

---

# 10. Critical Distinction: STUN Success vs TURN Success

The historical experiments expose an important architectural distinction.

## STUN

STUN helps a peer discover a server-reflexive address and assists ICE in determining viable connectivity paths.

The WebTorrent artifact demonstrates `srflx` candidate generation.

## TURN

TURN supplies a relay when direct connectivity is unavailable or undesirable.

The historical TURN tests attempted to force relay usage and failed.

Therefore the evidence currently looks like:

```text
STUN / direct WebRTC path:     demonstrated working
Forced TURN relay path:        demonstrated failing
```

That is the most defensible current project-level summary.

---

# 11. What We Can Reliably Conclude

## Confirmed

1. The tested `openrelay.metered.ca` TURN configuration failed under all four tested network/VPN combinations.
2. The relay tests used `iceTransportPolicy: "relay"`, so they intentionally excluded ordinary direct ICE paths.
3. The relay logs do not contain enough diagnostics to identify the exact TURN failure stage.
4. A separate WebTorrent/WebRTC test successfully created WebRTC peer connections.
5. The WebTorrent test produced host and server-reflexive candidates.
6. The WebTorrent test reached `ICE STATE: connected` and `CONNECTION STATE: connected` for observed connections.
7. WebRTC DataChannels were active.
8. A DataChannel send contained a BitTorrent protocol handshake.
9. The successful WebTorrent path therefore reached actual WebTorrent protocol traffic, not merely ICE gathering.
10. The inspected WebTorrent evidence does not show a relay candidate, so TURN must not be credited for the successful connection without further evidence.

## Probable but not yet proven

1. The successful WebTorrent connections were direct or STUN-assisted rather than TURN-relayed.
2. The observed `172.77.160.188` address was a server-reflexive mapping generated through STUN.
3. The WebTorrent tracker/swarm infrastructure was able to establish peer connectivity in the tested environment.

These should become confirmed only after candidate-pair and transport-statistics instrumentation is added.

## Unknown

1. Which STUN server produced each specific `srflx` candidate.
2. Which candidate pair was selected for each successful connection.
3. Whether the connection was UDP, TCP, or another ICE transport at the final selected pair.
4. Whether any TURN allocation succeeded transiently before a different path won.
5. How long each WebRTC connection remained stable.
6. Whether substantial torrent piece data, rather than only handshake/control traffic, crossed the DataChannel.
7. Whether the WebTorrent peers were all reached through the same network path.
8. Whether the large artifact contains later disconnects, failures, tracker errors, or additional candidate types that were not visible in the connector-exposed portion.

---

# 12. What We Must NOT Infer

The historical tests do **not** justify these claims:

- "The mobile carrier blocks WebRTC."
- "The VPN blocks WebRTC."
- "Wi-Fi blocks TURN."
- "openrelay.metered.ca is universally broken."
- "Google STUN is definitely responsible for the successful connection."
- "Twilio STUN is definitely responsible for the successful connection."
- "WebTorrent always uses direct P2P."
- "WebTorrent never uses TURN."
- "TURN is unnecessary for HiveStream."

The correct engineering posture is:

> **Direct/STUN-assisted WebRTC has been demonstrated in the historical environment. The tested TURN relay configuration has not. The exact candidate path remains to be measured.**

---

# 13. Implications for HiveStream

## 13.1 Do not make TURN a prerequisite for the browser swarm

The existing HiveStream architecture should continue to treat ordinary WebRTC/WebTorrent connectivity as the primary path.

TURN should be considered a fallback capability for difficult NAT/firewall situations, not as proof that the browser swarm is healthy.

## 13.2 Keep multiple transport paths available

The architecture should conceptually support:

```text
                    ┌──────────────┐
                    │   Signaling  │
                    │ WSS / tracker│
                    └──────┬───────┘
                           │
                  peer discovery
                           │
                    ┌──────▼───────┐
                    │     ICE      │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
            HOST         SRFLX        RELAY
              │            │            │
              └────────────┼────────────┘
                           │
                    WebRTC DataChannel
                           │
                    WebTorrent pieces
```

The application should observe which path actually wins rather than assuming one.

## 13.3 Browser churn remains a separate problem

Even when WebRTC works, browser peers are not equivalent to permanent seeders.

HiveStream therefore still needs:

- IndexedDB persistence;
- aggressive piece availability management;
- preload/buffer zones;
- multiple peers per torrent where practical;
- persistent desktop/Tauri/Electron seeders where available;
- webseed fallback;
- tracker redundancy.

The network tests neither prove nor disprove these architectural requirements.

---

# 14. Recommended Next Network Test

The next test should be **candidate-path forensic testing**, not another generic TURN tester.

## Required instrumentation

For every peer connection, record:

```js
pc.onicegatheringstatechange
pc.oniceconnectionstatechange
pc.onconnectionstatechange
pc.onicecandidate
pc.ondatachannel
```

and periodically call:

```js
pc.getStats()
```

The test should extract at minimum:

```text
candidate-pair
local-candidate
remote-candidate
candidateType
protocol
address / relatedAddress where exposed
port
state
bytesSent
bytesReceived
packetsSent
packetsReceived
currentRoundTripTime
availableOutgoingBitrate
availableIncomingBitrate
```

## Candidate-path verdict

The tester should produce a compact result such as:

```text
CONNECTION #3
------------------------------
ICE: connected
PC: connected
Selected pair: srflx -> srflx
Transport: udp
Relay: NO
Bytes sent: 1.42 MB
Bytes received: 8.71 MB
RTT: 42 ms
Duration: 184 s
VERDICT: DIRECT/STUN-ASSISTED
```

or:

```text
CONNECTION #3
------------------------------
ICE: connected
PC: connected
Selected pair: relay -> srflx
Transport: udp
Relay: YES
Bytes sent: ...
Bytes received: ...
VERDICT: TURN RELAY
```

A failed attempt should likewise identify the last meaningful state rather than merely printing `ICE: {}`.

---

# 15. Test Matrix for the Next Phase

The same candidate-forensics test should eventually be run under:

| Test | Network | VPN | STUN | TURN | Goal |
|---|---|---|---|---|---|
| A | Mobile | Off | Yes | No | establish direct/STUN baseline |
| B | Wi-Fi/DSL | Off | Yes | No | compare fixed broadband |
| C | Mobile | On | Yes | No | VPN effect |
| D | Wi-Fi/DSL | On | Yes | No | VPN + broadband |
| E | Mobile | Off | Yes | Yes | determine TURN fallback |
| F | Wi-Fi/DSL | Off | Yes | Yes | determine TURN fallback |
| G | Mobile | On | Yes | Yes | combined stress |
| H | Wi-Fi/DSL | On | Yes | Yes | combined stress |

The important change from the April tests is that the new test records **the selected path**, not merely whether ICE eventually failed.

---

# 16. Recommended Evidence Levels

Future knowledge-base entries should use an evidence classification:

### E1 — Observation

A raw event or value was captured.

Example:

```text
candidateType = srflx
```

### E2 — Repeated observation

The same behavior appeared across multiple connections or test runs.

### E3 — Controlled conclusion

A controlled experiment isolates the relevant variable.

Example:

```text
iceTransportPolicy=relay
→ relay path fails
```

### E4 — Architecture-level conclusion

A conclusion supported by multiple independent tests and/or repeated environments.

This prevents the project knowledge base from silently promoting a single browser experiment into an architectural law.

---

# 17. Historical Failure Is Valuable Data

The TURN failures should remain permanently archived.

They are not useless because the test failed. They answer an important engineering question:

> "Did this exact relay configuration work on the tested device/network combinations?"

The answer is currently:

**No.**

Likewise, the WebTorrent artifact is valuable because it provides the contrasting positive path:

> "Can this environment establish a WebRTC DataChannel and carry BitTorrent protocol traffic?"

The available evidence says:

**Yes.**

That contrast is one of the most useful pieces of historical network knowledge in the repository.

---

# 18. Current Network Knowledge Snapshot

```text
                         CURRENT EVIDENCE

                 ┌──────────────────────────┐
                 │ Browser WebRTC available │
                 └────────────┬─────────────┘
                              │
                         ICE / STUN
                              │
                    ┌─────────▼─────────┐
                    │ srflx candidates  │
                    │ observed          │
                    └─────────┬─────────┘
                              │
                         ICE connected
                              │
                    ┌─────────▼─────────┐
                    │ DataChannel       │
                    │ connected         │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ BitTorrent       │
                    │ handshake bytes  │
                    └───────────────────┘

TURN experiment:

  forced relay → ICE failed

Therefore:

  DIRECT/STUN PATH = demonstrated
  TURN PATH        = not demonstrated; tested configuration failed
  SELECTED PATH    = requires getStats() forensic test
```

---

# 19. Relationship to Existing HiveStream Work

This knowledge should be read alongside the existing HiveStream implementation lineage and architecture documents.

Relevant project principles remain:

- playlist = distribution/scheduling layer;
- WebTorrent = media transport layer;
- IndexedDB = persistence layer;
- WebRTC = peer transport/control substrate;
- WSS trackers = peer discovery/signaling infrastructure;
- webseed/HTTP = fallback path;
- persistent desktop/Node/Tauri seeders = reliability layer.

The network evidence reinforces the value of this layered architecture: no single browser networking mechanism should be assumed to be universally available.

---

# 20. Bottom Line

The April 2026 experiments produced an important and non-obvious result:

> **The browser/WebTorrent environment demonstrated real WebRTC connectivity and BitTorrent protocol traffic, while the separately tested forced TURN relay configuration failed across mobile/Wi-Fi and VPN/non-VPN combinations.**

The next engineering step is therefore **not** to abandon WebRTC, and it is **not** to assume TURN is useless.

The next step is to measure the actual ICE candidate pair and transport path used by successful WebTorrent connections and to make TURN failures diagnostically precise.

Once that is known, HiveStream can make an evidence-based decision about:

- whether TURN belongs in the default browser configuration;
- whether TURN should be fallback-only;
- which TURN transports/providers are worth retaining;
- how much the system can rely on direct WebRTC;
- and when persistent seeders/webseed fallback must take over.

---

## Source Integrity Note

The five TURN artifacts were individually inspected. The beginning of the large WebTorrent artifact was inspected through the GitHub connector and provides the successful WebRTC/DataChannel/BitTorrent evidence documented above. The connector currently truncates the approximately 254 KB artifact before its complete remainder can be programmatically reviewed in this session. Consequently, this document intentionally does **not** claim that the entire WebTorrent log has been exhaustively enumerated. Any later pass that exposes the full artifact should append/upgrade the unknown sections rather than silently replacing these observations.
