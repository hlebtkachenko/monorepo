#!/usr/bin/env node
/* global process */
/**
 * Required PR gate: every non-release PR must add a bullet under
 * CHANGELOG.md's ## [Unreleased] section without removing existing bullets.
 *
 * Release PRs are exempt because they intentionally move Unreleased entries
 * into a versioned section.
 */

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

const RELEASE_TITLE_RE =
  /^chore\(release\): v[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[1-9][0-9]*)?$/

function usage() {
  process.stderr.write(
    "usage: check-changelog-unreleased.mjs --base <ref> --head <ref|WORKTREE> --title <pr-title>\n",
  )
}

function parseArgs(argv) {
  const parsed = {
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    base: process.env.BASE_REF || "origin/main",
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    head: process.env.HEAD_REF || "WORKTREE",
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    title: process.env.PR_TITLE || "",
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--") continue
    if (arg === "--base") parsed.base = argv[++i] ?? ""
    else if (arg === "--head") parsed.head = argv[++i] ?? ""
    else if (arg === "--title") parsed.title = argv[++i] ?? ""
    else {
      usage()
      process.stderr.write(`unknown argument: ${arg}\n`)
      process.exit(2)
    }
  }

  if (!parsed.base || !parsed.head) {
    usage()
    process.exit(2)
  }

  return parsed
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  })

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} exited ${result.status}: ${result.stderr}`,
    )
  }

  return result.stdout
}

function gitShow(ref, path) {
  if (ref === "WORKTREE") {
    return readFileSync(path, "utf8")
  }

  return git(["show", `${ref}:${path}`])
}

function changedFiles(base, head) {
  if (head === "WORKTREE") {
    return git(["diff", "--name-only", base, "--"]).split("\n").filter(Boolean)
  }

  return git(["diff", "--name-only", `${base}...${head}`])
    .split("\n")
    .filter(Boolean)
}

function unreleasedBody(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const start = lines.findIndex((line) => line.trim() === "## [Unreleased]")

  if (start === -1) {
    throw new Error(
      "CHANGELOG.md is missing the required ## [Unreleased] section.",
    )
  }

  const end = lines.findIndex(
    (line, index) => index > start && /^## \[[^\]]+\]/.test(line.trim()),
  )

  return lines.slice(start + 1, end === -1 ? lines.length : end)
}

function bulletBlocks(sectionLines) {
  const blocks = []
  let current = null

  for (const line of sectionLines) {
    if (/^###\s+/.test(line.trim())) {
      continue
    }

    if (/^\s*-\s+\S/.test(line)) {
      if (current) blocks.push(current)
      current = [line]
      continue
    }

    if (current && line.trim() !== "") {
      current.push(line)
    }
  }

  if (current) blocks.push(current)

  return blocks.map((block) => block.join(" ").replace(/\s+/g, " ").trim())
}

function fail(message) {
  process.stderr.write(`CHANGELOG gate failed: ${message}\n`)
  process.exit(1)
}

const { base, head, title } = parseArgs(process.argv.slice(2))

if (RELEASE_TITLE_RE.test(title)) {
  process.stdout.write(
    "Release PR title detected; skipping Unreleased-add requirement.\n",
  )
  process.exit(0)
}

const files = changedFiles(base, head)
if (!files.includes("CHANGELOG.md")) {
  fail(
    "CHANGELOG.md was not changed. Add a bullet under ## [Unreleased], or use a chore(release): vX.Y.Z PR title for release cuts.",
  )
}

let baseBlocks
let headBlocks
try {
  baseBlocks = bulletBlocks(unreleasedBody(gitShow(base, "CHANGELOG.md")))
  headBlocks = bulletBlocks(unreleasedBody(gitShow(head, "CHANGELOG.md")))
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

const missing = baseBlocks.filter((block) => !headBlocks.includes(block))
if (missing.length > 0) {
  fail(
    [
      "existing Unreleased entries were removed or edited.",
      "Normal PRs must only add to Unreleased; release PRs move entries into a version section.",
      "",
      "Missing from head:",
      ...missing.map((block) => `  - ${block}`),
    ].join("\n"),
  )
}

const added = headBlocks.filter((block) => !baseBlocks.includes(block))
if (added.length === 0) {
  fail(
    "CHANGELOG.md changed, but no new bullet was added under ## [Unreleased].",
  )
}

process.stdout.write(
  `CHANGELOG gate passed: ${added.length} new Unreleased entr${
    added.length === 1 ? "y" : "ies"
  } added; ${baseBlocks.length} existing entr${
    baseBlocks.length === 1 ? "y" : "ies"
  } preserved.\n`,
)
