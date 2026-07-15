import { describe, expect, it } from "vitest"
import {
  DOCUMENT_HEADER_BYTES,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_PREVIEW_TTL_SECONDS,
  DOCUMENT_UPLOAD_TTL_SECONDS,
  documentUploadType,
  parseDocumentKey,
  validateDocumentConfirmation,
  validateDocumentHeader,
} from "./document-validation"

const WORKSPACE_ID = "11111111-2222-4333-8444-555555555555"
const OTHER_WORKSPACE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
const SHA256 = "ab".repeat(32)

function key(extension = "pdf"): string {
  return `documents/${WORKSPACE_ID}/${SHA256}.${extension}`
}

function checksumBase64(): string {
  return Buffer.from(SHA256, "hex").toString("base64")
}

describe("document upload policy constants", () => {
  it("uses the shared upload size and short-lived URL policy", () => {
    expect(DOCUMENT_MAX_BYTES).toBe(50 * 1024 * 1024)
    expect(DOCUMENT_UPLOAD_TTL_SECONDS).toBe(300)
    expect(DOCUMENT_PREVIEW_TTL_SECONDS).toBe(900)
    expect(DOCUMENT_HEADER_BYTES).toBe(4096)
  })
})

describe("parseDocumentKey()", () => {
  it("parses the exact workspace-scoped content-addressed key shape", () => {
    expect(parseDocumentKey(key())).toEqual({
      workspaceId: WORKSPACE_ID,
      sha256: SHA256,
      extension: "pdf",
    })
  })

  it.each([
    `avatars/${WORKSPACE_ID}/${SHA256}.pdf`,
    `documents/${WORKSPACE_ID}/nested/${SHA256}.pdf`,
    `documents/${WORKSPACE_ID}/${SHA256}.PDF`,
    `documents/${WORKSPACE_ID}/${"A".repeat(64)}.pdf`,
    `documents/not-a-uuid/${SHA256}.pdf`,
    `documents/${WORKSPACE_ID}/${SHA256}.pdf/extra`,
    `documents/${WORKSPACE_ID}/${SHA256}`,
    `documents/${WORKSPACE_ID}/${SHA256}.pdf?download=1`,
  ])("rejects malformed or non-canonical key %s", (candidate) => {
    expect(parseDocumentKey(candidate)).toBeNull()
  })

  it("keeps structural parsing independent of the browser upload allowlist", () => {
    expect(parseDocumentKey(key("json"))?.extension).toBe("json")
  })
})

describe("documentUploadType()", () => {
  it.each([
    ["application/pdf", "invoice.PDF", "pdf", "pdf", "signature"],
    ["image/png", "/tmp/receipt.png", "png", "png", "signature"],
    ["image/jpeg", "receipt.jpg", "jpeg", "jpg", "signature"],
    ["image/jpeg", ".jpeg", "jpeg", "jpeg", "signature"],
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "ledger.xlsx",
      "xlsx",
      "xlsx",
      "signature",
    ],
    ["text/csv; charset=utf-8", "export.csv", "csv", "csv", "heuristic"],
    ["application/xml", "pohoda.xml", "xml", "xml", "heuristic"],
    ["text/xml; charset=UTF-8", "invoice.isdoc", "xml", "isdoc", "heuristic"],
    ["text/isdoc", "invoice.isdoc", "xml", "isdoc", "heuristic"],
  ] as const)(
    "resolves %s with %s",
    (contentType, filename, kind, extension, headerValidation) => {
      expect(documentUploadType(contentType, filename)).toEqual({
        kind,
        contentType: contentType.split(";", 1)[0]?.toLowerCase(),
        extension,
        headerValidation,
      })
    },
  )

  it.each([
    ["application/pdf", "invoice.png"],
    ["image/jpg", "receipt.jpg"],
    ["application/octet-stream", "invoice.pdf"],
    ["text/isdoc", "pohoda.xml"],
    ["application/isdoc+xml", "invoice.isdoc"],
    ["text/csv", "export.txt"],
    ["", "invoice.pdf"],
    ["application/pdf", "no-extension"],
  ])("rejects mismatched or unsupported pair %s / %s", (type, filename) => {
    expect(documentUploadType(type, filename)).toBeNull()
  })
})

describe("validateDocumentHeader() signatures", () => {
  it.each([
    ["application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2d]],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      [0x50, 0x4b, 0x03, 0x04],
    ],
  ] as const)("accepts the %s signature", (contentType, bytes) => {
    expect(validateDocumentHeader(contentType, Uint8Array.from(bytes))).toEqual(
      { valid: true, method: "signature" },
    )
  })

  it.each([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ])("rejects a missing or truncated %s signature", (contentType) => {
    expect(
      validateDocumentHeader(contentType, Uint8Array.from([0x25, 0x50])),
    ).toMatchObject({ valid: false, method: "signature" })
  })

  it("honestly treats any local-file ZIP header as only an XLSX container signature", () => {
    const zipHeaderOnly = Uint8Array.from([0x50, 0x4b, 0x03, 0x04])
    const result = validateDocumentHeader(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      zipHeaderOnly,
    )
    expect(result.valid).toBe(true)
    expect(result.method).toBe("signature")
  })
})

