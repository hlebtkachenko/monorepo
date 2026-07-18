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
 * Usage:
 *   node scripts/governance/collect-changelog.mjs --version v0.24.0 [--date YYYY-MM-DD]
 *          [--since <tag>] [--keep]
 *   node scripts/governance/collect-changelog.mjs --dry-run [--since <tag>]
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
      "usage: collect-changelog.mjs --version vX.Y.Z [--date YYYY-MM-DD] [--since <tag>] [--keep]",
      "       collect-changelog.mjs --dry-run [--since <tag>]",
      "",
    ].join("\n"),
  )
}

function parseArgs(argv) {
  const parsed = {
    version: "",
    date: "",
    since: "",
    dryRun: false,
    keep: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--") continue
    else if (arg === "--version") parsed.version = argv[++i] ?? ""
    else if (arg === "--date") parsed.date = argv[++i] ?? ""
    else if (arg === "--since") parsed.since = argv[++i] ?? ""
    else if (arg === "--dry-run") parsed.dryRun = true
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
function dependencyFragments(sinceTag) {
  if (!sinceTag) return []
  const log = git([
    "log",
    "--pretty=%s",
    `${sinceTag}..HEAD`,
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
    breaking: false,
    migration: false,
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

  // Insert the new version section right after `## [Unreleased]`, leaving
  // Unreleased empty above it. Reuse the blank line that already precedes the
  // next `## [` section so no double blank is introduced.
  lines.splice(unreleased + 1, 0, "", section)
  return `${lines.join("\n")}${hadTrailingNewline ? "\n" : ""}`
}

function main() {
  const { version, date, since, dryRun, keep } = parseArgs(
    process.argv.slice(2),
  )

  const sinceTag = since || previousTag()
  const fileFragments = loadFragments(FRAGMENT_DIR)
  const prByFile = resolvePrNumbers(fileFragments)
  const fragments = [...fileFragments, ...dependencyFragments(sinceTag)]

  if (fragments.length === 0) {
    process.stdout.write(
      `No changelog fragments in ${FRAGMENT_DIR}/ and no chore(deps) commits since ${sinceTag || "(no tag)"}.\n`,
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
