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
  },
} satisfies Formats
