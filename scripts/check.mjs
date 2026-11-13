#!/usr/bin/env node
// Validates the repo: SKILL.md frontmatter, layout, groups, version
// immutability, and a scan for proprietary or private content.
// No dependencies. Exits non-zero with a list of findings.
//
//   node scripts/check.mjs                 # immutability vs HEAD~1 (if any)
//   node scripts/check.mjs --base <ref>    # immutability vs <ref>
//   node scripts/check.mjs --no-git        # skip the immutability check
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NAME_RE, SEMVER_RE, listGroups, listSkillVersions, parseSkillFile } from './lib.mjs'

const MAX_DESCRIPTION = 300
const MAX_SKILL_BYTES = 64 * 1024
// Folders whose content is published (and therefore scanned).
const CONTENT_DIRS = ['skills', 'groups', 'memory']
const CONTENT_FILES = ['README.md']

// ── Proprietary-content scan ──────────────────────────────────────────

const EXAMPLE_DOMAIN = /(^|\.)(example\.(com|org|net)|[a-z0-9-]+\.(example|test|invalid|localhost))$/i
const ALLOWED_EMAILS = new Set(['git@github.com', 'git@gitlab.com', 'git@bitbucket.org'])
const PLACEHOLDER_USERS = new Set(['user', 'username', 'you', 'me', 'example', 'name'])

