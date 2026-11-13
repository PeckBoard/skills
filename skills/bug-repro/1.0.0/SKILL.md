---
name: bug-repro
description: Turn a bug report into a minimal, reliable reproduction and a failing test before attempting a fix.
version: 1.0.0
tags: [debugging, testing]
groups: [testing]
---

# Bug Reproduction

Use this when given a bug report, a failing behaviour, or a crash, before
changing any code to fix it.

## 1. Restate the Bug

Write three lines:

- **Expected:** what should happen.
- **Actual:** what happens instead (exact error text, wrong output).
- **Conditions:** version, platform, configuration, input, and steps.

If any of these are missing from the report, list the specific question
to ask rather than guessing.

## 2. Reproduce It As Reported

Follow the reported steps exactly in a clean environment (fresh data
directory, default config). Record whether it reproduces every time,
sometimes, or never. For intermittent bugs, run it in a loop and note
the failure rate — you will need that number to prove a fix.

## 3. Minimize

Remove one condition at a time — input size, config options, steps,
concurrency — and keep only what is needed for the failure. Stop when
removing anything else makes the bug disappear. A minimal repro usually
points straight at the cause.

## 4. Capture It As a Failing Test

Write an automated test at the lowest level that still reproduces the
bug, named after the behaviour (`rejects_duplicate_slug_on_rename`),
not the ticket number. Run it and confirm it fails *for the reported
reason* — check the assertion message, not just the exit code.

## 5. Locate, Then Fix

Only now read the code path the test exercises. Form one hypothesis,
check it with a log line or debugger, and fix the cause rather than the
symptom. The failing test must now pass, and the rest of the suite must
still pass.

## Report

```
Repro: <minimal steps or test name> — fails N/N runs before the fix
Cause: <one or two sentences, with file:line>
Fix: <what changed>
Test: <test name> now passes; suite green
```
