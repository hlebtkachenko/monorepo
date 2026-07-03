// The intake boundary contract. Parsers are PURE: bytes + context in, canonical Brain IR out — no
// filesystem, no network, no clock (the timestamp is injected so a parse is deterministic + replayable).
// IR record + source types are owned by @workspace/brain; intake never imports @workspace/accounting.

import type { IrRecord, IrSource } from "@workspace/brain"

/** What magic-byte + extension detection resolves a leaf to. */
export type DetectedFormat = IrSource | "zip" | "unknown"

/** A leaf file surfaced from a dump (after ZIP unpack / directory walk), with its detected format. */
export interface LeafFile {
  /** Path within the container (zip entry name or the relative on-disk path). */
  path: string
  /** Raw bytes. Parsers consume these directly — no re-reading from disk. */
  bytes: Uint8Array
  /** Detected format: a real `IrSource`, a nested `"zip"`, or `"unknown"`. `pohoda_db` = refuse-and-demand-XML. */
  format: DetectedFormat
}

/** Context stamped onto every produced record's provenance envelope. Injected to keep parsers pure. */
export interface ParseContext {
  /** Which org this dump belongs to (resolved from the folder / IČO upstream). */
  orgRef: string
  /** Path/locator prefix for provenance (the container path this leaf came from). */
  sourcePath: string
  /** ISO-8601 timestamp to stamp `ingested_at` — injected, never read from the clock. */
  ingestedAt: string
}

/** A non-fatal issue a parser surfaces instead of throwing (kept for the human review pile). */
export interface ParseWarning {
  /** The leaf/locator the issue is about. */
  path: string
  message: string
}

/** The result of parsing one leaf (or a batch) into canonical IR. */
export interface ParseResult {
  records: IrRecord[]
  warnings: ParseWarning[]
}
