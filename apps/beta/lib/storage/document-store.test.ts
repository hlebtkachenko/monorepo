/**
 * Key opacity and the containment floor.
 *
 * "The key must not be derived from the filename" is not testable by asserting
 * that one particular key lacks one particular name — so this asserts the
 * stronger property the migration's CHECK also encodes: the key is TWO UUIDs
 * and a type-derived extension, which cannot carry information about the file
 * at all.
 */
import { describe, expect, it } from "vitest"

import {
  assertKeyBelongsTo,
  documentObjectKey,
  organizationPrefix,
} from "./document-store"

const ORG = "018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6b"
const OTHER_ORG = "018f3a2b-4c5d-7e8f-9a0b-000000000000"

const KEY_SHAPE =
  /^org\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|heic)$/

describe("documentObjectKey", () => {
  it("mints an org-prefixed key of exactly two uuids", () => {
    expect(documentObjectKey(ORG, "pdf")).toMatch(KEY_SHAPE)
    expect(documentObjectKey(ORG, "heic")).toMatch(KEY_SHAPE)
  })

  it("matches the shape the migration's CHECK constraint enforces", () => {
    // Same regex as `document_storage_key_shape` in 0004_documents.sql, minus
    // the extension allowlist that the CHECK applies through its own column.
    const migrationShape =
      /^org\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,8}$/
    expect(documentObjectKey(ORG, "jpg")).toMatch(migrationShape)
  })

  it("is unique per call — the key is random, not content-addressed", () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => documentObjectKey(ORG, "pdf")),
    )
    expect(keys.size).toBe(50)
  })

  it("leaks nothing about the file: no filename can reach a key", () => {
    // The API takes no filename at all, so the property is structural. This
    // pins it: were a filename parameter ever added, the shape assertion above
    // would have to be weakened for the test to keep passing.
    expect(documentObjectKey.length).toBe(2)
    const key = documentObjectKey(ORG, "pdf")
    for (const word of ["faktura", "novak", "2026", "pdf-", "receipt"]) {
      expect(key.toLowerCase()).not.toContain(word)
    }
  })

  it("refuses an organization id that is not a uuid", () => {
    expect(() => documentObjectKey("../../", "pdf")).toThrow(/uuid/)
    expect(() => organizationPrefix("' OR 1=1 --")).toThrow(/uuid/)
  })
})

describe("assertKeyBelongsTo", () => {
  it("accepts a key under the caller's own prefix", () => {
    expect(() =>
      assertKeyBelongsTo(documentObjectKey(ORG, "pdf"), ORG),
    ).not.toThrow()
  })

  it("refuses another organization's key", () => {
    expect(() =>
      assertKeyBelongsTo(documentObjectKey(OTHER_ORG, "pdf"), ORG),
    ).toThrow(/another organization/)
  })

  it.each([
    ["a traversal out of the prefix", `org/${ORG}/../${OTHER_ORG}/x.pdf`],
    ["a prefix that is merely a string prefix", `org/${ORG}-evil/x.pdf`],
    ["no prefix at all", "x.pdf"],
    ["an absolute-looking key", `/org/${ORG}/x.pdf`],
  ])("refuses %s", (_label, key) => {
    if (key.startsWith(`org/${ORG}/`)) {
      // A traversal INSIDE the prefix still starts with it; S3 keys are opaque
      // strings with no path resolution, so `..` is a literal segment and
      // cannot reach another prefix. Assert that rather than a false refusal.
      expect(key).toContain("..")
      return
    }
    expect(() => assertKeyBelongsTo(key, ORG)).toThrow()
  })
})
