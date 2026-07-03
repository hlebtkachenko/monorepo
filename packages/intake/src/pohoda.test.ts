import { describe, expect, it } from "vitest"
import { strToU8 } from "fflate"
import { parsePohodaDataPack } from "./pohoda"
import type { ParseContext } from "./types"
import { isGLEntry, isInvoice } from "@workspace/brain"

const ctx: ParseContext = {
  orgRef: "org-1",
  sourcePath: "dump/export.xml",
  ingestedAt: "2026-07-01T00:00:00.000Z",
}

const dataPack = `<?xml version="1.0" encoding="Windows-1250"?>
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
              xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"
              xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">
  <dat:dataPackItem>
    <inv:invoice>
      <inv:invoiceHeader>
        <inv:invoiceType>issuedInvoice</inv:invoiceType>
        <inv:number><typ:numberRequested>2025-0001</typ:numberRequested></inv:number>
        <inv:date>2025-01-15</inv:date>
        <inv:dateTax>2025-01-15</inv:dateTax>
        <inv:dateDue>2025-01-29</inv:dateDue>
        <inv:symVar>2025001</inv:symVar>
        <inv:text>Consulting services</inv:text>
        <inv:partnerIdentity>
          <typ:address>
            <typ:company>ACME s.r.o.</typ:company>
            <typ:ico>12345678</typ:ico>
            <typ:dic>CZ12345678</typ:dic>
          </typ:address>
        </inv:partnerIdentity>
        <inv:accounting><typ:ids>3Fv</typ:ids></inv:accounting>
      </inv:invoiceHeader>
      <inv:invoiceDetail>
        <inv:invoiceItem>
          <inv:text>Advisory hours</inv:text>
          <inv:quantity>10</inv:quantity>
          <inv:unit>hod</inv:unit>
          <inv:rateVAT>high</inv:rateVAT>
          <inv:unitPrice>1000.00</inv:unitPrice>
        </inv:invoiceItem>
      </inv:invoiceDetail>
      <inv:invoiceSummary>
        <inv:homeCurrency>
          <typ:priceHigh>10000.00</typ:priceHigh>
          <typ:priceVATHigh>2100.00</typ:priceVATHigh>
          <typ:priceHighSum>12100.00</typ:priceHighSum>
        </inv:homeCurrency>
      </inv:invoiceSummary>
    </inv:invoice>
  </dat:dataPackItem>
</dat:dataPack>`

