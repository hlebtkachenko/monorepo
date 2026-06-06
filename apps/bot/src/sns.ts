import type { IssueEvent } from "./issues/types.js"

// AWS SNS HTTPS delivery envelope (subset). SNS cannot send a custom auth header, so the
// /sns route is gated by a `?token=` query param (preserved by SNS on every POST) — full
// SNS signature verification is a follow-up hardening.
export interface SnsEnvelope {
  Type: string // "SubscriptionConfirmation" | "Notification" | "UnsubscribeConfirmation"
  SubscribeURL?: string
  Message?: string
  Subject?: string
  TopicArn?: string
}

// CloudWatch alarm message shape (subset of the JSON in SNS `Message`).
interface CwAlarm {
  AlarmName?: string
  NewStateValue?: string // ALARM | OK | INSUFFICIENT_DATA
  NewStateReason?: string
}

/** Confirm an SNS HTTPS subscription by GETting its SubscribeURL. Returns true on 2xx. */
export async function confirmSubscription(
  envelope: SnsEnvelope,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (envelope.Type !== "SubscriptionConfirmation" || !envelope.SubscribeURL)
    return false
  try {
    const res = await fetchImpl(envelope.SubscribeURL)
    return res.ok
  } catch {
    return false
  }
}

/**
 * Map an SNS Notification to a normalized IssueEvent. CloudWatch alarms only open an issue
 * on ALARM (OK/INSUFFICIENT_DATA return null). Non-alarm notifications (budgets, custom) map
 * to a generic infra event. Fingerprint is stable per alarm/subject so flaps dedup.
 */
export function snsToEvent(envelope: SnsEnvelope): IssueEvent | null {
  if (envelope.Type !== "Notification") return null
  const raw = envelope.Message ?? ""

  let alarm: CwAlarm | null = null
  try {
    alarm = JSON.parse(raw) as CwAlarm
  } catch {
    alarm = null
  }

  if (alarm?.AlarmName) {
    const state = alarm.NewStateValue ?? "ALARM"
    if (state !== "ALARM") return null
    return {
      source: "error",
      title: `AWS: ${alarm.AlarmName}`,
      body: `**${alarm.AlarmName}** → ${state}\n\n${(alarm.NewStateReason ?? "").slice(0, 800)}`,
      fingerprintParts: ["aws-alarm", alarm.AlarmName],
      area: "infra",
      risk: "high",
    }
  }

  const subject = envelope.Subject ?? "AWS notification"
  return {
    source: "error",
    title: `AWS: ${subject}`,
    body: raw.slice(0, 800),
    fingerprintParts: ["aws-notification", subject],
    area: "infra",
    risk: "medium",
  }
}
