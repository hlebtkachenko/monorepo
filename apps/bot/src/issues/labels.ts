import type { IssueEvent, IssueSource } from "./types.js"

// DEV team + DEV — Incidents (rolling) project. Auto-created issues land here.
export const DEFAULT_TEAM_ID = "ad95d719-40bb-43d5-85fd-0c4bba3dcd08"
export const INCIDENTS_PROJECT_ID = "00c12cdd-47e4-4f3f-b42c-a6f9d21a0f47"

// Resolved Linear label ids (stable; ids survive renames, so hardcoding beats a runtime query).
export const LABEL = {
  agentCreated: "280f742d-de07-4d03-99f3-342a38355de9",
  ciFailure: "d1347aa7-7298-4a79-a040-057c115fd78b",
  securityScan: "9ebea71f-76f9-4c59-b72a-268a658dceb5",
  customerRequest: "6ae1e2da-a0b1-47e1-9c80-8a097606c41c",
  typeSecurity: "4e511341-bf3c-42dd-9011-3019642a4da0",
  typeFix: "d91d15ff-d1a1-4454-b906-73dd8a26f3ea",
  risk: {
    blocking: "2deefeeb-32b4-484a-b74c-02f7d17e4c71",
    high: "d6f0f9b3-b2a3-4a42-bf5c-32ff883eb996",
    medium: "1ac83be9-c964-42e4-817e-e519ea2aedc2",
    low: "6def66e9-929c-4c98-9f28-387590f82b4c",
  },
  // NOTE: PUBLIC Linear label ids, not secrets. The api/secrets/auth entries trip
  // gitleaks' generic-api-key keyword heuristic (property name is the trigger), so
  // they carry an inline gitleaks:allow — honest annotation, not a real credential.
  area: {
    api: "12328123-9a4e-47f2-8220-38a685985973", // gitleaks:allow
    web: "4faa18a9-0221-4959-a1f5-eb6b3b6c7be7",
    ci: "f45d069f-f010-4ad3-a697-7aa0af07cd5c",
    observability: "b67b6c89-000a-4a9a-b8fd-51722ca63364",
    secrets: "1119ce12-3f44-4d82-a307-f9a19d95a56b", // gitleaks:allow
    infra: "de0d7dc8-4853-419b-bff1-79eae8fb03f3",
    auth: "bca15af9-90e9-4e7b-bb5c-e1f87b17ca73", // gitleaks:allow
    db: "7d88abf5-1400-4107-ad58-e50fd51a815f",
    agents: "142ed089-a8d0-43f0-82b4-8d21a3259528",
  },
} as const

/** Explicit label set per the DEV-56 source→labels map. Always tags `agent-created`. */
export function labelsFor(e: IssueEvent): string[] {
  const ids: string[] = [LABEL.agentCreated]
  if (e.source === "ci-failure") ids.push(LABEL.ciFailure)
  if (e.source === "security-scan") ids.push(LABEL.securityScan)
  if (e.source === "customer-request") ids.push(LABEL.customerRequest)
  ids.push(
    e.type === "security" || e.source === "security-scan"
      ? LABEL.typeSecurity
      : LABEL.typeFix,
  )
  if (e.risk) ids.push(LABEL.risk[e.risk])
  if (e.area) ids.push(LABEL.area[e.area])
  return [...new Set(ids)]
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
