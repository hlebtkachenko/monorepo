import type { BetaFilingKind, BetaObligationGroup } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

import { FILING_KIND_LABEL_KEY } from "./filing-labels"

/**
 * Finance › Dluhy a platby' own Czech labels — the sibling of
 * `filing-labels.ts`, for the one enum the filing registry does not own.
 *
 * THE READ MODEL SHIPS NO DISPLAY STRINGS. `lib/data/obligations.ts` says so in
 * its own header and `obligations.test.ts` asserts it by refusing any Czech
 * diacritic in a serialized row. This module is the other half of that
 * arrangement, and it holds ONLY the creditor-group map: a filing's Czech name
 * already lives in `filing-labels.ts` (PR 17) and a second copy of it here
 * would be a second thing to keep in step.
 *
 * `satisfies Record<Enum, BetaMessageKey>` makes a value added to
 * `beta_obligation_group` a compile error rather than a blank heading, and a
 * key that is not in `messages/cs.json` a compile error too. The runtime half —
 * walking the pgEnum's own `enumValues` — is in the sibling test.
 */

/** The four §2.4 creditor groups, as the Dluhy a platby headings. */
export const OBLIGATION_GROUP_LABEL_KEY = {
  fu: "finance.groupFu",
  cssz_zp: "finance.groupCsszZp",
  dodavatele: "finance.groupDodavatele",
  ostatni: "finance.groupOstatni",
} as const satisfies Record<BetaObligationGroup, BetaMessageKey>

/**
 * The three creditor groups a MANUAL liability may take: the enum MINUS
 * `dodavatele`.
 *
 * That group belongs wholly to PR 28's imported saldokonto, and the database
 * refuses a manual liability in it (`liability_group_is_residue`, migration
 * 0006) — so a select that offered it would offer an option whose only possible
 * outcome is a constraint violation, and a form reader that accepted it would
 * turn a typo into a 500.
 *
 * Written out rather than filtered off `betaObligationGroup.enumValues`,
 * because this module is PURE (types only from `@/db/schema`) so that a Client
 * Component can render the select without pulling Drizzle into its bundle. The
 * relationship to the enum is asserted at runtime in the sibling test instead.
 */
export const MANUAL_OBLIGATION_GROUPS: readonly BetaObligationGroup[] = [
  "fu",
  "cssz_zp",
  "ostatni",
]

/**
 * The title of one obligation row, whichever source produced it.
 *
 * A filing has a `filingKind` and no `label`; a manual liability has a `label`
 * and no `filingKind` (and PR 28's partner saldo will have a `label` too). The
 * union guarantees exactly one of the two is set, so this is the whole mapping —
 * and it returns a discriminated result rather than a string, because one branch
 * needs translating and the other is already the office's own words.
 */
export function obligationTitle(obligation: {
  filingKind: BetaFilingKind | null
  label: string | null
}): { kind: "key"; value: BetaMessageKey } | { kind: "text"; value: string } {
  if (obligation.filingKind !== null) {
    return { kind: "key", value: FILING_KIND_LABEL_KEY[obligation.filingKind] }
  }
  // `??` rather than `!`: a row with neither is not representable through the
  // union today, and if one ever is, an empty title beats a crash on a page
  // whose job is to tell a client what they owe.
  return { kind: "text", value: obligation.label ?? "" }
}
