/**
 * Column helpers for domain-specific types.
 *
 * The `$type<Money<C>>()` applied here is COMPILE-TIME ONLY. Drizzle stores
 * numeric(19,4) as a string at runtime; consumers must convert at the
 * application boundary (parse the string into a bigint of minor units, then
 * brand it as Money<C>). Raw SQL (`tx.execute(sql`...`)`) bypasses the brand
 * entirely and returns `unknown[]`.
 *
 * See ADR-0013.
 */
import { numeric } from "drizzle-orm/pg-core"
import type { Currency, Money } from "./types.js"

/**
 * Money column: numeric(19,4) branded as Money<Currency> at compile time.
 *
 * Usage: `amount: money('amount')` in a pgTable definition.
 */
export function money<TName extends string>(name: TName) {
  return numeric(name, { precision: 19, scale: 4 }).$type<Money<Currency>>()
}
