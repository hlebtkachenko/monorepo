#!/usr/bin/env node
/* global fetch, process */
/* eslint-disable no-control-regex -- Strip ANSI and control bytes from external deployment logs. */

import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"

const BOT_INGEST_URL = "https://bot.afframe.com/ingest"
const MAX_MESSAGE_LENGTH = 3_800

const PHASE_LABELS = {
  guard: "deployment guard",
  "validate-inputs": "input validation",
  "brand-placeholder-guard": "production brand guard",
  "detect-changes": "change detection",
  "deploy-prep": "environment preparation",
  "build-images": "image build and CVE scan",
  deploy: "AWS deployment",
  "restore-paused-state": "failed-deploy cleanup",
  smoke: "post-deploy smoke test and rollback",
}

const PHASE_ORDER = Object.keys(PHASE_LABELS)

function compact(value, limit = 500) {
  const normalized = String(value ?? "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(
      /https?:\/\/[^\s?]+\?\S+/g,
      (url) => `${url.split("?")[0]}?[redacted]`,
    )
    .replace(/(Bearer|token|secret|password)\s*[=:]\s*\S+/gi, "$1=[redacted]")
    .replace(/\/bot[A-Za-z0-9_:-]+\//g, "/bot[redacted]/")
    .replace(/\*{3,}/g, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return normalized.length > limit
    ? `${normalized.slice(0, limit - 1).trimEnd()}…`
    : normalized
}

function headline(message) {
  return compact(String(message ?? "").split("\n", 1)[0], 180)
}

function resultOf(needs, phase) {
  return needs?.[phase]?.result ?? "skipped"
}

export function decideDeploymentNotification({
  environment,
  stack,
  autoReleaseId,
  needs,
}) {
  const automatic = Boolean(autoReleaseId)
  const guardResult = resultOf(needs, "guard")
  const guardGo = needs?.guard?.outputs?.go
  const guardReason = needs?.guard?.outputs?.reason

  if (
    automatic &&
    guardResult === "success" &&
    guardGo !== "true" &&
    guardReason === "release-ineligible"
  ) {
    return { notify: false, outcome: "suppressed", phase: "guard" }
  }

  const failedPhase = PHASE_ORDER.find((phase) =>
    ["failure", "cancelled"].includes(resultOf(needs, phase)),
  )
  if (failedPhase) {
    return { notify: true, outcome: "failure", phase: failedPhase }
  }

  if (guardResult !== "success" || guardGo !== "true") {
    return { notify: true, outcome: "failure", phase: "guard" }
  }
  if (resultOf(needs, "deploy") !== "success") {
    return { notify: true, outcome: "failure", phase: "deploy" }
  }
  if (stack !== "infra-only" && resultOf(needs, "smoke") !== "success") {
    return { notify: true, outcome: "failure", phase: "smoke" }
  }
  if (environment !== "production") {
    return { notify: false, outcome: "success", phase: "smoke" }
  }
  return { notify: true, outcome: "success", phase: "smoke" }
}

export function summarizeReleaseBody(body) {
  const cleaned = String(body ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const bullets = cleaned
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) =>
      line
        .replace(/^[-*]\s+/, "")
        .replace(/\s+by\s+@\S+\s+in\s+https?:\/\/\S+/i, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"),
    )
    .map((line) => compact(line, 220))
    .filter(Boolean)

  if (bullets.length > 0) {
    const suffix = bullets.length > 3 ? `; +${bullets.length - 3} more` : ""
    return compact(`${bullets.slice(0, 3).join("; ")}${suffix}`, 700)
  }

  const prose = cleaned
    .filter(
      (line) =>
        !/^#{1,6}\s/.test(line) && !/^\*\*Full Changelog\*\*/.test(line),
    )
    .join(" ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  return compact(prose || "No release summary was provided.", 700)
}

export function extractErrorSummary(logText) {
  const lines = String(logText ?? "")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\d{4}-\d{2}-\d{2}T[^\s]+\s+/, "")
        .replace(/^.*?##\[error\]/, "Error: ")
        .replace(/^.*?::error(?: [^:]*)?::/i, "Error: "),
    )
    .map((line) => compact(line, 500))
    .filter(Boolean)

  const explicit = lines.filter((line) =>
    /(?:error|failed|failure|timed out|refusing|missing|required)/i.test(line),
  )
  const useful = explicit.filter(
    (line) =>
      !/^process completed with exit code/i.test(line) &&
      !/^error: process completed with exit code/i.test(line),
  )
  return (useful.at(-1) ?? explicit.at(-1) ?? "").replace(/^Error:\s*/i, "")
}

export function formatDeployNotification({
  outcome,
  environment,
  mode,
  target,
  commit,
  stack,
  summary,
  failureReason,
  runUrl,
}) {
  const lines = [
    outcome === "success"
      ? "Production deploy succeeded"
      : `${environment} deploy failed`,
    `Mode: ${mode}`,
    `Target: ${target}`,
    `Commit: ${commit}`,
    `Stack: ${stack}`,
  ]
  if (outcome === "failure") lines.push(`TLDR: ${failureReason}`)
  lines.push(`Changes: ${summary}`, `Run: ${runUrl}`)
  const message = lines.map((line) => compact(line, 1_000)).join("\n")
  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH - 1).trimEnd()}…`
    : message
}

function githubHeaders(token) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "afframe-deploy-notification",
    "x-github-api-version": "2022-11-28",
  }
}

async function githubGet(path, { apiUrl, token }) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: githubHeaders(token),
  })
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${path}`)
  }
  return response.json()
}

