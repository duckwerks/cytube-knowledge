# HiveStream Persistent Project Memory Layer

**Date:** 2026-09-08  
**Project:** HiveStream / cytube-hivestream  
**Repository:** `duckwerks/cytube-knowledge`

## Authorship and provenance

**Human Project Lead:** Elwood Edwards  
**AI Research & Engineering:** GPT-5.6 Luna (OpenAI) — HiveStream Research & Engineering Assistant

This document records a proposed persistent collaboration layer for HiveStream development across multiple AI assistants and working environments. It is an architectural/workflow proposal, not evidence that any particular external AI service currently supports every described operation.

---

## 1. The problem this solves

HiveStream is a long-running engineering project. The project's useful state should not depend on one AI remembering a conversation, one browser tab remaining open, or one assistant having access to every application.

The goal is therefore:

> **Don't try to make one AI remember the project. Make the project remember itself.**

A persistent project-memory layer gives different assistants a shared, durable body of project knowledge while allowing each system to work through the tools it is best connected to.

This is especially useful for HiveStream because the project contains several kinds of state:

- architecture decisions
- source-code findings
- reverse-engineering evidence
- runtime test results
- implementation plans
- open questions
- research notes
- handoff material
- provenance and historical decisions

These should survive the end of a conversation and remain understandable to another human or AI contributor.

---

## 2. Proposed two-layer project memory

```text
                    HIVE STREAM PROJECT MEMORY

                         ┌───────────────┐
                         │ PROJECT STATE │
                         └───────┬───────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
              GitHub                         Drive
          Engineering layer                Working layer
                  │                             │
       source + decisions              research + notes
       + provenance                    + experiments
       + history                       + drafts
                  │                             │
                  └──────────────┬──────────────┘
                                 │
                         HUMAN PROJECT LEAD
                           Elwood Edwards
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
              ChatGPT                       Claude
          GitHub read/write             Drive read/write*
                  │                             │
                  └──────────────┬──────────────┘
                                 │
                         Shared project state
```

`*` Claude's exact Drive capabilities must be verified in the environment being used. This document does not assume that a generic Drive connection necessarily provides every possible Drive/Docs operation.

The important idea is not that GitHub and Drive are interchangeable. They serve different purposes.

---

## 3. GitHub is the canonical engineering record

The GitHub repository should remain the authoritative source for durable engineering state.

For HiveStream, GitHub should contain:

- source code
- version history
- commits
- architecture decisions
- implementation artifacts
- reproducible technical documents
- evidence summaries
- important test findings
- roadmaps
- open technical questions
- lineage/provenance
- eventually issues and pull requests

The canonical knowledge repository is:

`duckwerks/cytube-knowledge`

GitHub should answer:

> **What has the project actually established, decided, implemented, or archived?**

Git history is particularly valuable because it provides a durable chronology of how conclusions changed.

### GitHub should not become a dumping ground

Not every scratch note or temporary experiment needs to be committed immediately.

The repository should contain information that has durable value to the project.

A useful rule is:

```text
Temporary thought
      ↓
Working notes / experiment
      ↓
Validated finding or useful design conclusion
      ↓
Archive in GitHub
```

---

## 4. Google Drive is the collaborative working layer

A Drive/Docs environment can complement GitHub by holding material that is useful during active investigation but does not necessarily belong in the canonical engineering history immediately.

Potential Drive contents:

- working research documents
- large experimental logs
- evolving planning documents
- drafts
- scratch analysis
- cross-project research
- documents being actively edited by humans and AI assistants
- temporary LLM handoff material
- meeting-style notes
- large collections of observations before they are distilled into durable repository artifacts

Drive should answer:

> **What are we currently thinking, investigating, collecting, or drafting?**

This is intentionally different from GitHub's role.

---

## 5. The documents become the interface between AIs

The most important architectural benefit is that the persistent documents themselves become the communication protocol between assistants.

Instead of:

```text
ChatGPT remembers conversation
        ↓
Claude tries to reconstruct conversation
        ↓
Human explains missing context
```

