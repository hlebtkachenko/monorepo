import { Readable } from "node:stream"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createDocumentHandlers } from "./document-handlers"
import type { DocumentHandlerDependencies } from "./document-handlers"
import type { AttachmentRow } from "../../../_lib/inbox-attachment-repo"

const WS = "11111111-1111-1111-1111-111111111111"
const OTHER_WS = "22222222-2222-2222-2222-222222222222"
const USER = "99999999-9999-9999-9999-999999999999"
const SHA = "a".repeat(64)
const KEY = `documents/${WS}/${SHA}.pdf`
const CHECKSUM_B64 = Buffer.from(SHA, "hex").toString("base64")
const PDF_HEADER = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]) // %PDF-1.7

function pdfHead() {
  return {
    size: 1000,
    contentType: "application/pdf",
    checksumSha256: CHECKSUM_B64,
    etag: "etag",
  }
}

function makeDeps(overrides?: {
  userId?: string | null
  workspaceId?: string | null
}) {
  const store = {
    head: vi.fn(async () => pdfHead()),
    getBytes: vi.fn(async () => Readable.from([PDF_HEADER])),
    presignPost: vi.fn(async () => ({
      key: KEY,
      url: "https://s3",
      fields: {},
    })),
    presignGet: vi.fn(async () => "https://s3/signed"),
    tagConfirmed: vi.fn(async () => {}),
    tagOrphan: vi.fn(async () => {}),
    setDeletedTag: vi.fn(async () => {}),
    clearDeletedTag: vi.fn(async () => {}),
  }
  const repo = {
    findLiveByHash: vi.fn(
      async (): Promise<{ id: string; storageKey: string } | null> => null,
    ),
    getById: vi.fn(async (): Promise<AttachmentRow | null> => ({
      id: "att-1",
      storageKey: KEY,
      sha256: SHA,
      contentType: "application/pdf",
      size: 1000,
      filename: "invoice.pdf",
      deletedAt: null,
    })),
    upsertConfirmed: vi.fn(async () => ({ id: "att-1" })),
    markDeleted: vi.fn(async () => true),
    clearDeleted: vi.fn(async () => true),
  }
  const deps: DocumentHandlerDependencies = {
    getSessionUserId: vi.fn(async () =>
      overrides && "userId" in overrides ? overrides.userId! : USER,
    ),
    getActiveWorkspaceId: vi.fn(async () =>
      overrides && "workspaceId" in overrides ? overrides.workspaceId! : WS,
    ),
    getStore: () => store,
    repo,
  }
  return { deps, store, repo }
}

const jsonReq = (body: unknown) =>
  new Request("https://app/api/documents/x", {
    method: "POST",
    body: JSON.stringify(body),
  })

describe("presignUpload", () => {
  let d: ReturnType<typeof makeDeps>
  beforeEach(() => {
    d = makeDeps()
  })

  it("401 when unauthenticated", async () => {
    const h = createDocumentHandlers(makeDeps({ userId: null }).deps)
    const res = await h.presignUpload(
      jsonReq({
        sha256: SHA,
        filename: "a.pdf",
        contentType: "application/pdf",
        size: 10,
      }),
    )
    expect(res.status).toBe(401)
  })

  it("404 when the session user has no workspace", async () => {
    const h = createDocumentHandlers(makeDeps({ workspaceId: null }).deps)
    const res = await h.presignUpload(
      jsonReq({
        sha256: SHA,
        filename: "a.pdf",
        contentType: "application/pdf",
        size: 10,
      }),
    )
    expect(res.status).toBe(404)
  })

  it("400 on an unsupported document type", async () => {
    const h = createDocumentHandlers(d.deps)
    const res = await h.presignUpload(
      jsonReq({
        sha256: SHA,
        filename: "a.exe",
        contentType: "application/x-msdownload",
        size: 10,
      }),
    )
    expect(res.status).toBe(400)
  })

  it("dedups against the DB row (not S3) and never presigns when a live row exists", async () => {
    d.repo.findLiveByHash.mockResolvedValueOnce({
      id: "att-9",
      storageKey: KEY,
    })
    const h = createDocumentHandlers(d.deps)
    const res = await h.presignUpload(
      jsonReq({
        sha256: SHA,
        filename: "a.pdf",
        contentType: "application/pdf",
        size: 10,
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: "att-9", alreadyExists: true })
    expect(d.store.presignPost).not.toHaveBeenCalled()
  })

  it("presigns a fresh upload with the server-derived workspace", async () => {
    const h = createDocumentHandlers(d.deps)
    const res = await h.presignUpload(
      jsonReq({
        sha256: SHA,
        filename: "a.pdf",
        contentType: "application/pdf",
        size: 10,
      }),
    )
    expect(res.status).toBe(200)
    expect(d.store.presignPost).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, sha256: SHA, ext: "pdf" }),
    )
  })
})

