import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QRCode, QRCodeCanvas, QRCodeImage, QRCodeSkeleton } from "./qr-code"

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,fake"),
    toCanvas: vi.fn().mockResolvedValue(undefined),
    toString: vi.fn().mockResolvedValue("<svg></svg>"),
  },
}))

describe("QRCode", () => {
  it("renders root div with size CSS var", () => {
    render(
      <QRCode value="hello" size={150} data-testid="qr">
        <QRCodeCanvas />
      </QRCode>,
    )
    const root = screen.getByTestId("qr")
    expect(root.style.getPropertyValue("--qr-code-size")).toBe("150px")
  })

  it("renders skeleton while generating", () => {
    render(
      <QRCode value="hi">
        <QRCodeSkeleton data-testid="sk" />
      </QRCode>,
    )
    expect(screen.getByTestId("sk")).toBeInTheDocument()
  })

  it("renders image after generation", async () => {
    render(
      <QRCode value="data">
        <QRCodeImage alt="My QR" />
      </QRCode>,
    )
    await waitFor(() => {
      expect(screen.getByAltText("My QR")).toBeInTheDocument()
    })
  })
})
