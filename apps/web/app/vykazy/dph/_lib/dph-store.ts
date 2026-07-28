// Persistence for the DPH evidence.
//
// Its own storage key, separate from `vykazy-doc` and `vykazy-denik`, for two
// reasons. The evidence is the only part of the builder that holds counterparty
// TAX IDENTIFIERS, and for an OSVČ a DIČ is a rodné číslo — so it gets its own
// lifecycle, its own wipe, and a default that does NOT outlive the browser tab.
// And keeping it out of the doc means a keystroke in the evidence table does not
// re-serialize the whole rozvaha/VZZ document on every change.
//
// Default storage is sessionStorage: the evidence disappears when the tab closes.
// `/vykazy` is a login-free public route, so anything durable on a shared machine
// is a liability the user has to opt into deliberately, not opt out of.

import type { DphEvidence } from "./dph-evidence"
import { emptyEvidence } from "./dph-evidence"

const KEY = "vykazy-dph"
const MODE_KEY = "vykazy-dph-mode"

/** Where the evidence lives. "session" clears with the tab; "local" persists. */
export type DphStorageMode = "session" | "local"

/**
 * Refuse to write more than this. Every key on the origin shares one ~5 MB quota
 * with `vykazy-doc` and `vykazy-denik` (itself capped at 2 MB), so an unbounded
 * evidence blob can push the whole builder over and take the výkazy down with it.
 */
const MAX_BYTES = 1_500_000

function store(mode: DphStorageMode): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return mode === "local" ? window.localStorage : window.sessionStorage
  } catch {
    // Storage access throws outright when cookies/site data are blocked.
    return null
  }
}

export function getStorageMode(): DphStorageMode {
  if (typeof window === "undefined") return "session"
  try {
    return window.localStorage.getItem(MODE_KEY) === "local"
      ? "local"
      : "session"
  } catch {
    return "session"
  }
}

function setStorageMode(mode: DphStorageMode): void {
  if (typeof window === "undefined") return
  try {
    if (mode === "local") window.localStorage.setItem(MODE_KEY, "local")
    else window.localStorage.removeItem(MODE_KEY)
  } catch {
    // Nothing to do — the mode simply stays at its default.
  }
}

/**
 * Move the evidence to the other store, in one step.
 *
 * Switching the mode and re-saving as two separate calls left the old copy
 * behind: turning "Uchovat v tomto prohlížeči" back off wrote the mode flag and
 * saved into sessionStorage, while the full evidence — every counterparty DIČ,
 * which for an OSVČ is a rodné číslo — stayed in localStorage indefinitely,
 * invisible to `loadEvidence` and never aged out. On a login-free public route
 * that defeats the whole point of the session default.
 */
export function switchStorageMode(
  mode: DphStorageMode,
  evidence: DphEvidence,
): SaveResult {
  if (typeof window === "undefined") return { ok: false, reason: "unavailable" }
  const abandoned = mode === "local" ? "session" : "local"
  setStorageMode(mode)
  const result = saveEvidence(evidence)
  try {
    store(abandoned)?.removeItem(KEY)
  } catch {
    // Best effort — a blocked storage holds nothing to leave behind.
  }
  return result
}

export function loadEvidence(rok: string): DphEvidence {
  const s = store(getStorageMode())
  if (!s) return emptyEvidence(rok)
  try {
    const raw = s.getItem(KEY)
    if (!raw) return emptyEvidence(rok)
    const parsed: unknown = JSON.parse(raw)
    return normalize(parsed, rok)
  } catch {
    return emptyEvidence(rok)
  }
}

export type SaveResult =
  { ok: true } | { ok: false; reason: "too-large" | "unavailable" | "quota" }

/**
 * Persist the evidence. Unlike the builder's document save, this REPORTS failure
 * instead of swallowing it: silently dropping a quota error means the user types
 * four hundred dokladů, reloads, and finds them gone with nothing having said so.
 */
export function saveEvidence(evidence: DphEvidence): SaveResult {
  const s = store(getStorageMode())
  if (!s) return { ok: false, reason: "unavailable" }
  const serialized = JSON.stringify(evidence)
  if (serialized.length > MAX_BYTES) return { ok: false, reason: "too-large" }
  try {
    s.setItem(KEY, serialized)
    return { ok: true }
  } catch {
    return { ok: false, reason: "quota" }
  }
}

/** Remove the evidence from BOTH storages, whichever mode is active. */
export function wipeEvidence(): void {
  if (typeof window === "undefined") return
  for (const s of [window.sessionStorage, window.localStorage]) {
    try {
      s.removeItem(KEY)
    } catch {
      // Best effort — a blocked storage has nothing to wipe anyway.
    }
  }
}

/** Coerce unknown parsed JSON into a valid evidence document. */
function normalize(input: unknown, rok: string): DphEvidence {
  if (typeof input !== "object" || input === null) return emptyEvidence(rok)
  const o = input as Record<string, unknown>
  const rows = Array.isArray(o.rows) ? (o.rows as DphEvidence["rows"]) : []
  const manual =
    typeof o.manual === "object" && o.manual !== null
      ? (o.manual as Record<string, string>)
      : {}
  return {
    version: 1,
    rows,
    manual,
    rok: typeof o.rok === "string" && o.rok !== "" ? o.rok : rok,
    mesic: typeof o.mesic === "string" ? o.mesic : undefined,
    ctvrt: typeof o.ctvrt === "string" ? o.ctvrt : undefined,
    obdobi: o.obdobi === "mesic" || o.obdobi === "ctvrt" ? o.obdobi : undefined,
    khMesic: typeof o.khMesic === "string" ? o.khMesic : undefined,
    khCtvrt: typeof o.khCtvrt === "string" ? o.khCtvrt : undefined,
    khObdobi:
      o.khObdobi === "mesic" || o.khObdobi === "ctvrt" ? o.khObdobi : undefined,
    shMesic: typeof o.shMesic === "string" ? o.shMesic : undefined,
    shCtvrt: typeof o.shCtvrt === "string" ? o.shCtvrt : undefined,
    shObdobi:
      o.shObdobi === "mesic" || o.shObdobi === "ctvrt" ? o.shObdobi : undefined,
    cUfo: typeof o.cUfo === "string" ? o.cUfo : undefined,
    dic: typeof o.dic === "string" ? o.dic : undefined,
    typDs: o.typDs === "P" || o.typDs === "F" ? o.typDs : undefined,
    forma: typeof o.forma === "string" ? o.forma : undefined,
    khForma: typeof o.khForma === "string" ? o.khForma : undefined,
    shForma: typeof o.shForma === "string" ? o.shForma : undefined,
    dZjist: typeof o.dZjist === "string" ? o.dZjist : undefined,
    cJedVyzvy: typeof o.cJedVyzvy === "string" ? o.cJedVyzvy : undefined,
    vyzvaOdp: typeof o.vyzvaOdp === "string" ? o.vyzvaOdp : undefined,
  }
}
