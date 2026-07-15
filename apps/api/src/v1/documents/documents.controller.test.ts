import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Contract tests for the `/v1/documents` READ/RETRIEVE twin. `withWorkspace` is
 * mocked with an in-memory RLS emulation (the callback only sees rows whose
 * workspace_id matches the GUC scope), and the S3 store is mocked, so
 * cross-workspace isolation + the download-url gate are exercised without a live
 * Postgres or AWS.
 */

const WS = "11111111-1111-1111-1111-111111111111"
const OTHER_WS = "22222222-2222-2222-2222-222222222222"
const USER = "99999999-9999-9999-9999-999999999999"

type Pred =
  | { kind: "isNull"; col: string }
  | { kind: "eq"; col: string; val: unknown }
  | undefined

interface Row {
  workspace_id: string
  id: string
  filename: string
  content_type: string
  size: number
  sha256: string
  deleted_at: Date | null
  confirmed_at: Date
  created_at: Date
  updated_at: Date
  storage_key: string
}

const state = vi.hoisted(() => ({ rows: [] as Row[] }))

vi.mock("@workspace/auth/api-key-verifier", () => ({ verifyApiKey: vi.fn() }))

vi.mock("@workspace/db/schema", () => ({
  inbox_attachment: {
    id: "id",
    filename: "filename",
    content_type: "content_type",
    size: "size",
    sha256: "sha256",
    deleted_at: "deleted_at",
    confirmed_at: "confirmed_at",
    created_at: "created_at",
    updated_at: "updated_at",
    storage_key: "storage_key",
  },
}))

vi.mock("@workspace/db", () => {
  const evalPred = (pred: Pred, row: Row): boolean => {
    if (!pred) return true
    if (pred.kind === "isNull") return row[pred.col as keyof Row] === null
    return row[pred.col as keyof Row] === pred.val
  }
  const project = (row: Row, projection: Record<string, string>) => {
    const out: Record<string, unknown> = {}
    for (const [key, marker] of Object.entries(projection)) {
      out[key] = row[marker as keyof Row]
    }
    return out
  }
  return {
    eq: (col: string, val: unknown): Pred => ({ kind: "eq", col, val }),
    isNull: (col: string): Pred => ({ kind: "isNull", col }),
    desc: (col: string) => col,
    withWorkspace: async (
      workspaceId: string,
      _userId: string,
      fn: (db: unknown) => Promise<unknown>,
    ) => {
      const visible = () =>
        state.rows.filter((r) => r.workspace_id === workspaceId)
      const db = {
        select(projection: Record<string, string>) {
          let predicate: Pred
          const chain = {
            from: () => chain,
            where: (pred: Pred) => {
              predicate = pred
              return chain
            },
            orderBy: () =>
              Promise.resolve(
                visible()
                  .filter((r) => evalPred(predicate, r))
                  .sort(
                    (a, b) => b.created_at.getTime() - a.created_at.getTime(),
                  )
                  .map((r) => project(r, projection)),
              ),
            limit: () =>
              Promise.resolve(
                visible()
                  .filter((r) => evalPred(predicate, r))
                  .slice(0, 1)
                  .map((r) => project(r, projection)),
              ),
          }
          return chain
        },
      }
      return fn(db)
    },
  }
})

const presignGet = vi.fn(async () => "https://s3.example/signed")
vi.mock("@workspace/storage", () => ({
  DOCUMENT_PREVIEW_TTL_SECONDS: 900,
  S3DocumentStore: class {
    presignGet = presignGet
  },
}))

const { DocumentsController } = await import("./documents.controller")

const principal = (userId: string | null = USER) =>
  ({ workspaceId: WS, userId }) as never

function seed() {
  const at = (iso: string) => new Date(iso)
  state.rows = [
    {
      workspace_id: WS,
      id: "d1",
      filename: "faktura.pdf",
      content_type: "application/pdf",
      size: 100,
      sha256: "a".repeat(64),
      deleted_at: null,
      confirmed_at: at("2026-07-14T10:00:00Z"),
      created_at: at("2026-07-14T10:00:00Z"),
      updated_at: at("2026-07-14T10:00:00Z"),
      storage_key: `documents/${WS}/${"a".repeat(64)}.pdf`,
    },
    {
      workspace_id: WS,
      id: "d2",
      filename: "old.pdf",
      content_type: "application/pdf",
      size: 200,
      sha256: "b".repeat(64),
      deleted_at: at("2026-07-13T10:00:00Z"),
      confirmed_at: at("2026-07-12T10:00:00Z"),
      created_at: at("2026-07-12T10:00:00Z"),
      updated_at: at("2026-07-13T10:00:00Z"),
      storage_key: `documents/${WS}/${"b".repeat(64)}.pdf`,
    },
    {
      workspace_id: OTHER_WS,
      id: "d3",
      filename: "foreign.pdf",
      content_type: "application/pdf",
      size: 300,
      sha256: "c".repeat(64),
      deleted_at: null,
      confirmed_at: at("2026-07-14T10:00:00Z"),
      created_at: at("2026-07-14T11:00:00Z"),
      updated_at: at("2026-07-14T11:00:00Z"),
      storage_key: `documents/${OTHER_WS}/${"c".repeat(64)}.pdf`,
    },
  ]
}

describe("DocumentsController.list", () => {
  beforeEach(() => {
    seed()
    presignGet.mockClear()
  })

  it("returns the workspace's live documents (excludes deleted + other workspaces)", async () => {
    const controller = new DocumentsController()
    const res = await controller.list(
      { includeDeleted: undefined },
      principal(),
    )
    expect(res.documents.map((d) => d.id)).toEqual(["d1"])
    expect(res.documents[0]).toMatchObject({
      filename: "faktura.pdf",
      contentType: "application/pdf",
      size: 100,
      deletedAt: null,
    })
  })

  it("includes soft-deleted documents when includeDeleted=true", async () => {
    const controller = new DocumentsController()
    const res = await controller.list({ includeDeleted: "true" }, principal())
    expect(res.documents.map((d) => d.id).sort()).toEqual(["d1", "d2"])
    expect(res.documents.find((d) => d.id === "d2")?.deletedAt).not.toBeNull()
  })

  it("rejects a service key with no bound user (403)", async () => {
    const controller = new DocumentsController()
    await expect(
      controller.list({ includeDeleted: undefined }, principal(null)),
    ).rejects.toThrow(/user-bound/)
  })
})

describe("DocumentsController.downloadUrl", () => {
  beforeEach(() => {
    seed()
    presignGet.mockClear()
  })

  it("mints a presigned attachment URL for a live document", async () => {
    const controller = new DocumentsController()
    const res = await controller.downloadUrl("d1", principal())
    expect(res).toEqual({
      url: "https://s3.example/signed",
      expiresInSeconds: 900,
    })
    expect(presignGet).toHaveBeenCalledWith(
      `documents/${WS}/${"a".repeat(64)}.pdf`,
      expect.objectContaining({
        disposition: "attachment",
        callerWorkspaceId: WS,
        filename: "faktura.pdf",
      }),
    )
  })

  it("404s a soft-deleted document (never signs)", async () => {
    const controller = new DocumentsController()
    await expect(controller.downloadUrl("d2", principal())).rejects.toThrow(
      /not found/,
    )
    expect(presignGet).not.toHaveBeenCalled()
  })

  it("404s a document in another workspace (RLS fence)", async () => {
    const controller = new DocumentsController()
    await expect(controller.downloadUrl("d3", principal())).rejects.toThrow(
      /not found/,
    )
    expect(presignGet).not.toHaveBeenCalled()
  })
})
