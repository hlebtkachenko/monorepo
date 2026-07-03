// CSV → IR. Pure: bytes in, BankTransaction IR out. Decode UTF-8 (BOM-tolerant), Papa.parse with delimiter
// auto-detect, then hand the raw cell grid to the shared tabular mapper. No filesystem, no network.

import Papa from "papaparse"
import type { ParseContext, ParseResult } from "./types"
import { rowsToBankTransactions, type Cell } from "./tabular"
import { decodeUtf8 } from "./text"

export function parseCsv(bytes: Uint8Array, ctx: ParseContext): ParseResult {
  const text = decodeUtf8(bytes)
  const parsed = Papa.parse<string[]>(text, {
    delimiter: "",
    skipEmptyLines: "greedy",
    header: false,
  })

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return {
      records: [],
      warnings: [
        {
          path: ctx.sourcePath,
          message: `csv parse failed: ${parsed.errors[0]?.message ?? "unknown error"}`,
        },
      ],
    }
  }

  const rows: Cell[][] = parsed.data.map((row) =>
    row.map((value) => (value === "" ? null : value)),
  )

  return rowsToBankTransactions(rows, ctx, "csv")
}
