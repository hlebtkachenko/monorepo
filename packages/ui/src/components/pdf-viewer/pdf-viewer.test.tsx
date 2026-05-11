import { describe, expect, it, vi } from "vitest"
import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("react-pdf/dist/Page/AnnotationLayer.css", () => ({}))
vi.mock("react-pdf/dist/Page/TextLayer.css", () => ({}))

let capturedOnLoadSuccess: ((info: { numPages: number }) => void) | undefined

vi.mock("react-pdf", () => {
  return {
    pdfjs: {
      version: "test",
      GlobalWorkerOptions: { workerSrc: "" },
    },
    Document: ({
      children,
      onLoadSuccess,
    }: {
      children?: React.ReactNode
      onLoadSuccess?: (info: { numPages: number }) => void
    }) => {
      capturedOnLoadSuccess = onLoadSuccess
      return <div data-testid="stub-document">{children}</div>
    },
    Page: ({ pageNumber }: { pageNumber: number }) => (
      <div data-testid={`stub-page-${pageNumber}`}>Page {pageNumber}</div>
    ),
  }
})

import { PdfViewer } from "./pdf-viewer"

describe("PdfViewer", () => {
  it("renders the toolbar with mode switcher and zoom controls", () => {
    render(<PdfViewer file="sample.pdf" />)
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Fit width" }),
    ).toBeInTheDocument()
  })

  it("navigates pages after the document reports its page count", async () => {
    const user = userEvent.setup()
    render(<PdfViewer file="sample.pdf" mode="single" />)

    act(() => {
      capturedOnLoadSuccess?.({ numPages: 5 })
    })

    const pageInput = screen.getByLabelText("Current page") as HTMLInputElement
    expect(pageInput.value).toBe("1")

    await user.click(screen.getByRole("button", { name: "Next page" }))
    expect(
      (screen.getByLabelText("Current page") as HTMLInputElement).value,
    ).toBe("2")

    await user.click(screen.getByRole("button", { name: "Previous page" }))
    expect(
      (screen.getByLabelText("Current page") as HTMLInputElement).value,
    ).toBe("1")
  })
})
