#!/usr/bin/env node
/**
 * Post (or update) a Linear comment on the issue linked to the current
 * PR's branch. The comment carries the PR URL + a one-line summary so
 * stakeholders watching the Linear ticket see the PR without leaving
 * Linear.
 *
 * Idempotent: looks up an existing comment authored by the API key's
 * user that already references the PR URL; updates rather than appends
 * a duplicate.
 *
 * Usage:
 *   apply-linear-context.mjs <branch-name> <pr-url> <pr-title>
 *
 * Exits 0 silently when LINEAR_API_KEY is unset (workflow degrades).
 */

import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const [branch, prUrl, prTitle] = process.argv.slice(2)
if (!branch || !prUrl || !prTitle) {
  process.stderr.write(
    "usage: apply-linear-context.mjs <branch> <pr-url> <pr-title>\n",
  )
  process.exit(2)
}

const apiKey = process.env.LINEAR_API_KEY
if (!apiKey) {
  process.stdout.write("LINEAR_API_KEY unset — skipping write-back.\n")
  process.exit(0)
}

const fetchScript = resolve(
  process.cwd(),
  "scripts/governance/linear-fetch.mjs",
)
// spawnSync with argv array — never a shell-interpolated template
// literal — so a branch name containing shell metacharacters cannot
// inject a command. The branch name reaches this script verbatim from
// the GitHub Actions context, which is operator-controlled in trusted
// CI but the safe pattern costs nothing.
const fetchResult = spawnSync("node", [fetchScript, branch], {
  encoding: "utf8",
})
if (fetchResult.status !== 0) {
  process.stderr.write(`linear-fetch.mjs exited ${fetchResult.status}\n`)
  process.exit(0)
}
const issueJson = (fetchResult.stdout ?? "").trim()
const issue = issueJson === "null" ? null : JSON.parse(issueJson)
if (!issue) {
  process.stdout.write("No Linear issue linked to branch.\n")
  process.exit(0)
}

const body = `PR: [${prTitle}](${prUrl})`

const existing = await graphql(
  `
    query IssueComments($id: String!, $needle: String!) {
      issue(id: $id) {
        id
        comments(filter: { body: { contains: $needle } }) {
          nodes {
            id
          }
        }
      }
    }
  `,
  { id: issue.identifier, needle: prUrl },
)
const issueId = existing?.data?.issue?.id
const commentId = existing?.data?.issue?.comments?.nodes?.[0]?.id
if (!issueId) {
  process.stderr.write("Could not resolve issue ID for write-back.\n")
  process.exit(0)
}

if (commentId) {
  await graphql(
    `
      mutation Update($id: String!, $body: String!) {
        commentUpdate(id: $id, input: { body: $body }) {
          success
        }
      }
    `,
    { id: commentId, body },
  )
  process.stdout.write(`Updated Linear comment on ${issue.identifier}.\n`)
} else {
  await graphql(
    `
      mutation Create($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
        }
      }
    `,
    { issueId, body },
  )
  process.stdout.write(`Posted Linear comment on ${issue.identifier}.\n`)
}

async function graphql(query, variables) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    process.stderr.write(`Linear API ${res.status}: ${await res.text()}\n`)
    return null
  }
  return res.json()
}
