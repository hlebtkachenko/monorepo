import { describe, it, expect } from "vitest"
import { renderScanReport, scanToIssue, type ScanPoint } from "./scan.js"

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
