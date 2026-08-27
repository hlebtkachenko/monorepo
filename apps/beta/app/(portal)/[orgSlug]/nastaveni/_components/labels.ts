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
 * "ZAMĚSTNANEC" IS THE FIFTH LABEL §2.6.1 NAMES, AND IT IS NOT IN THIS MAP —
 * because it is not a role (PR 33). The employee seat is `guest` +
 * `payroll_employee.app_user_id`, so it is rendered as a separate BADGE beside
 * "Neaktivní" and "Poslední účetní" in Lidé's state cell, never as an entry
 * here.
 *
 * THAT SPLIT IS NOT AESTHETIC. This map feeds two things: the label shown when a
 * row has no role select, and the OPTIONS of the select itself. A "Zaměstnanec"
 * entry would therefore have to be either a role somebody can be assigned — which
 * it is not, since the seat is created by consuming a pre-bound link and by
 * nothing else — or a value that renders in one branch and is filtered out of the
 * other. The first version of this PR took the first road and put the seat label
 * behind `assignableRoles.length === 0`; that branch is UNREACHABLE for a guest
 * row (an owner or admin may always re-role a guest, so the select always
 * renders), so the label never appeared for the rows it existed to mark. The
 * badge has no such branch.
 *
 * Keeping the map keyed purely on `BetaOrgRole` also preserves what `satisfies
 * Record<...>` is for: proof that every enum value has a label. A fifth key would
 * break that proof to encode something the enum does not contain.
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
