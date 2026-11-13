// Shared helpers for build-index.mjs and check.mjs. No dependencies.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'

export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
export const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/** Compare two semver strings (build metadata ignored). */
export function compareSemver(a, b) {
  const pa = SEMVER_RE.exec(a)
  const pb = SEMVER_RE.exec(b)
  if (!pa || !pb) return String(a).localeCompare(String(b))
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d !== 0) return d
  }
  const ra = pa[4]
  const rb = pb[4]
  if (!ra && !rb) return 0
  if (!ra) return 1 // a release outranks its prereleases
  if (!rb) return -1
  const xa = ra.split('.')
  const xb = rb.split('.')
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    if (xa[i] === undefined) return -1
    if (xb[i] === undefined) return 1
    const na = /^\d+$/.test(xa[i])
    const nb = /^\d+$/.test(xb[i])
    if (na && nb) {
      const d = Number(xa[i]) - Number(xb[i])
      if (d !== 0) return d
    } else if (na !== nb) {
      return na ? -1 : 1
    } else if (xa[i] !== xb[i]) {
      return xa[i] < xb[i] ? -1 : 1
    }
  }
  return 0
}

/** Highest non-prerelease version, else the highest prerelease. */
export function latestVersion(versions) {
  const sorted = [...versions].sort(compareSemver).reverse()
  return sorted.find((v) => !SEMVER_RE.exec(v)?.[4]) ?? sorted[0] ?? null
}

function unquote(s) {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

function stripComment(v) {
  // Drop a trailing ` # comment` that is not inside quotes.
  let q = null
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (q) {
      if (c === q) q = null
    } else if (c === '"' || c === "'") {
      q = c
    } else if (c === '#' && (i === 0 || /\s/.test(v[i - 1]))) {
      return v.slice(0, i).trimEnd()
    }
  }
  return v
}

/**
 * Parse the small YAML subset SKILL.md frontmatter uses: `key: scalar`,
 * `key: [a, b]`, and `key:` followed by `- item` lines.
 * Returns { data, body, bodyLine, error }.
 */
export function parseSkillFile(text) {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const lines = src.split('\n')
  if (lines[0] !== '---') return { error: 'missing frontmatter (file must start with ---)' }
  const end = lines.indexOf('---', 1)
  if (end < 0) return { error: 'unterminated frontmatter (no closing ---)' }
  const data = {}
  let listKey = null
  for (let i = 1; i < end; i++) {
    const raw = lines[i]
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const item = /^\s+-\s*(.*)$/.exec(raw) ?? /^-\s+(.*)$/.exec(raw)
    if (item && listKey) {
      data[listKey].push(unquote(stripComment(item[1])))
      continue
    }
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/.exec(raw)
    if (!m) return { error: `frontmatter line ${i + 1} is not "key: value": ${raw}` }
    const key = m[1]
    const val = stripComment(m[2].trim())
    listKey = null
    if (val === '') {
      data[key] = []
      listKey = key
    } else if (val.startsWith('[')) {
      if (!val.endsWith(']')) return { error: `frontmatter line ${i + 1}: unterminated list` }
      const inner = val.slice(1, -1).trim()
      data[key] = inner ? inner.split(',').map((s) => unquote(s)).filter((s) => s !== '') : []
    } else {
      data[key] = unquote(val)
    }
  }
  return { data, body: lines.slice(end + 1).join('\n').replace(/^\n+/, ''), bodyLine: end + 2 }
}

function dirs(p) {
  if (!existsSync(p)) return []
  return readdirSync(p)
    .filter((n) => !n.startsWith('.') && statSync(path.join(p, n)).isDirectory())
    .sort()
}

/** Every skills/<name>/<version>/ dir: [{ name, version, dir, file }]. */
export function listSkillVersions(root) {
  const out = []
  const skillsDir = path.join(root, 'skills')
  for (const name of dirs(skillsDir)) {
    for (const version of dirs(path.join(skillsDir, name))) {
      const dir = path.join(skillsDir, name, version)
      out.push({ name, version, dir, file: path.join(dir, 'SKILL.md') })
    }
  }
  return out
}

/** Every groups/<slug>.json: [{ slug, file, data, error }]. */
export function listGroups(root) {
  const groupsDir = path.join(root, 'groups')
  if (!existsSync(groupsDir)) return []
  return readdirSync(groupsDir)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => {
      const file = path.join(groupsDir, n)
      const slug = n.slice(0, -'.json'.length)
      try {
        return { slug, file, data: JSON.parse(readFileSync(file, 'utf8')) }
      } catch (e) {
        return { slug, file, error: `invalid JSON: ${e.message}` }
      }
    })
}
