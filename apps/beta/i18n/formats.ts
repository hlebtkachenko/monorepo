import type { Formats } from "next-intl"

/**
 * Beta is Czech-only (plan v3 Part 3). There is no locale routing and no
 * locale negotiation: one locale, one catalog, one set of cs-CZ formats.
 * Adding a second locale later means adding a messages file and a resolver,
 * not restructuring the routes.
 */
export const BETA_LOCALE = "cs"

/** All Czech accounting deadlines are read in Prague local time. */
export const BETA_TIME_ZONE = "Europe/Prague"

/**
 * Monday. Czech calendar convention — pass to `weekStartsOn` on every
 * calendar / date-picker mounted in this app (date-fns and the UI calendar
 * primitives both default to Sunday).
 */
export const WEEK_STARTS_ON = 1

/**
 * cs-CZ presentation defaults: DD.MM.YYYY dates and Kč amounts. Named
 * formats keep the rendering identical across every surface — components
 * ask for `format.dateTime(d, "date")`, never for their own option bag.
 */
export const betaFormats = {
  dateTime: {
    date: { day: "2-digit", month: "2-digit", year: "numeric" },
    dateTime: {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
    month: { month: "long", year: "numeric" },
  },
  number: {
    currency: {
      style: "currency",
      currency: "CZK",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
    currencyWhole: {
      style: "currency",
      currency: "CZK",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    },
    /**
     * A statutory statement cell (Výkazy, spec §2.5): grouped, two decimals,
     * and NO currency symbol.
     *
     * A rozvaha prints bare numbers under one "v Kč" heading — repeating "Kč"
     * in every cell of a four-column form is noise the paper form does not
     * have, and it is the column header, not the cell, that says what the unit
     * is. Two fraction digits always, so the decimal points line up down a
     * column of `tabular-nums`.
     */
    statement: {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
    /**
     * An interest rate as the contract states it (spec §2.4 "úrok").
     *
     * `style: "decimal"`, NOT `style: "percent"`: `loan.interest_rate_pct`
     * already holds the figure in percent units, and Intl's percent style
     * multiplies by 100 — it would print a 4,125 % úvěr as 412,5 %. The "%"
     * belongs to the caller's markup, next to the number this produces.
     */
    rate: {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    },
  },
} satisfies Formats
