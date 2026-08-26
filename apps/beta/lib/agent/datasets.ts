/**
 * The ingestion surface, declared in one place (spec §3.2: "Endpoints mirror the
 * datasets").
 *
 * WHY THE UNIMPLEMENTED ARMS ARE LISTED. Spec §0.3 forbids placeholders, and
 * this is not one: there is no route, no schema and no dead handler for a
 * dataset marked `implemented: false`. What the entry buys is the same thing
 * `IMPORT_DATASETS` (lib/data/imports.ts) buys the completeness matrix — the
 * office agent asking `GET /api/agent/v1/meta` can tell "beta does not accept
 * this yet" apart from "beta accepted it and dropped it", which is the
 * difference between a deployment fault and a silent data loss.
 *
 * Each entry names the PR that turns it on, so the arm has one obvious home
 * rather than a TODO nobody owns.
 */
export type AgentDataset = {
  /** Path segment under `/api/agent/v1/orgs/{orgSlug}/`. */
  readonly path: string
  readonly implemented: boolean
  /** Where the not-yet-implemented arm lands. */
  readonly note?: string
}

export const AGENT_DATASETS: readonly AgentDataset[] = Object.freeze([
  { path: "publish/statements", implemented: true },
  { path: "publish/trial-balance", implemented: true },
  { path: "publish/payroll", implemented: true },
  { path: "filings", implemented: true },
  { path: "liabilities", implemented: true },
  { path: "assets", implemented: true },
  { path: "client-tasks", implemented: true },
  {
    path: "publish/saldokonto",
    implemented: false,
    note: "PR 27 ships partner + partner_saldo",
  },
  {
    path: "account-balance-map",
    implemented: false,
    note: "PR 26 ships account_balance_map",
  },
])
