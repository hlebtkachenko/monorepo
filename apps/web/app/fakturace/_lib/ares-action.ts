"use server"

// Server action: look up a company in the public ARES registry by IČO and map
// the result onto a /fakturace Party. Runs server-side (no CORS, no token) via
// @workspace/registries — a pure fetch to ARES. Never throws to the client:
// every failure is returned as { ok: false, error } in Czech.

import {
  lookupAres,
  RegistryLookupError,
  type AresProfile,
} from "@workspace/registries"

import type { Party } from "./types"

/** ARES `address.street` is the composed display line (e.g. "Jankovcova
 * 1522/53"); use it directly, falling back to house/orientation numbers. */
function composeUlice(address: AresProfile["address"]): string {
  if (address.street && address.street.trim() !== "") return address.street
  return [address.houseNumber, address.orientationNumber]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join("/")
}

export async function lookupAresParty(
  ico: string,
): Promise<{ ok: true; data: Partial<Party> } | { ok: false; error: string }> {
  const digits = ico.replace(/\D/g, "")
  if (digits.length === 0 || digits.length > 8) {
    return { ok: false, error: "Neplatné IČO — zadejte 8 číslic." }
  }
  const normalized = digits.padStart(8, "0")

  let profile: AresProfile
  try {
    profile = await lookupAres(normalized)
  } catch (error) {
    if (error instanceof RegistryLookupError) {
      return {
        ok: false,
        error:
          "Načtení z ARES se nezdařilo. Zkontrolujte IČO nebo to zkuste znovu.",
      }
    }
    return { ok: false, error: "Neočekávaná chyba při načítání z ARES." }
  }

  const { address } = profile
  return {
    ok: true,
    data: {
      nazev: profile.legalName,
      ico: profile.ico,
      ulice: composeUlice(address),
      psc: address.postalCode ?? "",
      obec: address.city ?? "",
      stat:
        address.countryCode === "CZ"
          ? "Česká republika"
          : (address.countryCode ?? "Česká republika"),
    },
  }
}
