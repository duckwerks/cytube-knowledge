# Knowledge Model

## Purpose

The knowledge base must distinguish what Cytube demonstrably does from what we infer and what we propose for HiveStream.

## Classification

### FACT

A statement directly supported by authoritative documentation, source code, protocol evidence, or a reproducible observation.

### INFERENCE

A conclusion derived from one or more facts. Inferences must identify the evidence they depend on.

### PROPOSAL

A design decision for HiveStream or another custom system. A proposal is not evidence about Cytube.

### OPEN QUESTION

An unresolved point requiring research, source inspection, experimentation, or clarification.

## Source discipline

Non-trivial facts should identify their source. Prefer primary sources such as Cytube source code, protocol documentation, official documentation, and reproducible experiments. Secondary explanations may be useful but should not silently become authoritative facts.

## Observation records

When behavior is experimentally observed, record:

- date
- client/server version when known
- environment
- exact action performed
- observed result
- expected result
- interpretation
- evidence or logs

This allows later work to distinguish an actual Cytube behavior from an accidental property of a particular client, browser, server version, or test environment.
