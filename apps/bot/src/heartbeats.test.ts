import { describe, it, expect } from "vitest"
import { staleHeartbeats, HEARTBEATS } from "./heartbeats.js"

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

describe("HEARTBEATS registry", () => {
  it("includes the bot scan + nightly dast + status-page prober", () => {
    expect(HEARTBEATS.map((h) => h.key).sort()).toEqual([
      "dast",
      "scan",
      "status-page",
    ])
  })
})
