/**
 * Unit tests for `writeToolCallLog` input + actor-kind validation.
 *
 * Both the `input` NOT-NULL guard and `validateActorKind` run before any
 * database access, so every negative-path case below needs no live DB —
 * the dummy `tx` is never dereferenced. The happy paths (which do reach
 * `tx`) are covered by the RLS integration tests.
 */

import { describe, expect, it } from "vitest"
import { writeToolCallLog } from "../src/audit/write-log.js"
import type { WriteLogInput } from "../src/audit/types.js"
import type { OrganizationBoundDb } from "../src/tenancy.js"

// Validation throws before `tx` is touched, so an unbacked stub suffices.
const tx = {} as unknown as OrganizationBoundDb

function input(overrides: Partial<WriteLogInput>): WriteLogInput {
  return {
    organizationId: "org-1",
    toolName: "test.tool",
    idempotencyKey: "key-1",
    actorKind: "system",
    userId: null,
    input: {},
    ...overrides,
  }
}

describe("writeToolCallLog input guard", () => {
  it("rejects undefined input", async () => {
    await expect(
      writeToolCallLog(tx, input({ input: undefined })),
    ).rejects.toThrow(/input is required/)
  })

  it("rejects null input", async () => {
    await expect(writeToolCallLog(tx, input({ input: null }))).rejects.toThrow(
      /input is required/,
    )
  })
})

describe("writeToolCallLog actor-kind validation", () => {
  it("rejects actor_kind 'human' without userId", async () => {
    await expect(
      writeToolCallLog(tx, input({ actorKind: "human", userId: null })),
    ).rejects.toThrow(/actor_kind 'human' requires userId/)
  })

  it("rejects actor_kind 'ai' without conversationId", async () => {
    await expect(
      writeToolCallLog(tx, input({ actorKind: "ai", conversationId: null })),
    ).rejects.toThrow(/actor_kind 'ai' requires conversationId/)
  })

  it("rejects actor_kind 'ai_on_behalf' without userId", async () => {
    await expect(
      writeToolCallLog(
        tx,
        input({
          actorKind: "ai_on_behalf",
          userId: null,
          conversationId: "conv-1",
        }),
      ),
    ).rejects.toThrow(/ai_on_behalf' requires both userId and conversationId/)
  })

  it("rejects actor_kind 'ai_on_behalf' without conversationId", async () => {
    await expect(
      writeToolCallLog(
        tx,
        input({
          actorKind: "ai_on_behalf",
          userId: "user-1",
          conversationId: null,
        }),
      ),
    ).rejects.toThrow(/ai_on_behalf' requires both userId and conversationId/)
  })
})
