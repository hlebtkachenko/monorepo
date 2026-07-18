#!/usr/bin/env node
/* global process */
/**
 * Release-cut collector. Folds every `changelog.d/` fragment plus synthesized
 * Dependabot bumps into a new `## [vX.Y.Z] — DATE` section in CHANGELOG.md,
 * then deletes the consumed fragments (kept on `--dry-run` and `--keep`).
 *
 * `--dry-run` writes nothing and prints the rendered section + the suggested
 * bump — this is the `changelog:preview` "what's shipping" view that the single
 * shared file used to give at a glance.
 *
 * `--through <ref>` cuts a partial release: only fragments whose adding commit
 * is an ancestor of `<ref>` are folded in (and deleted); everything merged
 * after the boundary stays pending for the next cut. Defaults to `HEAD` (the
 * whole folder). This is how you release the first N of several already-merged
 * PRs without moving fragment files by hand.
 *
 * Usage:
 *   node scripts/governance/collect-changelog.mjs --version v0.24.0 [--date YYYY-MM-DD]
 *          [--since <tag>] [--through <ref>] [--keep]
 *   node scripts/governance/collect-changelog.mjs --dry-run [--since <tag>] [--through <ref>]
 */

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"

import {
  FRAGMENT_DIR,
  loadFragments,
  pickBump,
  renderVersionSection,
} from "./changelog-fragments.mjs"
import { synthesizeDependencyBullets } from "./synthesize-dependency-changelog.mjs"

const CHANGELOG_FILE = "CHANGELOG.md"
const VERSION_RE = /^v[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[1-9][0-9]*)?$/

function usage() {
  process.stderr.write(
    [
      "usage: collect-changelog.mjs --version vX.Y.Z [--date YYYY-MM-DD] [--since <tag>] [--through <ref>] [--keep]",
      "       collect-changelog.mjs --dry-run [--since <tag>] [--through <ref>]",
      "",
    ].join("\n"),
  )
}

function parseArgs(argv) {
  const parsed = {
    version: "",
    date: "",
    since: "",
    through: "",
    dryRun: false,
    keep: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--") continue
    else if (arg === "--version") parsed.version = argv[++i] ?? ""
    else if (arg === "--date") parsed.date = argv[++i] ?? ""
    else if (arg === "--since") parsed.since = argv[++i] ?? ""
    else if (arg === "--through") {
      const value = argv[++i]
      // A dropped value must not silently widen the (destructive) cut back to
      // the whole folder — fail loudly instead.
      if (value === undefined || value.startsWith("--")) {
        usage()
        process.stderr.write("--through requires a <ref> value\n")
        process.exit(2)
      }
      parsed.through = value
    } else if (arg === "--dry-run") parsed.dryRun = true
    else if (arg === "--keep") parsed.keep = true
    else {
      usage()
      process.stderr.write(`unknown argument: ${arg}\n`)
      process.exit(2)
    }
  }

  if (!parsed.dryRun) {
    if (!parsed.version) {
      usage()
      process.stderr.write("--version is required unless --dry-run\n")
      process.exit(2)
    }
    if (!VERSION_RE.test(parsed.version)) {
      process.stderr.write(
        `invalid --version "${parsed.version}" (expected vMAJOR.MINOR.PATCH[-rc.N])\n`,
      )
      process.exit(2)
    }
  }

  return parsed
}

function git(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  })
  if (result.status !== 0) return null
  return result.stdout
}

function previousTag() {
  return git(["describe", "--tags", "--abbrev=0"])?.trim() || ""
}

/** True when `ref` resolves to a commit in this repo. */
function refExists(ref) {
  return (
    spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])
      .status === 0
  )
}

/** SHA of the commit that first added `file`, or "" if it isn't committed yet. */
function addingCommit(file) {
  return (
    git(["log", "-1", "--diff-filter=A", "--format=%H", "--", file])?.trim() ||
    ""
  )
}

/** True when `sha` is an ancestor of (or equal to) `ref`. */
function isAncestor(sha, ref) {
  return (
    spawnSync("git", ["merge-base", "--is-ancestor", sha, ref]).status === 0
  )
}

/**
 * Keep only fragments whose adding commit is reachable from the boundary ref.
 * `HEAD` short-circuits to the whole set (and keeps not-yet-committed local
 * fragments, matching the default folder-snapshot behavior). A fragment with no
 * adding commit under a non-HEAD boundary can't be proven in-range, so it is
 * left pending and reported.
 */
function fragmentsThrough(fragments, ref) {
  if (ref === "HEAD") return fragments
  const included = []
  for (const fragment of fragments) {
    const sha = addingCommit(fragment.file)
    if (sha && isAncestor(sha, ref)) included.push(fragment)
    else {
      const why = sha ? `added after ${ref}` : "not committed yet"
      process.stderr.write(
        `Deferring ${fragment.file}: ${why} — stays pending.\n`,
      )
    }
  }
  return included
}

