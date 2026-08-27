/**
 * THE PURGE IS THE ONE OPERATION IN THIS APP THAT MUST DESTROY BYTES, AND IT
 * RUNS AGAINST A BUCKET WHOSE DEFAULT BEHAVIOUR IS TO KEEP THEM.
 *
 * `infra/cdk/lib/beta-data-stack.ts` gives the documents bucket
 * `versioned: true` and `noncurrentVersionExpiration: 30 days`. On such a
 * bucket a `DeleteObject` with no `VersionId` writes a DELETE MARKER and
 * demotes the live object to a noncurrent version — the object stops appearing
 * in an ordinary listing and the bytes survive for a month. Every one of those
 * facts is invisible from the call site, and all of them together mean an
 * erasure request served with `delete()` reports success and erases nothing.
 *
 * So this file drives the REAL S3 implementation against a scripted client
 * rather than the memory fake. The fake is exercised too, at the bottom, for a
 * different reason: a purge test that only ever ran against the fake would be
 * asserting that the fake forgets things.
 *
 * NO `aws-sdk-client-mock`. `createS3DocumentStore(config, client)` takes the
 * client as a parameter precisely so a test can pass its own, and adding a
 * devDependency to `apps/beta` would touch `pnpm-lock.yaml` — a turbo
 * `globalDependency` whose change cold-rebuilds all 32 packages. A recorded
 * command log is also a better assertion than a matcher library: it shows the
 * ORDER and the exact `VersionId` of every destructive call.
 */
import { Readable } from "node:stream"

import { describe, expect, it } from "vitest"

import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  type S3Client,
} from "@aws-sdk/client-s3"

import {
  createMemoryDocumentStore,
  PDF_BYTES,
} from "../../tests/memory-document-store"

import { createS3DocumentStore } from "./document-store-s3"

const ORG = "11111111-2222-3333-4444-555555555555"
const OTHER_ORG = "99999999-8888-7777-6666-555555555555"
const PREFIX = `org/${ORG}/`

type ListPage = {
  Versions?: { Key?: string; VersionId?: string }[]
  DeleteMarkers?: { Key?: string; VersionId?: string }[]
  IsTruncated?: boolean
  NextKeyMarker?: string
  NextVersionIdMarker?: string
}

type Recorded =
  | {
      command: "list"
      prefix?: string
      keyMarker?: string
      versionIdMarker?: string
    }
  | { command: "delete"; objects: { Key?: string; VersionId?: string }[] }

/**
 * A client that answers `ListObjectVersions` from a script and records every
 * command. `deleteErrors` injects the partial-failure shape S3 reports as an
 * HTTP 200 with a populated `Errors` array.
 */
function scriptedClient(
  pages: ListPage[],
  options: { deleteErrors?: { Key: string; Code: string }[] } = {},
): { client: S3Client; log: Recorded[] } {
  const log: Recorded[] = []
  let page = 0

  const client = {
    async send(command: unknown) {
      if (command instanceof ListObjectVersionsCommand) {
        log.push({
          command: "list",
          prefix: command.input.Prefix,
          keyMarker: command.input.KeyMarker,
          versionIdMarker: command.input.VersionIdMarker,
        })
        return pages[page++] ?? {}
      }
      if (command instanceof DeleteObjectsCommand) {
        log.push({
          command: "delete",
          objects: command.input.Delete?.Objects ?? [],
        })
        return options.deleteErrors ? { Errors: options.deleteErrors } : {}
      }
      throw new Error("unexpected command")
    },
  } as unknown as S3Client

  return { client, log }
}

function store(client: S3Client) {
  return createS3DocumentStore(
    { bucket: "beta-documents", region: "eu-central-1" },
    client,
  )
}

const deleted = (log: Recorded[]): { Key?: string; VersionId?: string }[] =>
  log.flatMap((entry) => (entry.command === "delete" ? entry.objects : []))

