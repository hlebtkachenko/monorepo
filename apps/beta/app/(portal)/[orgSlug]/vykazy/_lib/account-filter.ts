import type { TrialBalanceLineView } from "@/lib/data/projections"

/**
 * The Obratová předvaha search box (spec §2.5's "účet, název …" table).
 *
 * IN MEMORY, OVER ROWS ALREADY READ — deliberately, and it is not a shortcut.
 * A předvaha is one published batch of a few hundred accounts that the page has
 * already fetched in full to render the table; pushing the filter into SQL
 * would add a round trip, a second WHERE clause to keep tenant-safe, and a
 * `LIKE` pattern built from request input, all to filter a list that is already
 * in hand. This is presentation over provided rows, which spec §0.2 allows
 * explicitly, and it computes no accounting value — it only decides which rows
 * are on screen.
 *
 * MATCHES THE CODE OR THE NAME. The office types "221" to find the bank and
 * "banka" to find the same row; refusing the second would be a search box that
 * only works if you already know the answer. Both are matched as substrings,
 * case- and diacritics-insensitively, so "UCTY" finds "Bankovní účty".
 */

/** Fold for comparison: lowercase, diacritics removed. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

export function filterTrialBalance(
  lines: readonly TrialBalanceLineView[],
  query: string,
): readonly TrialBalanceLineView[] {
  const needle = fold(query.trim())
  if (needle === "") return lines
  return lines.filter(
    (line) =>
      fold(line.accountCode).includes(needle) ||
      fold(line.accountName).includes(needle),
  )
}
