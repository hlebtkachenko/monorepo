import { describe, it, expect } from "vitest"
import { renderBriefing, renderScanReport, type ScanPoint } from "./scan.js"

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
    expect(r).toContain("heartbeats fresh")
  })
  it("flags issues with red markers", () => {
    const r = renderScanReport(red)
    expect(r).toContain("ISSUES")
    expect(r).toContain("🔴 api")
  })
  it("uses the bonus header on demand", () => {
    expect(renderScanReport(green, true)).toContain("Bonus")
  })
  it("includes stale heartbeat details in the report", () => {
    const r = renderScanReport(green, false, [
      { key: "dast", label: "Nightly DAST", maxAgeMs: 1 },
    ])
    expect(r).toContain("stale: dast")
  })
})

describe("renderBriefing", () => {
  it("summarises health and heartbeats (all clear)", () => {
    const r = renderBriefing(green, [])
    expect(r).toContain("Daily briefing")
    expect(r).toContain("all endpoints green")
    expect(r).toContain("heartbeats fresh")
  })
  it("flags down endpoints and stale heartbeats in one message", () => {
    const r = renderBriefing(red, [
      { key: "dast", label: "Nightly DAST", maxAgeMs: 1 },
    ])
    expect(r).toContain("down: api")
    expect(r).toContain("api: HTTP 503")
    expect(r).toContain("stale: dast")
  })
})
