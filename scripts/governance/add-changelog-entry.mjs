#!/usr/bin/env node
/* global process */
/**
 * Insert one CHANGELOG.md bullet under ## [Unreleased].
 *
 * This helper always preserves existing entries and inserts the new bullet at
 * the top of the requested category so parallel agents do not overwrite each
 * other's release notes.
 */

import { readFileSync, writeFileSync } from "node:fs"

const DEFAULT_CATEGORY_ORDER = [
  "Added",
  "Changed",
  "Deprecated",
  "Removed",
  "Fixed",
  "Security",
  "Docs",
  "Dependencies",
]

function usage() {
  process.stderr.write(
    "usage: add-changelog-entry.mjs --category <name> --entry <text> [--file CHANGELOG.md]\n",
  )
}

function parseArgs(argv) {
  const parsed = { file: "CHANGELOG.md", category: "", entry: "" }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--") continue
    if (arg === "--file") parsed.file = argv[++i] ?? ""
    else if (arg === "--category") parsed.category = argv[++i] ?? ""
    else if (arg === "--entry") parsed.entry = argv[++i] ?? ""
    else {
      usage()
      process.stderr.write(`unknown argument: ${arg}\n`)
      process.exit(2)
    }
  }

  if (!parsed.file || !parsed.category || !parsed.entry) {
    usage()
    process.exit(2)
  }

  return parsed
}

function findUnreleasedRange(lines) {
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

function findCategoryRange(lines, start, end, category) {
  const heading = `### ${category}`
  const categoryStart = lines.findIndex(
    (line, index) =>
      index > start &&
      index < end &&
      line.trim().toLowerCase() === heading.toLowerCase(),
  )

  if (categoryStart === -1) return null

  const nextCategory = lines.findIndex(
    (line, index) =>
      index > categoryStart && index < end && /^###\s+/.test(line.trim()),
  )

  return {
    start: categoryStart,
    end: nextCategory === -1 ? end : nextCategory,
  }
}

function categoryInsertIndex(lines, start, end, category) {
  const targetOrder = DEFAULT_CATEGORY_ORDER.indexOf(category)

  if (targetOrder === -1) {
    return start + 1
  }

  for (let i = start + 1; i < end; i += 1) {
    const match = lines[i].trim().match(/^###\s+(.+)$/)
    if (!match) continue

    const existingOrder = DEFAULT_CATEGORY_ORDER.indexOf(match[1])
    if (existingOrder !== -1 && existingOrder > targetOrder) {
      return i
    }
  }

  return end
}

function insertEntry(markdown, category, entry) {
  const hadTrailingNewline = markdown.endsWith("\n")
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  if (lines.at(-1) === "") lines.pop()

  const { start, end } = findUnreleasedRange(lines)
  const bullet = `- ${entry.trim()}`
  const categoryRange = findCategoryRange(lines, start, end, category)

  if (categoryRange) {
    let insertAt = categoryRange.start + 1
    while (insertAt < categoryRange.end && lines[insertAt].trim() === "") {
      insertAt += 1
    }
    lines.splice(insertAt, 0, bullet)
  } else {
    const insertAt = categoryInsertIndex(lines, start, end, category)
    const block = [`### ${category}`, "", bullet, ""]
    const needsLeadingBlank =
      insertAt > 0 && lines[insertAt - 1] && lines[insertAt - 1].trim() !== ""
    lines.splice(insertAt, 0, ...(needsLeadingBlank ? ["", ...block] : block))
  }

  return `${lines.join("\n")}${hadTrailingNewline ? "\n" : ""}`
}

try {
  const { file, category, entry } = parseArgs(process.argv.slice(2))
  const current = readFileSync(file, "utf8")
  const next = insertEntry(current, category, entry)
  writeFileSync(file, next)
  process.stdout.write(
    `Added CHANGELOG.md Unreleased entry under ${category}.\n`,
  )
} catch (error) {
  process.stderr.write(
    `Failed to add changelog entry: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  )
  process.exit(1)
}