/** Map each fragment file to the PR number of the squash commit that added it. */
function resolvePrNumbers(fragments) {
  const prByFile = {}
  for (const fragment of fragments) {
    const subject = git([
      "log",
      "-1",
      "--diff-filter=A",
      "--format=%s",
      "--",
      fragment.file,
    ])
    const match = subject?.match(/\(#(\d+)\)/)
    if (match) prByFile[fragment.file] = Number(match[1])
  }
  return prByFile
}

/** Dependabot bumps land no fragment; recover them from chore(deps) commits. */
function dependencyFragments(sinceTag, untilRef = "HEAD") {
  if (!sinceTag) return []
  const log = git([
    "log",
    "--pretty=%s",
    `${sinceTag}..${untilRef}`,
    "--grep=^chore(deps",
  ])
  if (!log) return []
  const subjects = log
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  return synthesizeDependencyBullets(subjects).map((bullet, index) => ({
    file: `synthesized:deps:${index}`,
    category: "Dependencies",
    bump: "patch",
    override: false,
    body: bullet,
    summary: bullet.replace(/\s+/g, " ").trim(),
  }))
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function insertSection(markdown, section) {
  const hadTrailingNewline = markdown.endsWith("\n")
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  if (lines.at(-1) === "") lines.pop()

  const unreleased = lines.findIndex(
    (line) => line.trim() === "## [Unreleased]",
  )
  if (unreleased === -1) {
    throw new Error("CHANGELOG.md is missing the ## [Unreleased] section.")
  }

  // Insert the new version section directly above the newest existing version
  // heading (the first `## [` after Unreleased), so the `## [Unreleased]`
  // heading and its explainer paragraph stay intact at the top.
  let insertAt = lines.findIndex(
    (line, index) => index > unreleased && /^## \[/.test(line.trim()),
  )
  if (insertAt === -1) insertAt = lines.length

  lines.splice(insertAt, 0, section, "")
  return `${lines.join("\n")}${hadTrailingNewline ? "\n" : ""}`
}

function main() {
  const { version, date, since, through, dryRun, keep } = parseArgs(
    process.argv.slice(2),
  )

  const untilRef = through || "HEAD"
  if (untilRef !== "HEAD" && !refExists(untilRef)) {
    process.stderr.write(`--through ref "${untilRef}" is not a valid commit.\n`)
    process.exit(2)
  }

  const sinceTag = since || previousTag()
  const fileFragments = fragmentsThrough(loadFragments(FRAGMENT_DIR), untilRef)
  const prByFile = resolvePrNumbers(fileFragments)
  const fragments = [
    ...fileFragments,
    ...dependencyFragments(sinceTag, untilRef),
  ]

  if (fragments.length === 0) {
    const boundary = untilRef === "HEAD" ? "" : ` through ${untilRef}`
    process.stdout.write(
      `No changelog fragments in ${FRAGMENT_DIR}/${boundary} and no chore(deps) commits since ${sinceTag || "(no tag)"}.\n`,
    )
    return
  }

  const resolvedDate = date || today()
  const heading = dryRun
    ? `## [Unreleased] — preview (${resolvedDate})`
    : `## [${version}] — ${resolvedDate}`
  const section = renderVersionSection(fragments, { heading, prByFile })
  const bump = pickBump(fragments)
  const overridden = fragments.some((f) => f.override)
  const bumpLine = `Suggested bump: ${bump.toUpperCase()}${
    overridden
      ? " (override — take as final; do not re-derive against the rule)"
      : ""
  }`

  if (dryRun) {
    process.stdout.write(`${section}\n\n`)
    process.stdout.write(`${bumpLine}\n`)
    process.stdout.write(
      `\n${fragments.length} pending entr${fragments.length === 1 ? "y" : "ies"}. See docs/conventions/RELEASES.md for the bump rules.\n`,
    )
    return
  }

  const current = readFileSync(CHANGELOG_FILE, "utf8")
  writeFileSync(CHANGELOG_FILE, insertSection(current, section))

  if (!keep) {
    for (const fragment of fileFragments) {
      if (existsSync(fragment.file)) rmSync(fragment.file)
    }
  }

  process.stdout.write(
    [
      `Collected ${fragments.length} entr${fragments.length === 1 ? "y" : "ies"} into ${CHANGELOG_FILE} under ## [${version}] (${bumpLine.toLowerCase()}).`,
      keep
        ? `Kept ${fileFragments.length} fragment${fileFragments.length === 1 ? "" : "s"} (--keep; delete them at the final release).`
        : `Removed ${fileFragments.length} consumed fragment${fileFragments.length === 1 ? "" : "s"} — stage the deletions.`,
    ]
      .filter(Boolean)
      .join("\n") + "\n",
  )
}

try {
  main()
} catch (error) {
  process.stderr.write(
    `Failed to collect changelog: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exit(1)
}