async function resolveCommit(reference, client) {
  return githubGet(
    `/repos/${client.repository}/commits/${encodeURIComponent(reference)}`,
    client,
  )
}

async function resolveAutomaticContext(releaseId, client) {
  const release = await githubGet(
    `/repos/${client.repository}/releases/${releaseId}`,
    client,
  )
  const commit = await resolveCommit(release.tag_name, client)
  return {
    target: `release ${release.tag_name}`,
    commit: `${commit.sha.slice(0, 8)} ${headline(commit.commit?.message)}`,
    summary: summarizeReleaseBody(release.body),
  }
}

async function resolveManualContext({ imageTagOverride, githubSha }, client) {
  const overrideSha = /^sha-([0-9a-f]{7,40})$/i.exec(imageTagOverride)?.[1]
  const commit = await resolveCommit(overrideSha ?? githubSha, client)
  const releases = await githubGet(
    `/repos/${client.repository}/releases?per_page=20`,
    client,
  )

  for (const release of releases) {
    if (!release.tag_name || release.draft || !release.published_at) continue
    let compare
    try {
      compare = await githubGet(
        `/repos/${client.repository}/compare/${encodeURIComponent(release.tag_name)}...${commit.sha}`,
        client,
      )
    } catch {
      continue
    }
    if (!["ahead", "identical"].includes(compare.status)) continue

    const count = Number(compare.ahead_by ?? 0)
    const commits = Array.isArray(compare.commits) ? compare.commits : []
    const summaries = commits
      .slice(0, 3)
      .map((item) => headline(item.commit?.message))
      .filter(Boolean)
    const more =
      count > summaries.length ? `; +${count - summaries.length} more` : ""
    const onTop =
      summaries.length > 0 ? ` On top: ${summaries.join("; ")}${more}` : ""
    return {
      target:
        count === 0
          ? `release ${release.tag_name}`
          : `${release.tag_name} + ${count} commit${count === 1 ? "" : "s"}`,
      commit: `${commit.sha.slice(0, 8)} ${headline(commit.commit?.message)}`,
      summary: compact(
        `Base ${release.tag_name}: ${summarizeReleaseBody(release.body)}${onTop}`,
        900,
      ),
    }
  }

  return {
    target: `commit ${commit.sha.slice(0, 8)}`,
    commit: `${commit.sha.slice(0, 8)} ${headline(commit.commit?.message)}`,
    summary:
      headline(commit.commit?.message) || "No commit summary was available.",
  }
}

function phaseMatchesJob(phase, jobName) {
  const normalized = jobName.toLowerCase().replace(/[_\s]+/g, "-")
  return normalized.includes(phase)
}

