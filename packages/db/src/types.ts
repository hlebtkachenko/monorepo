/**
 * Domain types: Money<Currency>, FxRate<From, To>, and branded IDs.
 *
 * Brands are COMPILE-TIME ONLY. Drizzle stores numeric(19,4) as a string;
 * consumers must convert at the application boundary. Raw SQL (`tx.execute(...)`)
 * bypasses the brand entirely and returns `unknown[]`.
 *
 * See ADR-0013 for the full contract.
 */

export type Currency = "CZK" | "EUR" | "USD" | "GBP"

/**
 * Compile-time brand for monetary amounts stored as bigint minor units.
 * Never use native `number` for money fields.
 */
export type Money<C extends Currency> = bigint & { readonly __money: C }

/**
 * FX rate from currency F to currency T.
 *
 * Rules (ADR-0013):
 *   - Never auto-invert. FxRate<EUR, CZK> is not the same as FxRate<CZK, EUR>.
 *   - Never substitute a neighbor date.
 *   - Call FxRate.convert(money) only. Never query rate tables directly.
 *
 * `convert` implementation is deferred to the ledger phase.
 */
export type FxRate<F extends Currency, T extends Currency> = {
  readonly from: F
  readonly to: T
  readonly rate: number
  readonly date: string
}

/**
 * Branded ID types. String UUID at runtime; distinct types at compile time.
 */
export type WorkspaceId = string & { readonly __brand: "WorkspaceId" }
export type OrganizationId = string & { readonly __brand: "OrganizationId" }
export type UserId = string & { readonly __brand: "UserId" }
export type ToolCallLogId = string & { readonly __brand: "ToolCallLogId" }
