import { describe, it, expect } from "vitest"
import {
  renderBriefing,
  renderScanReport,
  scanToIssue,
  type ScanPoint,
} from "./scan.js"

const green: ScanPoint[] = [
  { name: "api", ok: true, detail: "HTTP 200" },
  { name: "web", ok: true, detail: "HTTP 200" },
]
const red: ScanPoint[] = [
  { name: "api", ok: false, detail: "HTTP 503" },
  { name: "web", ok: true, detail: "HTTP 200" },
]

describe("renderScanReport", () => {
  it("reports all green", () => {
    const r = renderScanReport(green)
    expect(r).toContain("all green")
    expect(r).toContain("✅ api")
  })
  it("flags issues with red markers", () => {
    const r = renderScanReport(red)
    expect(r).toContain("ISSUES")
    expect(r).toContain("🔴 api")
  })
  it("uses the bonus header on demand", () => {
    expect(renderScanReport(green, true)).toContain("Bonus")
  })
})

describe("renderBriefing", () => {
  it("summarises health, incidents and heartbeats (all clear)", () => {
    const r = renderBriefing(green, [], [])
    expect(r).toContain("Daily briefing")
    expect(r).toContain("all endpoints green")
    expect(r).toContain("no tracked incidents")
    expect(r).toContain("heartbeats fresh")
  })
  it("flags down endpoints, open incidents and stale heartbeats", () => {
    const r = renderBriefing(
      red,
      [{ identifier: "DEV-1", count: 3 }],
      [{ key: "dast", label: "Nightly DAST", maxAgeMs: 1 }],
    )
    expect(r).toContain("down: api")
    expect(r).toContain("DEV-1×3")
    expect(r).toContain("stale: dast")
  })
})

describe("scanToIssue", () => {
  it("returns null when all green", () => {
    expect(scanToIssue(green)).toBeNull()
  })
  it("returns an observability event listing down points with a stable fingerprint", () => {
    const e = scanToIssue(red)
    expect(e?.area).toBe("observability")
    expect(e?.risk).toBe("high")
    expect(e?.title).toContain("api")
    expect(e?.fingerprintParts).toEqual(["health-scan", "api"])
  })
})
