"use client"

import * as React from "react"
import dynamic from "next/dynamic"

const PdfViewer = dynamic(
  () =>
    import("@workspace/ui/components/pdf-viewer").then((m) => ({
      default: m.PdfViewer,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Loading PDF viewer…
      </div>
    ),
  },
)

const SAMPLE_PDF_URL = "/sample.pdf"

export function PdfViewerDemo() {
  return (
    <div className="h-[500px] w-full">
      <PdfViewer file={SAMPLE_PDF_URL} className="h-full" />
    </div>
  )
}
