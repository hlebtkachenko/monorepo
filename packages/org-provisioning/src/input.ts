/**
 * ScaffoldInput — the ONE flat, Zod-validated shape every surface (UI wizard,
 * onboarding, agent/API) constructs and the orchestrator consumes. Prefill only
 * SUGGESTS a value of this shape; the orchestrator performs no HTTP. Never
 * carries organization_id / role — those are server-derived (workspaceId +
 * ownerUserId are injected by the caller, not accepted from an API body).
 */
import { z } from "zod"

export const RegimeCode = z.enum([
  "DOUBLE_ENTRY",
  "SINGLE_ENTRY",
  "TAX_RECORDS",
])
export const VatRegimeCode = z.enum(["NON_PAYER", "PAYER", "IDENTIFIED_PERSON"])
export const VatFilingPeriodCode = z.enum(["MONTHLY", "QUARTERLY"])
export const AccountingSizeCode = z.enum(["MICRO", "SMALL", "MEDIUM", "LARGE"])
export const FxRatePolicy = z.enum(["DAILY", "REAL", "FIXED"])
export const PersonKind = z.enum(["legal_entity", "natural_person"])
export const EntityKind = z.enum(["NEW_ENTITY", "MIGRATED_ENTITY"])

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected an ISO date (YYYY-MM-DD)")

export const ScaffoldAddress = z.object({
  /** Composed display line (e.g. "Jankovcova 1522/53"). */
  street: z.string().nullish(),
  /** číslo popisné. */
  houseNumber: z.string().nullish(),
  /** číslo orientační (may carry a letter, e.g. "53a"). */
  orientationNumber: z.string().nullish(),
  city: z.string().nullish(),
  postalCode: z.string().nullish(),
  /** Kraj (region name, from ARES). */
  region: z.string().nullish(),
  countryCode: z.string().length(2).nullish(),
})
export type ScaffoldAddress = z.infer<typeof ScaffoldAddress>

export const OssScheme = z.enum(["UNION", "IMPORT"])

export const AuthorizedPerson = z.object({
  givenName: z.string().min(1).max(128),
  familyName: z.string().min(1).max(128),
  position: z.string().max(128).nullish(),
})
export type AuthorizedPerson = z.infer<typeof AuthorizedPerson>

export const ScaffoldInput = z.object({
  // --- server-injected scope (never from an API request body) ---------------
  workspaceId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  /** Client-supplied idempotency key; a retry with the same key replays. */
  idempotencyKey: z.string().min(8).max(200),

  // --- identity -------------------------------------------------------------
  legalName: z.string().min(1).max(512),
  /** Omit to derive from legalName. */
  slug: z.string().min(2).max(64).optional(),
  personKind: PersonKind,
  legalSubjectKind: z.string().max(64).default("for_profit"),
  legalFormCode: z.string().min(1).max(32),
  ico: z
    .string()
    .regex(/^\d{8}$/)
    .nullish(),
  /** DIČ incl. country prefix (CZ12345678). Required when VAT PAYER/IDENTIFIED. */
  dic: z.string().max(32).nullish(),
  address: ScaffoldAddress.optional(),
  businessActivityCodes: z.array(z.string()).default([]),

  // --- extended identity / config (0041) ------------------------------------
  /** Datová schránka (ISDS ID) — 7-char lowercase alphanumeric. Manual entry. */
  dataBoxId: z
    .string()
    .regex(/^[a-z0-9]{7}$/)
    .nullish(),
  contactEmail: z.string().max(320).nullish(),
  contactPhone: z.string().max(32).nullish(),
  website: z.string().max(512).nullish(),
  /** Poštovní adresa — up to 3 free-text lines (ARES adresaDorucovaci). */
  deliveryAddressLines: z.array(z.string()).max(3).optional(),
  /** Finanční úřad (ÚFO) code; from ARES financniUrad. */
  taxOfficeCode: z.string().max(4).nullish(),
  taxOfficeWorkplaceCode: z.string().max(4).nullish(),
  /** Spisová značka incl. court (§435 NOZ document footer). */
  registryFileNumber: z.string().max(256).nullish(),
  /** Statutory signer (oprávněná osoba). */
  authorizedPerson: AuthorizedPerson.optional(),
  /** EU One-Stop-Shop registration; requires VAT registration (§110k ZDPH). */
  oss: z.object({ scheme: OssScheme, validFrom: isoDate }).optional(),

  // --- accounting configuration --------------------------------------------
  /** Omit to auto-derive from the legal form (deterministic cases only). */
  regimeCode: RegimeCode.optional(),
  /** From ARES seznamRegistraci — forces DOUBLE_ENTRY even for a natural person. */
  inPublicRegister: z.boolean().default(false),
  accountingSizeCode: AccountingSizeCode.nullish(),
  accountingCurrency: z.string().length(3).default("CZK"),
  fxRatePolicy: FxRatePolicy.nullish(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),

  // --- period bootstrap -----------------------------------------------------
  entityKind: EntityKind,
  /** datum vzniku (NEW) — first period start; short first period. */
  registeredAt: isoDate.nullish(),
  /** Conversion date (MIGRATED) or an explicit first-period start. */
  periodStart: isoDate.nullish(),
  /** Explicit first-period end (escape hatch, e.g. §3/4 up-to-15-month period). */
  periodEnd: isoDate.nullish(),
  /** Fiscal/calendar year to open when no explicit start date is supplied. */
  fiscalYear: z.number().int().min(1990).max(2100).optional(),

  // --- VAT ------------------------------------------------------------------
  vatRegimeCode: VatRegimeCode.default("NON_PAYER"),
  /** PAYER only; new payers default MONTHLY (§99/§99a ZDPH). */
  vatFilingPeriod: VatFilingPeriodCode.nullish(),
  /** Registration date; defaults to the first period start. */
  vatValidFrom: isoDate.nullish(),

  // --- provenance (opaque registry snapshots, stored, never logged) ---------
  aresSnapshot: z.unknown().optional(),
  dphSnapshot: z.unknown().optional(),
})

export type ScaffoldInput = z.infer<typeof ScaffoldInput>
export type ScaffoldInputRaw = z.input<typeof ScaffoldInput>

/**
 * Slug from a legal name: lowercase, non-alphanumeric → '-', trimmed, ≤48 chars.
 * Pads to satisfy the length ≥ 2 CHECK. Mirrors the onboarding slugify contract.
 */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    // Collapses every run of non-alphanumerics to a SINGLE "-", so there is
    // never more than one leading/trailing dash to trim.
    .replace(/[^a-z0-9]+/g, "-")
    // Quantifier-free trims (not `/^-+|-+$/g` / `/-+$/`): no `+`, so there is
    // no backtracking shape for CodeQL js/polynomial-redos to flag. Safe
    // because the collapse above guarantees at most one boundary dash.
    .replace(/^-/, "")
    .replace(/-$/, "")
    .slice(0, 48)
  return slug.length < 2 ? "org" : slug
}
