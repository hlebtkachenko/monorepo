/**
 * The single SQL predicate for an ISSUED intra-Community supply (§64 goods §9/1
 * service), shared by the DPH ř.20/21 filters (dph.ts) and the souhrnné hlášení
 * gate (souhrnne-hlaseni.ts) so the two reports share the IDENTICAL predicate
 * and cannot diverge (#541).
 *
 * The row must be an ISSUED_INVOICE, REVERSE_CHARGE (the mode decideVat emits for
 * issued-EU — classify.ts — and the mode the capture boundary enforces), with
 * vat_jurisdiction = 'EU'. Gating on vat_mode = 'REVERSE_CHARGE' also keeps a
 * STANDARD+EU B2C distance sale or an OUTSIDE_VAT+EU §10 service out of the SH
 * recap (§102(1) is B2B intra-Community supplies only).
 *
 * The predicate BODY exists exactly once — `issuedEuSupply(...)` — so the two
 * exported variants cannot drift: they differ only in how the three columns are
 * qualified (dph.ts's CTE projects bare `type` / `vat_mode` / `vat_jurisdiction`;
 * souhrnne-hlaseni.ts joins `sr` / `pr` directly). The qualifiers are hardcoded
 * constants, never user input, so sql.raw on the identifiers is safe and keeps
 * the emitted SQL byte-identical to the hand-written predicate.
 */
import { sql } from "drizzle-orm"
import { vatClassificationPredicates } from "./vat-classification"

/**
 * Predicate for the DPH builder (dph.ts), where the CTE projects `type` and bare
 * `vat_mode` / `vat_jurisdiction` columns. Used inside FILTER (WHERE …).
 */
export const ISSUED_EU_SUPPLY_DPH = vatClassificationPredicates({
  documentType: sql`type`,
  mode: sql`vat_mode`,
  jurisdiction: sql`vat_jurisdiction`,
  supplyKind: sql`supply_kind`,
}).issuedEuSupply

/**
 * Predicate for the souhrnné hlášení builder (souhrnne-hlaseni.ts), which joins
 * summary_record `sr` and partial_record `pr` directly. Used inside WHERE …
 */
export const ISSUED_EU_SUPPLY_SH = vatClassificationPredicates({
  documentType: sql`sr.type`,
  mode: sql`pr.vat_mode`,
  jurisdiction: sql`pr.vat_jurisdiction`,
  supplyKind: sql`pr.supply_kind`,
}).issuedEuSupply
