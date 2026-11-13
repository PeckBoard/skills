---
name: test-plan-writer
description: Write a focused test plan for a feature or change — what to test, at which level, and which cases matter — before writing the tests.
version: 1.0.0
tags: [testing, planning, quality]
groups: [testing]
---

# Test Plan Writer

Use this before writing tests for a new feature or a non-trivial change,
or when asked "how should we test this?".

## Steps

1. **State the behaviour.** In two or three sentences, describe what the
   user (or calling code) can do after this change that they could not
   do before. Tests verify behaviour, not implementation.
2. **List the entry points.** UI flows, API routes, CLI commands, jobs,
   public functions. Each entry point a user can reach needs at least one
   test at the level the user reaches it.
3. **Pick the level for each case.**
   - *Unit* — pure logic with many input permutations (parsers,
     calculators, validators).
   - *Integration* — code that crosses a boundary you own (database,
     file system, internal HTTP).
   - *End-to-end* — one test per distinct user-visible flow. Keep these
     few; they are slow and the most valuable.
4. **Enumerate cases.** For each entry point:
   - the happy path;
   - each meaningful state transition (created → active → archived);
   - failure modes a user can actually trigger (invalid input,
     permission denied, conflict, not found, timeout);
   - boundaries (empty, one, many, maximum size).
5. **Cut.** Remove cases that only restate the implementation or that a
   higher-level test already covers. A plan with ten sharp cases beats one
   with fifty overlapping ones.
6. **Note test data and isolation.** What fixtures are needed? Can tests
   run in parallel? What must be faked (clock, network, randomness)?

## Output Format

```
## Test Plan: <feature>

Behaviour: <2–3 sentences>

| # | Level | Entry point | Case | Expected |
|---|-------|-------------|------|----------|
| 1 | e2e   | Settings → Save | valid form | toast shown, value persisted after reload |
| 2 | unit  | parseDuration() | "90m"      | 5400 seconds |

Fixtures: ...
Out of scope: ...
```
