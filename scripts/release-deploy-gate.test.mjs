import assert from "node:assert/strict"
import { test } from "node:test"

import {
  evaluateReleaseDeployGate,
  formatDecisionOutputs,
  SKIP_CD_MARKER,
} from "./release-deploy-gate.mjs"

const publishedAt = "2026-07-18T10:00:00Z"

function decision(overrides = {}) {
  const release = {
    id: 10,
    tag_name: "v0.10.0",
    body: "Release notes",
    created_at: "2026-07-18T09:45:00Z",
    draft: false,
    prerelease: false,
    published_at: publishedAt,
    ...overrides.release,
  }
  return evaluateReleaseDeployGate({
    release,
    releases: overrides.releases ?? [release],
    deploymentsByEnvironment: overrides.deploymentsByEnvironment ?? {
      staging: [],
      production: [],
    },
    expectedPublishedAt: overrides.expectedPublishedAt ?? publishedAt,
  })
}

test("allows stable release into staging and production", () => {
  assert.deepEqual(decision(), {
    eligible: true,
    production: true,
    reason: "stable release is eligible for staging and production",
  })
})

test("limits release candidates to staging", () => {
  assert.deepEqual(decision({ release: { prerelease: true } }), {
    eligible: true,
    production: false,
    reason: "release candidate is eligible for staging",
  })
})

test("skip marker is case-insensitive", () => {
  const result = decision({
    release: { body: `Operator override\n${SKIP_CD_MARKER.toUpperCase()}` },
  })
  assert.equal(result.eligible, false)
  assert.match(result.reason, /cd:skip/)
})

test("newer draft release supersedes current release", () => {
  const result = decision({
    releases: [
      {
        id: 11,
        tag_name: "v0.10.1",
        created_at: "2026-07-18T10:15:00Z",
        draft: true,
        published_at: "2026-07-18T10:30:00Z",
      },
    ],
  })
  assert.equal(result.eligible, false)
  assert.match(result.reason, /v0\.10\.1/)
})

test("deployment at publication time counts as already started", () => {
  const result = decision({
    deploymentsByEnvironment: {
      staging: [{ id: 42, created_at: publishedAt }],
    },
  })
  assert.equal(result.eligible, false)
  assert.equal(result.reason, "staging deployment 42 already started")
})

test("older deployment does not block release", () => {
  const result = decision({
    deploymentsByEnvironment: {
      staging: [{ id: 41, created_at: "2026-07-18T09:59:59Z" }],
    },
  })
  assert.equal(result.eligible, true)
})

test("publication timestamp mismatch fails closed", () => {
  const result = decision({
    expectedPublishedAt: "2026-07-18T10:00:01Z",
  })
  assert.equal(result.eligible, false)
  assert.match(result.reason, /timestamp changed/)
})

test("workflow outputs contain only normalized booleans", () => {
  assert.equal(
    formatDecisionOutputs({
      eligible: true,
      production: false,
      reason: "untrusted\ncommand=value",
    }),
    "eligible=true\nproduction=false\n",
  )
})
