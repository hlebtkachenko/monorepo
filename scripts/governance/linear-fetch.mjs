#!/usr/bin/env node
/**
 * Resolve a Linear issue from a branch name. Branch convention:
 *
 *   <author>/<aff-NNN>-<slug>     →  Linear issue AFF-NNN
 *   <author>/aff-NNN-<slug>       →  Linear issue AFF-NNN
 *   <author>/<slug>                →  null (no ticket linked)
 *
 * Usage: `linear-fetch.mjs <branch-name>`
 * Stdout: JSON `{ identifier, title, url, status }` or `null`.
 *
 * Reads `LINEAR_API_KEY` from env. Exits 0 with `null` when the key is
 * absent (the workflow degrades to a generic checklist).
 */

const branch = process.argv[2]
if (!branch) {
  process.stderr.write("usage: linear-fetch.mjs <branch-name>\n")
  process.exit(2)
}

const apiKey = process.env.LINEAR_API_KEY
if (!apiKey) {
  process.stdout.write("null\n")
  process.exit(0)
}

const match = branch.match(/aff-(\d+)/i)
if (!match) {
  process.stdout.write("null\n")
  process.exit(0)
}
const identifier = `AFF-${match[1]}`

const query = `
  query Issue($id: String!) {
    issue(id: $id) {
      identifier
      title
      url
      state { name }
    }
  }
`

const res = await fetch("https://api.linear.app/graphql", {
  method: "POST",
  headers: {
    authorization: apiKey,
    "content-type": "application/json",
  },
  body: JSON.stringify({ query, variables: { id: identifier } }),
})

if (!res.ok) {
  process.stderr.write(`Linear API ${res.status}: ${await res.text()}\n`)
  process.stdout.write("null\n")
  process.exit(0)
}

const body = await res.json()
const issue = body?.data?.issue
if (!issue) {
  process.stdout.write("null\n")
  process.exit(0)
}

process.stdout.write(
  JSON.stringify({
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    status: issue.state?.name ?? null,
  }) + "\n",
)
