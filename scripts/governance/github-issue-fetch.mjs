#!/usr/bin/env node
import { execFileSync } from "node:child_process"

/**
 * Resolve GitHub issues linked to a PR.
 *
 * Priority:
 *   1. GitHub's `closingIssuesReferences` metadata.
 *   2. `#123` or `/issues/123` references in PR title/body/commit messages.
 *
 * Usage: github-issue-fetch.mjs <pull-request-number>
 * Stdout: JSON array of `{ number, title, url, state }`.
 */

const prNumber = Number(process.argv[2])
if (!Number.isInteger(prNumber) || prNumber <= 0) {
  process.stderr.write("usage: github-issue-fetch.mjs <pull-request-number>\n")
  process.exit(2)
}

const repoSlug = resolveRepoSlug()
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
if (!token) {
  process.stdout.write("[]\n")
  process.exit(0)
}

function resolveRepoSlug() {
  const fromEnv = process.env.GITHUB_REPOSITORY?.trim()
  if (fromEnv) return fromEnv

  try {
    const remote = execFileSync(
      "git",
      ["config", "--get", "remote.origin.url"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim()
    const match =
      remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/) ??
      remote.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/)
    if (match?.[1]) return match[1]
  } catch {
    // handled by caller
  }

  process.stderr.write(
    "GITHUB_REPOSITORY is unset and remote.origin.url is not a GitHub repo\n",
  )
  process.exit(2)
}

const [owner, repo] = repoSlug.split("/")
if (!owner || !repo) {
  process.stderr.write(`invalid GITHUB_REPOSITORY: ${repoSlug}\n`)
  process.exit(2)
}

const pr = await graphql(
  `
    query PullRequestIssueLinks(
      $owner: String!
      $repo: String!
      $number: Int!
    ) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          title
          body
          closingIssuesReferences(first: 20) {
            nodes {
              number
              title
              url
              state
            }
          }
          commits(first: 50) {
            nodes {
              commit {
                message
              }
            }
          }
        }
      }
    }
  `,
  { owner, repo, number: prNumber },
)

const pullRequest = pr?.data?.repository?.pullRequest
if (!pullRequest) {
  process.stdout.write("[]\n")
  process.exit(0)
}

const byNumber = new Map()
for (const issue of pullRequest.closingIssuesReferences?.nodes ?? []) {
  if (issue?.number) byNumber.set(issue.number, issue)
}

const textParts = [
  pullRequest.title,
  pullRequest.body,
  ...(pullRequest.commits?.nodes ?? []).map((node) => node?.commit?.message),
]
for (const number of referencedIssueNumbers(textParts.filter(Boolean))) {
  if (byNumber.has(number)) continue
  const issue = await fetchIssue(number)
  if (issue) byNumber.set(issue.number, issue)
}

process.stdout.write(JSON.stringify([...byNumber.values()]) + "\n")

function referencedIssueNumbers(parts) {
  const found = new Set()
  for (const part of parts) {
    for (const match of part.matchAll(/(?:^|[^\w/])#(\d+)\b/g)) {
      found.add(Number(match[1]))
    }
    for (const match of part.matchAll(/\/issues\/(\d+)\b/g)) {
      found.add(Number(match[1]))
    }
  }
  return [...found]
}

async function fetchIssue(number) {
  const res = await github(`/repos/${repoSlug}/issues/${number}`)
  if (!res || res.pull_request) return null
  return {
    number: res.number,
    title: res.title,
    url: res.html_url,
    state: res.state,
  }
}

async function graphql(query, variables) {
  return github("/graphql", {
    method: "POST",
    body: JSON.stringify({ query, variables }),
  })
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
