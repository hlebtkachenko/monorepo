#!/usr/bin/env node
/* global fetch, process */

import { appendFileSync, realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const SKIP_CD_MARKER = "<!-- cd:skip -->"

function timestamp(value, label) {
  const parsed = Date.parse(value ?? "")
  if (!Number.isFinite(parsed)) throw new Error(`${label} is not a timestamp`)
  return parsed
}

export function evaluateReleaseDeployGate({
  release,
  releases,
  deploymentsByEnvironment,
  expectedPublishedAt,
}) {
  if (!release || typeof release !== "object") {
    throw new Error("release payload is missing")
  }
  if (release.draft) {
    return { eligible: false, production: false, reason: "release is a draft" }
  }

  const publishedAt = timestamp(release.published_at, "release.published_at")
  const createdAt = timestamp(
    release.created_at ?? release.published_at,
    "release.created_at",
  )
  if (
    expectedPublishedAt &&
    timestamp(expectedPublishedAt, "expected published_at") !== publishedAt
  ) {
    return {
      eligible: false,
      production: false,
      reason: "release publication timestamp changed",
    }
  }

  if ((release.body ?? "").toLowerCase().includes(SKIP_CD_MARKER)) {
    return {
      eligible: false,
      production: false,
      reason: `${SKIP_CD_MARKER} is present`,
    }
  }

  const newer = releases.find(
    (candidate) =>
      candidate.id !== release.id &&
      (candidate.created_at || candidate.published_at) &&
      timestamp(
        candidate.created_at ?? candidate.published_at,
        "candidate.created_at",
      ) > createdAt,
  )
  if (newer) {
    return {
      eligible: false,
      production: false,
      reason: `newer release ${newer.tag_name ?? newer.id} exists`,
    }
  }

  for (const [environment, deployments] of Object.entries(
    deploymentsByEnvironment,
  )) {
    const started = deployments.find(
      (deployment) =>
        deployment.created_at &&
        timestamp(deployment.created_at, "deployment.created_at") >=
          publishedAt,
    )
    if (started) {
      return {
        eligible: false,
        production: false,
        reason: `${environment} deployment ${started.id} already started`,
      }
    }
  }

  return {
    eligible: true,
    production: !release.prerelease,
    reason: release.prerelease
      ? "release candidate is eligible for staging"
      : "stable release is eligible for staging and production",
  }
}

async function githubGet(path, { apiUrl, token }) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "afframe-release-deploy-gate",
      "x-github-api-version": "2022-11-28",
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${path}`)
  }
  return response.json()
}

export function formatDecisionOutputs({ eligible, production }) {
  return [
    `eligible=${eligible === true ? "true" : "false"}`,
    `production=${production === true ? "true" : "false"}`,
    "",
  ].join("\n")
}

function writeDecisionOutputs(decision, outputPath) {
  if (outputPath) appendFileSync(outputPath, formatDecisionOutputs(decision))
}

export async function runReleaseDeployGate(env = process.env) {
  const repository = env.GITHUB_REPOSITORY?.trim()
  const releaseId = env.RELEASE_ID?.trim()
  const expectedPublishedAt = env.RELEASE_PUBLISHED_AT?.trim()
  const token = env.GITHUB_TOKEN?.trim()
  const apiUrl = (env.GITHUB_API_URL ?? "https://api.github.com").replace(
    /\/$/,
    "",
  )
  const environments = (env.DEPLOYMENT_ENVIRONMENTS ?? "staging,production")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  if (!repository?.match(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)) {
    throw new Error("GITHUB_REPOSITORY must be owner/repo")
  }
  if (!releaseId?.match(/^[1-9][0-9]*$/)) {
    throw new Error("RELEASE_ID must be a positive integer")
  }
  if (!expectedPublishedAt) {
    throw new Error("RELEASE_PUBLISHED_AT is required")
  }
  if (!token) throw new Error("GITHUB_TOKEN is required")
  if (environments.length === 0) {
    throw new Error("DEPLOYMENT_ENVIRONMENTS must not be empty")
  }

  const client = { apiUrl, token }
  const release = await githubGet(
    `/repos/${repository}/releases/${releaseId}`,
    client,
  )
  const releases = await githubGet(
    `/repos/${repository}/releases?per_page=100`,
    client,
  )
  const deploymentsByEnvironment = Object.fromEntries(
    await Promise.all(
      environments.map(async (environment) => [
        environment,
        await githubGet(
          `/repos/${repository}/deployments?environment=${encodeURIComponent(environment)}&per_page=100`,
          client,
        ),
      ]),
    ),
  )

  const decision = evaluateReleaseDeployGate({
    release,
    releases,
    deploymentsByEnvironment,
    expectedPublishedAt,
  })
  writeDecisionOutputs(decision, env.GITHUB_OUTPUT)
  process.stdout.write(
    `${decision.eligible ? "Eligible" : "Skipped"}: ${decision.reason}\n`,
  )
  return decision
}

const invokedDirectly =
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  runReleaseDeployGate().catch((error) => {
    process.stderr.write(
      `Release deployment gate failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  })
}