the desired flow becomes:

```text
                 Persistent Project State
                         │
              ┌──────────┴──────────┐
              │                     │
           ChatGPT               Claude
              │                     │
          updates repo        updates working docs
              │                     │
              └──────────┬──────────┘
                         ↓
                 Human reviews state
```

The assistant is no longer the permanent memory. The project artifacts are.

This also makes it possible to replace one assistant with another without losing the project's accumulated reasoning.

---

## 6. Recommended project-state documents

A practical persistent project layer can use a small number of predictable documents:

```text
PROJECT/
├── 00-CURRENT-STATE.md
├── 01-ARCHITECTURE.md
├── 02-ROADMAP.md
├── 03-OPEN-QUESTIONS.md
├── 04-EXPERIMENT-LOG.md
├── 05-DECISIONS.md
└── 06-LLM-HANDOFF.md
```

These names are conceptual. They do not all need to exist in both GitHub and Drive.

### 00-CURRENT-STATE.md

The shortest useful description of where the project is now.

It should answer:

- What is HiveStream?
- What is already proven?
- What has been selected?
- What are we building next?
- What is explicitly out of scope?

This should be the first document an unfamiliar assistant can read.

### 01-ARCHITECTURE.md

The current technical architecture and major boundaries.

For HiveStream this includes, among other things:

- media identity
- segment model
- P2P media plane
- playback plane
- persistence
- replication manager
- local ingestion
- room/playlist integration
- future control/discovery layer

### 02-ROADMAP.md

The implementation sequence, milestones, and current phase.

### 03-OPEN-QUESTIONS.md

Questions that remain unresolved, with enough context to prevent repeated investigation of already-settled issues.

### 04-EXPERIMENT-LOG.md

Runtime experiments, observations, measurements, failures, and conclusions.

### 05-DECISIONS.md

Short architectural decision records. Each decision should state what was chosen, why, alternatives considered, and whether the decision is provisional or final.

### 06-LLM-HANDOFF.md

A concise entry point for another AI assistant. It should point to the deeper documents rather than attempting to contain the entire project.

HiveStream already has a dedicated handoff document in GitHub; this proposed structure is compatible with that approach.

---

## 7. Recommended division of responsibility

### GitHub

**Canonical engineering state**

```text
source code
architecture
implementation
validated findings
commits
history
issues
PRs
provenance
```

### Drive

**Active collaborative working state**

```text
research
scratch work
large logs
drafts
planning
cross-assistant notes
working documents
```

### Human project lead

**Authority over project direction**

```text
scope
priorities
acceptance/rejection of conclusions
final design decisions
release decisions
```

### AI assistants

**Research and engineering contributors**

```text
investigate
analyze
write tests
interpret evidence
propose designs
implement changes
update project artifacts
identify uncertainty
```

AI output should not silently become architectural truth. Important conclusions should be recorded with their evidence status.

---

## 8. Evidence discipline

HiveStream already uses an explicit evidence classification system. The persistent layer should preserve it.

```text
SOURCE PROVEN
Directly established from source code.

RUNTIME PROVEN
Established by controlled runtime testing.

STRONG INFERENCE
Architectural conclusion derived from multiple source/runtime observations.

UNPROVEN / OPEN
Question remains under investigation.

DESIGN PROPOSAL
Proposed HiveStream architecture; not evidence that referenced projects implement it.
```

This matters because an AI reading old project notes may otherwise mistake a hypothesis for an established fact.

Persistent documents should therefore prefer statements such as:

```text
RUNTIME PROVEN: Browser B received segment data from Browser A.

STRONG INFERENCE: Persistent segment inventory can be used as a source of
future P2P availability.

UNPROVEN / OPEN: Exact announcement behavior after pre-populating storage
before P2P loader activation remains to be runtime-tested.
```

This makes the project much harder to derail through accidental assumption inheritance.

---

## 9. Synchronization between the two layers

The two stores should not be treated as automatically identical mirrors.

