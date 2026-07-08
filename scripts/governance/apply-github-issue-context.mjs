#!/usr/bin/env node
/**
 * Post or update a PR backlink comment on GitHub issues linked to the PR.
 * Idempotent: a hidden marker lets the workflow update the same comment on
 * every PR synchronize event.
 *
 * Usage:
 *   apply-github-issue-context.mjs <pr-number> <pr-url> <pr-title>
 */

import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const [prNumber, prUrl, prTitle] = process.argv.slice(2)
if (!prNumber || !prUrl || !prTitle) {
  process.stderr.write(
    "usage: apply-github-issue-context.mjs <pr-number> <pr-url> <pr-title>\n",
  )
  process.exit(2)
}

const repo = resolveRepoSlug()
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
if (!token) {
  process.stdout.write("GITHUB_TOKEN unset — skipping issue write-back.\n")
  process.exit(0)
}

const fetchScript = resolve(
  process.cwd(),
  "scripts/governance/github-issue-fetch.mjs",
)
const fetchResult = spawnSync("node", [fetchScript, prNumber], {
  encoding: "utf8",
  env: process.env,
})
if (fetchResult.status !== 0) {
  process.stderr.write(`github-issue-fetch.mjs exited ${fetchResult.status}\n`)
  process.exit(0)
}
const issueJson = (fetchResult.stdout ?? "[]").trim()
const issues = JSON.parse(issueJson)
if (!Array.isArray(issues) || issues.length === 0) {
  process.stdout.write("No GitHub issue linked to PR.\n")
  process.exit(0)
}

for (const issue of issues) {
  const marker = `<!-- afframe-pr-link:${prUrl} -->`
  const body = `${marker}\nPR: [${prTitle}](${prUrl})`
  const comments = await github(
    `/repos/${repo}/issues/${issue.number}/comments?per_page=100`,
  )
  if (!comments) continue

  const existing = comments.find((comment) => comment.body?.includes(marker))
  if (existing) {
    await github(`/repos/${repo}/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    })
    process.stdout.write(`Updated PR backlink on #${issue.number}.\n`)
  } else {
    await github(`/repos/${repo}/issues/${issue.number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    })
    process.stdout.write(`Posted PR backlink on #${issue.number}.\n`)
  }
}

function resolveRepoSlug() {
  const fromEnv = process.env.GITHUB_REPOSITORY?.trim()
  if (fromEnv) return fromEnv

  const result = spawnSync("git", ["config", "--get", "remote.origin.url"], {
    encoding: "utf8",
  })
  const remote = (result.stdout ?? "").trim()
  const match =
    remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/) ??
    remote.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/)
  if (match?.[1]) return match[1]

  process.stderr.write(
    "GITHUB_REPOSITORY is unset and remote.origin.url is not a GitHub repo\n",
  )
  process.exit(2)
}

async function github(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "afframe-governance",
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    process.stderr.write(`GitHub API ${res.status}: ${await res.text()}\n`)
    return null
  }
  return res.status === 204 ? true : res.json()
}
