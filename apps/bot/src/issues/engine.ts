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
    const count = await deps.store.bumpDedup(fp, now)
    await deps.issues.addComment(
      existing.issueId,
      `↩︎ Recurred (occurrence #${count})\n\n${e.body}${renderLinks(e.links)}`,
    )
    return {
      action: "commented",
      issueId: existing.issueId,
      identifier: existing.identifier,
      count,
      url: `https://github.com/${deps.repo}/issues/${existing.issueId}`,
      fingerprint: fp,
    }
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

  await deps.store.createDedup({
    fingerprint: fp,
    issueId: issue.id,
    identifier: issue.identifier,
    count: 1,
    firstSeen: now,
    lastSeen: now,
  })
  return {
    action: "created",
    issueId: issue.id,
    identifier: issue.identifier,
    count: 1,
    url: issue.url,
    fingerprint: fp,
  }
}
