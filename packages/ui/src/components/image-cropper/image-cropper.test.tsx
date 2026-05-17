import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ImageCropper } from "./image-cropper"

// react-easy-crop measures the DOM and binds pointer listeners that jsdom
// does not implement. Stub it with a marker element plus a button that fires
// onCropComplete with a deterministic pixel crop area.
vi.mock("react-easy-crop", () => ({
  __esModule: true,
  default: ({
    image,
    onCropComplete,
  }: {
    image: string
    onCropComplete: (
      area: { x: number; y: number; width: number; height: number },
      areaPixels: { x: number; y: number; width: number; height: number },
    ) => void
  }) => (
    <div data-testid="cropper-stub" data-image={image}>
      <button
        type="button"
        onClick={() =>
          onCropComplete(
            { x: 0, y: 0, width: 100, height: 100 },
            { x: 0, y: 0, width: 200, height: 200 },
          )
        }
      >
        emit-crop
      </button>
    </div>
  ),
}))

function makeFile(): File {
  return new File(["binary"], "avatar.png", { type: "image/png" })
}

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url")
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe("ImageCropper", () => {
  it("renders the dialog with title when open", () => {
    render(
      <ImageCropper
        open
        file={makeFile()}
        onCancel={vi.fn()}
        onCropComplete={vi.fn()}
      />,
    )
    expect(
      screen.getByRole("heading", { name: "Edit avatar" }),
    ).toBeInTheDocument()
  })

  it("does not render the dialog when closed", () => {
    render(
      <ImageCropper
        open={false}
        file={makeFile()}
        onCancel={vi.fn()}
        onCropComplete={vi.fn()}
      />,
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("renders the cropper once a file is provided", () => {
    render(
      <ImageCropper
        open
        file={makeFile()}
        onCancel={vi.fn()}
        onCropComplete={vi.fn()}
      />,
    )
    expect(screen.getByTestId("cropper-stub")).toBeInTheDocument()
  })

  it("shows an empty state when no file is provided", () => {
    render(
      <ImageCropper
        open
        file={null}
        onCancel={vi.fn()}
        onCropComplete={vi.fn()}
      />,
    )
    expect(screen.getByText("No image selected")).toBeInTheDocument()
  })

  it("exposes a zoom slider", () => {
    render(
      <ImageCropper
        open
        file={makeFile()}
        onCancel={vi.fn()}
        onCropComplete={vi.fn()}
      />,
    )
    expect(screen.getByRole("slider")).toBeInTheDocument()
    expect(screen.getByLabelText("Zoom")).toBeInTheDocument()
  })

  it("invokes onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ImageCropper
        open
        file={makeFile()}
        onCancel={onCancel}
        onCropComplete={vi.fn()}
      />,
    )
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("disables Save until a crop area is reported", async () => {
    const user = userEvent.setup()
    render(
      <ImageCropper
        open
        file={makeFile()}
        onCancel={vi.fn()}
        onCropComplete={vi.fn()}
      />,
    )
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "emit-crop" }))
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled()
  })

  it("produces a Blob via onCropComplete when Save is clicked", async () => {
    const user = userEvent.setup()
    const onCropComplete = vi.fn()

    // The component draws to a canvas; jsdom needs a toBlob implementation.
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => {
        callback(new Blob(["cropped"], { type: "image/png" }))
      })
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    // Image load resolves immediately so cropImageToBlob can proceed.
    Object.defineProperty(globalThis.Image.prototype, "src", {
      configurable: true,
      set() {
        this.dispatchEvent(new Event("load"))
      },
    })

    render(
      <ImageCropper
        open
        file={makeFile()}
        onCancel={vi.fn()}
        onCropComplete={onCropComplete}
      />,
    )

    await user.click(screen.getByRole("button", { name: "emit-crop" }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await vi.waitFor(() => {
      expect(onCropComplete).toHaveBeenCalledTimes(1)
    })
    expect(onCropComplete.mock.calls[0]?.[0]).toBeInstanceOf(Blob)

    toBlobSpy.mockRestore()
  })
})
