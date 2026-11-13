---
name: pr-review-checklist
description: Review a pull request or branch diff for correctness, tests, compatibility, and maintainability, and report verified findings ranked by severity.
version: 1.1.0
tags: [review, git, quality]
groups: [pr-review]
---

# Pull Request Review Checklist

Use this when asked to review a pull request, a branch, or a diff.

## Before Reading the Diff

1. Read the PR title, description, and any linked issue. Write down, in one
   sentence, what the change is supposed to do. Every finding is judged
   against that intent.
2. Note the size of the diff. If it is very large, review it by area
   (data model, API, UI, tests) rather than file by file.
3. Find the callers of every function, type, or endpoint the diff
   changes. A change is only as safe as its least-prepared caller.

## Correctness

- Does the code do what the description claims? Trace at least one real
  input end to end.
- Edge cases: empty input, a single item, very large input, unicode,
  `null`/`None`/missing fields, concurrent callers, retries.
- Error handling: are errors surfaced, logged, or silently swallowed?
  Is cleanup (files, locks, connections) done on the error path too?
- Off-by-one errors in loops, slices, pagination, and date ranges.
- Changed function signatures: are all callers updated?

## Compatibility

- Database migrations: do they run on a table that already has rows?
  Are they reversible? Do they drop or retype anything?
- Public APIs, CLI flags, config keys, and file formats: does existing
  data or an older client still work?
- Feature flags and defaults: what happens for users who never touch
  the new setting?

## Tests

- Is there a test that fails without this change and passes with it?
- Do the tests assert behaviour, or only that code ran?
- Are flaky patterns present (sleeps, real clocks, network, ordering)?

## Maintainability

- Names say what things are; no misleading names left after a refactor.
- No dead code, commented-out blocks, or debug prints.
- Duplication that should use an existing helper.

## Verify Before Reporting

For every candidate finding, re-read the surrounding code and confirm the
failure is real: name the input or state that triggers it. Drop findings
you cannot make concrete, or mark them `unverified`.

## Reporting

Report each finding as:

```
[severity] path/to/file.ext:LINE — what is wrong
  Why it matters: the concrete input or state that breaks
  Suggested fix: one or two lines
```

Severity is one of `blocker`, `major`, `minor`, `nit`. Rank blockers
first. If you found nothing significant, say so plainly instead of
inventing nits. End with a one-line verdict: `approve`,
`approve with nits`, or `request changes`.
