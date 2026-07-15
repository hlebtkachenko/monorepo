// Tier-1.5 — ARES register cross-check for `brain event`.
//
// The Brain extracts a counterparty identity (name / IČO / DIČ) from an invoice and emits it VERBATIM
// (Tier 1). A mis-OCR'd-but-VALID IČO binds a wrong-but-real partner undetectably — the only guard today is
// a human eyeballing the extracted fields. This module CROSS-CHECKS the extracted IČO against the ARES public
// register (obchodní jméno + zápis v rejstříku) BEFORE the event is POSTed, so a mismatch is caught by the
// system, not left to the reviewer's eye.
//
// It mirrors `prefillFromRegistries` (@workspace/org-provisioning): the lookup runs strictly BEFORE the write,
// NEVER inside a transaction, and is FAIL-OPEN — ARES down / rate-limited / unknown IČO is a non-event that
// degrades to "unavailable" (a warning, never a block), because the write HOLDS on the cold-start floor
// anyway. On a real name mismatch the CLI refuses `--execute` unless the operator overrides, AND asserts the
// `counterparty_register_mismatch` cap so the server holds it sub-green and the held-event review surfaces the
// reason. The comparison logic is PURE + unit-tested; only `crossCheckCounterparty` performs I/O.

import { lookupAres, RegistryLookupError } from "@workspace/registries"
import type { CreateAccountingEventRequest } from "@workspace/shared/api"

/** The cap kind asserted on a register mismatch — must match `TIER2_CAP_VALUES` (packages/brain confidence). */
export const REGISTER_MISMATCH_CAP = "counterparty_register_mismatch"

/** The extracted counterparty identity carried on the event request (`request.counterparty`). */
export type EventCounterparty = NonNullable<
  CreateAccountingEventRequest["counterparty"]
>

/**
 * The cross-check outcome:
 *  - `match`          — the IČO is in ARES and the official obchodní jméno matches the extracted name.
 *  - `mismatch`       — the IČO resolves to a DIFFERENT name → likely a wrong/mis-OCR'd IČO (holds, refuses execute).
 *  - `not_in_register`— ARES knows the IČO but the subject is not in a public register (unusual for a company).
 *  - `no_ico`         — no IČO to check against (foreign / individual / name-only) → nothing to verify.
 *  - `unavailable`    — ARES could not be reached / returned nothing (fail-open: warn, never block).
 */
type RegisterVerdictStatus =
  "match" | "mismatch" | "not_in_register" | "no_ico" | "unavailable"

export interface RegisterVerdict {
  status: RegisterVerdictStatus
  /** The name the Brain extracted (verbatim). */
  extractedName: string
  /** The official ARES obchodní jméno, when the lookup resolved. */
  officialName: string | null
  /** ARES `inPublicRegister` (zápis v OR/spolkovém rejstříku), when resolved. */
  inPublicRegister: boolean | null
  /** The IČO that was (or would have been) checked; null when none was extracted. */
  ico: string | null
  /** Human-readable one-line explanation (Czech), for the CLI proposal. */
  message: string
}

const LEGAL_FORM_TOKENS = new Set([
  "sro",
  "spolsro",
  "as",
  "ks",
  "vos",
  "se",
  "zs",
  "ops",
  "spol",
  "druzstvo",
  "statnipodnik",
  "sp",
])

/**
 * Normalize a business name for tolerant comparison: NFD-strip diacritics, lowercase, drop everything but
 * `[a-z0-9]`, split into tokens, and drop Czech legal-form tokens (s.r.o. / a.s. / spol. s r.o. / …). ARES
 * emits the legal form inside `obchodniJmeno` ("ACME s.r.o.") while an OCR extraction may omit or reformat it,
 * so comparing the legal-form-stripped token sets avoids a false mismatch on pure formatting.
 */
export function normalizeNameTokens(name: string): string[] {
  const collapsed = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Collapse dotted abbreviations so "s.r.o." → "sro", "a.s." → "as", "o.p.s." → "ops" become single
    // tokens the legal-form set can drop (instead of fragmenting into single letters s / r / o).
    .replace(/\./g, "")
  return collapsed
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
    .filter((t) => !LEGAL_FORM_TOKENS.has(t))
}

/**
 * True when two names refer to the same entity, tolerant of legal-form suffix, punctuation, diacritics, case,
 * and word order: equal token multisets, OR the shorter name's tokens are all contained in the longer one
 * ("ACME" vs "ACME Praha"). Empty-after-normalization (a name that is ALL legal-form tokens / punctuation)
 * never matches — there is nothing distinctive to compare.
 */
export function namesMatch(extracted: string, official: string): boolean {
  const a = normalizeNameTokens(extracted)
  const b = normalizeNameTokens(official)
  if (a.length === 0 || b.length === 0) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  const longerCounts = new Map<string, number>()
  for (const t of longer) longerCounts.set(t, (longerCounts.get(t) ?? 0) + 1)
  for (const t of shorter) {
    const n = longerCounts.get(t) ?? 0
    if (n === 0) return false
    longerCounts.set(t, n - 1)
  }
  return true
}

