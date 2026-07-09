import type { Store } from "../state/store.js"
import type { GitHubIssueClient } from "./github.js"
import type { IssueEvent, IssueResult } from "./types.js"
import { fingerprint } from "./fingerprint.js"
import {
  labelsFor,
  type ProjectFieldConfig,
  projectFieldsFor,
  titlePrefix,
} from "./labels.js"

export interface EngineDeps {
  store: Store
  issues: GitHubIssueClient
  repo: string
  projectId?: string
  projectFieldConfig?: ProjectFieldConfig
  parentIssueNumber?: number
  /** Injected clock for testability. */
  now: () => number
}

function renderLinks(links?: { label: string; url: string }[]): string {
  if (!links || links.length === 0) return ""
  return "\n\n" + links.map((l) => `- [${l.label}](${l.url})`).join("\n")
}

/**
 * A dedup row's `issueId` is a GitHub issue number — a positive integer. Rows from the
 * retired Linear backend carry a Linear UUID instead; those must be treated as absent so
 * the fingerprint gets a fresh GitHub issue rather than a comment POST into a 404 void.
 */
function isGitHubIssueNumber(issueId: string): boolean {
  return /^\d+$/.test(issueId)
}

/**
 * Create a deduped GitHub issue for an event, or comment + bump an existing one.
 * Returns null if issue creation failed, so callers can fall back to a plain ping.
 */
export async function processEvent(
  e: IssueEvent,
  deps: EngineDeps,
): Promise<IssueResult | null> {
  const fp = await fingerprint(e.source, e.fingerprintParts)
  const now = deps.now()

  const existing = await deps.store.getDedup(fp)
  if (existing) {
    // Only comment when the row points at a live GitHub issue. A stale Linear id, or a
    // comment POST that fails (issue deleted / token lost access), drops the row and
    // falls through to create — the incident is never silently swallowed.
    if (isGitHubIssueNumber(existing.issueId)) {
      const commented = await deps.issues.addComment(
        existing.issueId,
        `↩︎ Recurred (occurrence #${existing.count + 1})\n\n${e.body}${renderLinks(
          e.links,
        )}`,
      )
      if (commented) {
        const count = await deps.store.bumpDedup(fp, now)
        return {
          action: "commented",
          issueId: existing.issueId,
          identifier: existing.identifier,
          count,
          url: `https://github.com/${deps.repo}/issues/${existing.issueId}`,
          fingerprint: fp,
        }
      }
    }
    await deps.store.deleteDedup(fp)
  }

  const title = `${titlePrefix(e.source)} ${e.title}`
  const description = `${e.body}${renderLinks(e.links)}\n\n_fingerprint: ${fp}_`
  const issue = await deps.issues.createIssue({
    title,
    body: description,
    labels: labelsFor(e),
    projectId: deps.projectId,
    projectFields: projectFieldsFor(e, deps.projectFieldConfig),
    parentIssueNumber: deps.parentIssueNumber,
  })
  if (!issue) return null

  const issueId = String(issue.number)
  const identifier = `#${issue.number}`
  await deps.store.createDedup({
    fingerprint: fp,
    issueId,
    identifier,
    count: 1,
    firstSeen: now,
    lastSeen: now,
  })
  return {
    action: "created",
    issueId,
    identifier,
    count: 1,
    url: issue.url,
    fingerprint: fp,
  }
}