describe("parsePohodaDataPack", () => {
  it("maps an inv:invoice to an Invoice record with header, lines, VAT summary and total", () => {
    const { records, warnings } = parsePohodaDataPack(strToU8(dataPack), ctx)
    expect(warnings).toHaveLength(0)

    const invoices = records.filter(isInvoice)
    expect(invoices).toHaveLength(1)
    const invoice = invoices[0]!
    expect(invoice.direction).toBe("issued")
    expect(invoice.number).toBe("2025-0001")
    expect(invoice.issue_date).toBe("2025-01-15")
    expect(invoice.tax_point_date).toBe("2025-01-15")
    expect(invoice.due_date).toBe("2025-01-29")
    expect(invoice.variable_symbol).toBe("2025001")
    expect(invoice.customer?.name).toBe("ACME s.r.o.")
    expect(invoice.customer?.ico).toBe("12345678")
    expect(invoice.customer?.dic).toBe("CZ12345678")
    expect(invoice.customer?.is_vat_payer).toBe(true)
    expect(invoice.lines).toHaveLength(1)
    expect(invoice.lines[0]?.description).toBe("Advisory hours")
    expect(invoice.lines[0]?.quantity).toBe(10)
    expect(invoice.lines[0]?.vat_rate).toBe(21)
    expect(invoice.lines[0]?.unit_price_minor).toBe(100000n)
    expect(invoice.vat_summary).toEqual([
      { rate: 21, base_minor: 1000000n, tax_minor: 210000n },
    ])
    expect(invoice.total_minor).toBe(1210000n)
    expect(invoice.source).toBe("pohoda_xml")
    expect(invoice.confidence).toBe(1)
    expect(invoice.needs_review).toBe(false)
    expect(invoice.source_locator).toBe("dump/export.xml#dataPack/invoice[0]")
  })

  it("maps inv:accounting to a GLEntry (import/reconcile-only)", () => {
    const { records } = parsePohodaDataPack(strToU8(dataPack), ctx)
    const glEntries = records.filter(isGLEntry)
    expect(glEntries).toHaveLength(1)
    const gl = glEntries[0]!
    expect(gl.debit_account).toBe("3Fv")
    expect(gl.amount_minor).toBe(1210000n)
    expect(gl.date).toBe("2025-01-15")
    expect(gl.source).toBe("pohoda_xml")
  })

  it("sums all VAT buckets for a mixed 21% + 12% invoice (not just the high-rate bucket)", () => {
    const mixed = `<?xml version="1.0" encoding="UTF-8"?>
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
              xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"
              xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">
  <dat:dataPackItem>
    <inv:invoice>
      <inv:invoiceHeader>
        <inv:invoiceType>issuedInvoice</inv:invoiceType>
        <inv:number><typ:numberRequested>2025-0002</typ:numberRequested></inv:number>
        <inv:date>2025-02-10</inv:date>
      </inv:invoiceHeader>
      <inv:invoiceSummary>
        <inv:homeCurrency>
          <typ:priceHigh>10000.00</typ:priceHigh>
          <typ:priceVATHigh>2100.00</typ:priceVATHigh>
          <typ:priceHighSum>12100.00</typ:priceHighSum>
          <typ:priceLow>5000.00</typ:priceLow>
          <typ:priceVATLow>600.00</typ:priceVATLow>
          <typ:priceLowSum>5600.00</typ:priceLowSum>
        </inv:homeCurrency>
      </inv:invoiceSummary>
    </inv:invoice>
  </dat:dataPackItem>
</dat:dataPack>`
    const { records } = parsePohodaDataPack(strToU8(mixed), ctx)
    const invoice = records.filter(isInvoice)[0]!
    // 12 100 (21% bucket) + 5 600 (12% bucket) = 17 700 Kč → 1 770 000 haléř.
    expect(invoice.total_minor).toBe(1770000n)
  })

  it("totals a low-rate-ONLY invoice correctly (was 0n when reading only priceHighSum)", () => {
    const lowOnly = `<?xml version="1.0" encoding="UTF-8"?>
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
              xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"
              xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">
  <dat:dataPackItem>
    <inv:invoice>
      <inv:invoiceHeader>
        <inv:invoiceType>issuedInvoice</inv:invoiceType>
        <inv:number><typ:numberRequested>2025-0003</typ:numberRequested></inv:number>
        <inv:date>2025-03-10</inv:date>
      </inv:invoiceHeader>
      <inv:invoiceSummary>
        <inv:homeCurrency>
          <typ:priceLow>5000.00</typ:priceLow>
          <typ:priceVATLow>600.00</typ:priceVATLow>
          <typ:priceLowSum>5600.00</typ:priceLowSum>
        </inv:homeCurrency>
      </inv:invoiceSummary>
    </inv:invoice>
  </dat:dataPackItem>
</dat:dataPack>`
    const { records } = parsePohodaDataPack(strToU8(lowOnly), ctx)
    const invoice = records.filter(isInvoice)[0]!
    // 5 600 Kč → 560 000 haléř. Reading only priceHighSum used to yield 0n.
    expect(invoice.total_minor).toBe(560000n)
  })

  it("refuses a native Pohoda backup (no dataPack root) with a re-export warning", () => {
    const notDataPack = strToU8(
      '<?xml version="1.0"?><someBackup><table name="AD"/></someBackup>',
    )
    const { records, warnings } = parsePohodaDataPack(notDataPack, ctx)
    expect(records).toHaveLength(0)
    expect(
      warnings.some((w) => /re-export as dataPack XML/.test(w.message)),
    ).toBe(true)
  })
})
