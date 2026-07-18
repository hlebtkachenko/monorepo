import assert from "node:assert/strict"
import { test } from "node:test"

import {
  decideDeploymentNotification,
  extractErrorSummary,
  formatDeployNotification,
  summarizeReleaseBody,
} from "./deploy-notification.mjs"

function needs(overrides = {}) {
  return {
    guard: { result: "success", outputs: { go: "true", reason: "ready" } },
    "validate-inputs": { result: "success", outputs: {} },
    "brand-placeholder-guard": { result: "success", outputs: {} },
    "detect-changes": { result: "success", outputs: {} },
    "deploy-prep": { result: "success", outputs: {} },
    "build-images": { result: "success", outputs: {} },
    deploy: { result: "success", outputs: { deployed: "true" } },
    "restore-paused-state": { result: "skipped", outputs: {} },
    smoke: { result: "success", outputs: {} },
    ...overrides,
  }
}

test("notifies after a successful production deploy", () => {
  assert.deepEqual(
    decideDeploymentNotification({
      environment: "production",
      stack: "all",
      autoReleaseId: "42",
      needs: needs(),
    }),
    { notify: true, outcome: "success", phase: "smoke" },
  )
})

test("keeps successful staging deploys quiet", () => {
  assert.equal(
    decideDeploymentNotification({
      environment: "staging",
      stack: "all",
      autoReleaseId: "42",
      needs: needs(),
    }).notify,
    false,
  )
})

test("reports the first failed deployment phase", () => {
  assert.deepEqual(
    decideDeploymentNotification({
      environment: "staging",
      stack: "all",
      autoReleaseId: "42",
      needs: needs({
        "build-images": { result: "failure", outputs: {} },
        deploy: { result: "skipped", outputs: {} },
        smoke: { result: "skipped", outputs: {} },
      }),
    }),
    { notify: true, outcome: "failure", phase: "build-images" },
  )
})

test("does not report expected automatic release suppression as failure", () => {
  assert.deepEqual(
    decideDeploymentNotification({
      environment: "production",
      stack: "all",
      autoReleaseId: "42",
      needs: needs({
        guard: {
          result: "success",
          outputs: { go: "false", reason: "release-ineligible" },
        },
        deploy: { result: "skipped", outputs: {} },
        smoke: { result: "skipped", outputs: {} },
      }),
    }),
    { notify: false, outcome: "suppressed", phase: "guard" },
  )
})

test("summarizes generated release notes without hidden markers", () => {
  assert.equal(
    summarizeReleaseBody(`
      <!-- cd:skip -->
      ## What's Changed
      * Add automatic deployment notifications by @hleb in https://github.com/o/r/pull/1
      * Harden release deployment gate
    `),
    "Add automatic deployment notifications; Harden release deployment gate",
  )
})

test("extracts a useful error instead of the generic exit-code line", () => {
  assert.equal(
    extractErrorSummary(`
      2026-07-18T10:00:00Z ::error::ECR scan did not complete for web
      2026-07-18T10:00:01Z ##[error]Process completed with exit code 1.
    `),
    "ECR scan did not complete for web",
  )
})

test("formats release context and failure TLDR in one Telegram message", () => {
  const message = formatDeployNotification({
    outcome: "failure",
    environment: "production",
    mode: "manual workflow dispatch",
    target: "v0.23.8 + 2 commits",
    commit: "abcdef12 fix(api): repair health probe",
    stack: "app-only",
    summary: "Base v0.23.8: accounting fixes. On top: repair health probe",
    failureReason:
      "The deployment stopped in AWS deployment, step “Deploy CDK stacks”.",
    runUrl: "https://github.com/o/r/actions/runs/1",
  })
  assert.match(message, /production deploy failed/)
  assert.match(message, /v0\.23\.8 \+ 2 commits/)
  assert.match(message, /TLDR: The deployment stopped/)
  assert.match(message, /Changes: Base v0\.23\.8/)
})
