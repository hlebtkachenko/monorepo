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

/**
 * Existing repo labels only. Type/priority live in GitHub Project fields, so the label
 * is a pure function of the resolved project type: enhancement for feat, bug for anything
 * defect-shaped (fix/security), nothing for chore/refactor/docs/test.
 */
export function labelsFor(e: IssueEvent): string[] {
  const type = projectTypeFor(e)
  if (type === "feat") return ["enhancement"]
  if (type === "fix" || type === "security") return ["bug"]
  return []
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
  const typeOptionId = config.type?.options?.[type]
  if (config.type?.fieldId && typeOptionId) {
    fields.push({ fieldId: config.type.fieldId, optionId: typeOptionId })
  }
  const priorityOptionId = config.priority?.options?.[priority]
  if (config.priority?.fieldId && priorityOptionId) {
    fields.push({
      fieldId: config.priority.fieldId,
      optionId: priorityOptionId,
    })
  }
  return fields
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * Parse + normalize the deploy-time `GITHUB_PROJECT_FIELD_CONFIG` JSON at the system
 * boundary. Each section is kept only when its required fields are present and correctly
 * typed, so a partial/typo'd config degrades to "issue created without those Project
 * fields" instead of throwing a TypeError deep in `projectFieldsFor` — which would escape
 * the emit fail-soft seam and 500 the whole /issue path. Returns undefined only when the
 * env var is unset.
 */
export function parseProjectFieldConfig(
  value?: string,
): ProjectFieldConfig | undefined {
  if (!value) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return undefined
  }
  if (!isRecord(parsed)) return undefined

  const config: ProjectFieldConfig = {}
  const { status, type, priority } = parsed
  if (
    isRecord(status) &&
    typeof status.fieldId === "string" &&
    typeof status.backlogOptionId === "string"
  ) {
    config.status = {
      fieldId: status.fieldId,
      backlogOptionId: status.backlogOptionId,
    }
  }
  if (
    isRecord(type) &&
    typeof type.fieldId === "string" &&
    isRecord(type.options)
  ) {
    config.type = {
      fieldId: type.fieldId,
      options: type.options as Partial<Record<IssueType, string>>,
    }
  }
  if (
    isRecord(priority) &&
    typeof priority.fieldId === "string" &&
    isRecord(priority.options)
  ) {
    config.priority = {
      fieldId: priority.fieldId,
      options: priority.options as Partial<Record<IssuePriority, string>>,
    }
  }
  return config
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
