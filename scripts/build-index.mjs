#!/usr/bin/env node
// Generates index.json from skills/ and groups/. No dependencies.
//
//   node scripts/build-index.mjs            # write index.json
//   node scripts/build-index.mjs --stdout   # print instead of writing
//
// generated_at only moves when the content changes, so rebuilding an
// unchanged repo leaves index.json byte-identical.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareSemver, latestVersion, listGroups, listSkillVersions, parseSkillFile } from './lib.mjs'

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : [])

/** Build the index object (without generated_at) for the repo at `root`. */
export function buildIndexContent(root) {
  const byName = new Map()
  for (const sv of listSkillVersions(root)) {
    if (!existsSync(sv.file)) continue
    const parsed = parseSkillFile(readFileSync(sv.file, 'utf8'))
    if (parsed.error) throw new Error(`${path.relative(root, sv.file)}: ${parsed.error}`)
    if (!byName.has(sv.name)) byName.set(sv.name, new Map())
    byName.get(sv.name).set(sv.version, parsed.data)
  }

  const skills = [...byName.keys()].sort().map((name) => {
    const versions = [...byName.get(name).keys()].sort(compareSemver).reverse()
    const latest = latestVersion(versions)
    const fm = byName.get(name).get(latest)
    return {
      name,
      description: String(fm.description ?? ''),
      tags: asList(fm.tags).map(String),
      groups: asList(fm.groups).map(String),
      versions,
      latest,
    }
  })

  const groups = listGroups(root).map((g) => {
    if (g.error) throw new Error(`${path.relative(root, g.file)}: ${g.error}`)
    // A group lists the skills its file names plus every skill whose
    // latest version declares the group.
    const members = new Set(asList(g.data.skills).map(String))
    for (const s of skills) if (s.groups.includes(g.slug)) members.add(s.name)
    return {
      slug: g.slug,
      name: String(g.data.name ?? g.slug),
      description: String(g.data.description ?? ''),
      skills: [...members].sort(),
    }
  })

  return { schema: 1, skills, groups }
}

/** Full index, reusing `previous.generated_at` when the content is unchanged. */
export function buildIndex(root, previous = null, now = new Date()) {
  const content = buildIndexContent(root)
  let generatedAt = now.toISOString()
  if (previous && previous.generated_at) {
    const { generated_at: _ignored, ...prevContent } = previous
    if (JSON.stringify(prevContent) === JSON.stringify(content)) generatedAt = previous.generated_at
  }
  return { schema: 1, generated_at: generatedAt, skills: content.skills, groups: content.groups }
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const out = path.join(root, 'index.json')
  let previous = null
  if (existsSync(out)) {
    try {
      previous = JSON.parse(readFileSync(out, 'utf8'))
    } catch {
      previous = null
    }
  }
  const json = JSON.stringify(buildIndex(root, previous), null, 2) + '\n'
  if (process.argv.includes('--stdout')) {
    process.stdout.write(json)
  } else {
    writeFileSync(out, json)
    console.log(`wrote ${path.relative(process.cwd(), out) || 'index.json'}`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (e) {
    console.error(`build-index: ${e.message}`)
    process.exit(1)
  }
}