/** IČO is at most 8 digits; ARES keys on the zero-padded 8-digit form. Returns null when not checkable. */
function checkableIco(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "")
  if (!digits || digits.length > 8) return null
  return digits.padStart(8, "0")
}

export interface CrossCheckOptions {
  /** Injected for tests / a custom ARES base URL; defaults to the real `lookupAres`. */
  lookup?: (ico: string) => Promise<{
    legalName: string
    inPublicRegister: boolean
  }>
  /** Abort/timeout signal forwarded to the ARES fetch. */
  signal?: AbortSignal
}

/**
 * Cross-check an extracted counterparty against ARES. FAIL-OPEN: any lookup failure returns `unavailable`
 * (never throws). PURE otherwise (the only I/O is the injected `lookup`). Returns `no_ico` when there is no
 * checkable IČO (foreign supplier, individual, or name-only) — there is nothing to verify against ARES.
 */
export async function crossCheckCounterparty(
  counterparty: EventCounterparty | null | undefined,
  options: CrossCheckOptions = {},
): Promise<RegisterVerdict> {
  const extractedName = counterparty?.name ?? ""
  const ico = checkableIco(counterparty?.ico)
  const base = {
    extractedName,
    officialName: null,
    inPublicRegister: null,
    ico,
  } as const

  if (!ico) {
    return {
      ...base,
      status: "no_ico",
      message:
        "Bez IČO — protistranu nelze ověřit proti ARES (zahraniční / fyzická osoba / jen název).",
    }
  }

  const lookup =
    options.lookup ??
    (async (i: string) => {
      const profile = await lookupAres(i, { signal: options.signal })
      return {
        legalName: profile.legalName,
        inPublicRegister: profile.inPublicRegister,
      }
    })

  let resolved: { legalName: string; inPublicRegister: boolean }
  try {
    resolved = await lookup(ico)
  } catch (error) {
    const detail =
      error instanceof RegistryLookupError || error instanceof Error
        ? error.message
        : String(error)
    return {
      ...base,
      status: "unavailable",
      message: `ARES nedostupné (ověření přeskočeno, doklad se stejně podrží): ${detail}`,
    }
  }

  const officialName = resolved.legalName
  const inPublicRegister = resolved.inPublicRegister
  const enriched = { extractedName, officialName, inPublicRegister, ico }

  if (!namesMatch(extractedName, officialName)) {
    return {
      ...enriched,
      status: "mismatch",
      message:
        `NESHODA s ARES: IČO ${ico} patří „${officialName}“, ale doklad uvádí „${extractedName}“. ` +
        "Pravděpodobně chybně načtené IČO — ověřte zdroj.",
    }
  }
  if (!inPublicRegister) {
    return {
      ...enriched,
      status: "not_in_register",
      message: `IČO ${ico} („${officialName}“) není zapsáno ve veřejném rejstříku — ověřte.`,
    }
  }
  return {
    ...enriched,
    status: "match",
    message: `Ověřeno v ARES: IČO ${ico} = „${officialName}“ (zápis v rejstříku).`,
  }
}

/**
 * A verdict that should refuse `--execute` (unless overridden) — a real, actionable register problem.
 * ONLY `mismatch` (the extracted name ≠ ARES obchodní jméno for that IČO — the mis-OCR'd-IČO case this
 * feature targets). `not_in_register` is NOT blocking: `inPublicRegister` is the obchodní/spolkový rejstřík
 * only, so a perfectly valid OSVČ (natural person, never in the OR) is `not_in_register` with a matching
 * name — blocking it would break every OSVČ doc and mislabel a correct partner. It stays informational
 * (printed, never blocks or caps), exactly like `unavailable` / `no_ico`.
 */
export function verdictBlocksExecute(verdict: RegisterVerdict): boolean {
  return verdict.status === "mismatch"
}

const STATUS_MARK: Record<RegisterVerdictStatus, string> = {
  match: "✓",
  mismatch: "✗",
  not_in_register: "⚠",
  no_ico: "·",
  unavailable: "⚠",
}

/** Render the verdict as one CLI line for the event proposal. */
export function renderRegisterVerdict(verdict: RegisterVerdict): string {
  return `  ARES ${STATUS_MARK[verdict.status]} ${verdict.message}\n`
}

/**
 * When the verdict is blocking, assert the `counterparty_register_mismatch` cap on the event request's
 * evidence envelope (creating `signals` / `capSignals` when absent, de-duplicating) so the server holds the
 * write sub-green and the held-event review shows why. Returns a fresh request — never mutates the input. A
 * no-op for a non-blocking verdict, so a clean verdict leaves the request byte-identical.
 */
export function withRegisterCapSignals(
  request: CreateAccountingEventRequest,
  verdict: RegisterVerdict,
): CreateAccountingEventRequest {
  if (!verdictBlocksExecute(verdict)) return request
  const existing = request.signals ?? undefined
  const existingCaps = existing?.capSignals ?? []
  const merged = [...new Set([...existingCaps, REGISTER_MISMATCH_CAP])]
  return {
    ...request,
    signals: { ...(existing ?? {}), capSignals: merged },
  }
}
