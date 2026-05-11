"use client"

import { PDFDocument } from "pdf-lib"
import { pdfjs } from "react-pdf"

let workerConfigured = false

/**
 * Configure the pdfjs worker. Safe to call multiple times. Guarded against SSR.
 * Module-level code never touches the worker; callers run only at runtime in the
 * browser, so the first call lazily configures the worker URL.
 */
export function ensurePdfWorker(): void {
  if (workerConfigured) return
  if (typeof window === "undefined") return
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  }
  workerConfigured = true
}

export interface PdfPageInfo {
  pageNumber: number
  width: number
  height: number
  rotation: number
}

export interface PdfDocumentInfo {
  numPages: number
  title?: string
  author?: string
  subject?: string
  keywords?: string
  creator?: string
  producer?: string
  creationDate?: Date
  modificationDate?: Date
}

/**
 * Fetch a PDF from a URL and convert it to a File object.
 */
export async function fetchPdfAsFile(
  url: string,
  filename?: string,
): Promise<File> {
  const parsed = new URL(url)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Unsupported URL scheme: ${parsed.protocol}`)
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch PDF: ${response.status} ${response.statusText}`,
    )
  }
  const blob = await response.blob()
  const finalFilename =
    filename || url.split("/").pop()?.split("?")[0] || "document.pdf"
  return new File([blob], finalFilename, { type: "application/pdf" })
}

async function loadPdfLibDocument(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  return await PDFDocument.load(arrayBuffer)
}

async function loadPdfJsDocument(file: File) {
  ensurePdfWorker()
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument(arrayBuffer)
  return await loadingTask.promise
}

/**
 * Get information about a PDF document (metadata + page count).
 */
export async function getPdfInfo(file: File): Promise<PdfDocumentInfo> {
  const pdfDoc = await loadPdfLibDocument(file)
  const info: PdfDocumentInfo = { numPages: pdfDoc.getPageCount() }
  const title = pdfDoc.getTitle()
  if (title) info.title = title
  const author = pdfDoc.getAuthor()
  if (author) info.author = author
  const subject = pdfDoc.getSubject()
  if (subject) info.subject = subject
  const keywords = pdfDoc.getKeywords()
  if (keywords) info.keywords = keywords
  const creator = pdfDoc.getCreator()
  if (creator) info.creator = creator
  const producer = pdfDoc.getProducer()
  if (producer) info.producer = producer
  const creationDate = pdfDoc.getCreationDate()
  if (creationDate) info.creationDate = creationDate
  const modificationDate = pdfDoc.getModificationDate()
  if (modificationDate) info.modificationDate = modificationDate
  return info
}

/**
 * Get dimensions and rotation for a specific page.
 */
export async function getPageInfo(
  file: File,
  pageNumber: number,
): Promise<PdfPageInfo> {
  const pdfDoc = await loadPdfLibDocument(file)
  const pageCount = pdfDoc.getPageCount()
  if (pageNumber < 1 || pageNumber > pageCount) {
    throw new Error(
      `Page number ${pageNumber} is out of range (1-${pageCount})`,
    )
  }
  const page = pdfDoc.getPage(pageNumber - 1)
  const { width, height } = page.getSize()
  const rotation = page.getRotation().angle
  return { pageNumber, width, height, rotation }
}

/**
 * Extract a single page as a new PDF blob.
 */
export async function extractPage(
  file: File,
  pageNumber: number,
): Promise<Blob> {
  const pdfDoc = await loadPdfLibDocument(file)
  const pageCount = pdfDoc.getPageCount()
  if (pageNumber < 1 || pageNumber > pageCount) {
    throw new Error(
      `Page number ${pageNumber} is out of range (1-${pageCount})`,
    )
  }
  const newPdf = await PDFDocument.create()
  const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageNumber - 1])
  if (!copiedPage) {
    throw new Error(`Failed to copy page ${pageNumber}`)
  }
  newPdf.addPage(copiedPage)
  const pdfBytes = await newPdf.save()
  return new Blob([pdfBytes.slice().buffer], { type: "application/pdf" })
}

/**
 * Extract a range of pages as a new PDF blob.
 */
export async function extractPageRange(
  file: File,
  startPage: number,
  endPage: number,
): Promise<Blob> {
  const pdfDoc = await loadPdfLibDocument(file)
  const pageCount = pdfDoc.getPageCount()
  if (startPage < 1 || endPage > pageCount || startPage > endPage) {
    throw new Error(
      `Invalid page range ${startPage}-${endPage} (document has ${pageCount} pages)`,
    )
  }
  const newPdf = await PDFDocument.create()
  const pageIndices = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage - 1 + i,
  )
  const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices)
  for (const page of copiedPages) {
    newPdf.addPage(page)
  }
  const pdfBytes = await newPdf.save()
  return new Blob([pdfBytes.slice().buffer], { type: "application/pdf" })
}

interface PdfJsTextItem {
  str: string
}

/**
 * Extract the text content of a single page.
 */
export async function getPageText(
  file: File,
  pageNumber: number,
): Promise<string> {
  const pdf = await loadPdfJsDocument(file)
  if (pageNumber < 1 || pageNumber > pdf.numPages) {
    throw new Error(
      `Page number ${pageNumber} is out of range (1-${pdf.numPages})`,
    )
  }
  const page = await pdf.getPage(pageNumber)
  const textContent = await page.getTextContent()
  return (textContent.items as PdfJsTextItem[])
    .map((item) => item.str)
    .join(" ")
}

/**
 * Search for text across all pages. Returns page numbers where it appears.
 */
export async function searchText(
  file: File,
  searchText: string,
  caseSensitive = false,
): Promise<number[]> {
  const pdf = await loadPdfJsDocument(file)
  const foundPages: number[] = []
  const normalizedSearch = caseSensitive ? searchText : searchText.toLowerCase()
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    const pageText = (textContent.items as PdfJsTextItem[])
      .map((item) => item.str)
      .join(" ")
    const normalizedPageText = caseSensitive ? pageText : pageText.toLowerCase()
    if (normalizedPageText.includes(normalizedSearch)) {
      foundPages.push(pageNum)
    }
  }
  return foundPages
}

/**
 * Render a PDF page as a base64-encoded PNG.
 * Requires a browser environment with Canvas API.
 */
export async function screenshotPage(
  file: File,
  pageNumber: number,
  scale = 2,
): Promise<string> {
  if (typeof document === "undefined") {
    throw new Error(
      "screenshotPage requires a browser environment with Canvas API.",
    )
  }
  const pdf = await loadPdfJsDocument(file)
  if (pageNumber < 1 || pageNumber > pdf.numPages) {
    throw new Error(
      `Page number ${pageNumber} is out of range (1-${pdf.numPages})`,
    )
  }
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Could not get canvas context")
  }
  canvas.height = viewport.height
  canvas.width = viewport.width
  const renderContext = {
    canvasContext: context,
    viewport,
  } as Parameters<typeof page.render>[0]
  await page.render(renderContext).promise
  return canvas.toDataURL("image/png")
}

/**
 * Render every page as a base64-encoded PNG thumbnail.
 */
export async function getAllPageThumbnails(
  file: File,
  scale = 0.5,
): Promise<string[]> {
  const info = await getPdfInfo(file)
  const thumbnails: string[] = []
  for (let i = 1; i <= info.numPages; i++) {
    const thumbnail = await screenshotPage(file, i, scale)
    thumbnails.push(thumbnail)
  }
  return thumbnails
}

export type {
  PDFDocumentProxy,
  PDFPageProxy,
  TextContent,
} from "pdfjs-dist/types/src/display/api"
