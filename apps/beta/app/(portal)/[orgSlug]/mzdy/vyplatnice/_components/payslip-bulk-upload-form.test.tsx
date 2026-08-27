/**
 * The bulk-upload form, rendered.
 *
 * `renderToStaticMarkup`, the same technique and the same reasoning
 * `upload-panel.test.tsx` states in full: the initial render is a function of
 * its props, effects do not run, and a string is enough for every assertion
 * here. The ZIP-parsing and per-row upload behaviour lives in event handlers
 * this "pure" (node-environment, no jsdom) suite cannot simulate; the state
 * machine those handlers drive is asserted directly and exhaustively in
 * `../_lib/payslip-upload-queue.test.ts`.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}))

const { PayslipBulkUploadForm } = await import("./payslip-bulk-upload-form")

const EMPLOYEES = [
  { id: "emp-1", fullName: "Jana Nováková" },
  { id: "emp-2", fullName: "Petr Svoboda" },
]

const html = renderToStaticMarkup(
  <NextIntlClientProvider
    locale={BETA_LOCALE}
    timeZone={BETA_TIME_ZONE}
    formats={betaFormats}
    messages={betaMessages as never}
  >
    <PayslipBulkUploadForm
      orgSlug="acme-sro"
      periodId="11111111-1111-1111-1111-111111111111"
      employees={EMPLOYEES}
    />
  </NextIntlClientProvider>,
)

describe("PayslipBulkUploadForm — initial render", () => {
  it("offers a ZIP file picker, and only a ZIP one", () => {
    expect(html).toContain('accept=".zip,application/zip"')
    expect(html).toContain("Vybrat ZIP soubor")
  })

  it("names the upload's purpose", () => {
    expect(html).toContain("Hromadné nahrání výplatnic")
    expect(html).toContain(
      "Ke každému souboru navrhneme zaměstnance podle názvu souboru",
    )
  })

  it("renders no preview table and no submit button before anything is picked", () => {
    expect(html).not.toContain("Kontrola přiřazení")
    expect(html).not.toContain("Nahrát vybrané")
    for (const employee of EMPLOYEES) {
      expect(html).not.toContain(employee.fullName)
    }
  })

  it("renders no error banner before anything is picked", () => {
    expect(html).not.toContain("ZIP archiv")
  })
})
