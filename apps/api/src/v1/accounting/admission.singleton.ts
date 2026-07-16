import {
  type AdmissionController,
  DbAdmissionController,
  InMemoryAdmissionController,
} from "@workspace/db"

// A non-integer / negative override would be nonsensical for a concurrency cap,
// so fall back to the documented default rather than admit an absurd number.
const cap = (raw: string | undefined, dflt: number): number => {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : dflt
}

const caps = {
  global: cap(process.env["ACCOUNTING_ADMISSION_GLOBAL_CAP"], 32),
  perKey: cap(process.env["ACCOUNTING_ADMISSION_PER_ORG_CAP"], 8),
}

/**
 * Process-wide admission controller for the v1 accounting WRITE lane
 * (EPIC-R marshrutizátor, ADR-0028 §Decision.1).
 *
 * Gated on EVERY `runGatedWrite` call (all three write ops). Pre-launch the web
 * review UI never calls the v1 API — it runs Server Actions against the domain
 * directly — so all v1 accounting-write traffic is agent (Brain) traffic; there
 * is no human caller to starve here. Held-write RESOLVE is deliberately NOT
 * admission-gated (a human must always be able to drain the review queue even
 * when the AI lane is capped or killed).
 *
 * The kill-switch (`BRAIN_RUNTIME_ACTIVE`, read by `isBrainRuntimeActive`) fails
 * CLOSED: with it unset / not truthy the lane admits NOTHING (writes get a
 * `RateLimitedError` → 429). Deploys that want the write lane live must set
 * `BRAIN_RUNTIME_ACTIVE=1`. Caps are env-tunable.
 *
 * Cross-instance caps (#472): `ACCOUNTING_ADMISSION_SHARED=1` selects the
 * Postgres-backed {@link DbAdmissionController}, which enforces the caps across
 * every API container (via `brain_admission_slot`). Default (unset / not `1`) is
 * the process-local {@link InMemoryAdmissionController} — zero prod behavior
 * change until Hleb flips the env, so this stays deployable-safe.
 */
export const accountingAdmission: AdmissionController =
  process.env["ACCOUNTING_ADMISSION_SHARED"] === "1"
    ? new DbAdmissionController(caps)
    : new InMemoryAdmissionController(caps)
