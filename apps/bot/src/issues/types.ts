export type IssueSource =
  "ci-failure" | "security-scan" | "customer-request" | "agent" | "error"
type Risk = "blocking" | "high" | "medium" | "low"
export type IssueType =
  "feat" | "fix" | "refactor" | "chore" | "docs" | "test" | "security"
type IssueArea =
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
  /** GitHub Project Type field; defaults from source when omitted. */
  type?: IssueType
  links?: { label: string; url: string }[]
  /** GitHub Actions run id — when set, the Telegram echo grows an "⟳ Rerun" button. */
  runId?: number
  /** GitHub Actions run html url — when set, the echo grows an "Open run" button. */
  runUrl?: string
}

export interface IssueResult {
  action: "created" | "commented"
  issueId: string
  identifier: string
  count: number
  url: string
  fingerprint: string
}
