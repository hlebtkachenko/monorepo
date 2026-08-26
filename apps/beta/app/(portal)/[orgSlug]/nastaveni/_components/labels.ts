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
 * `payroll_employee.app_user_id`, so the label is chosen by
 * `orgRoleLabelKey` below, which takes the seat fact alongside the role. Keeping
 * the map keyed purely on `BetaOrgRole` is what lets `satisfies Record<...>`
 * keep proving that every enum value has a label; a fifth key would break that
 * proof to encode something the enum does not contain.
 */
export const ROLE_LABEL_KEY = {
  owner: "nastaveni.roleOwner",
  admin: "nastaveni.roleAdmin",
  member: "nastaveni.roleMember",
  guest: "nastaveni.roleGuest",
} as const satisfies Record<BetaOrgRole, BetaMessageKey>

/**
 * The label ONE SEAT reads, given its role and whether it is an employee seat
 * (spec §2.6.1: "member displays as 'Pracovník firmy (vedení)', employee seat
 * displays as 'Zaměstnanec'").
 *
 * WHY THE DISTINCTION IS WORTH RENDERING AT ALL. Spec §2.6.1's own argument is
 * mis-assignment: a Lidé page that shows two rows both reading "Host", one of
 * which silently reads a person's payslips, gives the company admin no way to
 * see who has what. Deactivating the wrong one, or leaving a leaver's seat live,
 * both start with not being able to tell them apart.
 *
 * IT IS A DISPLAY FACT, NOT A PERMISSION. Nothing branches on this string; the
 * seat's actual narrowing is `payrollScope` and `isEmployeeSeat`, several layers
 * below. A guest with no link still reads "Host", which remains true of them.
 */
export function orgRoleLabelKey(member: {
  readonly role: BetaOrgRole
  readonly employeeSeat: boolean
}): BetaMessageKey {
  if (member.role === "guest" && member.employeeSeat) {
    return "nastaveni.roleEmployee"
  }
  return ROLE_LABEL_KEY[member.role]
}

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