/** Rules: [kind, regex, optional filter(match) → keep?]. All regexes global. */
const RULES = [
  ['private-key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g],
  ['aws-access-key', /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[0-9A-Z]{16}\b/g],
  ['aws-secret-key', /aws_secret_access_key\s*[:=]\s*["']?[A-Za-z0-9/+=]{30,}/gi],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{16,}/g],
  ['openai-key', /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{20,}/g],
  ['slack-token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
  ['slack-webhook', /hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+/g],
  [
    'email',
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    (m) => {
      const addr = m.toLowerCase()
      const [local, domain] = addr.split('@')
      if (ALLOWED_EMAILS.has(addr)) return false
      if (local === 'noreply' || local === 'no-reply') return false
      return !EXAMPLE_DOMAIN.test(domain)
    },
  ],
  [
    'private-ip',
    /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
    (m) => m.split('.').every((o) => Number(o) <= 255),
  ],
  [
    'internal-hostname',
    /(?<![\w.-])[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.(?:internal|local|corp|lan)(?![\w.-])/gi,
  ],
  [
    'home-path',
    /(?:\/home\/[A-Za-z0-9_][A-Za-z0-9_.-]*|\/Users\/[A-Za-z0-9_][A-Za-z0-9_.-]*|\b[A-Za-z]:\\Users\\[A-Za-z0-9_][A-Za-z0-9_. -]*)/g,
    (m) => !PLACEHOLDER_USERS.has(m.split(/[\\/]/).filter(Boolean).pop().toLowerCase()),
  ],
]

function redact(s) {
  if (s.length <= 8) return s.slice(0, 2) + '***'
  return s.slice(0, 6) + '***'
}

/** Scan text for content that must not be published. → [{line, kind, excerpt}] */
export function scanText(text) {
  const findings = []
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    for (const [kind, re, keep] of RULES) {
      re.lastIndex = 0
      for (const m of line.matchAll(re)) {
        if (keep && !keep(m[0])) continue
        findings.push({ line: i + 1, kind, excerpt: redact(m[0]) })
      }
    }
  })
  return findings
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const n of readdirSync(dir).sort()) {
    if (n === '.git' || n === 'node_modules') continue
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

// ── Immutability (git) ────────────────────────────────────────────────

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

/**
 * Paths under skills/ that existed at `base` and were modified or deleted
 * since (working tree included). Returns { changed, note }.
 */
export function changedPublishedVersions(root, base) {
  try {
    if (git(root, ['rev-parse', '--is-inside-work-tree']).trim() !== 'true') {
      return { changed: [], note: 'not a git work tree; immutability check skipped' }
    }
  } catch {
    return { changed: [], note: 'git unavailable or not a repo; immutability check skipped' }
  }
  const ref = base ?? 'HEAD~1'
  try {
    git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  } catch {
    return { changed: [], note: `base ${ref} not found; immutability check skipped` }
  }
  const out = git(root, ['diff', '--name-status', '--no-renames', ref, '--', 'skills'])
  const changed = []
  for (const line of out.split('\n')) {
    const [status, file] = line.split('\t')
    if (!file) continue
    if (status.startsWith('M') || status.startsWith('D') || status.startsWith('T')) {
      changed.push({ status: status[0], file })
    }
  }
  return { changed, note: null }
}

// ── Repo check ────────────────────────────────────────────────────────

/**
 * Validate the repo at `root`. → { errors: [string], notes: [string] }
 * opts.base: git ref for the immutability check (default HEAD~1);
 * opts.git === false skips it.
 */
export function checkRepo(root, opts = {}) {
  const errors = []
  const notes = []
  const rel = (p) => path.relative(root, p).split(path.sep).join('/')

  // Groups first: skills reference them.
  const groupSlugs = new Set()
  const groups = listGroups(root)
  for (const g of groups) {
    const f = rel(g.file)
    if (g.error) {
      errors.push(`${f}: ${g.error}`)
      continue
    }
    groupSlugs.add(g.slug)
    if (!NAME_RE.test(g.slug)) errors.push(`${f}: file name "${g.slug}" is not a valid slug`)
    const d = g.data
    if (typeof d !== 'object' || d === null || Array.isArray(d)) {
      errors.push(`${f}: must be a JSON object`)
      continue
    }
    if (d.slug !== g.slug) errors.push(`${f}: "slug" must be "${g.slug}" (matches the file name)`)
    if (typeof d.name !== 'string' || !d.name.trim()) errors.push(`${f}: "name" is required`)
    if (typeof d.description !== 'string') errors.push(`${f}: "description" must be a string`)
    if (!Array.isArray(d.skills) || d.skills.some((s) => typeof s !== 'string')) {
      errors.push(`${f}: "skills" must be an array of skill names`)
    }
  }

  const skillNames = new Set()
  const skillsDir = path.join(root, 'skills')
  if (existsSync(skillsDir)) {
    for (const n of readdirSync(skillsDir)) {
      const p = path.join(skillsDir, n)
      if (!statSync(p).isDirectory()) errors.push(`${rel(p)}: only skill folders belong in skills/`)
    }
  }

  for (const sv of listSkillVersions(root)) {
    const where = rel(sv.dir)
    skillNames.add(sv.name)
    if (!NAME_RE.test(sv.name)) errors.push(`${where}: folder "${sv.name}" is not a valid skill name`)
    if (!SEMVER_RE.test(sv.version)) {
      errors.push(`${where}: folder "${sv.version}" is not a semver version`)
    }
    for (const n of readdirSync(sv.dir)) {
      if (n !== 'SKILL.md') errors.push(`${where}/${n}: only SKILL.md belongs in a version folder`)
    }
    if (!existsSync(sv.file)) {
      errors.push(`${where}: missing SKILL.md`)
      continue
    }
    const f = rel(sv.file)
    const raw = readFileSync(sv.file, 'utf8')
    if (Buffer.byteLength(raw) > MAX_SKILL_BYTES) errors.push(`${f}: larger than 64 KiB`)
    const parsed = parseSkillFile(raw)
    if (parsed.error) {
      errors.push(`${f}: ${parsed.error}`)
      continue
    }
    const fm = parsed.data
    if (typeof fm.name !== 'string' || !NAME_RE.test(fm.name)) {
      errors.push(`${f}: "name" must match ${NAME_RE}`)
    } else if (fm.name !== sv.name) {
      errors.push(`${f}: name "${fm.name}" does not match folder skills/${sv.name}/`)
    }
    if (typeof fm.version !== 'string' || !SEMVER_RE.test(fm.version)) {
      errors.push(`${f}: "version" must be semver (e.g. 1.0.0)`)
    } else if (fm.version !== sv.version) {
      errors.push(`${f}: version "${fm.version}" does not match folder ${sv.version}/`)
    }
    if (typeof fm.description !== 'string' || !fm.description.trim()) {
      errors.push(`${f}: "description" is required`)
    } else if (fm.description.length > MAX_DESCRIPTION) {
      errors.push(`${f}: "description" is longer than ${MAX_DESCRIPTION} characters`)
    }
    for (const key of ['tags', 'groups']) {
      if (fm[key] === undefined) continue
      if (!Array.isArray(fm[key])) {
        errors.push(`${f}: "${key}" must be a list, e.g. ${key}: [a, b]`)
        continue
      }
      for (const v of fm[key]) {
        if (!NAME_RE.test(v)) errors.push(`${f}: ${key} entry "${v}" must match ${NAME_RE}`)
      }
    }
    for (const g of Array.isArray(fm.groups) ? fm.groups : []) {
      if (!groupSlugs.has(g)) errors.push(`${f}: group "${g}" has no groups/${g}.json`)
    }
    if (!parsed.body.trim()) errors.push(`${f}: body is empty`)
  }

  for (const g of groups) {
    if (g.error || !Array.isArray(g.data?.skills)) continue
    for (const s of g.data.skills) {
      if (typeof s === 'string' && !skillNames.has(s)) {
        errors.push(`${rel(g.file)}: lists skill "${s}" which has no skills/${s}/ folder`)
      }
    }
  }

  // Published versions are immutable.
  if (opts.git !== false) {
    const { changed, note } = changedPublishedVersions(root, opts.base)
    if (note) notes.push(note)
    for (const c of changed) {
      const what = c.status === 'D' ? 'deleted' : 'modified'
      errors.push(
        `${c.file}: published version ${what} — versions are immutable; add a new version folder instead`,
      )
    }
  }

  // Proprietary-content scan over everything that gets published.
  const files = [
    ...CONTENT_DIRS.flatMap((d) => walk(path.join(root, d))),
    ...CONTENT_FILES.map((f) => path.join(root, f)).filter((p) => existsSync(p)),
  ]
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const fd of scanText(text)) {
      errors.push(`${rel(file)}:${fd.line}: proprietary-content [${fd.kind}] ${fd.excerpt}`)
    }
  }

  return { errors, notes }
}

function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') opts.base = argv[++i] || undefined
    else if (argv[i] === '--no-git') opts.git = false
    else if (argv[i] === '--root') opts.root = argv[++i]
  }
  // An all-zero sha is what GitHub sends as "before" for a new branch.
  if (opts.base && /^0+$/.test(opts.base)) opts.base = undefined
  const { errors, notes } = checkRepo(opts.root ? path.resolve(opts.root) : root, opts)
  for (const n of notes) console.log(`note: ${n}`)
  if (errors.length) {
    console.error(`check failed with ${errors.length} finding(s):`)
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
  }
  console.log('check passed')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
