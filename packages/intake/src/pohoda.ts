// Pohoda dataPack XML → IR. Pure: bytes in, Invoice + GLEntry IR out. Parses the documented dataPack export
// with fast-xml-parser; namespace prefixes (dat:/inv:/typ:) are STRIPPED via removeNSPrefix so the mapping
// keys stay clean. A native Pohoda backup (not dataPack XML) is refused with a warning — never parsed.
// Money is bigint minor units (haléř). Amounts and VAT summaries are read from the source but re-checked by
// a later reconcile WP; here they are carried through with needs_review flagged when a header field is absent.

import { XMLParser } from "fast-xml-parser"
import type {
  Counterparty,
  GLEntry,
  Invoice,
  InvoiceDirection,
  InvoiceLine,
  IrRecord,
  VatSummaryRow,
} from "@workspace/brain"
import { buildEnvelope } from "./provenance"
import type { ParseContext, ParseResult, ParseWarning } from "./types"
import { decodeUtf8, textOf } from "./text"
import { decimalStringToMinor } from "./tabular"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // removeNSPrefix strips dat:/inv:/typ: prefixes so the mapping keys stay clean. Safe for the fields
  // mapped today (none collide across prefixes); a TRAP if a future field can appear under two prefixes
  // (two distinct elements would then flatten to the same key) — key such a field on its full name.
  removeNSPrefix: true,
  // dataPack XML carries no legitimate DTD entities — disabling internal-entity substitution removes the
  // internal-entity-injection surface.
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
})

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

const text = textOf

/** Parse a decimal string ("1234.56", "1234,56") to bigint minor units. Null when unparseable. */
function toMinor(value: unknown): bigint | null {
  const raw = text(value).trim()
  if (!raw) return null
  const normalized = raw.replace(/\s/g, "").replace(",", ".")
  const negative = normalized.startsWith("-")
  const unsigned = negative ? normalized.slice(1) : normalized
  return decimalStringToMinor(unsigned, negative)
}

function toNumber(value: unknown): number | undefined {
  const raw = text(value).trim().replace(",", ".")
  if (!raw) return undefined
  const num = Number(raw)
  return Number.isFinite(num) ? num : undefined
}

function digitsOnly(value: unknown): string | undefined {
  const digits = text(value).replace(/\D/g, "")
  return digits.length > 0 ? digits : undefined
}

/** Is this dataPack parse actually a native backup masquerading (no dataPack root)? */
function findDataPack(
  doc: Record<string, unknown>,
): Record<string, unknown> | null {
  const dp = doc["dataPack"]
  return dp && typeof dp === "object" ? (dp as Record<string, unknown>) : null
}

function mapCounterparty(identity: unknown): Counterparty | undefined {
  if (!identity || typeof identity !== "object") return undefined
  const node = identity as Record<string, unknown>
  const address = node["address"] as Record<string, unknown> | undefined
  const name = text(address?.["company"] ?? address?.["name"]) || undefined
  const ico = digitsOnly(address?.["ico"])
  const dic = text(address?.["dic"]) || undefined
  if (!name && !ico && !dic) return undefined
  return {
    name: name ?? "",
    ...(ico ? { ico } : {}),
    ...(dic ? { dic, is_vat_payer: true } : {}),
  }
}

function mapLines(detail: unknown): InvoiceLine[] {
  const items = asArray(
    (detail as Record<string, unknown> | undefined)?.["invoiceItem"] as unknown,
  )
  return items.map((item) => {
    const node = item as Record<string, unknown>
    const line: InvoiceLine = {
      description: text(node["text"]),
    }
    const quantity = toNumber(node["quantity"])
    if (quantity !== undefined) line.quantity = quantity
    const unit = text(node["unit"]) || undefined
    if (unit) line.unit = unit
    const unitPrice = toMinor(node["unitPrice"])
    if (unitPrice !== null) line.unit_price_minor = unitPrice
    const rate = vatRateFromCode(text(node["rateVAT"]))
    if (rate !== undefined) line.vat_rate = rate
    return line
  })
}

