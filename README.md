# Peckboard Skills

The public skill catalog for [Peckboard](https://peckboard.com). A _skill_
is a reusable set of instructions an AI agent loads when a task calls for
it — a review checklist, a release routine, a debugging method. Peckboard
reads this repo's generated `index.json`, so every skill here can be
searched and subscribed to from **Settings → Skills → Browse** in any
Peckboard instance, or from the [skills page on peckboard.com](https://peckboard.com/skills.html).

Skills are plain Markdown with a small YAML header, compatible with
Claude-style `SKILL.md` files, so they are useful outside Peckboard too.

## Layout

```
skills/<name>/<version>/SKILL.md   one folder per published version
groups/<slug>.json                 named bundles of skills
index.json                         generated — do not edit by hand
scripts/build-index.mjs            regenerates index.json
scripts/check.mjs                  validation + proprietary-content scan
```

## The SKILL.md Format

```markdown
---
name: pr-review-checklist
description: One line saying when to use this skill
version: 1.1.0
tags: [review, git]
groups: [pr-review]
---

# Pull Request Review Checklist

The instructions the agent follows...
```

| Field         | Rules                                                                 |
| ------------- | --------------------------------------------------------------------- |
| `name`        | kebab-case, `^[a-z0-9][a-z0-9-]{0,63}$`, equal to the folder name      |
| `description` | one line, at most 300 characters — agents use it to decide relevance |
| `version`     | [semver](https://semver.org), equal to the version folder name        |
| `tags`        | optional list of kebab-case words used by search                      |
| `groups`      | optional list of group slugs; each needs a `groups/<slug>.json`       |

The body is ordinary Markdown. Write it as instructions to an agent: when
to use the skill, the steps, and the shape of the output. Keep it under
64 KiB.

### Groups

A group bundles skills that are used together, so a session can be given
the whole set at once:

```json
{
  "slug": "pr-review",
  "name": "PR review skills",
  "description": "What the bundle is for",
  "skills": ["pr-review-checklist", "security-review"]
}
```

A group's members are the skills it lists plus every skill whose latest
version names the group in its `groups` field.

### Versions Are Immutable

Once a version folder is merged it never changes — Peckboard users can pin
a version and must get the same text forever. To change a skill, copy the
latest folder to a new version (`1.1.0` → `1.2.0` for additions, `2.0.0`
when the skill's behaviour changes incompatibly), edit the copy, and bump
`version` in its header. CI rejects any pull request that edits or deletes
an existing version folder.

## Contributing

1. Fork the repo and create a branch.
2. Add `skills/<name>/1.0.0/SKILL.md` (or a new version of an existing
   skill), and add it to a group if one fits.
3. Run the checks (Node 20+, no install needed):

   ```bash
   node scripts/check.mjs
   node --test test/*.test.mjs
   ```

4. Open a pull request. You do not need to rebuild `index.json` — CI
   regenerates and commits it when your change lands on `main`.

A good skill is generic (useful in many codebases), specific about steps
and output, and short enough that an agent reads all of it.

## Rule: No Proprietary Content

**Everything in this repo is public.** Do not contribute anything you do
not have the right to publish, or anything that identifies a private
system:

- no secrets of any kind — API keys, tokens, passwords, private keys;
- no email addresses (use `example.com` placeholders);
- no private IP addresses or internal hostnames (`.internal`, `.local`,
  `.corp`, `.lan`);
- no absolute home-directory paths that name a real user — use `~/` or a
  placeholder such as `user`;
- no company-internal procedures, customer names, code, or documents.

`scripts/check.mjs` scans every skill, group, and this README for these
patterns and fails the build with the file and line of each finding.
Peckboard runs the same guard before it lets you publish a skill here. The
scan is a safety net, not a guarantee — reviewers reject anything
proprietary it misses.

Private, team-only skills belong in a **team repo** instead: a private git
repository with the same `skills/` and `groups/` layout (plus a `memory/`
folder for shared team notes) that Peckboard syncs as a team source.
