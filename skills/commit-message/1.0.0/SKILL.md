---
name: commit-message
description: Write a clear git commit message (subject + body) from a staged diff, explaining what changed and why.
version: 1.0.0
tags: [git, writing]
groups: [pr-review, release]
---

# Commit Message

Use this when asked to write or improve a commit message.

## Read First

Look at the staged diff (`git diff --cached`) and recent history
(`git log --oneline -n 20`). Match the repository's existing conventions —
Conventional Commits (`feat:`, `fix:`), a version prefix, a ticket prefix,
or plain sentences. Conventions in the repo win over this skill.

## Subject Line

- Imperative mood: "Add retry to upload", not "Added" or "Adds".
- 50 characters is the target, 72 the hard limit.
- No trailing period.
- Say what the change *does* for the reader, not which files moved:
  "Fix duplicate emails when a job retries", not "Update mailer.js".

## Body

Leave one blank line after the subject, then wrap at 72 columns.

1. **Why** — the problem or motivation. What was broken, slow, or
   missing? This is the part future readers cannot recover from the diff.
2. **What** — a short summary of the approach, especially anything
   non-obvious or any alternative you rejected.
3. **Impact** — migrations, config changes, behaviour changes users will
   notice, follow-up work.

Skip the body only for truly self-explanatory changes (typo fixes,
version bumps).

## Rules

- One logical change per commit. If the message needs "and" twice,
  suggest splitting the commit.
- Reference issues as the project does (`Fixes #123`).
- Never include secrets, internal hostnames, or customer data in a
  commit message — history is permanent.

## Example

```
Fix duplicate emails when a send job retries

The mail worker marked a message as sent only after the provider call
returned. A timeout after the provider had accepted the message caused
the job to retry and send it again.

Record a send attempt with an idempotency key before calling the
provider and pass the key through, so a retry is deduplicated upstream.

Fixes #482
```