/** Pohoda encodes VAT rate as a code (high/low/third/none) rather than a percentage. */
function vatRateFromCode(code: string): number | undefined {
  switch (code.toLowerCase()) {
    case "high":
      return 21
    case "low":
      return 12
    case "third":
      return 0
    case "none":
      return 0
    default:
      return undefined
  }
}

function mapVatSummary(summary: unknown): VatSummaryRow[] {
  const node = summary as Record<string, unknown> | undefined
  if (!node) return []
  const rows: VatSummaryRow[] = []
  const homeCurrency = node["homeCurrency"] as
    | Record<string, unknown>
    | undefined
  if (!homeCurrency) return rows
  const buckets: { key: string; rate: number }[] = [
    { key: "high", rate: 21 },
    { key: "low", rate: 12 },
    { key: "third", rate: 0 },
  ]
  for (const bucket of buckets) {
    const base = toMinor(
      homeCurrency[`priceBase${cap(bucket.key)}`] ??
        homeCurrency[`price${cap(bucket.key)}`],
    )
    const tax = toMinor(homeCurrency[`priceVAT${cap(bucket.key)}`])
    if (base === null && tax === null) continue
    rows.push({
      rate: bucket.rate,
      base_minor: base ?? 0n,
      tax_minor: tax ?? 0n,
    })
  }
  return rows
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * The invoice grand total in home currency (haléř). Pohoda splits the summary into per-VAT-rate buckets;
 * the grand total is the SUM of every bucket present (`priceHighSum` + `priceLowSum` + `price3Sum` = base
 * + VAT of each rate), plus the zero-rate base (`priceNone`) and any rounding (`priceRound` / `round`).
 * Reading only `priceHighSum` understated a mixed-rate invoice and yielded 0 for a low-rate-only invoice —
 * and this value feeds `content_hash`, so it must be the true total. Buckets read from homeCurrency, with a
 * flat fallback for exports that put the sums directly on invoiceSummary.
 */
function invoiceTotalMinor(
  summary: Record<string, unknown> | undefined,
): bigint {
  const homeCurrency = summary?.["homeCurrency"] as
    | Record<string, unknown>
    | undefined
  const from = (key: string): bigint =>
    toMinor(homeCurrency?.[key] ?? summary?.[key]) ?? 0n
  // Rounding is `priceRound` OR `round` depending on schema version — never both — so prefer one, don't add.
  const rounding =
    toMinor(homeCurrency?.["priceRound"] ?? summary?.["priceRound"]) ??
    toMinor(homeCurrency?.["round"] ?? summary?.["round"]) ??
    0n
  return (
    from("priceHighSum") +
    from("priceLowSum") +
    from("price3Sum") +
    from("priceNone") +
    rounding
  )
}

function invoiceDirection(typeCode: string): InvoiceDirection {
  return /issue|vydan/i.test(typeCode) ? "issued" : "received"
}

/** inv:number may be a bare string or a wrapper carrying <typ:numberRequested>. */
function readNumber(value: unknown): string {
  if (value && typeof value === "object" && !("#text" in value)) {
    const node = value as Record<string, unknown>
    return text(node["numberRequested"] ?? node["numberOfDocument"])
  }
  return text(value)
}

function mapInvoice(
  invoice: Record<string, unknown>,
  index: number,
  ctx: ParseContext,
): Invoice {
  const header =
    (invoice["invoiceHeader"] as Record<string, unknown> | undefined) ?? {}
  const summary = invoice["invoiceSummary"] as
    | Record<string, unknown>
    | undefined

  const number = readNumber(header["number"])
  const issueDate = text(header["date"])
  const taxPoint = text(header["dateTax"]) || undefined
  const dueDate = text(header["dateDue"]) || undefined
  const invoiceType = text(header["invoiceType"])
  const direction = invoiceDirection(invoiceType)
  const partner = mapCounterparty(header["partnerIdentity"])

  const lines = mapLines(invoice["invoiceDetail"])
  const vatSummary = mapVatSummary(summary)
  const total = invoiceTotalMinor(summary)

  const inferred = !issueDate || !number

  const envelope = buildEnvelope({
    ctx,
    source: "pohoda_xml",
    withinLocator: `dataPack/invoice[${index}]`,
    rawBytes: JSON.stringify(invoice),
    raw: invoice,
    confidence: inferred ? 0.85 : 1.0,
    needsReview: inferred,
  })

  return {
    ...envelope,
    record_type: "invoice",
    direction,
    doc_type: "invoice",
    number,
    issue_date: issueDate,
    ...(taxPoint ? { tax_point_date: taxPoint } : {}),
    ...(dueDate ? { due_date: dueDate } : {}),
    ...(direction === "received"
      ? { supplier: partner }
      : { customer: partner }),
    currency: text(header["foreignCurrency"]) || "CZK",
    lines,
    vat_summary: vatSummary,
    total_minor: total,
    ...(digitsOnly(header["symVar"])
      ? { variable_symbol: digitsOnly(header["symVar"]) }
      : {}),
    ...(digitsOnly(header["symConst"])
      ? { constant_symbol: digitsOnly(header["symConst"]) }
      : {}),
  }
}

function mapGlEntries(
  invoice: Record<string, unknown>,
  invoiceIndex: number,
  ctx: ParseContext,
): GLEntry[] {
  const header = invoice["invoiceHeader"] as Record<string, unknown> | undefined
  const account = header?.["accounting"] as Record<string, unknown> | undefined
  if (!account) return []
  const ids = text(account["ids"])
  if (!ids) return []
  const summary = invoice["invoiceSummary"] as
    | Record<string, unknown>
    | undefined
  const amount = invoiceTotalMinor(summary)
  const envelope = buildEnvelope({
    ctx,
    source: "pohoda_xml",
    withinLocator: `dataPack/invoice[${invoiceIndex}]/accounting`,
    rawBytes: JSON.stringify(account),
    raw: account,
    confidence: 1.0,
    needsReview: false,
  })
  return [
    {
      ...envelope,
      record_type: "gl_entry",
      date: text(header?.["date"]),
      debit_account: ids,
      credit_account: ids,
      amount_minor: amount,
      description: text(header?.["text"]) || ids,
    },
  ]
}

export function parsePohodaDataPack(
  bytes: Uint8Array,
  ctx: ParseContext,
): ParseResult {
  const warnings: ParseWarning[] = []
  // Strip a leading BOM before parsing — fast-xml-parser can choke on a BOM before the XML declaration.
  const xml = decodeUtf8(bytes)

  let doc: Record<string, unknown>
  try {
    doc = parser.parse(xml) as Record<string, unknown>
  } catch (error) {
    return {
      records: [],
      warnings: [
        {
          path: ctx.sourcePath,
          message: `pohoda xml parse failed: ${error instanceof Error ? error.message : "unknown"}`,
        },
      ],
    }
  }

  const dataPack = findDataPack(doc)
  if (!dataPack) {
    return {
      records: [],
      warnings: [
        {
          path: ctx.sourcePath,
          message: "native Pohoda backup — re-export as dataPack XML",
        },
      ],
    }
  }

  const records: IrRecord[] = []
  const items = asArray(dataPack["dataPackItem"] as unknown)
  items.forEach((item, itemIndex) => {
    const node = item as Record<string, unknown>
    const invoice = node["invoice"] as Record<string, unknown> | undefined
    if (invoice) {
      records.push(mapInvoice(invoice, itemIndex, ctx))
      records.push(...mapGlEntries(invoice, itemIndex, ctx))
    }
  })

  if (records.length === 0) {
    warnings.push({
      path: ctx.sourcePath,
      message: "dataPack contained no invoice items",
    })
  }

  return { records, warnings }
}
