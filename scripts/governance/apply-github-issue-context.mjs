#!/usr/bin/env node
/**
 * Post or update a PR backlink comment on GitHub issues linked to the PR.
 * Idempotent: a hidden marker lets the workflow update the same comment on
 * every PR synchronize event.
 *
 * Usage:
 *   apply-github-issue-context.mjs <pr-number> <pr-url> <pr-title>
 */

import {
  fetchLinkedIssues,
  githubClient,
  resolveRepoSlug,
} from "./github-issue-fetch.mjs"

const [prNumber, prUrl, prTitle] = process.argv.slice(2)
if (!prNumber || !prUrl || !prTitle) {
  process.stderr.write(
    "usage: apply-github-issue-context.mjs <pr-number> <pr-url> <pr-title>\n",
  )
  process.exit(2)
}

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
if (!token) {
  process.stdout.write("GITHUB_TOKEN unset — skipping issue write-back.\n")
  process.exit(0)
}

let repoSlug
try {
  repoSlug = resolveRepoSlug()
} catch (err) {
  process.stderr.write(`${err.message}\n`)
  process.exit(2)
}

const github = githubClient(token)
const issues = await fetchLinkedIssues(Number(prNumber), { repoSlug, token })
if (issues.length === 0) {
  process.stdout.write("No GitHub issue linked to PR.\n")
  process.exit(0)
}

for (const issue of issues) {
  const marker = `<!-- afframe-pr-link:${prUrl} -->`
  const body = `${marker}\nPR: [${prTitle}](${prUrl})`
  const comments = await github(
    `/repos/${repoSlug}/issues/${issue.number}/comments?per_page=100`,
  )
  if (!comments) continue

  const existing = comments.find((comment) => comment.body?.includes(marker))
  if (existing) {
    await github(`/repos/${repoSlug}/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    })
    process.stdout.write(`Updated PR backlink on #${issue.number}.\n`)
  } else {
    await github(`/repos/${repoSlug}/issues/${issue.number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    })
    process.stdout.write(`Posted PR backlink on #${issue.number}.\n`)
  }
}