describe("purgeOrganization — the S3 implementation", () => {
  it("deletes every version BY VERSION ID, which is the whole point", () => {
    // A delete without a VersionId is the no-op this method exists to avoid, so
    // the assertion is on the id being present and correct, not on the count.
    const { client, log } = scriptedClient([
      {
        Versions: [
          { Key: `${PREFIX}a.pdf`, VersionId: "v3" },
          { Key: `${PREFIX}a.pdf`, VersionId: "v2" },
          { Key: `${PREFIX}a.pdf`, VersionId: "v1" },
        ],
      },
    ])

    return store(client)
      .purgeOrganization(ORG)
      .then((result) => {
        expect(result.removed).toBe(3)
        expect(deleted(log)).toEqual([
          { Key: `${PREFIX}a.pdf`, VersionId: "v3" },
          { Key: `${PREFIX}a.pdf`, VersionId: "v2" },
          { Key: `${PREFIX}a.pdf`, VersionId: "v1" },
        ])
        expect(
          deleted(log).every((entry) => entry.VersionId !== undefined),
          "a delete with no VersionId writes a marker instead of destroying",
        ).toBe(true)
      })
  })

  it("deletes delete markers too, not only object versions", async () => {
    // A delete marker is itself a version. Leaving them behind leaves the
    // object's history and a stub that keeps the key in a version listing.
    const { client, log } = scriptedClient([
      {
        Versions: [{ Key: `${PREFIX}a.pdf`, VersionId: "v1" }],
        DeleteMarkers: [{ Key: `${PREFIX}a.pdf`, VersionId: "dm1" }],
      },
    ])

    const result = await store(client).purgeOrganization(ORG)

    expect(result.removed).toBe(2)
    expect(
      deleted(log)
        .map((entry) => entry.VersionId)
        .sort(),
    ).toEqual(["dm1", "v1"])
  })

  it("lists under the organization prefix and nothing wider", async () => {
    const { client, log } = scriptedClient([{}])
    await store(client).purgeOrganization(ORG)

    const lists = log.filter((entry) => entry.command === "list")
    expect(lists).toHaveLength(1)
    expect(lists[0]).toMatchObject({ prefix: PREFIX })
  })

  it("refuses an organization id that is not a uuid, before it lists anything", async () => {
    // There is no key to compare against here, so the prefix IS the containment
    // check — a caller that reached this method with `../` or an empty string
    // would list, and then destroy, a wider slice of the bucket than one book.
    for (const hostile of ["", "../..", "' OR 1=1 --", "org"]) {
      const { client, log } = scriptedClient([{}])
      await expect(store(client).purgeOrganization(hostile)).rejects.toThrow(
        /uuid/,
      )
      expect(log, `${hostile} reached the network`).toEqual([])
    }
  })

  it("never deletes a key outside the prefix, even if the listing returns one", async () => {
    // A listing is a prefix match and `assertKeyBelongsTo`'s own suite pins that
    // `org/<uuid>-evil/` is a string prefix of `org/<uuid>`. It cannot arise
    // here because the prefix ends in `/` — and the filter is asserted anyway,
    // because this loop issues unrecoverable deletes.
    const { client, log } = scriptedClient([
      {
        Versions: [
          { Key: `${PREFIX}mine.pdf`, VersionId: "v1" },
          { Key: `org/${OTHER_ORG}/theirs.pdf`, VersionId: "v1" },
          { Key: `org/${ORG}-evil/theirs.pdf`, VersionId: "v1" },
        ],
      },
    ])

    const result = await store(client).purgeOrganization(ORG)

    expect(deleted(log)).toEqual([
      { Key: `${PREFIX}mine.pdf`, VersionId: "v1" },
    ])
    expect(result.removed).toBe(1)
  })

  it("drops an entry the SDK typed as possibly having no key", async () => {
    // Every field on `ObjectVersion` is optional and `ObjectIdentifier.Key` is
    // `string | undefined`, so mapping one to the other compiles with no filter
    // and sends `{ Key: undefined }` to S3.
    const { client, log } = scriptedClient([
      {
        Versions: [
          { Key: `${PREFIX}a.pdf` },
          { VersionId: "v1" },
          { Key: `${PREFIX}b.pdf`, VersionId: "v1" },
        ],
      },
    ])

    const result = await store(client).purgeOrganization(ORG)

    expect(deleted(log)).toEqual([{ Key: `${PREFIX}b.pdf`, VersionId: "v1" }])
    expect(result.removed).toBe(1)
  })

  it("carries BOTH markers across pages", async () => {
    // Paging a version listing on KeyMarker alone re-reads the first page
    // whenever one key has more versions than fit in a page — the loop never
    // ends, and the test that would catch it is this one.
    const { client, log } = scriptedClient([
      {
        Versions: [{ Key: `${PREFIX}a.pdf`, VersionId: "v2" }],
        IsTruncated: true,
        NextKeyMarker: `${PREFIX}a.pdf`,
        NextVersionIdMarker: "v2",
      },
      {
        Versions: [{ Key: `${PREFIX}a.pdf`, VersionId: "v1" }],
        IsTruncated: false,
      },
    ])

    const result = await store(client).purgeOrganization(ORG)

    expect(log.filter((entry) => entry.command === "list")).toEqual([
      {
        command: "list",
        prefix: PREFIX,
        keyMarker: undefined,
        versionIdMarker: undefined,
      },
      {
        command: "list",
        prefix: PREFIX,
        keyMarker: `${PREFIX}a.pdf`,
        versionIdMarker: "v2",
      },
    ])
    expect(result.removed).toBe(2)
  })

  it("stops paging when the listing says it is not truncated", async () => {
    // The inverse of the case above: a loop that kept going on a non-truncated
    // page would re-list forever. The scripted client returns `{}` past the end
    // of its script, so a runaway loop shows up as extra list calls.
    const { client, log } = scriptedClient([
      { Versions: [{ Key: `${PREFIX}a.pdf`, VersionId: "v1" }] },
    ])

    await store(client).purgeOrganization(ORG)
    expect(log.filter((entry) => entry.command === "list")).toHaveLength(1)
  })

  it("batches at the 1000-key API limit", async () => {
    const versions = Array.from({ length: 2101 }, (_, index) => ({
      Key: `${PREFIX}${index}.pdf`,
      VersionId: `v${index}`,
    }))
    const { client, log } = scriptedClient([{ Versions: versions }])

    const result = await store(client).purgeOrganization(ORG)

    const batches = log.filter((entry) => entry.command === "delete")
    expect(batches.map((batch) => batch.objects.length)).toEqual([
      1000, 1000, 101,
    ])
    expect(result.removed).toBe(2101)
  })

  it("throws on a partial failure, which S3 reports as a 200", async () => {
    // `DeleteObjects` returns HTTP 200 with a populated `Errors` array when
    // some keys fail; `send()` does not throw. A purge that ignored it would
    // return a count and a clean conscience while leaving bytes behind — the
    // one outcome this method exists to prevent.
    const { client } = scriptedClient(
      [{ Versions: [{ Key: `${PREFIX}a.pdf`, VersionId: "v1" }] }],
      { deleteErrors: [{ Key: `${PREFIX}a.pdf`, Code: "AccessDenied" }] },
    )

    await expect(store(client).purgeOrganization(ORG)).rejects.toThrow(
      /AccessDenied/,
    )
  })

  it("is a no-op on an organization with no objects", async () => {
    const { client, log } = scriptedClient([{}])
    expect(await store(client).purgeOrganization(ORG)).toEqual({ removed: 0 })
    expect(deleted(log)).toEqual([])
  })
})

