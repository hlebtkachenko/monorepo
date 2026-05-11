import type { Meta, StoryObj } from "@storybook/react"
import { PdfViewer } from "./pdf-viewer"

// Minimal valid 1-page PDF (renders as a blank page). Used so stories
// don't depend on a network or local file fixture.
const TINY_PDF_BASE64 =
  "JVBERi0xLjQKJeLjz9MKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAyMDAgMjAwXS9SZXNvdXJjZXM8PD4+L0NvbnRlbnRzIDQgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwvTGVuZ3RoIDQ0Pj5zdHJlYW0KQlQgL0YxIDI0IFRmIDEwIDEwMCBUZCAoSGVsbG8gUERGKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDIzNCAwMDAwMCBuIAowMDAwMDAwMTgxIDAwMDAwIG4gCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA5MyAwMDAwMCBuIAp0cmFpbGVyCjw8L1NpemUgNS9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjI3OQolJUVPRgo="

const samplePdf = `data:application/pdf;base64,${TINY_PDF_BASE64}`

const meta: Meta<typeof PdfViewer> = {
  title: "Components/PdfViewer",
  component: PdfViewer,
  parameters: { layout: "padded" },
}
export default meta
type Story = StoryObj<typeof PdfViewer>

export const SinglePage: Story = {
  args: { file: samplePdf, mode: "single", className: "h-[600px]" },
}

export const Continuous: Story = {
  args: { file: samplePdf, mode: "scroll", className: "h-[600px]" },
}

export const Book: Story = {
  args: { file: samplePdf, mode: "book", className: "h-[600px]" },
}

export const ZoomedIn: Story = {
  args: {
    file: samplePdf,
    mode: "single",
    initialZoom: 1.5,
    className: "h-[600px]",
  },
}