A better conceptual flow is:

```text
                 WORKING MATERIAL
                       │
                       ↓
              Drive / working docs
                       │
                 investigation
                       │
                       ↓
                validated result
                       │
                       ↓
              GitHub durable record
                       │
                       ↓
                canonical state
```

The reverse direction is also important:

```text
GitHub canonical state
        ↓
working document / handoff
        ↓
Claude / ChatGPT / human
        ↓
new investigation
```

The two layers therefore form a feedback loop rather than a simple mirror.

---

## 10. Avoiding synchronization hell

A major danger is creating a system in which GitHub and Drive contain conflicting versions of the same document.

Do **not** make every document a two-way synchronized master copy by default.

Instead, assign ownership to information.

For example:

```text
Question / scratch investigation
    → Drive owner

Validated architecture decision
    → GitHub owner

Source code
    → GitHub owner

Git history
    → GitHub owner

Temporary research notes
    → Drive owner

Final experiment finding
    → GitHub owner
```

When a Drive document produces a durable conclusion, promote the conclusion into GitHub rather than maintaining two competing canonical copies.

This dramatically reduces conflict and ambiguity.

---

## 11. AI handoff protocol

When a new AI joins the project, the intended reading order should be:

```text
1. 00-CURRENT-STATE
        ↓
2. LLM HANDOFF
        ↓
3. ARCHITECTURE
        ↓
4. ROADMAP
        ↓
5. OPEN QUESTIONS
        ↓
6. relevant experiment / decision records
```

For the current HiveStream repository, the existing handoff document already establishes a similar rule:

1. read the handoff first;
2. read the architecture decision next;
3. read the P2P media-loader reuse findings;
4. read the CyTube HLS/P2P checkpoint;
5. treat runtime tests as evidence;
6. preserve project scope;
7. avoid restarting broad technology surveys without a concrete blocker.

This protocol should remain the standard regardless of which AI performs the next task.

---

## 12. Why this is particularly valuable for HiveStream

HiveStream is not simply a small application. It combines:

- browser media playback
- HLS
- WebRTC
- P2P segment exchange
- persistent browser storage
- local file ingestion
- playlist/media identity
- CyTube integration
- replication strategy

There is a high risk that future assistants will repeatedly rediscover the same facts or, worse, contradict previous findings because they cannot see the reasoning behind an architectural choice.

Persistent project artifacts prevent that.

For example, the project has already investigated multiple P2P technologies and selected **p2p-media-loader** as the initial media-plane foundation. A future assistant should not restart that entire survey simply because it has not seen the earlier reasoning.

The durable documents preserve the decision and its evidence.

---

## 13. The persistence layer should preserve project identity

Every durable project document should identify its provenance.

Recommended header:

```text
Project: HiveStream
Human Project Lead: Elwood Edwards
AI Research & Engineering: GPT-5.6 Luna (OpenAI) — HiveStream Research & Engineering Assistant
Date: YYYY-MM-DD
Status: [DRAFT / ACTIVE / VALIDATED / SUPERSEDED]
```

When another AI contributes, its contribution should also be identifiable.

The purpose is not bureaucracy. It is historical clarity.

A future contributor should be able to tell:

- who proposed something
- who tested it
- who validated it
- whether it was a design proposal or observed behavior
- whether a later decision superseded it

---

## 14. What should NOT be put in the persistent layer

Do not preserve everything merely because it exists.

Avoid turning the project memory into:

- an unfiltered transcript archive
- endless speculative technology lists
- duplicate copies of source code
- secrets or credentials
- personal/private information that is unnecessary to engineering
- every failed thought with no future value
- stale plans without status

The objective is **high information density**, not maximum volume.

A good project memory system remembers conclusions and the evidence needed to trust them.

---

## 15. Relationship to the current HiveStream architecture

This persistence layer does not change the HiveStream product architecture.

It is an engineering-process architecture around the project.

The product architecture remains:

```text
                    HIVE STREAM

        ┌───────────────────────────────┐
        │         APPLICATION           │
        │ room / playlist / media ID    │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────┐
        │       DISTRIBUTION LAYER      │
        │ persistence / replication     │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────┐
        │          P2P MEDIA            │
        │       p2p-media-loader        │
        │          WebRTC               │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────┐
        │           PLAYBACK            │
        │       HLS.js / Video.js       │
        └───────────────────────────────┘
```

The project-memory architecture sits outside this:

```text
             ENGINEERING MEMORY
          ┌──────────┴──────────┐
          │                     │
       GitHub                 Drive
          │                     │
          └──────────┬──────────┘
                     │
                AI / HUMAN
                     │
                     ↓
                HiveStream
```

This distinction should remain explicit.

---

## 16. Current ChatGPT / GitHub / Drive situation

At the time this document was created:

- ChatGPT has GitHub access for `duckwerks/cytube-knowledge`, including write capability.
- The repository is therefore suitable as the canonical engineering record.
- Google Drive is not currently available to ChatGPT in this environment because the Drive connector is disabled/unavailable.
- A separate AI environment may have Drive access, but its exact capabilities must be verified there rather than assumed.

Therefore the practical workflow today can already use:

```text
ChatGPT
   ↕
GitHub canonical state
```

and, if another environment has appropriate Drive access:

```text
Claude
   ↕
Drive working state
```

The two can still exchange durable information through GitHub documents even without direct Drive interoperability.

---

## 17. Recommended initial implementation

Do not build an elaborate synchronization service yet.

The project should first establish the human-readable convention.

### Phase 1 — document ownership

Decide which documents are GitHub-canonical and which are working documents.

### Phase 2 — current-state document

Maintain one concise `00-CURRENT-STATE` document that points to the authoritative deeper documents.

### Phase 3 — experiment promotion

When a working experiment produces a useful conclusion:

```text
working observation
       ↓
interpretation
       ↓
evidence classification
       ↓
validated finding
       ↓
GitHub archive
```

### Phase 4 — AI handoff

Every AI entering the project reads the current state and handoff before making architectural recommendations.

### Phase 5 — automation only if needed

Only after the manual workflow proves useful should we consider automated synchronization, indexing, webhooks, or document bridges.

This avoids creating infrastructure to solve a problem that disciplined documents may already solve.

---

## 18. Long-term possibility: a project knowledge protocol

If HiveStream grows substantially, the persistent layer could eventually become more formal.

A future system could expose structured project knowledge:

```text
GET CURRENT_STATE
GET ARCHITECTURE
GET OPEN_QUESTIONS
GET DECISIONS
GET EXPERIMENTS
GET ARTIFACT provenance
APPEND EXPERIMENT
PROPOSE DECISION
PROMOTE FINDING
```

Multiple AI assistants could then operate against the same project knowledge interface.

But this should be considered a future optimization, not current HiveStream scope.

The simplest durable implementation is currently sufficient:

> **Well-structured documents + Git history + explicit provenance + evidence classification.**

---

## 19. Final principle

HiveStream's engineering process should be designed so that project knowledge survives the assistant that created it.

The intended relationship is:

```text
             HUMAN PROJECT LEAD
                    │
                    ↓
             PROJECT ARTIFACTS
                    │
        ┌───────────┴───────────┐
        │                       │
      GitHub                  Drive
   canonical state         working state
        │                       │
        └───────────┬───────────┘
                    │
             AI CONTRIBUTORS
                    │
                    ↓
             new artifacts
                    │
                    └──────────→ project memory
```

The ultimate objective is not to make ChatGPT remember HiveStream, nor to make Claude remember HiveStream.

It is to make **HiveStream itself remember what has been learned**.

---

## Status

**STATUS: ACTIVE DESIGN PROPOSAL**

This document defines the proposed project-memory workflow. It does not require immediate automation or a second synchronization system.

The recommended next step is simply to adopt the document ownership rules and maintain a concise current-state/handoff record. Automation should be added only when the manual workflow demonstrates a concrete bottleneck.
