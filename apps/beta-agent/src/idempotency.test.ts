import { describe, expect, it } from "vitest"

import { idempotencyKey, isValidIdempotencyKey } from "./idempotency"

const base = {
  path: "publish/trial-balance",
  orgSlug: "stavby-vltava",
  period: "2026-07",
  payload: { lines: [{ accountCode: "211000", closingBalance: "34279.50" }] },
}

describe("idempotencyKey", () => {
  it("is stable for the same call, so a retry is replayed and not re-applied", () => {
    expect(idempotencyKey(base)).toBe(idempotencyKey({ ...base }))
  })

  it("satisfies the server's own character class", () => {
    expect(isValidIdempotencyKey(idempotencyKey(base))).toBe(true)
  })

  it("differs per dataset — the server 409s on a key reused across acts", () => {
    expect(idempotencyKey({ ...base, path: "filings" })).not.toBe(
      idempotencyKey(base),
    )
  })

  it("differs per organization, so one run over ten clients never collides", () => {
    expect(idempotencyKey({ ...base, orgSlug: "jina-firma" })).not.toBe(
      idempotencyKey(base),
    )
  })

  it("differs per period", () => {
    expect(idempotencyKey({ ...base, period: "2026-08" })).not.toBe(
      idempotencyKey(base),
    )
  })

  it("differs when the file's content changed — a correction IS a new act", () => {
    expect(
      idempotencyKey({
        ...base,
        payload: {
          lines: [{ accountCode: "211000", closingBalance: "34280.50" }],
        },
      }),
    ).not.toBe(idempotencyKey(base))
  })

  it("ignores the order the transformer happened to emit keys in", () => {
    expect(
      idempotencyKey({
        ...base,
        payload: {
          lines: [{ closingBalance: "34279.50", accountCode: "211000" }],
        },
      }),
    ).toBe(idempotencyKey(base))
  })

  it("rejects a hand-passed key the server would refuse with a 400", () => {
    expect(isValidIdempotencyKey("mesic 07")).toBe(false)
    expect(isValidIdempotencyKey("")).toBe(false)
    expect(isValidIdempotencyKey("a".repeat(201))).toBe(false)
    expect(isValidIdempotencyKey("uzaverka-2026-07:predvaha")).toBe(true)
  })
})
