/**
 * The upload surface, rendered.
 *
 * WHAT IS WORTH ASSERTING ABOUT A FILE INPUT. Three things, and all three are
 * requirements someone wrote down rather than details of this implementation:
 * the CAMERA path of spec §2.2 (`capture="environment"`, which is the single
 * attribute that turns a file picker into a camera on a phone), the MULTI-SELECT
 * gallery path next to it, and the absence of any field the OFFICE owns — a
 * doc_type picker here would quietly move an accounting decision onto the client
 * (spec §3.3).
 *
 * `renderToStaticMarkup`, like `documents-view.test.tsx`: the panel's initial
 * render is a function of its props, effects do not run, and a string is enough
 * for every assertion above. The QUEUE's behaviour — progress, retry,
 * duplicates — is a pure reducer and is asserted directly in
 * `upload-queue.test.ts`, where partial-failure scenarios cost three lines
 * instead of a mocked XHR.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}))

const { UploadPanel } = await import("./upload-panel")

const html = renderToStaticMarkup(
  <NextIntlClientProvider
    locale={BETA_LOCALE}
    timeZone={BETA_TIME_ZONE}
    formats={betaFormats}
    messages={betaMessages as never}
  >
    <UploadPanel orgSlug="acme-sro" />
  </NextIntlClientProvider>,
)

describe("UploadPanel — the entry points of spec §2.2", () => {
  it("offers the camera, and offers it FIRST", () => {
    expect(html).toContain('capture="environment"')
    // `image/*` rather than the full allowlist: iOS hands back whatever the
    // camera produced, and a narrower accept greys the shutter out.
    expect(html).toContain('accept="image/*"')
    expect(html).toContain("Vyfotit doklad")
    expect(html.indexOf("Vyfotit doklad")).toBeLessThan(
      html.indexOf("Vybrat soubory"),
    )
  })

  it("offers a multi-select gallery / file picker", () => {
    expect(html).toContain("multiple")
    expect(html).toContain("Vybrat soubory")
  })

  it("advertises every type the server actually accepts, HEIC included", () => {
    for (const type of [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/heic",
    ]) {
      expect(html).toContain(type)
    }
    // Extensions too: Android and iOS both hand over HEIC with a missing or
    // wrong MIME type often enough that a types-only list greys out the photo.
    expect(html).toContain(".heic")
  })

  it("has a desktop drop zone as well as the phone controls", () => {
    expect(html).toContain("Přetáhněte soubory sem")
  })

  it("names the limits the server will actually enforce", () => {
    expect(html).toContain("PDF, JPEG, PNG nebo HEIC")
    expect(html).toContain("25 MB")
  })

  it("gives both inputs an accessible name", () => {
    expect(html).toContain('aria-label="Vyfotit doklad"')
    expect(html).toContain('aria-label="Vybrat soubory"')
  })
})

describe("UploadPanel — what it must NOT offer", () => {
  it("has no doc_type or stavba field — those are the office's (spec §3.3)", () => {
    expect(html).not.toContain("<select")
    expect(html).not.toContain("docType")
    expect(html).not.toContain("Stavba")
    // The Czech labels of the office-typed fields, none of which belong here.
    for (const label of ["Přijatá faktura", "Datum dokladu", "Částka"]) {
      expect(html).not.toContain(label)
    }
  })

  it("renders no queue rows before anything is picked", () => {
    for (const state of ["Ve frontě", "Nahrává se", "Už nahráno"]) {
      expect(html).not.toContain(state)
    }
    // No "retry everything" button over an empty queue either.
    expect(html).not.toContain("Zkusit vše znovu")
  })

  it("leaks nothing about where the bytes go", () => {
    // A storage key is `org/<uuid>/<uuid>.<ext>`. Matched by shape rather than
    // by the substring `org/`, which every inline `xmlns="http://www.w3.org/…"`
    // in a Lucide icon would trip.
    expect(html).not.toMatch(/org\/[0-9a-f]{8}-/i)
    expect(html).not.toContain("amazonaws")
    expect(html).not.toContain("DOCUMENTS_BUCKET")
  })

  it("renders no disabled control — an affordance is present or absent", () => {
    // Spec §2.0.1 for the guest seat: "upload affordances absent (not
    // disabled)". The PAGE decides whether to render this panel at all; when it
    // does, nothing inside it is greyed out.
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/)
    expect(html).not.toContain("aria-disabled")
  })
})