describe("confirm", () => {
  let d: ReturnType<typeof makeDeps>
  beforeEach(() => {
    d = makeDeps()
  })

  it("404 when the key belongs to another workspace", async () => {
    const h = createDocumentHandlers(d.deps)
    const res = await h.confirm(
      jsonReq({ key: `documents/${OTHER_WS}/${SHA}.pdf`, filename: "a.pdf" }),
    )
    expect(res.status).toBe(404)
    expect(d.store.head).not.toHaveBeenCalled()
  })

  it("404 when the object is missing in S3", async () => {
    d.store.head.mockRejectedValueOnce({ name: "NotFound" })
    const h = createDocumentHandlers(d.deps)
    const res = await h.confirm(jsonReq({ key: KEY, filename: "a.pdf" }))
    expect(res.status).toBe(404)
  })

  it("tags orphan and 422 when authoritative metadata fails validation", async () => {
    d.store.head.mockResolvedValueOnce({
      ...pdfHead(),
      checksumSha256: "wrong",
    })
    const h = createDocumentHandlers(d.deps)
    const res = await h.confirm(jsonReq({ key: KEY, filename: "a.pdf" }))
    expect(res.status).toBe(422)
    expect(d.store.tagOrphan).toHaveBeenCalledWith(KEY)
    expect(d.repo.upsertConfirmed).not.toHaveBeenCalled()
  })

  it("tags orphan and 422 when magic bytes do not match", async () => {
    d.store.getBytes.mockResolvedValueOnce(
      Readable.from([Buffer.from("not a pdf")]),
    )
    const h = createDocumentHandlers(d.deps)
    const res = await h.confirm(jsonReq({ key: KEY, filename: "a.pdf" }))
    expect(res.status).toBe(422)
    expect(d.store.tagOrphan).toHaveBeenCalled()
    expect(d.repo.upsertConfirmed).not.toHaveBeenCalled()
  })

  it("tags confirmed in S3 BEFORE writing the DB row (never DB-first)", async () => {
    const h = createDocumentHandlers(d.deps)
    const res = await h.confirm(jsonReq({ key: KEY, filename: "invoice.pdf" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: "att-1", key: KEY })
    expect(d.store.tagConfirmed.mock.invocationCallOrder[0]).toBeLessThan(
      d.repo.upsertConfirmed.mock.invocationCallOrder[0]!,
    )
    // authoritative head values, not client-declared
    expect(d.repo.upsertConfirmed).toHaveBeenCalledWith(
      WS,
      USER,
      expect.objectContaining({
        size: 1000,
        contentType: "application/pdf",
        filename: "invoice.pdf",
      }),
    )
  })

  it("writes NO DB row when tagConfirmed fails", async () => {
    d.store.tagConfirmed.mockRejectedValueOnce(new Error("s3 down"))
    const h = createDocumentHandlers(d.deps)
    const res = await h.confirm(jsonReq({ key: KEY, filename: "a.pdf" }))
    expect(res.status).toBe(502)
    expect(d.repo.upsertConfirmed).not.toHaveBeenCalled()
  })
})

describe("getUrl", () => {
  let d: ReturnType<typeof makeDeps>
  beforeEach(() => {
    d = makeDeps()
  })

  const getReq = (disposition?: string) =>
    new Request(
      `https://app/api/documents/att-1/url${disposition ? `?disposition=${disposition}` : ""}`,
    )

  it("404 when the row is missing", async () => {
    d.repo.getById.mockResolvedValueOnce(null)
    const h = createDocumentHandlers(d.deps)
    expect((await h.getUrl(getReq(), "att-1")).status).toBe(404)
  })

  it("404 when the row is soft-deleted", async () => {
    d.repo.getById.mockResolvedValueOnce({
      id: "att-1",
      storageKey: KEY,
      sha256: SHA,
      contentType: "application/pdf",
      size: 1000,
      filename: "a.pdf",
      deletedAt: new Date(),
    })
    const h = createDocumentHandlers(d.deps)
    expect((await h.getUrl(getReq(), "att-1")).status).toBe(404)
    expect(d.store.presignGet).not.toHaveBeenCalled()
  })

  it("signs an inline preview URL with the caller workspace", async () => {
    const h = createDocumentHandlers(d.deps)
    const res = await h.getUrl(getReq(), "att-1")
    expect(res.status).toBe(200)
    expect(d.store.presignGet).toHaveBeenCalledWith(
      KEY,
      expect.objectContaining({ disposition: "inline", callerWorkspaceId: WS }),
    )
  })

  it("signs an attachment download with the filename", async () => {
    const h = createDocumentHandlers(d.deps)
    await h.getUrl(getReq("attachment"), "att-1")
    expect(d.store.presignGet).toHaveBeenCalledWith(
      KEY,
      expect.objectContaining({
        disposition: "attachment",
        filename: "invoice.pdf",
      }),
    )
  })
})

describe("remove (soft-delete) — DB first, then S3 tag", () => {
  it("marks the DB row deleted BEFORE tagging S3", async () => {
    const d = makeDeps()
    const h = createDocumentHandlers(d.deps)
    const res = await h.remove("att-1")
    expect(res.status).toBe(200)
    expect(d.repo.markDeleted.mock.invocationCallOrder[0]).toBeLessThan(
      d.store.setDeletedTag.mock.invocationCallOrder[0]!,
    )
  })

  it("404 when the row is already gone", async () => {
    const d = makeDeps()
    d.repo.getById.mockResolvedValueOnce(null)
    const h = createDocumentHandlers(d.deps)
    expect((await h.remove("att-1")).status).toBe(404)
    expect(d.store.setDeletedTag).not.toHaveBeenCalled()
  })

  it("self-heals: re-attempts setDeletedTag on an already soft-deleted row without re-marking", async () => {
    const d = makeDeps()
    d.repo.getById.mockResolvedValueOnce({
      id: "att-1",
      storageKey: KEY,
      sha256: SHA,
      contentType: "application/pdf",
      size: 1000,
      filename: "a.pdf",
      deletedAt: new Date(),
    })
    const h = createDocumentHandlers(d.deps)
    const res = await h.remove("att-1")
    expect(res.status).toBe(200)
    expect(d.repo.markDeleted).not.toHaveBeenCalled()
    expect(d.store.setDeletedTag).toHaveBeenCalledWith(KEY)
  })
})

describe("restore (undo) — S3 tag first, then DB", () => {
  it("clears the S3 tag BEFORE clearing the DB row", async () => {
    const d = makeDeps()
    d.repo.getById.mockResolvedValueOnce({
      id: "att-1",
      storageKey: KEY,
      sha256: SHA,
      contentType: "application/pdf",
      size: 1000,
      filename: "a.pdf",
      deletedAt: new Date(),
    })
    const h = createDocumentHandlers(d.deps)
    const res = await h.restore("att-1")
    expect(res.status).toBe(200)
    expect(d.store.clearDeletedTag.mock.invocationCallOrder[0]).toBeLessThan(
      d.repo.clearDeleted.mock.invocationCallOrder[0]!,
    )
  })

  it("is a no-op ok for a row that is not deleted", async () => {
    const d = makeDeps()
    const h = createDocumentHandlers(d.deps)
    const res = await h.restore("att-1")
    expect(res.status).toBe(200)
    expect(d.store.clearDeletedTag).not.toHaveBeenCalled()
  })
})
