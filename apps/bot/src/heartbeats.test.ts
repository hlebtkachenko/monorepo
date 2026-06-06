import { describe, it, expect } from "vitest"
import { staleHeartbeats, deadManToIssue, HEARTBEATS } from "./heartbeats.js"

const spec = (key: string, maxAgeMs: number) => ({ key, label: key, maxAgeMs })

describe("staleHeartbeats", () => {
  const now = 1_000_000_000

  it("flags a job whose last beat is past its window", () => {
    const stale = staleHeartbeats(
      [{ spec: spec("dast", 1000), lastRun: now - 5000 }],
      now,
    )
    expect(stale.map((s) => s.key)).toEqual(["dast"])
  })

  it("ignores a fresh beat", () => {
    expect(
      staleHeartbeats([{ spec: spec("scan", 1000), lastRun: now - 500 }], now),
    ).toEqual([])
  })

  it("never flags a job that has never beaten", () => {
    expect(
      staleHeartbeats([{ spec: spec("dast", 1000), lastRun: null }], now),
    ).toEqual([])
  })
})

describe("deadManToIssue", () => {
  it("returns null when nothing is stale", () => {
    expect(deadManToIssue([])).toBeNull()
  })

  it("builds one deduped incident with a key-stable fingerprint", () => {
    const a = deadManToIssue([spec("b", 1), spec("a", 1)])
    const b = deadManToIssue([spec("a", 1), spec("b", 1)])
    expect(a?.source).toBe("error")
    expect(a?.area).toBe("observability")
    // Order-independent fingerprint so flaps dedup.
    expect(a?.fingerprintParts).toEqual(b?.fingerprintParts)
    expect(a?.fingerprintParts).toEqual(["dead-man", "a", "b"])
  })
})

describe("HEARTBEATS registry", () => {
  it("includes the bot scan + nightly dast", () => {
    expect(HEARTBEATS.map((h) => h.key).sort()).toEqual(["dast", "scan"])
  })
})
