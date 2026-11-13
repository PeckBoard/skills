---
name: pr-review-checklist
description: Review a pull request or branch diff for correctness, tests, and maintainability, and report findings ranked by severity.
version: 1.0.0
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

## Correctness

- Does the code do what the description claims? Trace at least one real
  input end to end.
- Edge cases: empty input, a single item, very large input, unicode,
  `null`/`None`/missing fields, concurrent callers, retries.
- Error handling: are errors surfaced, logged, or silently swallowed?
  Is cleanup (files, locks, connections) done on the error path too?
- Off-by-one errors in loops, slices, pagination, and date ranges.
- Changed function signatures: are all callers updated?

## Tests

- Is there a test that fails without this change and passes with it?
- Do the tests assert behaviour, or only that code ran?
- Are flaky patterns present (sleeps, real clocks, network, ordering)?

## Maintainability

- Names say what things are; no misleading names left after a refactor.
- No dead code, commented-out blocks, or debug prints.
- Duplication that should use an existing helper.

## Reporting

Report each finding as:

```
[severity] path/to/file.ext:LINE — what is wrong
  Why it matters: the concrete input or state that breaks
  Suggested fix: one or two lines
```

Severity is one of `blocker`, `major`, `minor`, `nit`. Rank blockers
first. If you found nothing significant, say so plainly instead of
inventing nits.
