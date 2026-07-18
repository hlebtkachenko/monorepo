import assert from "node:assert/strict"
import { test } from "node:test"

import { synthesizeDependencyBullets } from "./synthesize-dependency-changelog.mjs"

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
