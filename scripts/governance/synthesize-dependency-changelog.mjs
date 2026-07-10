#!/usr/bin/env node
/* global process */
/**
 * Release-cut helper: synthesizes the "### Dependencies" CHANGELOG.md
 * section from chore(deps) commits merged since the last tag.
 *
 * Dependabot PRs are exempt from the per-PR changelog gate
 * (check-changelog-unreleased.mjs), so their bumps never land an Unreleased
 * bullet on their own PR. This script recovers that record at release-cut
 * time by scanning commit subjects instead.
 *
 * Usage:
 *   node scripts/governance/synthesize-dependency-changelog.mjs [--since <tag>] [--write] [--file CHANGELOG.md]
 *
 * Without --write, prints the "### Dependencies" block to stdout. With
 * --write, merges it into CHANGELOG.md under ## [Unreleased] (creating the
 * subsection if missing, deduping against existing bullets, never removing
 * existing entries).
 */

import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

const DEPS_PREFIX_RE = /^chore\(deps[^)]*\):\s*/i

/**
 * Pure: maps chore(deps...) commit subjects into deduped, concise
 * "### Dependencies" bullets by stripping the chore(deps) / chore(deps-dev)
 * prefix. The rest of the Dependabot-authored subject (package name(s), old
 * -> new version or digest, PR number) is kept as-is.
 *
 * @param {string[]} commitSubjects
 * @returns {string[]}
 */
export function synthesizeDependencyBullets(commitSubjects) {
  const seen = new Set()
  const bullets = []

  for (const subject of commitSubjects) {
    const stripped = subject.trim().replace(DEPS_PREFIX_RE, "").trim()
    if (!stripped || seen.has(stripped)) continue

    seen.add(stripped)
    bullets.push(stripped)
  }

  return bullets
}

function usage() {
  process.stderr.write(
    "usage: synthesize-dependency-changelog.mjs [--since <tag>] [--write] [--file CHANGELOG.md]\n",
  )
}

function parseArgs(argv) {
  const parsed = { since: "", write: false, file: "CHANGELOG.md" }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--") continue
    else if (arg === "--since") parsed.since = argv[++i] ?? ""
    else if (arg === "--write") parsed.write = true
    else if (arg === "--file") parsed.file = argv[++i] ?? ""
    else {
      usage()
      process.stderr.write(`unknown argument: ${arg}\n`)
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

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} exited ${result.status}: ${result.stderr}`,
    )
  }

  return result.stdout
}

function resolvePreviousTag() {
  return git(["describe", "--tags", "--abbrev=0"]).trim()
}

function dependencyCommitSubjects(sinceTag) {
  // git log --grep uses POSIX basic regex by default, where "(" is already
  // literal (no backslash needed) — a backslash here would start an
  // unterminated BRE group and error with "parentheses not balanced".
  return git(["log", "--pretty=%s", `${sinceTag}..HEAD`, "--grep=^chore(deps"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function renderBlock(bullets) {
  return [
    "### Dependencies",
    "",
    ...bullets.map((bullet) => `- ${bullet}`),
  ].join("\n")
}

export function findUnreleasedRange(lines) {
  const start = lines.findIndex((line) => line.trim() === "## [Unreleased]")
  if (start === -1) {
    throw new Error(
      "CHANGELOG.md is missing the required ## [Unreleased] section.",
    )
  }

  const end = lines.findIndex(
    (line, index) => index > start && /^## \[[^\]]+\]/.test(line.trim()),
  )

  return { start, end: end === -1 ? lines.length : end }
}

function findDependenciesRange(lines, start, end) {
  const headingIndex = lines.findIndex(
    (line, index) =>
      index > start && index < end && line.trim() === "### Dependencies",
  )

  if (headingIndex === -1) return null

  const nextHeading = lines.findIndex(
    (line, index) =>
      index > headingIndex && index < end && /^###\s+/.test(line.trim()),
  )

  return { start: headingIndex, end: nextHeading === -1 ? end : nextHeading }
}

export function mergeIntoChangelog(markdown, bullets) {
  const hadTrailingNewline = markdown.endsWith("\n")
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  if (lines.at(-1) === "") lines.pop()

  const { start, end } = findUnreleasedRange(lines)
  const depsRange = findDependenciesRange(lines, start, end)

  let additions
  if (depsRange) {
    const existing = new Set(
      lines
        .slice(depsRange.start + 1, depsRange.end)
        .filter((line) => /^\s*-\s+\S/.test(line))
        .map((line) => line.replace(/^\s*-\s+/, "").trim()),
    )

    additions = bullets.filter((bullet) => !existing.has(bullet))
    if (additions.length > 0) {
      let insertAt = depsRange.start + 1
      while (insertAt < depsRange.end && lines[insertAt].trim() === "") {
        insertAt += 1
      }
      lines.splice(insertAt, 0, ...additions.map((bullet) => `- ${bullet}`))
    }
  } else {
    additions = bullets
    const block = [
      "### Dependencies",
      "",
      ...bullets.map((bullet) => `- ${bullet}`),
      "",
    ]
    const needsLeadingBlank =
      end > 0 && lines[end - 1] && lines[end - 1].trim() !== ""
    lines.splice(end, 0, ...(needsLeadingBlank ? ["", ...block] : block))
  }

  return {
    markdown: `${lines.join("\n")}${hadTrailingNewline ? "\n" : ""}`,
    addedCount: additions.length,
  }
}

function main() {
  const { since, write, file } = parseArgs(process.argv.slice(2))

  const sinceTag = since || resolvePreviousTag()
  const subjects = dependencyCommitSubjects(sinceTag)
  const bullets = synthesizeDependencyBullets(subjects)

  if (bullets.length === 0) {
    process.stdout.write(`No chore(deps) commits found since ${sinceTag}.\n`)
    return
  }

  if (!write) {
    process.stdout.write(`${renderBlock(bullets)}\n`)
    return
  }

  const current = readFileSync(file, "utf8")
  const { markdown, addedCount } = mergeIntoChangelog(current, bullets)
  writeFileSync(file, markdown)

  if (addedCount === 0) {
    process.stdout.write(
      `No new Dependencies entries to merge into ${file} (all ${bullets.length} already present).\n`,
    )
    return
  }

  process.stdout.write(
    `Merged ${addedCount} new Dependencies entr${
      addedCount === 1 ? "y" : "ies"
    } into ${file} under ## [Unreleased] (source: ${sinceTag}..HEAD; ${
      bullets.length - addedCount
    } already present).\n`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (error) {
    process.stderr.write(
      `Failed to synthesize dependency changelog: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    )
    process.exit(1)
  }
}
