/**
 * Client-safe schema + option lists for the create-organization wizard.
 *
 * This is the FORM contract (what the user fills / confirms). It deliberately
 * does NOT import @workspace/org-provisioning — that package pulls in db +
 * accounting (server-only). The server action maps these values onto the
 * domain ScaffoldInput and injects workspaceId / ownerUserId server-side.
 *
 * The schema is transform-free (no `.default()` / `.coerce`) so form input and
 * output types are identical — react-hook-form's Control type resolves cleanly.
 * Defaults live in the form's `defaultValues`; numeric coercion happens in
 * buildScaffoldInput; the real validation gate is the domain ScaffoldInput.
 */
import { z } from "zod"

export const REGIME_OPTIONS = [
  "DOUBLE_ENTRY",
  "SINGLE_ENTRY",
  "TAX_RECORDS",
] as const
export const VAT_REGIME_OPTIONS = [
  "NON_PAYER",
  "PAYER",
  "IDENTIFIED_PERSON",
] as const
export const SIZE_OPTIONS = ["MICRO", "SMALL", "MEDIUM", "LARGE"] as const
const ENTITY_KIND_OPTIONS = ["NEW_ENTITY", "MIGRATED_ENTITY"] as const
const FX_RATE_OPTIONS = ["DAILY", "REAL", "FIXED"] as const
const OSS_SCHEME_OPTIONS = ["UNION", "IMPORT"] as const

/** Legal forms seeded in 0025_accounting_reference_seed. */
export const LEGAL_FORM_OPTIONS = [
  { code: "OSVC", label: "OSVČ (fyzická osoba)" },
  { code: "SRO", label: "s.r.o." },
  { code: "AS", label: "a.s." },
  { code: "VOS", label: "v.o.s." },
  { code: "KS", label: "k.s." },
  { code: "DRUZSTVO", label: "Družstvo" },
  { code: "SPOLEK", label: "Spolek" },
  { code: "NADACE", label: "Nadace" },
  { code: "USTAV", label: "Ústav" },
  { code: "SVJ", label: "SVJ" },
] as const

const LEGAL_FORM_CODES = LEGAL_FORM_OPTIONS.map((o) => o.code) as [
  string,
  ...string[],
]

// Optional free-text: either an ISO date or the empty string (untouched field).
const isoDateOrEmpty = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
  .optional()
const optionalText = z.string().optional().or(z.literal(""))

export const OrgWizardSchema = z.object({
  ico: z.union([z.string().regex(/^\d{8}$/), z.literal("")]).optional(),
  legalName: z.string().min(1, "legalName").max(512),
  personKind: z.enum(["legal_entity", "natural_person"]),
  legalFormCode: z.enum(LEGAL_FORM_CODES),
  legalSubjectKind: z.enum(["for_profit", "non_profit"]),
  regimeCode: z.enum(REGIME_OPTIONS).optional(),
  vatRegimeCode: z.enum(VAT_REGIME_OPTIONS),
  vatFilingPeriod: z.enum(["MONTHLY", "QUARTERLY"]).optional(),
  accountingSizeCode: z.enum(SIZE_OPTIONS).optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  entityKind: z.enum(ENTITY_KIND_OPTIONS),
  registeredAt: isoDateOrEmpty,
  periodStart: isoDateOrEmpty,
  fiscalYear: optionalText,
  dic: z.string().max(32).optional().or(z.literal("")),
  // Carried from prefill (hidden), not user-edited.
  inPublicRegister: z.boolean(),
  businessActivityCodes: z.array(z.string()),
  street: optionalText,
  houseNumber: optionalText,
  orientationNumber: optionalText,
  city: optionalText,
  postalCode: optionalText,
  region: optionalText,
  countryCode: z.union([z.string().length(2), z.literal("")]).optional(),
  // Extended config (0041).
  dataBoxId: z
    .union([z.string().regex(/^[a-z0-9]{7}$/), z.literal("")])
    .optional(),
  contactEmail: optionalText,
  contactPhone: optionalText,
  website: optionalText,
  taxOfficeCode: optionalText,
  registryFileNumber: optionalText,
  fxRatePolicy: z.enum(FX_RATE_OPTIONS).optional(),
  // Signer (oprávněná osoba) — mapped only when both names present.
  signerGivenName: optionalText,
  signerFamilyName: optionalText,
  signerPosition: optionalText,
  // OSS — mapped only when a scheme + valid-from are both set.
  ossScheme: z.enum(OSS_SCHEME_OPTIONS).optional(),
  ossValidFrom: isoDateOrEmpty,
  // Carried from prefill (hidden).
  deliveryAddressLines: z.array(z.string()),
})

export type OrgWizardInput = z.infer<typeof OrgWizardSchema>

/** Baseline the wizard seeds into react-hook-form (schema is transform-free). */
export const WIZARD_DEFAULTS: OrgWizardInput = {
  legalName: "",
  personKind: "legal_entity",
  legalFormCode: "SRO",
  legalSubjectKind: "for_profit",
  vatRegimeCode: "NON_PAYER",
  fiscalYearStartMonth: 1,
  entityKind: "NEW_ENTITY",
  inPublicRegister: false,
  businessActivityCodes: [],
  deliveryAddressLines: [],
}
