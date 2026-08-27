import type { BetaIndicatorKind } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Ukazatele's own Czech labels — the sibling of `account-labels.ts`, on the same
 * terms.
 *
 * `satisfies Record<BetaIndicatorKind, BetaMessageKey>` makes a value added to
 * `beta_indicator_kind` a compile error rather than a blank select option, and a
 * key that is not in `messages/cs.json` a compile error too. The runtime half —
 * walking the pgEnum's own `enumValues` — is in the sibling test.
 *
 * PURE MODULE (types only from `@/db/schema`), because the Zadávání select is a
 * Client Component and must not pull Drizzle into its bundle. That is also why
 * `INDICATOR_KINDS` is hand-written rather than read off `enumValues`, and why
 * the test asserts it stays total.
 *
 * ONE ENTRY TODAY. That is the enum's own shape (migration 0020), not a stub:
 * obrat is the only figure spec §2.1 asks the office to state outside a
 * statement or an import. The list exists so the reader
 * (`formIndicatorKind`) and the select offer exactly the same closed set — the
 * discipline `formObligationGroup` documents — and so a second kind lands as one
 * edit here rather than as a form nobody remembered to widen.
 */
export const INDICATOR_KIND_LABEL_KEY = {
  annual_turnover: "ukazatele.kindAnnualTurnover",
} as const satisfies Record<BetaIndicatorKind, BetaMessageKey>

export const INDICATOR_KINDS: readonly BetaIndicatorKind[] = ["annual_turnover"]
