import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  DocumentClientError,
  deleteDocument,
  getDocumentUrl,
  restoreDocument,
  uploadDocument,
} from "./documents-client"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const pdf = () =>
  new File([Buffer.from("%PDF-1.7 hello")], "faktura.pdf", {
    type: "application/pdf",
  })

describe("uploadDocument", () => {
  it("runs sha256 → presign → direct-S3 POST (file last) → confirm", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          url: "https://s3.example",
          key: "documents/ws/ab.pdf",
          fields: { key: "documents/ws/ab.pdf", Policy: "p" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 })) // S3
      .mockResolvedValueOnce(json({ id: "att-1", key: "documents/ws/ab.pdf" }))

    const result = await uploadDocument(pdf())

    expect(result).toEqual({
      id: "att-1",
      key: "documents/ws/ab.pdf",
      deduped: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // presign body carries a 64-hex sha256 computed in-browser
    const presignBody = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(presignBody.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(presignBody).toMatchObject({
      filename: "faktura.pdf",
      contentType: "application/pdf",
    })

    // S3 POST: multipart form, `file` field LAST (S3 requirement)
    const s3Call = fetchMock.mock.calls[1]!
    expect(s3Call[0]).toBe("https://s3.example")
    const form = s3Call[1]!.body as FormData
    const names = [...form.keys()]
    expect(names.at(-1)).toBe("file")
    expect(names).toContain("Policy")

    // confirm carries the presigned key + filename
    const confirmBody = JSON.parse(fetchMock.mock.calls[2]![1]!.body as string)
    expect(confirmBody).toEqual({
      key: "documents/ws/ab.pdf",
      filename: "faktura.pdf",
    })
  })

  it("short-circuits on a dedup hit — no S3 POST, no confirm", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ alreadyExists: true, id: "att-9", key: "documents/ws/ab.pdf" }),
    )
    const result = await uploadDocument(pdf())
    expect(result).toEqual({
      id: "att-9",
      key: "documents/ws/ab.pdf",
      deduped: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("throws a staged DocumentClientError when presign fails", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: "unsupported document type" }, 400),
    )
    await expect(uploadDocument(pdf())).rejects.toMatchObject({
      name: "DocumentClientError",
      status: 400,
      stage: "presign",
    })
  })

  it("throws stage=s3 when S3 rejects the upload", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ url: "https://s3", key: "k", fields: {} }))
      .mockResolvedValueOnce(new Response("bad checksum", { status: 400 }))
    await expect(uploadDocument(pdf())).rejects.toMatchObject({
      stage: "s3",
      status: 400,
    })
  })
})

describe("getDocumentUrl / delete / restore", () => {
  it("requests a presigned URL for the given disposition", async () => {
    fetchMock.mockResolvedValueOnce(json({ url: "https://signed" }))
    const url = await getDocumentUrl("att-1", "attachment")
    expect(url).toBe("https://signed")
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "/api/documents/att-1/url?disposition=attachment",
    )
  })

  it("defaults to inline preview disposition", async () => {
    fetchMock.mockResolvedValueOnce(json({ url: "https://signed" }))
    await getDocumentUrl("att-1")
    expect(fetchMock.mock.calls[0]![0]).toContain("disposition=inline")
  })

  it("deleteDocument DELETEs the id", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }))
    await deleteDocument("att-1")
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("/api/documents/att-1")
    expect(init!.method).toBe("DELETE")
  })

  it("restoreDocument POSTs to /restore", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }))
    await restoreDocument("att-1")
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("/api/documents/att-1/restore")
    expect(init!.method).toBe("POST")
  })

  it("surfaces a DocumentClientError on a failed url fetch", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "document not found" }, 404))
    await expect(getDocumentUrl("att-1")).rejects.toBeInstanceOf(
      DocumentClientError,
    )
  })
})
