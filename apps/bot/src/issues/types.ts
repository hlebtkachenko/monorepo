export type IssueSource =
  | "ci-failure"
  | "security-scan"
  | "customer-request"
  | "agent"
  | "error"
export type Risk = "blocking" | "high" | "medium" | "low"
export type IssueArea =
  | "api"
  | "web"
  | "ci"
  | "observability"
  | "secrets"
  | "infra"
  | "auth"
  | "db"
  | "agents"

/** Normalized event every fan-in source (CI, errors, SNS, security, feedback, agent) produces. */
export interface IssueEvent {
  source: IssueSource
  title: string
  /** Markdown body. MUST be pre-sanitized by the caller (no secrets/PII/raw payloads). */
  body: string
  /** Stable identity dimensions — volatile tokens (timestamps, ids, line:col) must be stripped first. */
  fingerprintParts: string[]
  area?: IssueArea
  risk?: Risk
  /** Linear Type label; defaults to security for security-scan, else fix. */
  type?: "security" | "fix"
  links?: { label: string; url: string }[]
}

export interface IssueResult {
  action: "created" | "commented"
  issueId: string
  identifier: string
  count: number
  url: string
  fingerprint: string
}
