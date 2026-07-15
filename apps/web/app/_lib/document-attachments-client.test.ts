import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DocumentActionError,
  deleteDocument,
  getDocumentUrl,
  restoreDocument,
  sha256Hex,
  uploadDocument,
} from "./document-attachments-client"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const file = () =>
  new File([new Uint8Array([1, 2, 3, 4])], "receipt.pdf", {
    type: "application/pdf",
  })

afterEach(() => vi.restoreAllMocks())

describe("document-attachments-client", () => {
  it("sha256Hex returns a 64-char lowercase hex digest", async () => {
    const hex = await sha256Hex(file())
    expect(hex).toMatch(/^[0-9a-f]{64}$/)
  })

  it("uploadDocument runs presign → S3 POST → confirm and returns the row id", async () => {
    const calls: { url: string; method: string }[] = []
    const fetchMock = vi
      .fn()
      .mockImplementation((input: string, init?: RequestInit) => {
        calls.push({ url: String(input), method: init?.method ?? "GET" })
        if (String(input).endsWith("/presign-upload")) {
          return Promise.resolve(
            jsonResponse({
              key: "documents/ws/abc.pdf",
              url: "https://s3.example/bucket",
              fields: { key: "documents/ws/abc.pdf", policy: "p" },
            }),
          )
        }
        if (String(input) === "https://s3.example/bucket") {
          return Promise.resolve(new Response(null, { status: 204 }))
        }
        if (String(input).endsWith("/confirm")) {
          return Promise.resolve(
            jsonResponse({ id: "att-1", key: "documents/ws/abc.pdf" }),
          )
        }
        throw new Error(`unexpected fetch ${String(input)}`)
      })
    vi.stubGlobal("fetch", fetchMock)

    const result = await uploadDocument(file())

    expect(result).toEqual({
      id: "att-1",
      key: "documents/ws/abc.pdf",
      filename: "receipt.pdf",
      contentType: "application/pdf",
      size: 4,
      alreadyExists: false,
    })
    // presign, S3 POST, confirm — in order, and the S3 POST is a POST.
    expect(calls.map((c) => c.method)).toEqual(["POST", "POST", "POST"])
    expect(calls[0]?.url).toContain("/presign-upload")
    expect(calls[1]?.url).toBe("https://s3.example/bucket")
    expect(calls[2]?.url).toContain("/confirm")
  })

  it("uploadDocument short-circuits on a hash dedup hit (no S3 POST, no confirm)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          id: "existing-1",
          key: "documents/ws/abc.pdf",
          alreadyExists: true,
        }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const result = await uploadDocument(file())

    expect(result.alreadyExists).toBe(true)
    expect(result.id).toBe("existing-1")
    expect(fetchMock).toHaveBeenCalledTimes(1) // only presign
  })

  it("uploadDocument throws a typed error when presign fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, 400)),
    )
    await expect(uploadDocument(file())).rejects.toMatchObject({
      name: "DocumentActionError",
      action: "presign",
      status: 400,
    })
  })

  it("getDocumentUrl requests the disposition and returns the url", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ url: "https://s3.example/get?sig=1" }))
    vi.stubGlobal("fetch", fetchMock)

    const url = await getDocumentUrl("att-1", "attachment")

    expect(url).toBe("https://s3.example/get?sig=1")
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/documents/att-1/url?disposition=attachment",
    )
  })

  it("deleteDocument DELETEs and restoreDocument POSTs the restore route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await deleteDocument("att-1")
    await restoreDocument("att-1")

    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/documents/att-1",
      { method: "DELETE" },
    ])
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/documents/att-1/restore",
      { method: "POST" },
    ])
  })

  it("surfaces a delete failure as a DocumentActionError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    )
    await expect(deleteDocument("missing")).rejects.toBeInstanceOf(
      DocumentActionError,
    )
  })
})
