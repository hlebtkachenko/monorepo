/**
 * ČSÚ právní-forma číselník (code 21) → internal legal_form.code mapping.
 *
 * ARES returns právní forma as a ČSÚ code; the platform keys on the short
 * legal_form.code seeded in 0025. This is a BOUNDARY approximation covering the
 * common forms; an unmapped code resolves to null, and the caller falls back to
 * a manual pick in the wizard / a 422 on the API. Verify against the current
 * ČSÚ číselník before trusting a new code — external číselníky drift.
 *
 * Sources: ČSÚ číselník 21 "Právní formy".
 */

const CSU_TO_LEGAL_FORM: Readonly<Record<string, string>> = {
  "101": "OSVC", // Fyzická osoba podnikající dle živnostenského zákona
  "111": "VOS", // Veřejná obchodní společnost
  "112": "SRO", // Společnost s ručením omezeným
  "113": "KS", // Komanditní společnost
  "121": "AS", // Akciová společnost
  "205": "DRUZSTVO", // Družstvo
  "117": "NADACE", // Nadace
  "161": "USTAV", // Ústav
  "706": "SPOLEK", // Spolek
  "641": "SVJ", // Společenství vlastníků jednotek
}

/** Natural-person ČSÚ forms → person_kind = natural_person; everything else legal_entity. */
const NATURAL_PERSON_CSU_CODES: ReadonlySet<string> = new Set([
  "101", // OSVČ dle živnostenského zákona
  "102", // Fyzická osoba podnikající dle jiného než živnostenského zákona
  "107", // Zemědělský podnikatel — fyzická osoba
])

export function legalFormCodeFromCsu(csuCode: string | null): string | null {
  if (!csuCode) return null
  return CSU_TO_LEGAL_FORM[csuCode] ?? null
}

export function personKindFromCsu(
  csuCode: string | null,
): "legal_entity" | "natural_person" | null {
  if (!csuCode) return null
  return NATURAL_PERSON_CSU_CODES.has(csuCode)
    ? "natural_person"
    : "legal_entity"
}
