import type { OrganizationCard } from "@/lib/data/projections"

/**
 * The two composite fields of Karta společnosti (spec §2.1 item 5): sídlo and
 * účet.
 *
 * BOTH ARE STORED IN PARTS AND JOINED HERE, at the last step before display.
 * `db/schema/organization.ts` decomposes them on purpose — "a Czech account
 * number is three fields and a display string cannot be validated", and the ARES
 * reconciliation of §2.10 accepts or rejects an address FIELD BY FIELD. Joining
 * them in the data layer would hand every consumer a string it can no longer
 * take apart; joining them in each component would give the karta and the
 * Nastavení form two different renderings of the same row.
 *
 * EVERY PART IS OPTIONAL, which is the whole difficulty. A brand-new book has an
 * IČO and nothing else, and §0.4's "empty beats stale" applies to an address as
 * much as to a number: a half-known sídlo renders as the half that is known, and
 * a wholly unknown one renders as `null` so the caller can say "Neuvedeno"
 * rather than printing a lone comma.
 *
 * PURE: no `server-only`, no React — the type import is erased.
 */

type AddressParts = Pick<
  OrganizationCard,
  | "registeredStreet"
  | "registeredHouseNumber"
  | "registeredOrientationNumber"
  | "registeredCity"
  | "registeredPostalCode"
>

/**
 * `Dlouhá 123/45, 110 00 Praha 1`, in the Czech postal order.
 *
 * The house number is `číslo popisné/číslo orientační` when both are known and
 * the popisné alone when it is not — the slash is only correct with something on
 * both sides of it. Returns null when no part is known at all.
 */
export function formatBetaAddress(parts: AddressParts): string | null {
  const houseNumber = [
    parts.registeredHouseNumber,
    parts.registeredOrientationNumber,
  ]
    .filter((part): part is string => Boolean(part))
    .join("/")

  const street = [parts.registeredStreet, houseNumber]
    .filter((part): part is string => Boolean(part))
    .join(" ")

  const city = [parts.registeredPostalCode, parts.registeredCity]
    .filter((part): part is string => Boolean(part))
    .join(" ")

  const line = [street, city].filter((part) => part.length > 0).join(", ")
  return line.length > 0 ? line : null
}

type AccountParts = Pick<
  OrganizationCard,
  "bankAccountPrefix" | "bankAccountNumber" | "bankCode" | "iban"
>

/**
 * `předčíslí-číslo/kód banky`, or the plain number when there is no předčíslí.
 *
 * FALLS BACK TO THE IBAN, and only in that order: a Czech client reads the
 * domestic form, and the IBAN is what a book with a foreign account has instead.
 * Returns null when neither is known — never a bare `/<kód banky>`, which is
 * what joining unconditionally would print for a book whose bank code arrived
 * from ARES before its account number was typed in.
 */
export function formatBetaBankAccount(parts: AccountParts): string | null {
  if (parts.bankAccountNumber && parts.bankCode) {
    const local = parts.bankAccountPrefix
      ? `${parts.bankAccountPrefix}-${parts.bankAccountNumber}`
      : parts.bankAccountNumber
    return `${local}/${parts.bankCode}`
  }
  return parts.iban ?? null
}
