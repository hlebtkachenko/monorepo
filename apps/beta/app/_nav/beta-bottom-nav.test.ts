import { describe, expect, it } from "vitest"

import betaCs from "../../messages/cs.json"

import { betaBottomNav, type BetaBottomNavSlot } from "./beta-bottom-nav"
import { betaRailNav } from "./beta-nav"

function tabs(slots: BetaBottomNavSlot[]) {
  return slots.filter(
    (slot): slot is Extract<BetaBottomNavSlot, { kind: "tab" }> =>
      slot.kind === "tab",
  )
}

function fab(slots: BetaBottomNavSlot[]) {
  return slots.find(
    (slot): slot is Extract<BetaBottomNavSlot, { kind: "fab" }> =>
      slot.kind === "fab",
  )
}

function more(slots: BetaBottomNavSlot[]) {
  return slots.find(
    (slot): slot is Extract<BetaBottomNavSlot, { kind: "more" }> =>
      slot.kind === "more",
  )
}

describe("beta bottom nav", () => {
  it("resolves every label key against the catalog, including the two bottom-nav-only keys", () => {
    expect(betaCs.nav).toHaveProperty("nahrat")
    expect(betaCs.nav).toHaveProperty("vice")

    const slots = betaBottomNav("acme-sro", { canUpload: true, isOwner: true })
    for (const slot of slots) {
      if (slot.kind === "more") {
        expect(betaCs.nav).toHaveProperty(slot.labelKey)
        for (const item of slot.items) {
          expect(betaCs.nav).toHaveProperty(item.labelKey)
        }
      } else {
        expect(betaCs.nav).toHaveProperty(slot.labelKey)
      }
    }
  })

  it("always carries exactly the three primary tabs — Přehled, Dokumenty, Daně, in that order", () => {
    const slots = betaBottomNav("acme-sro")
    expect(tabs(slots).map((t) => t.labelKey)).toEqual([
      "prehled",
      "dokumenty",
      "dane",
    ])
    expect(tabs(slots).map((t) => t.href)).toEqual([
      "/acme-sro",
      "/acme-sro/dokumenty",
      "/acme-sro/dane",
    ])
  })

  it("re-scopes every href when called with a different org", () => {
    const slots = betaBottomNav("jina-firma", { canUpload: true })
    const hrefs = [
      ...tabs(slots).map((t) => t.href),
      fab(slots)?.href,
      ...(more(slots)?.items.map((i) => i.href) ?? []),
    ].filter((h): h is string => h !== undefined)
    expect(hrefs.every((h) => h.startsWith("/jina-firma"))).toBe(true)
  })

  it("omits the Nahrát FAB when the caller cannot upload", () => {
    expect(fab(betaBottomNav("acme-sro"))).toBeUndefined()
    expect(fab(betaBottomNav("acme-sro", { canUpload: false }))).toBeUndefined()
  })

  it("shows the Nahrát FAB, pointed at Dokumenty, when the caller can upload", () => {
    const slots = betaBottomNav("acme-sro", { canUpload: true })
    const upload = fab(slots)
    expect(upload?.icon).toBe("Upload")
    // No dedicated upload route exists — the FAB points at the page that
    // actually renders the upload panel (spec: no dead links).
    expect(upload?.href).toBe("/acme-sro/dokumenty")
  })

  it("sits the FAB between Dokumenty and Daně", () => {
    const slots = betaBottomNav("acme-sro", { canUpload: true })
    const kinds = slots.map((s) => s.kind)
    expect(kinds).toEqual(["tab", "tab", "fab", "tab", "more"])
  })

  it("puts every non-primary rail module into the Více sheet", () => {
    const slots = betaBottomNav("acme-sro", {
      isOwner: true,
      isManagement: true,
      showAssistant: true,
    })
    const labels = more(slots)?.items.map((i) => i.labelKey)
    expect(labels).toEqual([
      "finance",
      "vykazy",
      "mzdy",
      "majetek",
      "asistent",
      "ucetni",
    ])
  })

  it("narrows the Více sheet exactly as the rail narrows for a plain guest", () => {
    const slots = betaBottomNav("acme-sro")
    const labels = more(slots)?.items.map((i) => i.labelKey)
    expect(labels).toEqual(["finance", "vykazy", "majetek"])
  })

  it("omits the Více slot entirely if it would ever be empty", () => {
    // Not reachable with today's rail (finance/vykazy/majetek are always
    // present), but the guard exists rather than rendering a sheet with
    // nothing in it — pinned so a future rail change can't regress it silently.
    const slots = betaBottomNav("acme-sro")
    expect(more(slots)?.items.length).toBeGreaterThan(0)
  })

  /**
   * The employee seat (spec §2.6.1): "renders a narrowed rail: Přehled
   * (personal) · Dokumenty (own) · Moje mzda" — and the bottom nav mirrors
   * that rail exactly, never the company's five-slot layout. This is the
   * boundary the early return in `beta-nav.ts`'s `betaRailNav` protects, and
   * `betaBottomNav` reads through the SAME early return rather than
   * re-deciding independently — the two assertions below prove the mirror,
   * not just the seat's own shape.
   */
  it("mirrors the seat rail exactly — never the company bottom nav", () => {
    const seatBottom = betaBottomNav("acme-sro", { isEmployeeSeat: true })
    const seatRail = betaRailNav("acme-sro", { isEmployeeSeat: true }).filter(
      (entry) => entry !== "separator",
    )

    expect(tabs(seatBottom)).toHaveLength(seatRail.length)
    expect(seatBottom.every((slot) => slot.kind === "tab")).toBe(true)
    expect(tabs(seatBottom).map((t) => t.labelKey)).toEqual(
      seatRail.map((e) => e.labelKey),
    )
    expect(tabs(seatBottom).map((t) => t.href)).toEqual(
      seatRail.map((e) => e.href),
    )
    expect(tabs(seatBottom).map((t) => t.icon)).toEqual(
      seatRail.map((e) => e.icon),
    )
  })

  it("gives the seat no FAB and no Více, whatever canUpload/role flags say", () => {
    const seatBottom = betaBottomNav("acme-sro", {
      isEmployeeSeat: true,
      canUpload: true,
      isOwner: true,
      isManagement: true,
      showAssistant: true,
    })
    expect(fab(seatBottom)).toBeUndefined()
    expect(more(seatBottom)).toBeUndefined()
    expect(tabs(seatBottom).map((t) => t.labelKey)).toEqual([
      "prehled",
      "dokumenty",
      "mojeMzda",
    ])
  })

  it("never gives a seat a company module, even hidden in Více", () => {
    const seatBottom = betaBottomNav("acme-sro", { isEmployeeSeat: true })
    const labels = seatBottom.flatMap((slot) =>
      slot.kind === "more"
        ? slot.items.map((i) => i.labelKey)
        : [slot.labelKey],
    )
    for (const hidden of ["dane", "finance", "vykazy", "majetek"] as const) {
      expect(labels).not.toContain(hidden)
    }
  })
})