describe("validateDocumentHeader() text heuristics", () => {
  const utf8 = (value: string) => new TextEncoder().encode(value)

  it.each(["name,amount\nA,1", "name;amount\r\nA;1", "name\tamount\nA\t1"])(
    "accepts UTF-8 CSV with a supported delimiter: %s",
    (csv) => {
      expect(validateDocumentHeader("text/csv", utf8(csv))).toEqual({
        valid: true,
        method: "heuristic",
      })
    },
  )

  it("accepts a UTF-8 BOM in CSV", () => {
    expect(
      validateDocumentHeader(
        "text/csv; charset=utf-8",
        utf8("\ufeffname,amount\nA,1"),
      ),
    ).toMatchObject({ valid: true, method: "heuristic" })
  })

  it("accepts CSV when the bounded prefix splits a trailing UTF-8 code point", () => {
    const csv = `name,value\n${"x".repeat(DOCUMENT_HEADER_BYTES - 12)}€`
    const bytes = utf8(csv)
    expect(bytes[DOCUMENT_HEADER_BYTES - 1]).toBe(0xe2)

    expect(validateDocumentHeader("text/csv", bytes)).toEqual({
      valid: true,
      method: "heuristic",
    })
  })

  it.each([
    utf8("single column only"),
    Uint8Array.from([0x61, 0x2c, 0x62, 0x00]),
    Uint8Array.from([0xc3, 0x28, 0x2c]),
  ])("rejects CSV prefixes that fail the limited text heuristic", (bytes) => {
    expect(validateDocumentHeader("text/csv", bytes)).toMatchObject({
      valid: false,
      method: "heuristic",
    })
  })

  it.each([
    '<?xml version="1.0"?><dataPack />',
    '  \n\t<Invoice xmlns="urn:isdoc:invoice" />',
    "\ufeff  <dataPack />",
  ])("accepts XML with optional BOM/whitespace: %s", (xml) => {
    expect(validateDocumentHeader("application/xml", utf8(xml))).toEqual({
      valid: true,
      method: "heuristic",
    })
  })

  it("accepts XML when the bounded prefix splits a trailing UTF-8 code point", () => {
    const xml = `<root>${"x".repeat(DOCUMENT_HEADER_BYTES - 7)}€`
    const bytes = utf8(xml)
    expect(bytes[DOCUMENT_HEADER_BYTES - 1]).toBe(0xe2)

    expect(validateDocumentHeader("application/xml", bytes)).toEqual({
      valid: true,
      method: "heuristic",
    })
  })

  it.each([utf8("not xml"), Uint8Array.from([0xc3, 0x28, 0x3c])])(
    "rejects XML that is not UTF-8 text starting with a tag",
    (bytes) => {
      expect(validateDocumentHeader("text/xml", bytes)).toMatchObject({
        valid: false,
        method: "heuristic",
      })
    },
  )

  it("rejects unsupported content types", () => {
    expect(
      validateDocumentHeader("application/octet-stream", utf8("%PDF")),
    ).toMatchObject({ valid: false, method: "heuristic" })
  })
})

describe("validateDocumentConfirmation()", () => {
  const validHead = {
    size: 1234,
    contentType: "application/pdf",
    checksumSha256: checksumBase64(),
  }

  it("accepts S3-authoritative metadata matching the key and caller workspace", () => {
    expect(
      validateDocumentConfirmation(key(), WORKSPACE_ID, validHead),
    ).toEqual({
      valid: true,
      key: {
        workspaceId: WORKSPACE_ID,
        sha256: SHA256,
        extension: "pdf",
      },
      uploadType: {
        kind: "pdf",
        contentType: "application/pdf",
        extension: "pdf",
        headerValidation: "signature",
      },
    })
  })

  it("rejects a key owned by another workspace", () => {
    expect(
      validateDocumentConfirmation(key(), OTHER_WORKSPACE_ID, validHead),
    ).toMatchObject({
      valid: false,
      reason: expect.stringMatching(/workspace/),
    })
  })

  it.each([
    [0, "positive"],
    [1.5, "positive"],
    [DOCUMENT_MAX_BYTES + 1, "limit"],
  ])("rejects invalid authoritative size %s", (size, reason) => {
    expect(
      validateDocumentConfirmation(key(), WORKSPACE_ID, {
        ...validHead,
        size,
      }),
    ).toMatchObject({ valid: false, reason: expect.stringMatching(reason) })
  })

  it("rejects content type and extension mismatch", () => {
    expect(
      validateDocumentConfirmation(key(), WORKSPACE_ID, {
        ...validHead,
        contentType: "image/png",
      }),
    ).toMatchObject({
      valid: false,
      reason: expect.stringMatching(/content type/),
    })
  })

  it.each(["", Buffer.from("wrong").toString("base64")])(
    "rejects missing or mismatched authoritative checksum %s",
    (checksumSha256) => {
      expect(
        validateDocumentConfirmation(key(), WORKSPACE_ID, {
          ...validHead,
          checksumSha256,
        }),
      ).toMatchObject({
        valid: false,
        reason: expect.stringMatching(/checksum/),
      })
    },
  )
})
