import type { HeadResult } from "./document-store"

/** Maximum original upload size: 50 MiB. */
export const DOCUMENT_MAX_BYTES = 50 * 1024 * 1024
export const DOCUMENT_UPLOAD_TTL_SECONDS = 300
export const DOCUMENT_PREVIEW_TTL_SECONDS = 900
export const DOCUMENT_HEADER_BYTES = 4096

export type DocumentUploadKind = "pdf" | "png" | "jpeg" | "xlsx" | "csv" | "xml"

export type DocumentUploadContentType =
  | "application/pdf"
  | "image/png"
  | "image/jpeg"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  | "text/csv"
  | "application/xml"
  | "text/xml"
  | "text/isdoc"

export type DocumentUploadExtension =
  "pdf" | "png" | "jpg" | "jpeg" | "xlsx" | "csv" | "xml" | "isdoc"

export type DocumentHeaderValidationMethod = "signature" | "heuristic"

export interface DocumentUploadType {
  kind: DocumentUploadKind
  contentType: DocumentUploadContentType
  extension: DocumentUploadExtension
  headerValidation: DocumentHeaderValidationMethod
}

export interface ParsedDocumentKey {
  workspaceId: string
  sha256: string
  extension: string
}

export interface DocumentHeaderValidation {
  valid: boolean
  method: DocumentHeaderValidationMethod
  reason?: string
}

export type DocumentConfirmationValidation =
  | {
      valid: true
      key: ParsedDocumentKey
      uploadType: DocumentUploadType
    }
  | {
      valid: false
      reason: string
    }

interface UploadTypeDefinition {
  kind: DocumentUploadKind
  contentTypes: readonly DocumentUploadContentType[]
  extensions: readonly DocumentUploadExtension[]
  headerValidation: DocumentHeaderValidationMethod
}

const UPLOAD_TYPE_DEFINITIONS: readonly UploadTypeDefinition[] = [
  {
    kind: "pdf",
    contentTypes: ["application/pdf"],
    extensions: ["pdf"],
    headerValidation: "signature",
  },
  {
    kind: "png",
    contentTypes: ["image/png"],
    extensions: ["png"],
    headerValidation: "signature",
  },
  {
    kind: "jpeg",
    contentTypes: ["image/jpeg"],
    extensions: ["jpg", "jpeg"],
    headerValidation: "signature",
  },
  {
    kind: "xlsx",
    contentTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    extensions: ["xlsx"],
    headerValidation: "signature",
  },
  {
    kind: "csv",
    contentTypes: ["text/csv"],
    extensions: ["csv"],
    headerValidation: "heuristic",
  },
  {
    kind: "xml",
    contentTypes: ["application/xml", "text/xml"],
    extensions: ["xml", "isdoc"],
    headerValidation: "heuristic",
  },
  {
    kind: "xml",
    contentTypes: ["text/isdoc"],
    extensions: ["isdoc"],
    headerValidation: "heuristic",
  },
]

const DOCUMENT_KEY_PATTERN =
  /^documents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{64})\.([a-z0-9]+)$/

function normalizedContentType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
}

function extensionFrom(filenameOrExt: string): string {
  const basename = filenameOrExt.trim().split(/[\\/]/).at(-1) ?? ""
  const dot = basename.lastIndexOf(".")
  const extension = (
    dot >= 0 ? basename.slice(dot + 1) : basename
  ).toLowerCase()
  return /^[a-z0-9]+$/.test(extension) ? extension : ""
}

export function parseDocumentKey(key: string): ParsedDocumentKey | null {
  const match = DOCUMENT_KEY_PATTERN.exec(key)
  if (!match) return null

  const [, workspaceId, sha256, extension] = match
  if (!workspaceId || !sha256 || !extension) return null
  return { workspaceId, sha256, extension }
}

/** Resolves only supported browser-upload MIME and extension pairs. */
export function documentUploadType(
  contentType: string,
  filenameOrExt: string,
): DocumentUploadType | null {
  const normalizedType = normalizedContentType(contentType)
  const extension = extensionFrom(filenameOrExt)

  for (const definition of UPLOAD_TYPE_DEFINITIONS) {
    if (
      definition.contentTypes.includes(
        normalizedType as DocumentUploadContentType,
      ) &&
      definition.extensions.includes(extension as DocumentUploadExtension)
    ) {
      return {
        kind: definition.kind,
        contentType: normalizedType as DocumentUploadContentType,
        extension: extension as DocumentUploadExtension,
        headerValidation: definition.headerValidation,
      }
    }
  }
  return null
}

function hasPrefix(bytes: Uint8Array, expected: readonly number[]): boolean {
  if (bytes.byteLength < expected.length) return false
  return expected.every((value, index) => bytes[index] === value)
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes, {
      stream: true,
    })
  } catch {
    return null
  }
}

function containsBinaryControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (
      code === 0 ||
      (code >= 1 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31)
    ) {
      return true
    }
  }
  return false
}

function validateCsv(bytes: Uint8Array): DocumentHeaderValidation {
  const text = decodeUtf8(bytes)
  if (text === null) {
    return {
      valid: false,
      method: "heuristic",
      reason: "CSV prefix is not valid UTF-8",
    }
  }
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  if (withoutBom.length === 0 || containsBinaryControlCharacter(withoutBom)) {
    return {
      valid: false,
      method: "heuristic",
      reason: "CSV prefix is empty or contains binary control bytes",
    }
  }
  if (!/[,;\t]/.test(withoutBom)) {
    return {
      valid: false,
      method: "heuristic",
      reason: "CSV prefix has no comma, semicolon, or tab delimiter",
    }
  }
  return { valid: true, method: "heuristic" }
}

function validateXml(bytes: Uint8Array): DocumentHeaderValidation {
  const text = decodeUtf8(bytes)
  if (text === null) {
    return {
      valid: false,
      method: "heuristic",
      reason: "XML prefix is not valid UTF-8",
    }
  }
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  if (!withoutBom.trimStart().startsWith("<")) {
    return {
      valid: false,
      method: "heuristic",
      reason: "XML prefix does not start with an XML tag",
    }
  }
  return { valid: true, method: "heuristic" }
}

/**
 * Checks only a bounded prefix. PDF, PNG, and JPEG use file signatures. XLSX
 * proves only that the bytes begin like a ZIP container, not that its entries
 * form a workbook. CSV and XML checks are UTF-8 text heuristics. Deep parsing
 * and malware detection remain downstream responsibilities.
 */
export function validateDocumentHeader(
  contentType: string,
  bytes: Uint8Array,
): DocumentHeaderValidation {
  const normalizedType = normalizedContentType(contentType)
  const prefix = bytes.subarray(0, DOCUMENT_HEADER_BYTES)

  switch (normalizedType) {
    case "application/pdf":
      return hasPrefix(prefix, [0x25, 0x50, 0x44, 0x46])
        ? { valid: true, method: "signature" }
        : {
            valid: false,
            method: "signature",
            reason: "PDF signature %PDF is missing",
          }
    case "image/png":
      return hasPrefix(prefix, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        ? { valid: true, method: "signature" }
        : {
            valid: false,
            method: "signature",
            reason: "PNG signature is missing",
          }
    case "image/jpeg":
      return hasPrefix(prefix, [0xff, 0xd8, 0xff])
        ? { valid: true, method: "signature" }
        : {
            valid: false,
            method: "signature",
            reason: "JPEG signature is missing",
          }
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return hasPrefix(prefix, [0x50, 0x4b, 0x03, 0x04])
        ? { valid: true, method: "signature" }
        : {
            valid: false,
            method: "signature",
            reason: "XLSX ZIP container signature is missing",
          }
    case "text/csv":
      return validateCsv(prefix)
    case "application/xml":
    case "text/xml":
    case "text/isdoc":
      return validateXml(prefix)
    default:
      return {
        valid: false,
        method: "heuristic",
        reason: `Unsupported document content type: ${normalizedType || "empty"}`,
      }
  }
}

/** Validates S3-authoritative metadata before either confirm flow persists it. */
export function validateDocumentConfirmation(
  key: string,
  callerWorkspaceId: string,
  head: Pick<HeadResult, "size" | "contentType" | "checksumSha256">,
): DocumentConfirmationValidation {
  const parsed = parseDocumentKey(key)
  if (!parsed) return { valid: false, reason: "Invalid document object key" }
  if (parsed.workspaceId !== callerWorkspaceId) {
    return {
      valid: false,
      reason: "Document object key belongs to a different workspace",
    }
  }

  const uploadType = documentUploadType(head.contentType, parsed.extension)
  if (!uploadType) {
    return {
      valid: false,
      reason: "Stored content type does not match a supported key extension",
    }
  }
  if (!Number.isInteger(head.size) || head.size < 1) {
    return { valid: false, reason: "Stored document size must be positive" }
  }
  if (head.size > DOCUMENT_MAX_BYTES) {
    return {
      valid: false,
      reason: `Stored document exceeds the ${DOCUMENT_MAX_BYTES}-byte limit`,
    }
  }

  const expectedChecksum = Buffer.from(parsed.sha256, "hex").toString("base64")
  if (head.checksumSha256 !== expectedChecksum) {
    return {
      valid: false,
      reason: "Stored document checksum does not match its object key",
    }
  }

  return { valid: true, key: parsed, uploadType }
}
