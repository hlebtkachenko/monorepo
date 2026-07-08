import type { ProjectFieldValue } from "./github.js"
import type { IssueEvent, IssueSource, IssueType } from "./types.js"

type IssuePriority = "urgent" | "high" | "medium" | "low"

export interface ProjectFieldConfig {
  status?: {
    fieldId: string
    backlogOptionId: string
  }
  type?: {
    fieldId: string
    options: Partial<Record<IssueType, string>>
  }
  priority?: {
    fieldId: string
    options: Partial<Record<IssuePriority, string>>
  }
}

/** Existing repo labels only. Type/priority live in GitHub Project fields. */
export function labelsFor(e: IssueEvent): string[] {
  const labels = new Set<string>()
  const type = projectTypeFor(e)
  if (type === "feat") labels.add("enhancement")
  if (e.source === "security-scan") labels.add("bug")
  if (e.source === "error" || e.source === "ci-failure") labels.add("bug")
  if (type === "security" || type === "fix") labels.add("bug")
  return [...labels]
}

export function projectFieldsFor(
  e: IssueEvent,
  config?: ProjectFieldConfig,
): ProjectFieldValue[] {
  if (!config) return []

  const type = projectTypeFor(e)
  const priority =
    e.risk === "blocking"
      ? "urgent"
      : e.risk === "high"
        ? "high"
        : e.risk === "low"
          ? "low"
          : "medium"
  const fields: ProjectFieldValue[] = []
  if (config.status?.fieldId && config.status.backlogOptionId) {
    fields.push({
      fieldId: config.status.fieldId,
      optionId: config.status.backlogOptionId,
    })
  }
  const typeOptionId = config.type?.options[type]
  if (config.type?.fieldId && typeOptionId) {
    fields.push({ fieldId: config.type.fieldId, optionId: typeOptionId })
  }
  const priorityOptionId = config.priority?.options[priority]
  if (config.priority?.fieldId && priorityOptionId) {
    fields.push({
      fieldId: config.priority.fieldId,
      optionId: priorityOptionId,
    })
  }
  return fields
}

export function parseProjectFieldConfig(
  value?: string,
): ProjectFieldConfig | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as ProjectFieldConfig
    if (!parsed || typeof parsed !== "object") return undefined
    return parsed
  } catch {
    return undefined
  }
}

function projectTypeFor(e: IssueEvent): IssueType {
  if (e.type) return e.type
  if (e.source === "security-scan") return "security"
  if (e.source === "customer-request") return "feat"
  if (e.source === "agent") return "chore"
  return "fix"
}

const PREFIX: Record<IssueSource, string> = {
  "ci-failure": "[CI]",
  "security-scan": "[SECURITY]",
  error: "[ALERT]",
  "customer-request": "[FEEDBACK]",
  agent: "[AGENT]",
}

export function titlePrefix(source: IssueSource): string {
  return PREFIX[source]
}
