/**
 * Shared model for the CHANGELOG.md fragment workflow.
 *
 * Every non-release PR drops one fragment file under `changelog.d/` instead of
 * editing CHANGELOG.md's shared `## [Unreleased]` region. Unique filenames mean
 * parallel PRs never conflict. At release-cut, `collect-changelog.mjs` folds
 * every fragment into a new version section and a machine-readable manifest,
 * then deletes the fragments.
 *
 * This module is pure (no fs, no git) except `loadFragments`, so the rendering
 * and bump logic is unit-testable. Callers that need git (PR backfill) resolve
 * it themselves and pass a `prByFile` map in.
 */

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

export const FRAGMENT_DIR = "changelog.d"
export const NAMES_FILE = "scripts/governance/changelog-names.txt"

/** Keep a Changelog sections, in the fixed order they render. */
export const CATEGORY_ORDER = [
  "Added",
  "Changed",
  "Deprecated",
  "Removed",
  "Fixed",
  "Security",
  "Docs",
  "Dependencies",
]

/** Version-bump levers, weakest → strongest. `pickBump` takes the strongest. */
export const BUMP_ORDER = ["patch", "minor", "major"]

const BOOL_KEYS = new Set(["breaking", "migration"])

/**
 * Parse one fragment (YAML-subset frontmatter + markdown body). Throws with a
 * filename-prefixed message on any schema violation so the gate can surface it.
 *
 * @param {string} text raw file contents
 * @param {string} name display name for error messages (the filename)
 */
export function parseFragment(text, name = "<fragment>") {
  const norm = text.replace(/\r\n/g, "\n")
  const match = norm.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    throw new Error(`${name}: missing frontmatter delimited by --- ... ---`)
  }

  const [, frontmatter, bodyRaw] = match
  const meta = {}

  for (const rawLine of frontmatter.split("\n")) {
    const line = rawLine.trimEnd()
    if (line.trim() === "") continue

    const kv = line.match(/^([a-z_]+):\s*(.*)$/)
    if (!kv) throw new Error(`${name}: unparseable frontmatter line: "${line}"`)

    const key = kv[1]
    let value = kv[2].trim().replace(/^["']|["']$/g, "")

    if (BOOL_KEYS.has(key)) {
      if (value !== "true" && value !== "false") {
        throw new Error(
          `${name}: '${key}' must be true or false, got "${value}"`,
        )
      }
      meta[key] = value === "true"
    } else {
      meta[key] = value
    }
  }

  const category = meta.category
  if (!category) throw new Error(`${name}: 'category' is required`)
  if (!CATEGORY_ORDER.includes(category)) {
    throw new Error(
      `${name}: unknown category "${category}" (expected one of ${CATEGORY_ORDER.join(", ")})`,
    )
  }

  const bump = (meta.bump || "patch").toLowerCase()
  if (!BUMP_ORDER.includes(bump)) {
    throw new Error(`${name}: invalid bump "${bump}" (patch | minor | major)`)
  }

  const body = bodyRaw.trim()
  if (!body) throw new Error(`${name}: empty body`)

  return {
    category,
    bump,
    scope: meta.scope || null,
    breaking: meta.breaking === true,
    migration: meta.migration === true,
    note: meta.note || null,
    body,
    // Single-line form used in the manifest and for stable sorting.
    summary: body.replace(/\s+/g, " ").trim(),
  }
}

/**
 * Read + parse every `*.md` fragment in `dir` (dotfiles like `.gitkeep`
 * excluded). Returns objects carrying their repo-relative `file` path.
 */
export function loadFragments(dir = FRAGMENT_DIR) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        !entry.name.startsWith("."),
    )
    .map((entry) => {
      const file = join(dir, entry.name)
      return { file, ...parseFragment(readFileSync(file, "utf8"), file) }
    })
}

/** Strongest bump across all fragments; `patch` when the list is empty. */
export function pickBump(fragments) {
  let index = 0
  for (const fragment of fragments) {
    index = Math.max(index, BUMP_ORDER.indexOf(fragment.bump))
  }
  return BUMP_ORDER[index]
}

function bulletFor(fragment, pr) {
  const line = fragment.summary
  const hasRef = /\(#\d+\)\s*$/.test(line)
  return pr && !hasRef ? `- ${line} (#${pr})` : `- ${line}`
}

function sortFragments(fragments, prByFile) {
  return [...fragments].sort((a, b) => {
    const pa = prByFile[a.file] ?? Number.MAX_SAFE_INTEGER
    const pb = prByFile[b.file] ?? Number.MAX_SAFE_INTEGER
    if (pa !== pb) return pa - pb
    return a.summary.localeCompare(b.summary)
  })
}

/**
 * Render the version section markdown for a set of fragments. Deterministic:
 * fixed category order, then PR-number ascending, then summary.
 *
 * @param {object[]} fragments
 * @param {object} opts
 * @param {string} opts.heading full `## [...] — date` heading line
 * @param {Record<string, number>} [opts.prByFile] file → PR number
 */
export function renderVersionSection(fragments, { heading, prByFile = {} }) {
  const lines = [heading, ""]

  const breaking = sortFragments(
    fragments.filter((f) => f.breaking),
    prByFile,
  )
  if (breaking.length > 0) {
    lines.push("**Breaking changes:**", "")
    for (const f of breaking) lines.push(bulletFor(f, prByFile[f.file]))
    lines.push("")
  }

  const migrations = sortFragments(
    fragments.filter((f) => f.migration),
    prByFile,
  )
  if (migrations.length > 0) {
    lines.push(
      "**Migration required** (forward-fix only — a squash revert does not undo these):",
      "",
    )
    for (const f of migrations) lines.push(bulletFor(f, prByFile[f.file]))
    lines.push("")
  }

  for (const category of CATEGORY_ORDER) {
    const inCategory = sortFragments(
      fragments.filter((f) => f.category === category),
      prByFile,
    )
    if (inCategory.length === 0) continue

    lines.push(`### ${category}`, "")
    for (const f of inCategory) lines.push(bulletFor(f, prByFile[f.file]))
    lines.push("")
  }

  // Drop the trailing blank so the caller controls spacing.
  while (lines.at(-1) === "") lines.pop()
  return lines.join("\n")
}

/**
 * Machine-readable release manifest — the agent-facing companion to the human
 * CHANGELOG section. Written to `releases/<version>.json` at collect-time so
 * tooling can diff releases without parsing markdown.
 */
export function buildManifest(fragments, { version, date, prByFile = {} }) {
  return {
    version,
    date,
    suggestedBump: pickBump(fragments),
    breaking: fragments.some((f) => f.breaking),
    // Override / context instructions the release agent must honor (no re-ask).
    notes: fragments.filter((f) => f.note).map((f) => f.note),
    changes: sortFragments(fragments, prByFile).map((f) => ({
      category: f.category,
      scope: f.scope,
      bump: f.bump,
      breaking: f.breaking,
      migration: f.migration,
      pr: prByFile[f.file] ?? null,
      summary: f.summary,
    })),
  }
}
