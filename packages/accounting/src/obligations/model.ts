export type ObligationCategory = "VAT" | "PAYROLL"

export type ObligationKind =
  | "VAT_RETURN"
  | "CONTROL_STATEMENT"
  | "EC_SALES_LIST"
  | "SOCIAL_INSURANCE"
  | "HEALTH_INSURANCE"
  | "WITHHOLDING_TAX"

export interface ScheduleCandidate {
  kind: ObligationKind
  category: ObligationCategory
  title: string
  periodLabel: string
  periodStart: string
  periodEnd: string
  dueDate: string
}

export type ApplicabilityDecision =
  | {
      status: "APPLICABLE"
      reason: string
    }
  | {
      status: "CONDITION_NOT_EVALUATED"
      reason: string
    }

export interface Obligation extends ScheduleCandidate {
  applicability: ApplicabilityDecision
}

export type FilingRecord =
  | { status: "NOT_TRACKED" }
  | { status: "FILED"; recordedAt: string }
  | { status: "ACCEPTED"; recordedAt: string }
  | { status: "REJECTED"; recordedAt: string }

export type ObligationPresentationStatus =
  | "Past due date"
  | "Due soon"
  | "Upcoming"
  | "Condition not evaluated"
  | "Needs input"
  | "Filed"

/**
 * Presentation is derived from applicability, due date, and filing evidence.
 * A past due date without a filing record is not proof of non-compliance.
 */
export function deriveObligationPresentationStatus(
  obligation: Obligation,
  today: string,
  filing: FilingRecord = { status: "NOT_TRACKED" },
): ObligationPresentationStatus {
  if (filing.status === "FILED" || filing.status === "ACCEPTED") return "Filed"
  if (filing.status === "REJECTED") return "Needs input"
  if (obligation.applicability.status === "CONDITION_NOT_EVALUATED") {
    return "Condition not evaluated"
  }
  if (obligation.dueDate < today) return "Past due date"

  const dueMs = Date.parse(`${obligation.dueDate}T00:00:00Z`)
  const todayMs = Date.parse(`${today}T00:00:00Z`)
  const diffDays = Math.round((dueMs - todayMs) / (24 * 60 * 60 * 1000))
  return diffDays <= 14 ? "Due soon" : "Upcoming"
}
