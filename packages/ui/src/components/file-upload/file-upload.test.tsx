import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  FileUploadTrigger,
} from "./file-upload"

function Composed(
  props: React.ComponentProps<typeof FileUpload> & { triggerLabel?: string },
) {
  const { triggerLabel = "Choose files", ...rest } = props
  return (
    <FileUpload {...rest}>
      <FileUploadDropzone>
        <p>Drop files here</p>
        <FileUploadTrigger>{triggerLabel}</FileUploadTrigger>
      </FileUploadDropzone>
      <FileUploadList />
    </FileUpload>
  )
}

describe("FileUpload", () => {
  it("renders dropzone and trigger", () => {
    render(<Composed />)
    expect(screen.getByText("Drop files here")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Choose files" }),
    ).toBeInTheDocument()
  })

  it("accepts files via the hidden input and fires onValueChange", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Composed multiple onValueChange={onValueChange} />)

    const input = document.querySelector("input[type=file]") as HTMLInputElement
    expect(input).toBeInTheDocument()

    const file = new File(["hello"], "hello.txt", { type: "text/plain" })
    await user.upload(input, file)

    expect(onValueChange).toHaveBeenCalled()
    expect(screen.getByText("hello.txt")).toBeInTheDocument()
  })

  it("rejects files over maxSize", async () => {
    const user = userEvent.setup()
    const onFileReject = vi.fn()
    render(<Composed maxSize={4} onFileReject={onFileReject} />)

    const input = document.querySelector("input[type=file]") as HTMLInputElement
    const big = new File(["abcdefghij"], "big.txt", { type: "text/plain" })
    Object.defineProperty(big, "size", { value: 10 })
    await user.upload(input, big)

    expect(onFileReject).toHaveBeenCalledWith(big, "File too large")
  })
})
