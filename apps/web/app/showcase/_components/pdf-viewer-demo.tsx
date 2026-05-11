"use client"

import * as React from "react"
import dynamic from "next/dynamic"

import { Button } from "@workspace/ui/components/button"

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
  const [fileUrl, setFileUrl] = React.useState<string>(SAMPLE_PDF_URL)
  const objectUrlRef = React.useRef<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
    }
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    setFileUrl(url)
  }

  const handleReset = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    if (inputRef.current) {
      inputRef.current.value = ""
    }
    setFileUrl(SAMPLE_PDF_URL)
  }

  return (
    <div className="flex h-[560px] w-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={handleFileChange}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          Upload PDF
        </Button>
        <Button variant="ghost" onClick={handleReset}>
          Reset
        </Button>
      </div>
      <div className="h-[500px] w-full">
        <PdfViewer file={fileUrl} className="h-full" />
      </div>
    </div>
  )
}