async function resolveFailureReason(phase, client) {
  const page = await githubGet(
    `/repos/${client.repository}/actions/runs/${client.runId}/jobs?filter=latest&per_page=100`,
    client,
  )
  const failedJobs = (page.jobs ?? []).filter((job) =>
    ["failure", "cancelled"].includes(job.conclusion),
  )
  const job =
    failedJobs.find((candidate) => phaseMatchesJob(phase, candidate.name)) ??
    failedJobs.at(-1)
  const step = job?.steps?.find(
    (candidate) => candidate.conclusion === "failure",
  )
  const phaseText = PHASE_LABELS[phase] ?? phase
  const location = job
    ? `${phaseText}, step “${step?.name ?? job.name}”`
    : phaseText

  if (!job)
    return `The deployment stopped in ${location}. Open the run for details.`

  try {
    const response = await fetch(
      `${client.apiUrl}/repos/${client.repository}/actions/jobs/${job.id}/logs`,
      { headers: githubHeaders(client.token) },
    )
    const excerpt = response.ok
      ? extractErrorSummary(await response.text())
      : ""
    return excerpt
      ? `The deployment stopped in ${location}. ${excerpt}`
      : `The deployment stopped in ${location}. Open the run for the provider error.`
  } catch {
    return `The deployment stopped in ${location}. Open the run for the provider error.`
  }
}

async function sendToTelegram(text, level, secret) {
  const response = await fetch(BOT_INGEST_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text, level, source: "deploy" }),
  })
  if (!response.ok) throw new Error(`bot ingest returned ${response.status}`)
}

export async function runDeployNotification(env = process.env) {
  const repository = env.GITHUB_REPOSITORY?.trim()
  const token = env.GITHUB_TOKEN?.trim()
  const ingestSecret = env.INGEST_SECRET?.trim()
  const environment = env.DEPLOY_ENVIRONMENT?.trim()
  const stack = env.DEPLOY_STACK?.trim() || "all"
  const autoReleaseId = env.AUTO_RELEASE_ID?.trim() || ""
  const needs = JSON.parse(env.DEPLOY_NEEDS_JSON || "{}")

  if (!repository?.match(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)) {
    throw new Error("GITHUB_REPOSITORY must be owner/repo")
  }
  if (!token) throw new Error("GITHUB_TOKEN is required")
  if (!environment?.match(/^(staging|production)$/)) {
    throw new Error("DEPLOY_ENVIRONMENT must be staging or production")
  }

  const decision = decideDeploymentNotification({
    environment,
    stack,
    autoReleaseId,
    needs,
  })
  if (!decision.notify) {
    process.stdout.write(
      `Telegram deploy notification skipped: ${decision.outcome}.\n`,
    )
    return decision
  }
  if (!ingestSecret) {
    process.stderr.write(
      "::warning::INGEST_SECRET unset; Telegram deploy notification skipped.\n",
    )
    return decision
  }

  const client = {
    apiUrl: (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, ""),
    repository,
    runId: env.GITHUB_RUN_ID,
    token,
  }
  const fallback = {
    target: autoReleaseId
      ? `release id ${autoReleaseId}`
      : `commit ${(env.GITHUB_SHA ?? "unknown").slice(0, 8)}`,
    commit: (env.GITHUB_SHA ?? "unknown").slice(0, 8),
    summary:
      "GitHub metadata could not be loaded; open the workflow run for the change list.",
  }
  let context = fallback
  try {
    context = autoReleaseId
      ? await resolveAutomaticContext(autoReleaseId, client)
      : await resolveManualContext(
          {
            githubSha: env.GITHUB_SHA,
            imageTagOverride: env.IMAGE_TAG_OVERRIDE ?? "",
          },
          client,
        )
  } catch (error) {
    process.stderr.write(
      `::warning::Deploy context lookup failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
  }

  let failureReason = ""
  if (decision.outcome === "failure") {
    failureReason = await resolveFailureReason(decision.phase, client)
  }
  const runUrl = `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repository}/actions/runs/${env.GITHUB_RUN_ID}`
  const message = formatDeployNotification({
    ...context,
    environment,
    failureReason,
    mode: autoReleaseId ? "automatic release CD" : "manual workflow dispatch",
    outcome: decision.outcome,
    runUrl,
    stack,
  })
  await sendToTelegram(
    message,
    decision.outcome === "success" ? "success" : "error",
    ingestSecret,
  )
  process.stdout.write(
    `Telegram deploy notification sent: ${decision.outcome}.\n`,
  )
  return decision
}

const invokedDirectly =
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  runDeployNotification().catch((error) => {
    process.stderr.write(
      `::warning::Telegram deploy notification failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
  })
}
