/**
 * Branded primitive types — overlay on top of `openapi-typescript`'s
 * generated `components["schemas"]` to keep the platform's domain invariants
 * (currency-aware money, per-resource ID brands, FX overlay) at compile
 * time even when the wire shape is just `string` / `number`.
 *
 * Generated types come from the OpenAPI spec (`apps/api/openapi/v1.json`),
 * which carries no TS-brand information — the spec is wire-shape only. The
 * brand machinery lives here, in SDK userland, so a caller importing
 * `{ Money }` gets the same `Money<"CZK">` distinct-from-`Money<"EUR">`
 * guard as the server-side `@workspace/db/money` type.
 */

declare const __brand: unique symbol
type Brand<T, B extends string> = T & { readonly [__brand]: B }

/* ───────────── Resource IDs ───────────── */

export type OrganizationId = Brand<string, "OrganizationId">
export type WorkspaceId = Brand<string, "WorkspaceId">
export type InvoiceId = Brand<string, "InvoiceId">
export type AccountId = Brand<string, "AccountId">
export type JournalEntryId = Brand<string, "JournalEntryId">

/** Cast a raw wire string into a typed resource ID. The cast is unchecked
 *  — the server is the authority on ID validity. Use this only when the
 *  source is a value the API just returned. */
export const asOrganizationId = (id: string): OrganizationId =>
  id as OrganizationId
export const asWorkspaceId = (id: string): WorkspaceId => id as WorkspaceId
export const asInvoiceId = (id: string): InvoiceId => id as InvoiceId
export const asAccountId = (id: string): AccountId => id as AccountId
export const asJournalEntryId = (id: string): JournalEntryId =>
  id as JournalEntryId

/* ───────────── Currency-aware money ───────────── */

// Re-export the wire-schema currency union from `@workspace/shared/api` so
// the SDK never drifts from the spec. The server-side branded-money type
// in `@workspace/db` carries the same set; if we add a market (e.g. CHF),
// it lands in one place — the registry primitives — and ripples here.
import type { CurrencyCode } from "@workspace/shared/api"
export type Currency = CurrencyCode

/**
 * Currency-aware monetary value. Amount stored as a bigint in minor units
 * (haléře for CZK; cents for EUR/USD/GBP). The wire representation
 * (`{ amount: string, currency: "CZK" }`) deserialises with `Money.from(...)`
 * and re-serialises with `Money.toWire(...)`.
 *
 * The type parameter `C` keeps the platform's "no native number for money"
 * rule alive on the client: a function expecting `Money<"CZK">` cannot be
 * called with a `Money<"EUR">` value without an explicit conversion.
 */
export class Money<C extends Currency> {
  readonly amount: bigint
  readonly currency: C

  private constructor(amount: bigint, currency: C) {
    this.amount = amount
    this.currency = currency
  }

  static of<C extends Currency>(amount: bigint, currency: C): Money<C> {
    return new Money(amount, currency)
  }

  static from<C extends Currency>(wire: {
    amount: string
    currency: C
  }): Money<C> {
    return new Money(BigInt(wire.amount), wire.currency)
  }

  toWire(): { amount: string; currency: C } {
    return { amount: this.amount.toString(), currency: this.currency }
  }

  add(other: Money<C>): Money<C> {
    return new Money(this.amount + other.amount, this.currency)
  }

  sub(other: Money<C>): Money<C> {
    return new Money(this.amount - other.amount, this.currency)
  }

  equals(other: Money<C>): boolean {
    return this.amount === other.amount && this.currency === other.currency
  }

  toString(): string {
    return `${this.amount} ${this.currency}`
  }
}

/* ───────────── FX overlay ───────────── */

/**
 * Date-stamped FX rate from one currency to another. The SDK reads rates
 * the server returned with a payload — it never derives them, never inverts
 * a known rate, never substitutes a neighbour date. Mirrors the server-side
 * invariant from `CLAUDE.md`: "Call FxRate.convert(money) only".
 */
export class FxRate<From extends Currency, To extends Currency> {
  readonly from: From
  readonly to: To
  /** Rate as a string of decimal places — bigint × 10^scale = wire `numeric`. */
  readonly rate: string
  /** ISO date (YYYY-MM-DD) at which the rate is valid. */
  readonly date: string

  constructor(input: { from: From; to: To; rate: string; date: string }) {
    this.from = input.from
    this.to = input.to
    this.rate = input.rate
    this.date = input.date
  }

  /**
   * Convert a `Money<From>` to `Money<To>` using this rate. The result is
   * **truncated toward zero** to the minor unit of the target currency
   * (bigint integer division).
   *
   * This is intentional for **display only** — surfacing an estimate of a
   * conversion result in a UI. For booked accounting entries the server is
   * always the authority on the converted amount (it applies the platform's
   * rounding policy and writes the ledger lines). Never use this as the
   * source of truth for a posting; never reconcile a SDK-side conversion
   * against the server's booked figure.
   */
  convert(money: Money<From>): Money<To> {
    const [whole, fraction = ""] = this.rate.split(".")
    const scale = fraction.length
    const numerator = BigInt(`${whole}${fraction}`)
    const denominator = BigInt(10) ** BigInt(scale)
    const converted = (money.amount * numerator) / denominator
    return Money.of(converted, this.to)
  }
}
