// node --test test/*.test.mjs
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRepo, scanText } from '../scripts/check.mjs'
import { buildIndex } from '../scripts/build-index.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const temps = []
after(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })))

// Fixture secrets are assembled at runtime so this file itself never
// contains a token-shaped string.
const j = (...parts) => parts.join('')
const FAKE = {
  github: j('gh', 'p_', 'A1b2C3d4'.repeat(5)),
  aws: j('AK', 'IA', 'QWERTYUIOP123456'),
  anthropic: j('sk', '-ant-', 'api03-', 'x1'.repeat(15)),
  openai: j('sk', '-proj-', 'abc123'.repeat(5)),
  slack: j('xo', 'xb-', '1234567890-abcdefghij'),
  pem: j('-----BEGIN ', 'RSA PRIVATE', ' KEY-----'),
  email: j('jane.doe', '@', 'acme-widgets.io'),
  ip: j('192', '.168.', '4.20'),
  host: j('build01', '.corp'),
  home: j('/ho', 'me/', 'jdoe/projects/x'),
}

function skill(name, version, extra = '') {
  return `---\nname: ${name}\ndescription: Test skill ${name}\nversion: ${version}\ntags: [demo]\ngroups: [g1]\n---\n\n# ${name}\n\nBody text.${extra}\n`
}

function fixture(files) {
  const root = mkdtempSync(path.join(REPO, '.test-tmp-'))
  temps.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel)
    mkdirSync(path.dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
  return root
}

const GROUP = JSON.stringify({ slug: 'g1', name: 'Group one', description: 'd', skills: ['alpha'] })

test('the real repo passes', () => {
  const { errors } = checkRepo(REPO, { git: false })
  assert.deepEqual(errors, [])
})

test('a valid fixture passes', () => {
  const root = fixture({
    'skills/alpha/1.0.0/SKILL.md': skill('alpha', '1.0.0'),
    'skills/alpha/1.1.0/SKILL.md': skill('alpha', '1.1.0'),
    'groups/g1.json': GROUP,
  })
  assert.deepEqual(checkRepo(root, { git: false }).errors, [])
})

