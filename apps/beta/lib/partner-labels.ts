import type { BetaPartnerRole } from "@/db/schema"
import type { PartnerAresField } from "@/lib/ares/partner-suggestions"
import type { PartnerAging } from "@/lib/data/projections"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Czech display labels for the partner registry's two classifications — the
 * sibling of `lib/filing-labels.ts`, `lib/asset-labels.ts` and
 * `lib/import-labels.ts`, and here for the same reasons: an enum value is an
 * English identifier in a Czech product, and `lib/data/*` ships no display
 * strings at all.
 *
 * PURE MODULE — types only from `@/db/schema` and from the projections, so a
 * Client Component can render a role chip without pulling Drizzle into its
 * bundle. The relationship to the pgEnum is asserted at runtime in the sibling
 * test rather than by importing `enumValues` here.
 *
 * `satisfies Record<...>` is the guard that matters: a value added to
 * `beta_partner_role` in a later migration is a TYPE ERROR here until it has a
 * Czech label, rather than a raw `supplier` appearing on a client's screen.
 */

/** Spec §2.4's Partneři column "role". */
export const PARTNER_ROLE_LABEL_KEY = {
  supplier: "finance.roleSupplier",
  customer: "finance.roleCustomer",
  both: "finance.roleBoth",
  other: "finance.roleOther",
} as const satisfies Record<BetaPartnerRole, BetaMessageKey>

/**
 * Written out by hand rather than read off `betaPartnerRole.enumValues`
 * (same call `MANUAL_OBLIGATION_GROUPS` makes): this module imports no
 * runtime value from `@/db/schema`, only the TYPE, so a Client Component
 * (Zadávání dat's Partneři form) can render a role `<select>` without pulling
 * Drizzle into its bundle. Totality against the pgEnum is asserted in this
 * file's own test.
 */
export const PARTNER_ROLE_OPTIONS: readonly BetaPartnerRole[] = [
  "supplier",
  "customer",
  "both",
  "other",
]

/**
 * Czech labels for the ARES-reachable fields (`lib/ares/partner-suggestions.ts`),
 * for the "ARES navrhuje" suggestion list — the partner-shaped twin of
 * `nastaveni/_components/labels.ts`'s `IDENTITY_FIELD_LABEL`.
 */
export const PARTNER_ARES_FIELD_LABEL = {
  name: "zadavani.fieldPartnerName",
  dic: "zadavani.fieldDic",
  street: "zadavani.fieldStreet",
  houseNumber: "zadavani.fieldHouseNumber",
  orientationNumber: "zadavani.fieldOrientationNumber",
  city: "zadavani.fieldCity",
  postalCode: "zadavani.fieldPostalCode",
  countryCode: "zadavani.fieldCountryCode",
  legalFormCsuCode: "zadavani.fieldLegalFormCsuCode",
  registryFileNumber: "zadavani.fieldRegistryFileNumber",
} as const satisfies Record<PartnerAresField, BetaMessageKey>

/**
 * Spec §2.4's "aging signal", as the four bands a Czech saldokonto is read in
 * plus the honest fifth state.
 *
 * `unknown` has a label of its own rather than rendering as a dash, because
 * "the office stated no splatnost" and "nothing is overdue" are different facts
 * and §0.4 forbids showing the first as the second.
 */
export const PARTNER_AGING_LABEL_KEY = {
  unknown: "finance.agingUnknown",
  not_due: "finance.agingNotDue",
  days_1_30: "finance.aging1to30",
  days_31_90: "finance.aging31to90",
  days_over_90: "finance.agingOver90",
} as const satisfies Record<PartnerAging, BetaMessageKey>
