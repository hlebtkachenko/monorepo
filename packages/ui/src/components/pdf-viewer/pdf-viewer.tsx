"use client"

import * as React from "react"
import { Document, Page } from "react-pdf"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { ensurePdfWorker } from "@workspace/ui/lib/pdf-utils"
import { cn } from "@workspace/ui/lib/utils"

import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

type ViewMode = "single" | "scroll" | "book"

interface PdfViewerProps {
  /** URL to the PDF file or File object. */
  file: string | File
  /** Initial viewing mode. */
  mode?: ViewMode
  /** Initial zoom level (0.5 to 2.0). */
  initialZoom?: number
  /** Custom className. */
  className?: string
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.25

function PdfViewer({
  file,
  mode = "single",
  initialZoom = 1.0,
  className,
}: PdfViewerProps) {
  const [numPages, setNumPages] = React.useState<number>(0)
  const [currentPage, setCurrentPage] = React.useState<number>(1)
  const [viewMode, setViewMode] = React.useState<ViewMode>(mode)
  const [zoom, setZoom] = React.useState<number>(initialZoom)
  const [pageWidth, setPageWidth] = React.useState<number>(0)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    ensurePdfWorker()
  }, [])

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
    setCurrentPage(1)
  }

  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const containerWidth = el.clientWidth
      const baseWidth =
        viewMode === "book" ? containerWidth / 2 - 40 : containerWidth - 40
      setPageWidth(Math.max(baseWidth * zoom, 0))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [viewMode, zoom])

  const goToPreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - (viewMode === "book" ? 2 : 1), 1))
  }

  const goToNextPage = () => {
    setCurrentPage((prev) =>
      Math.min(
        prev + (viewMode === "book" ? 2 : 1),
        viewMode === "book" ? numPages - 1 : numPages,
      ),
    )
  }

  const handleZoomIn = () =>
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM))
  const handleZoomOut = () =>
    setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM))
  const handleFitWidth = () => setZoom(1.0)

  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const page = Number.parseInt(e.target.value, 10)
    if (!Number.isNaN(page) && page >= 1 && page <= numPages) {
      setCurrentPage(page)
    }
  }

  const showCoverAlone = viewMode === "book" && currentPage === 1
  const bookSecondPage = showCoverAlone ? null : currentPage + 1

  return (
    <div
      data-slot="pdf-viewer"
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-background",
        className,
      )}
    >
      <div
        data-slot="pdf-viewer-toolbar"
        className="flex items-center justify-between gap-4 border-b border-border bg-muted/50 p-3"
      >
        <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
          <Button
            type="button"
            variant={viewMode === "single" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("single")}
            data-slot="pdf-viewer-mode-single"
          >
            Single
          </Button>
          <Button
            type="button"
            variant={viewMode === "scroll" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("scroll")}
            data-slot="pdf-viewer-mode-scroll"
          >
            Scroll
          </Button>
          <Button
            type="button"
            variant={viewMode === "book" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("book")}
            data-slot="pdf-viewer-mode-book"
          >
            Book
          </Button>
        </div>

        {viewMode !== "scroll" && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goToPreviousPage}
              disabled={currentPage <= 1}
              aria-label="Previous page"
              data-slot="pdf-viewer-prev"
            >
              Previous
            </Button>
            <div className="flex items-center gap-1 text-sm">
              <Input
                type="number"
                min={1}
                max={numPages}
                value={currentPage}
                onChange={handlePageInput}
                aria-label="Current page"
                className="w-16 text-center"
                data-slot="pdf-viewer-page-input"
              />
              <span className="text-muted-foreground">/ {numPages}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage >= numPages}
              aria-label="Next page"
              data-slot="pdf-viewer-next"
            >
              Next
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            data-slot="pdf-viewer-zoom-out"
          >
            −
          </Button>
          <span className="min-w-12 text-center text-sm text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            data-slot="pdf-viewer-zoom-in"
          >
            +
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFitWidth}
            aria-label="Fit width"
            data-slot="pdf-viewer-fit"
          >
            Fit
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        data-slot="pdf-viewer-canvas"
        role="region"
        aria-label="PDF document"
        tabIndex={0}
        className={cn(
          "flex-1 overflow-auto bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          viewMode === "scroll" && "p-4",
          viewMode !== "scroll" && "flex items-start justify-center p-4",
        )}
      >
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center p-8">
              <div className="text-sm text-muted-foreground">
                Loading PDF...
              </div>
            </div>
          }
          error={
            <div className="flex items-center justify-center p-8">
              <div className="text-sm text-destructive">
                Failed to load PDF. Please check the file or URL.
              </div>
            </div>
          }
          className={cn(
            viewMode === "scroll" && "space-y-4",
            viewMode === "book" && "flex gap-4",
          )}
        >
          {viewMode === "scroll" && (
            <>
              {Array.from(new Array(numPages), (_, index) => (
                <div
                  key={`page_${index + 1}`}
                  className="flex justify-center"
                  data-slot="pdf-viewer-page"
                  data-page-number={index + 1}
                >
                  <Page
                    pageNumber={index + 1}
                    width={pageWidth || undefined}
                    className="shadow-lg ring-1 ring-border"
                    loading={
                      <div className="h-[800px] w-full animate-pulse rounded-md bg-background" />
                    }
                  />
                </div>
              ))}
            </>
          )}

          {viewMode === "single" && (
            <div
              className="flex justify-center"
              data-slot="pdf-viewer-page"
              data-page-number={currentPage}
            >
              <Page
                pageNumber={currentPage}
                width={pageWidth || undefined}
                className="shadow-lg ring-1 ring-border"
                loading={
                  <div className="h-[800px] w-full animate-pulse rounded-md bg-background" />
                }
              />
            </div>
          )}

          {viewMode === "book" && (
            <>
              <div
                className="flex justify-end"
                data-slot="pdf-viewer-page"
                data-page-number={currentPage}
              >
                <Page
                  pageNumber={currentPage}
                  width={pageWidth || undefined}
                  className="shadow-lg ring-1 ring-border"
                  loading={
                    <div className="h-[800px] w-full animate-pulse rounded-md bg-background" />
                  }
                />
              </div>
              {!showCoverAlone &&
                bookSecondPage &&
                bookSecondPage <= numPages && (
                  <div
                    className="flex justify-start"
                    data-slot="pdf-viewer-page"
                    data-page-number={bookSecondPage}
                  >
                    <Page
                      pageNumber={bookSecondPage}
                      width={pageWidth || undefined}
                      className="shadow-lg ring-1 ring-border"
                      loading={
                        <div className="h-[800px] w-full animate-pulse rounded-md bg-background" />
                      }
                    />
                  </div>
                )}
            </>
          )}
        </Document>
      </div>
    </div>
  )
}

export { PdfViewer }
export type { PdfViewerProps, ViewMode }