test('frontmatter, layout, and group errors are reported', () => {
  const root = fixture({
    'skills/alpha/1.0.0/SKILL.md': skill('beta', '1.0.0'), // name mismatch
    'skills/alpha/2.0.0/SKILL.md': skill('alpha', '2.0.1'), // version mismatch
    'skills/Bad_Name/1.0.0/SKILL.md': skill('Bad_Name', '1.0.0'),
    'skills/alpha/latest/SKILL.md': skill('alpha', 'latest'),
    'skills/gamma/1.0.0/SKILL.md': skill('gamma', '1.0.0').replace('groups: [g1]', 'groups: [nope]'),
    'skills/delta/1.0.0/SKILL.md': 'no frontmatter here\n',
    'groups/g1.json': JSON.stringify({ slug: 'g1', name: 'G', description: '', skills: ['ghost'] }),
  })
  const errors = checkRepo(root, { git: false }).errors.join('\n')
  assert.match(errors, /name "beta" does not match folder skills\/alpha\//)
  assert.match(errors, /version "2\.0\.1" does not match folder 2\.0\.0\//)
  assert.match(errors, /folder "Bad_Name" is not a valid skill name/)
  assert.match(errors, /folder "latest" is not a semver version/)
  assert.match(errors, /group "nope" has no groups\/nope\.json/)
  assert.match(errors, /delta\/1\.0\.0\/SKILL\.md: missing frontmatter/)
  assert.match(errors, /lists skill "ghost"/)
})

test('scanText flags each kind of proprietary content', () => {
  const kinds = (s) => scanText(s).map((f) => f.kind)
  assert.deepEqual(kinds(`token ${FAKE.github}`), ['github-token'])
  assert.deepEqual(kinds(`key ${FAKE.aws}`), ['aws-access-key'])
  assert.deepEqual(kinds(`ANTHROPIC_API_KEY=${FAKE.anthropic}`), ['anthropic-key'])
  assert.deepEqual(kinds(`OPENAI_API_KEY=${FAKE.openai}`), ['openai-key'])
  assert.deepEqual(kinds(`slack ${FAKE.slack}`), ['slack-token'])
  assert.deepEqual(kinds(FAKE.pem), ['private-key'])
  assert.deepEqual(kinds(`mail ${FAKE.email}`), ['email'])
  assert.deepEqual(kinds(`ssh ${FAKE.ip}`), ['private-ip'])
  assert.deepEqual(kinds(`see http://${FAKE.host}/ci`), ['internal-hostname'])
  assert.deepEqual(kinds(`cd ${FAKE.home}`), ['home-path'])
  // Excerpts are redacted.
  assert.ok(!scanText(FAKE.github)[0].excerpt.includes(FAKE.github.slice(8)))
})

test('scanText leaves ordinary text alone', () => {
  const ok = [
    'Contact dev@example.com or noreply@peckboard.com.',
    'Clone git@github.com:org/repo.git and copy .env.local and config.local.json.',
    'Point it at 127.0.0.1 or 203.0.113.7; the .local and .corp TLDs are private.',
    'Your files live in /home/user/project or ~/project.',
    'Assess the risk-of-regression-across-modules carefully, version 10.2.3.',
  ]
  for (const line of ok) assert.deepEqual(scanText(line), [], line)
})

test('proprietary content in a skill fails the check with file and line', () => {
  const root = fixture({
    'skills/alpha/1.0.0/SKILL.md': skill('alpha', '1.0.0', `\nUse ${FAKE.github} to push.`),
    'groups/g1.json': GROUP,
  })
  const errors = checkRepo(root, { git: false }).errors
  assert.equal(errors.length, 1)
  assert.match(errors[0], /skills\/alpha\/1\.0\.0\/SKILL\.md:\d+: proprietary-content \[github-token\]/)
})

test('published versions are immutable against the git base', () => {
  const root = fixture({
    'skills/alpha/1.0.0/SKILL.md': skill('alpha', '1.0.0'),
    'groups/g1.json': GROUP,
  })
  const g = (...args) =>
    execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
      stdio: 'ignore',
    })
  g('init', '-q')
  g('add', '.')
  g('commit', '-q', '-m', 'one')
  g('commit', '-q', '--allow-empty', '-m', 'two')

  // Adding a new version is fine.
  const v11 = path.join(root, 'skills/alpha/1.1.0/SKILL.md')
  mkdirSync(path.dirname(v11), { recursive: true })
  writeFileSync(v11, skill('alpha', '1.1.0'))
  assert.deepEqual(checkRepo(root, { base: 'HEAD' }).errors, [])

  // Editing a published one is not.
  const v10 = path.join(root, 'skills/alpha/1.0.0/SKILL.md')
  writeFileSync(v10, readFileSync(v10, 'utf8') + '\nMore.\n')
  const errors = checkRepo(root, { base: 'HEAD' }).errors.join('\n')
  assert.match(errors, /skills\/alpha\/1\.0\.0\/SKILL\.md: published version modified/)

  // Default base is HEAD~1; a missing base is skipped with a note.
  assert.match(checkRepo(root, {}).errors.join('\n'), /published version modified/)
  assert.match(checkRepo(root, { base: 'no-such-ref' }).notes.join('\n'), /not found/)
})

test('build-index sorts versions, picks latest, and keeps generated_at stable', () => {
  const root = fixture({
    'skills/alpha/1.0.0/SKILL.md': skill('alpha', '1.0.0'),
    'skills/alpha/1.10.0/SKILL.md': skill('alpha', '1.10.0'),
    'skills/alpha/1.2.0/SKILL.md': skill('alpha', '1.2.0'),
    'skills/alpha/2.0.0-beta.1/SKILL.md': skill('alpha', '2.0.0-beta.1'),
    'groups/g1.json': JSON.stringify({ slug: 'g1', name: 'Group one', description: 'd', skills: [] }),
  })
  const first = buildIndex(root, null, new Date('2026-01-01T00:00:00Z'))
  assert.equal(first.schema, 1)
  assert.deepEqual(first.skills[0].versions, ['2.0.0-beta.1', '1.10.0', '1.2.0', '1.0.0'])
  assert.equal(first.skills[0].latest, '1.10.0')
  assert.deepEqual(first.groups, [{ slug: 'g1', name: 'Group one', description: 'd', skills: ['alpha'] }])
  const again = buildIndex(root, first, new Date('2026-06-01T00:00:00Z'))
  assert.equal(again.generated_at, '2026-01-01T00:00:00.000Z')
})