/**
 * THE FAKE HAS TO BE ABLE TO FAIL THE WAY PRODUCTION FAILS.
 *
 * `createMemoryDocumentStore` was a flat `Map<key, bytes>` whose `delete`
 * removed the entry, so bytes really were gone. That is not what S3 does to a
 * versioned bucket, and the gap is not academic: a purge written as a loop over
 * `delete()` would have passed every existing suite while leaving thirty days
 * of recoverable versions in the real bucket. The fake now keeps a version
 * stack, and these cases pin the distinction the rest of the suite relies on.
 */
describe("purgeOrganization — the memory fake models a versioned bucket", () => {
  const putOne = async (
    memory: ReturnType<typeof createMemoryDocumentStore>,
    organizationId: string,
  ): Promise<string> => {
    const { key } = await memory.put({
      organizationId,
      contentType: "application/pdf",
      extension: "pdf",
      body: Readable.from([PDF_BYTES]),
    })
    return key
  }

  it("keeps the bytes after a delete — a delete marker is not an erasure", async () => {
    const memory = createMemoryDocumentStore()
    const key = await putOne(memory, ORG)
    expect(memory.versionCount()).toBe(1)

    await memory.delete(key, ORG)

    // Gone from the live listing, and still entirely present.
    expect(memory.keys()).toEqual([])
    expect(memory.bytesOf(key)).toBeUndefined()
    await expect(memory.get(key, ORG)).rejects.toThrow(/no such object/)
    expect(
      memory.versionCount(),
      "delete pushes a marker; the object version is still stored",
    ).toBe(2)
  })

  it("only the purge reaches zero", async () => {
    const memory = createMemoryDocumentStore()
    const key = await putOne(memory, ORG)
    await memory.delete(key, ORG)

    const result = await memory.purgeOrganization(ORG)

    expect(result.removed).toBe(2)
    expect(memory.versionCount()).toBe(0)
  })

  it("leaves another organization's objects alone", async () => {
    const memory = createMemoryDocumentStore()
    await putOne(memory, ORG)
    const theirs = await putOne(memory, OTHER_ORG)

    const result = await memory.purgeOrganization(ORG)

    expect(result.removed).toBe(1)
    expect(memory.keys()).toEqual([theirs])
    expect(memory.versionCount(`org/${OTHER_ORG}/`)).toBe(1)
  })

  it("refuses a non-uuid organization, like the real store", async () => {
    const memory = createMemoryDocumentStore()
    await expect(memory.purgeOrganization("../..")).rejects.toThrow(/uuid/)
  })
})
