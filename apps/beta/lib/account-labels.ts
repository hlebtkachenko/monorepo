import type { BetaAccountKind, BetaAccountMatchKind } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Finance › Účty a hotovost' own Czech labels — the sibling of
 * `obligation-labels.ts`, on the same terms.
 *
 * THE READ MODEL SHIPS NO DISPLAY STRINGS. `lib/data/account-balances.ts`
 * returns account codes, money strings and enum values; the Czech words live
 * here, so the model stays translatable and testable.
 *
 * `satisfies Record<Enum, BetaMessageKey>` makes a value added to
 * `beta_account_kind` / `beta_account_match_kind` a compile error rather than a
 * blank card heading, and a key that is not in `messages/cs.json` a compile
 * error too. The runtime half — walking the pgEnum's own `enumValues` — is in
 * the sibling test.
 *
 * PURE MODULE (types only from `@/db/schema`), because the Zadávání selects and
 * the account cards are Client Components and must not pull Drizzle into their
 * bundle. That is also why the two ordered lists below are hand-written rather
 * than read off `enumValues`, and why the test asserts they stay total.
 */

/** Spec §4's "kind bank|cash", as the card's own badge. */
export const ACCOUNT_KIND_LABEL_KEY = {
  bank: "finance.uctyKindBank",
  cash: "finance.uctyKindCash",
} as const satisfies Record<BetaAccountKind, BetaMessageKey>

/** Bank first: a client has several bank accounts and at most one pokladna. */
export const ACCOUNT_KINDS: readonly BetaAccountKind[] = ["bank", "cash"]

/**
 * How much of the účtový rozvrh one card claims (migration 0014).
 *
 * `exact` first, and it is the database default, because it is the mode that
 * cannot surprise anyone: it claims exactly the účet it names. `prefix` claims
 * every účet whose code starts with it, which is what a real analytic rozvrh
 * needs and also what the overlap trigger exists to keep honest.
 */
export const ACCOUNT_MATCH_KIND_LABEL_KEY = {
  exact: "finance.uctyMatchExact",
  prefix: "finance.uctyMatchPrefix",
} as const satisfies Record<BetaAccountMatchKind, BetaMessageKey>

export const ACCOUNT_MATCH_KINDS: readonly BetaAccountMatchKind[] = [
  "exact",
  "prefix",
]
