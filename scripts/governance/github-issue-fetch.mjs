#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Resolve GitHub issues linked to a PR.
 *
 * Priority:
 *   1. GitHub's `closingIssuesReferences` metadata.
 *   2. `#123` or `/issues/123` references in PR title/body/commit messages.
 *
 * Usable two ways:
 *   - CLI: `github-issue-fetch.mjs <pull-request-number>` -> JSON array on stdout.
 *   - Import: `fetchLinkedIssues(prNumber, { repoSlug, token })` (used by
 *     apply-github-issue-context.mjs, which also reuses `githubClient` /
 *     `resolveRepoSlug` from here — one copy of each helper, no subprocess seam).
 */

/** Resolve `owner/repo` from `GITHUB_REPOSITORY` or the git remote. Throws if neither resolves. */
export function resolveRepoSlug() {
  const fromEnv = process.env.GITHUB_REPOSITORY?.trim()
  if (fromEnv) return fromEnv

  let remote = ""
  try {
    remote = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    // fall through to the throw below
  }
  const match =
    remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/) ??
    remote.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/)
  if (match?.[1]) return match[1]

  throw new Error(
    "GITHUB_REPOSITORY is unset and remote.origin.url is not a GitHub repo",
  )
}

/** GitHub REST/GraphQL fetch bound to a token. Returns null on non-OK, `true` on 204. */
export function githubClient(token) {
  return async function github(path, init = {}) {
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
}

/** Resolve `{ number, title, url, state }[]` for the issues a PR links to. */
export async function fetchLinkedIssues(prNumber, { repoSlug, token }) {
  const [owner, repo] = repoSlug.split("/")
  if (!owner || !repo) throw new Error(`invalid repo slug: ${repoSlug}`)
  const github = githubClient(token)

  const pr = await github("/graphql", {
    method: "POST",
    body: JSON.stringify({
      query: `
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
      variables: { owner, repo, number: prNumber },
    }),
  })

  const pullRequest = pr?.data?.repository?.pullRequest
  if (!pullRequest) return []

  const byNumber = new Map()
  for (const issue of pullRequest.closingIssuesReferences?.nodes ?? []) {
    if (issue?.number) byNumber.set(issue.number, issue)
  }

  const textParts = [
    pullRequest.title,
    pullRequest.body,
    ...(pullRequest.commits?.nodes ?? []).map((node) => node?.commit?.message),
  ].filter(Boolean)
  for (const number of referencedIssueNumbers(textParts)) {
    if (byNumber.has(number)) continue
    const res = await github(`/repos/${repoSlug}/issues/${number}`)
    if (res && !res.pull_request) {
      byNumber.set(res.number, {
        number: res.number,
        title: res.title,
        url: res.html_url,
        state: res.state,
      })
    }
  }

  return [...byNumber.values()]
}

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

const invokedDirectly =
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  const prNumber = Number(process.argv[2])
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    process.stderr.write(
      "usage: github-issue-fetch.mjs <pull-request-number>\n",
    )
    process.exit(2)
  }
  let repoSlug
  try {
    repoSlug = resolveRepoSlug()
  } catch (err) {
    process.stderr.write(`${err.message}\n`)
    process.exit(2)
  }
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (!token) {
    process.stdout.write("[]\n")
    process.exit(0)
  }
  const issues = await fetchLinkedIssues(prNumber, { repoSlug, token })
  process.stdout.write(JSON.stringify(issues) + "\n")
}
