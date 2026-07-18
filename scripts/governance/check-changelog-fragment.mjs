#!/usr/bin/env node
/* global process */
/**
 * Required PR gate: every non-release PR must add at least one CHANGELOG
 * fragment under `changelog.d/` and must not delete an existing one (fragments
 * are removed only at release-cut). Every added fragment must be schema-valid.
 *
 * Unique-per-PR fragment files replace the old shared `## [Unreleased]` region,
 * so parallel PRs no longer conflict. Release PRs are exempt — they run
 * `collect-changelog.mjs`, which consumes the fragments into a version section.
 *
 * CLI/env are unchanged from the previous gate so preflight, the lefthook
 * pre-push hook, and the CI `check` job need no rewiring.
 */

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

import { FRAGMENT_DIR, parseFragment } from "./changelog-fragments.mjs"

const RELEASE_TITLE_RE =
  /^chore\(release\): v[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[1-9][0-9]*)?$/

function usage() {
  process.stderr.write(
    "usage: check-changelog-fragment.mjs --base <ref> --head <ref|WORKTREE> --title <pr-title>\n",
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

function fragmentLines(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".md"))
}

function fragmentsByStatus(base, head, filter) {
  // WORKTREE: compare base against the working tree (uncommitted included).
  // Otherwise: compare the base..head range of the PR.
  const range = head === "WORKTREE" ? [base] : [`${base}...${head}`]
  const tracked = fragmentLines(
    git([
      "diff",
      `--diff-filter=${filter}`,
      "--name-only",
      ...range,
      "--",
      FRAGMENT_DIR,
    ]),
  )

  // `git diff` ignores untracked files, so a brand-new fragment that has not
  // been staged/committed yet is invisible to the range diff. In WORKTREE mode
  // fold in untracked additions so a locally-created fragment counts.
  if (head === "WORKTREE" && filter === "A") {
    const untracked = fragmentLines(
      git(["ls-files", "--others", "--exclude-standard", "--", FRAGMENT_DIR]),
    )
    return [...new Set([...tracked, ...untracked])]
  }

  return tracked
}

function fail(message) {
  process.stderr.write(`CHANGELOG gate failed: ${message}\n`)
  process.exit(1)
}

const { base, head, title } = parseArgs(process.argv.slice(2))

if (RELEASE_TITLE_RE.test(title)) {
  process.stdout.write(
    "Release PR title detected; skipping fragment-add requirement.\n",
  )
  process.exit(0)
}

let added
let deleted
try {
  added = fragmentsByStatus(base, head, "A")
  deleted = fragmentsByStatus(base, head, "D")
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

if (deleted.length > 0) {
  fail(
    [
      "existing changelog fragments were deleted.",
      "Fragments are consumed only at release-cut (chore(release): vX.Y.Z).",
      "",
      "Deleted:",
      ...deleted.map((file) => `  - ${file}`),
    ].join("\n"),
  )
}

if (added.length === 0) {
  fail(
    `no changelog fragment added under ${FRAGMENT_DIR}/. Run: pnpm changelog:add -- --category <Cat> --entry "..."`,
  )
}

// Validate schema of every added fragment (reads the working tree; in CI the
// head SHA is checked out, so this is the fragment as it will land).
for (const file of added) {
  try {
    parseFragment(readFileSync(file, "utf8"), file)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

process.stdout.write(
  `CHANGELOG gate passed: ${added.length} fragment${
    added.length === 1 ? "" : "s"
  } added under ${FRAGMENT_DIR}/.\n`,
)
