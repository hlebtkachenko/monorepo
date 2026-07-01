/**
 * Admission caps unit tests (ADR-0028 §Decision.1) — PURE, no container.
 *
 * Covers the kill-switch (fails closed), the global cap, the per-key cap,
 * slot release freeing capacity, and idempotent release. No DB: the module is
 * in-memory, so these run without the testcontainer even though the shared
 * globalSetup boots one for the package's integration tests.
 */

import { describe, expect, it } from "vitest"
import {
  AdmissionController,
  AdmissionRejected,
  isBrainRuntimeActive,
} from "../src/admission.js"

const alwaysActive = { isActive: () => true }

describe("isBrainRuntimeActive — kill-switch fails closed", () => {
  it("denies when unset", () => {
    expect(isBrainRuntimeActive({})).toBe(false)
  })

  it("denies for empty / false-ish values", () => {
    for (const raw of ["", "false", "0", "no", "off", "  "]) {
      expect(isBrainRuntimeActive({ BRAIN_RUNTIME_ACTIVE: raw })).toBe(false)
    }
  })

  it("admits only for explicit truthy strings", () => {
    for (const raw of ["true", "TRUE", " 1 ", "1", "True"]) {
      expect(isBrainRuntimeActive({ BRAIN_RUNTIME_ACTIVE: raw })).toBe(true)
    }
  })
})

describe("AdmissionController — kill-switch", () => {
  it("rejects every acquire when inactive, even under caps", () => {
    const ctrl = new AdmissionController(
      { global: 10, perKey: 10 },
      { isActive: () => false },
    )
    try {
      ctrl.acquire("org-a")
      throw new Error("expected AdmissionRejected")
    } catch (err) {
      expect(err).toBeInstanceOf(AdmissionRejected)
      expect((err as AdmissionRejected).reason).toBe("kill_switch_inactive")
    }
    expect(ctrl.inFlight).toBe(0)
  })
})

describe("AdmissionController — per-key cap", () => {
  it("rejects the run over the per-key cap and admits again after release", () => {
    const ctrl = new AdmissionController(
      { global: 100, perKey: 2 },
      alwaysActive,
    )
    const s1 = ctrl.acquire("org-a")
    const s2 = ctrl.acquire("org-a")
    expect(ctrl.inFlightFor("org-a")).toBe(2)

    expect(() => ctrl.acquire("org-a")).toThrowError(AdmissionRejected)
    try {
      ctrl.acquire("org-a")
    } catch (err) {
      expect((err as AdmissionRejected).reason).toBe("per_key_cap_exceeded")
    }

    // A different key is unaffected by org-a saturation.
    const other = ctrl.acquire("org-b")
    expect(ctrl.inFlightFor("org-b")).toBe(1)

    // Freeing an org-a slot lets a new org-a run in.
    s1.release()
    expect(ctrl.inFlightFor("org-a")).toBe(1)
    const s3 = ctrl.acquire("org-a")
    expect(ctrl.inFlightFor("org-a")).toBe(2)

    s2.release()
    s3.release()
    other.release()
    expect(ctrl.inFlight).toBe(0)
    expect(ctrl.inFlightFor("org-a")).toBe(0)
  })
})

describe("AdmissionController — global cap", () => {
  it("rejects over the global cap across different keys", () => {
    const ctrl = new AdmissionController(
      { global: 2, perKey: 10 },
      alwaysActive,
    )
    const s1 = ctrl.acquire("org-a")
    const s2 = ctrl.acquire("org-b")
    expect(ctrl.inFlight).toBe(2)

    try {
      ctrl.acquire("org-c")
      throw new Error("expected AdmissionRejected")
    } catch (err) {
      expect(err).toBeInstanceOf(AdmissionRejected)
      expect((err as AdmissionRejected).reason).toBe("global_cap_exceeded")
    }

    // Global check precedes per-key: org-c had 0 in-flight yet was rejected.
    expect(ctrl.inFlightFor("org-c")).toBe(0)

    s1.release()
    const s3 = ctrl.acquire("org-c")
    expect(ctrl.inFlight).toBe(2)

    s2.release()
    s3.release()
    expect(ctrl.inFlight).toBe(0)
  })
})

describe("AdmissionController — release is idempotent", () => {
  it("a double release does not double-free a slot", () => {
    const ctrl = new AdmissionController({ global: 1, perKey: 1 }, alwaysActive)
    const s1 = ctrl.acquire("org-a")
    s1.release()
    s1.release() // no-op
    expect(ctrl.inFlight).toBe(0)
    expect(ctrl.inFlightFor("org-a")).toBe(0)

    // Capacity is exactly 1 again — not 2 from a double-free.
    const s2 = ctrl.acquire("org-a")
    expect(() => ctrl.acquire("org-b")).toThrowError(AdmissionRejected)
    s2.release()
  })
})

describe("AdmissionController — construction guards", () => {
  it("rejects negative or non-integer caps", () => {
    expect(() => new AdmissionController({ global: -1, perKey: 1 })).toThrow()
    expect(() => new AdmissionController({ global: 1, perKey: 1.5 })).toThrow()
  })
})
