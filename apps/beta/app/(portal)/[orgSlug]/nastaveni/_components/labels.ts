import type { BetaOrgRole } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"
import type { IdentityField } from "@/lib/ares/suggestions"

/**
 * Role → the label a CLIENT sees (spec §2.6.1, §2.10).
 *
 * THE DISPLAY NAMES ARE NOT THE ENUM NAMES, and that is load-bearing rather
 * than cosmetic. `owner` is the accounting office's seat, so it reads "Účetní";
 * `admin` is the person who owns the company, so it reads "Majitel
 * společnosti"; and `member` reads "Pracovník firmy (vedení)" because the spec's
 * whole argument for the recommendation is that somebody picking a role from a
 * list must not mis-assign one because "member" sounded like the smaller of two
 * options. It is the same map /admin renders (`app/admin/_components/labels.ts`)
 * with the same values under this section's own namespace — the two catalogs are
 * kept apart on purpose, so a wording change for the office cannot silently
 * restate a client's own role to them.
 *
 * "ZAMĚSTNANEC" IS ABSENT, and it is the fifth label §2.6.1 names. It is not a
 * role: the employee seat is `guest` + a `payroll_employee.app_user_id` link, so
 * distinguishing it from an ordinary Host needs a table that does not exist in
 * this database yet (spec §4 puts `payroll_employee` in the Mzdy PRs). It
 * arrives with the seat itself in PR 33; until then every `guest` reads "Host",
 * which is true of every guest that exists today.
 */
export const ROLE_LABEL_KEY = {
  owner: "nastaveni.roleOwner",
  admin: "nastaveni.roleAdmin",
  member: "nastaveni.roleMember",
  guest: "nastaveni.roleGuest",
} as const satisfies Record<BetaOrgRole, BetaMessageKey>

/**
 * The Czech label for every editable identity-card field, keyed by the SAME
 * names `IDENTITY_FIELDS` declares.
 *
 * `satisfies Record<IdentityField, ...>` is what keeps the two in step: adding a
 * field to `IDENTITY_FIELDS` without a label here is a compile error, and a
 * label for a field that no longer exists is one too. Without it the form would
 * silently render an untranslated key — or silently drop a field nobody noticed
 * was missing.
 *
 * The ARES suggestion list reads the same map, so a field is named identically
 * whether the office is typing it or accepting it from the registry.
 */
export const IDENTITY_FIELD_LABEL = {
  legalName: "nastaveni.fieldLegalName",
  ico: "nastaveni.fieldIco",
  dic: "nastaveni.fieldDic",
  registeredStreet: "nastaveni.fieldStreet",
  registeredHouseNumber: "nastaveni.fieldHouseNumber",
  registeredOrientationNumber: "nastaveni.fieldOrientationNumber",
  registeredCity: "nastaveni.fieldCity",
  registeredPostalCode: "nastaveni.fieldPostalCode",
  registeredCountryCode: "nastaveni.fieldCountryCode",
  dataBoxId: "nastaveni.fieldDataBoxId",
  courtFileNumber: "nastaveni.fieldCourtFileNumber",
  taxOfficeCode: "nastaveni.fieldTaxOfficeCode",
  bankAccountPrefix: "nastaveni.fieldBankPrefix",
  bankAccountNumber: "nastaveni.fieldBankNumber",
  bankCode: "nastaveni.fieldBankCode",
  iban: "nastaveni.fieldIban",
  bic: "nastaveni.fieldBic",
  contactEmail: "nastaveni.fieldContactEmail",
  contactPhone: "nastaveni.fieldContactPhone",
} as const satisfies Record<IdentityField, BetaMessageKey>
