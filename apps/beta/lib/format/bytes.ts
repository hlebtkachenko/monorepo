import { BETA_LOCALE } from "@/i18n/formats"

/**
 * cs-CZ byte-count formatting for plain presentational use — see `date.ts`'s
 * header for why this is a small direct `Intl` wrapper rather than a
 * `getFormatter()` call site.
 */
const byteFormat = new Intl.NumberFormat(BETA_LOCALE, {
  maximumFractionDigits: 1,
})

const BYTE_UNITS = ["B", "kB", "MB"] as const

/** A byte count → `1,4 MB`. Uploads are capped at 25 MiB, so MB is the top. */
export function formatBytes(value: number): string {
  let size = value
  let unit = 0
  while (size >= 1024 && unit < BYTE_UNITS.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${byteFormat.format(size)} ${BYTE_UNITS[unit]}`
}
