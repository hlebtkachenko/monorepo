import { describe, expect, it, vi } from "vitest"

vi.mock("react-pdf", () => ({
  pdfjs: {
    version: "test",
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: vi.fn(),
  },
}))

vi.mock("pdf-lib", () => ({
  PDFDocument: {
    load: vi.fn(),
    create: vi.fn(),
  },
}))

import { ensurePdfWorker, fetchPdfAsFile } from "./pdf-utils"

describe("pdf-utils", () => {
  it("ensurePdfWorker is idempotent and configures the worker src", async () => {
    const { pdfjs } = await import("react-pdf")
    pdfjs.GlobalWorkerOptions.workerSrc = ""
    ensurePdfWorker()
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toContain("pdf.worker")
    const after = pdfjs.GlobalWorkerOptions.workerSrc
    ensurePdfWorker()
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe(after)
  })

  it("fetchPdfAsFile rejects non-http(s) URLs before fetching", async () => {
    await expect(fetchPdfAsFile("file:///etc/passwd")).rejects.toThrow(
      /Unsupported URL scheme/,
    )
  })
})
