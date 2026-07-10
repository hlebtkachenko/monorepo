import assert from "node:assert/strict"
import { test } from "node:test"

import {
  mergeIntoChangelog,
  synthesizeDependencyBullets,
} from "./synthesize-dependency-changelog.mjs"

test("strips the chore(deps) / chore(deps-dev) prefix and keeps the PR number", () => {
  const subjects = [
    "chore(deps): bump postgres from `4aabea7` to `22c89fe` in /infra/compose/pgtap in the infra-compose-pgtap-docker group (#659)",
    "chore(deps-dev): bump the dev-dependencies group with 7 updates (#663)",
    "chore(deps): bump the production-dependencies group across 1 directory with 25 updates (#665)",
  ]

  assert.deepEqual(synthesizeDependencyBullets(subjects), [
    "bump postgres from `4aabea7` to `22c89fe` in /infra/compose/pgtap in the infra-compose-pgtap-docker group (#659)",
    "bump the dev-dependencies group with 7 updates (#663)",
    "bump the production-dependencies group across 1 directory with 25 updates (#665)",
  ])
})

test("dedups identical subjects", () => {
  const subjects = [
    "chore(deps): bump postgres (#410)",
    "chore(deps): bump postgres (#410)",
  ]

  assert.deepEqual(synthesizeDependencyBullets(subjects), [
    "bump postgres (#410)",
  ])
})

test("skips blank lines and preserves input order", () => {
  const subjects = [
    "",
    "  ",
    "chore(deps-dev): bump @playwright/test from 1.60.0 to 1.61.1 in the dev-dependencies group (#668)",
    "chore(deps): bump the github-actions group with 5 updates (#662)",
  ]

  assert.deepEqual(synthesizeDependencyBullets(subjects), [
    "bump @playwright/test from 1.60.0 to 1.61.1 in the dev-dependencies group (#668)",
    "bump the github-actions group with 5 updates (#662)",
  ])
})

test("mergeIntoChangelog: fresh insert when no ### Dependencies section exists — lands before the next ## [vX] heading", () => {
  const markdown = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "### Added",
    "",
    "- Something added",
    "",
    "## [v0.1.0] - 2026-01-01",
    "",
    "### Added",
    "",
    "- initial",
    "",
  ].join("\n")

  const { markdown: result, addedCount } = mergeIntoChangelog(markdown, [
    "bump a (#1)",
    "bump b (#2)",
  ])

  assert.equal(addedCount, 2)
  assert.equal(
    result,
    [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "### Added",
      "",
      "- Something added",
      "",
      "### Dependencies",
      "",
      "- bump a (#1)",
      "- bump b (#2)",
      "",
      "## [v0.1.0] - 2026-01-01",
      "",
      "### Added",
      "",
      "- initial",
      "",
    ].join("\n"),
  )
})

test("mergeIntoChangelog: merges into an existing ### Dependencies section, adding only new bullets", () => {
  const markdown = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "### Dependencies",
    "",
    "- bump x (#1)",
    "",
    "## [v0.1.0] - 2026-01-01",
    "",
    "- old",
    "",
  ].join("\n")

  const { markdown: result, addedCount } = mergeIntoChangelog(markdown, [
    "bump x (#1)",
    "bump y (#2)",
  ])

  assert.equal(addedCount, 1)
  assert.match(result, /- bump x \(#1\)/)
  assert.match(result, /- bump y \(#2\)/)
  assert.equal(
    result,
    [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "### Dependencies",
      "",
      "- bump y (#2)",
      "- bump x (#1)",
      "",
      "## [v0.1.0] - 2026-01-01",
      "",
      "- old",
      "",
    ].join("\n"),
  )
})

test("mergeIntoChangelog: dedup / idempotency — running twice with the same bullets adds nothing the second time", () => {
  const markdown = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "### Added",
    "",
    "- Something added",
    "",
    "## [v0.1.0] - 2026-01-01",
    "",
    "### Added",
    "",
    "- initial",
    "",
  ].join("\n")

  const bullets = ["bump a (#1)", "bump b (#2)"]

  const first = mergeIntoChangelog(markdown, bullets)
  assert.equal(first.addedCount, 2)

  const second = mergeIntoChangelog(first.markdown, bullets)
  assert.equal(second.addedCount, 0)
  assert.equal(second.markdown, first.markdown)
})

test("mergeIntoChangelog: preserves a trailing newline when present", () => {
  const markdown = "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- x\n"

  const { markdown: result } = mergeIntoChangelog(markdown, ["new bump (#9)"])

  assert.equal(
    result,
    "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- x\n\n### Dependencies\n\n- new bump (#9)\n\n",
  )
  assert.ok(result.endsWith("\n"))
})

test("mergeIntoChangelog: preserves the absence of a trailing newline", () => {
  const markdown = "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- x"

  const { markdown: result } = mergeIntoChangelog(markdown, ["new bump (#9)"])

  assert.equal(
    result,
    "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- x\n\n### Dependencies\n\n- new bump (#9)\n",
  )
  assert.ok(!result.endsWith("\n\n"))
})
