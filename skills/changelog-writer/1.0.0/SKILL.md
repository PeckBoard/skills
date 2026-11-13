---
name: changelog-writer
description: Turn a range of commits or merged PRs into a user-facing changelog entry grouped by Added, Changed, Fixed, and Removed.
version: 1.0.0
tags: [release, writing, git]
groups: [release]
---

# Changelog Writer

Use this when asked to write release notes or a changelog entry for a
version.

## Gather

1. Find the range: the previous release tag to the new one
   (`git log --oneline <prev-tag>..<new-ref>`), or the list of merged PRs.
2. Read each commit's body, not just its subject — the "why" usually
   lives there.
3. Check whether the project keeps a `CHANGELOG.md`; match its format.
   If none exists, use the format below (based on Keep a Changelog).

## Write for Users, Not Committers

- Describe the effect a user notices: "Uploads over 2 GB no longer fail",
  not "Fix int overflow in chunker".
- Drop internal-only changes (refactors, CI tweaks, test-only commits)
  unless they change behaviour.
- Merge several commits about the same feature into one line.
- Call out anything that needs action: breaking changes, migrations,
  renamed config keys, removed flags — put these first under a
  **Breaking** heading.
- Credit contributors if the project does so.

## Format

```
## [1.4.0] - 2026-03-02

### Breaking
- The `--legacy-auth` flag is removed; use `--auth=token` instead.

### Added
- Export boards as CSV from the board menu.

### Changed
- Search now matches card descriptions as well as titles.

### Fixed
- Uploads over 2 GB no longer fail partway through.

### Removed
- The deprecated v1 webhooks endpoint.
```

Omit empty sections. Keep each bullet to one line where possible, and
order bullets by how many users they affect.
