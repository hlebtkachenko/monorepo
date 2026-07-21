"use client"

// React context holding the whole editable Výkazy document (org identification +
// the per-statement value maps + rozsah) plus a screen-only hide-empty toggle.
// Auto-persists to localStorage on every change; hydrates from it on mount.
//
// It also owns the EDITABLE účetní deník as the single source of truth for the
// výkazy. The deník is a plain DenikRow[]; importing an XLSX, editing a cell,
// appending a row, or deleting a row all funnel through one central
// `recomputeFromDenik(rows)` that rebuilds the obratová předvaha, maps it onto
// the rozvaha/VZZ leaves, links the VZZ result into rozvaha A.V. (řádek 022), and
// writes those derived values into the three value maps — touching ONLY the
// bezne/brutto/korekce columns. The `minule` column (prior-year import) is left
// intact, and any cell the user has overridden keeps its manual value. So editing
// `castka`/`md`/`dal` recomputes the výkazy live.
//
// A derived leaf is "sourced" (rendered grey) until the user clicks it, which
// records a per-cell override that flips it back to a normal editable input.
//
// The deník rows + override sets are persisted separately and size-guarded
// (~2MB → memory only when over). `toDoc()` folds the whole state (org + values +
// rozsah + deník rows + overrides) into ONE VykazyDoc for JSON export; `loadDoc()`
// restores it — the předvaha is rebuilt from the rows, so one exported file
// round-trips the entire workspace including its edited deník.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import type { ColKey, OrgConfig, Rozsah, VykazValues } from "./types"
import type { DenikParseResult, DenikRow } from "./denik"
import { buildPredvaha, type Predvaha } from "./predvaha"
import { mapPredvahaToValues } from "./mapping"
import { computeColumn } from "./engine"
import { VZZ } from "../_data/vzz"
import {
  DOC_VERSION,
  emptyDoc,
  loadLocal,
  saveLocal,
  VALUES_KEY,
  type MinuleJson,
  type StatementKey,
  type VykazValuesByStatement,
  type VykazyDoc,
} from "./storage"

/** Editable OrgConfig fields that are plain text (everything except vTisicich). */
export type OrgTextKey = Exclude<keyof OrgConfig, "vTisicich">

/** One-time XLSX import diagnostics, kept so the panel can surface parse issues.
 * Null once no import produced them (e.g. after a JSON reload or manual rows). */
export interface DenikMeta {
  ignoredColumns: string[]
  warnings: string[]
  headerOk: boolean
  missingHeaders: string[]
}

/** Per-statement set of overridden leaf cells, keyed by `${rada}:${col}`. */
type OverrideSets = Record<StatementKey, Set<string>>

/** Columns the deník mapping owns. Everything else on a cell (notably `minule`)
 * is left untouched by a recompute. */
const DERIVED_COLS: ColKey[] = ["brutto", "korekce", "bezne"]

/** DenikRow fields that feed `buildPredvaha` (obratová předvaha + byZdroj). A row
 * patch touching none of these cannot change any předvaha/výkaz output, so its
 * recompute is skipped. */
const ACCOUNTING_KEYS = new Set<string>(["md", "dal", "castka", "zdroj"])

/** A stable, empty předvaha for the "no deník loaded" state. */
const EMPTY_PREDVAHA: Predvaha = buildPredvaha([])

interface OrgContextValue {
  doc: VykazyDoc
  org: OrgConfig
  rozsah: Rozsah
  values: VykazValuesByStatement
  hideEmpty: boolean
  // Deník-derived state.
  /** The editable deník rows (the single source of truth). `[]` when none. */
  denik: DenikRow[]
  /** Obratová předvaha derived from the current rows (empty when none). */
  predvaha: Predvaha
  denikUnmapped: string[]
  denikLoaded: boolean
  /** Diagnostics from the last XLSX import, or null. */
  denikMeta: DenikMeta | null
  setOrgText: (key: OrgTextKey, value: string) => void
  /** Merge a partial OrgConfig in one shot (e.g. from an ARES lookup). */
  patchOrg: (partial: Partial<OrgConfig>) => void
  setVTisicich: (value: boolean) => void
  setRozsah: (rozsah: Rozsah) => void
  setHideEmpty: (value: boolean) => void
  setCell: (
    statement: StatementKey,
    rada: string,
    col: ColKey,
    value: number | null,
  ) => void
  /** True while a leaf still shows an un-overridden value from the deník. */
  isSourced: (statement: StatementKey, rada: string, col: ColKey) => boolean
  /** Flip a sourced leaf back to a normal editable cell without changing its value. */
  overrideCell: (statement: StatementKey, rada: string, col: ColKey) => void
  /** Load a parsed XLSX deník: replaces the rows and recomputes from scratch. */
  importDenik: (result: DenikParseResult) => void
  /** Patch one deník row in place, then recompute the výkazy. */
  updateDenikRow: (index: number, patch: Partial<DenikRow>) => void
  /** Append a blank/defaulted deník row, then recompute the výkazy. */
  addDenikRow: (row?: Partial<DenikRow>) => void
  /** Remove a deník row by index, then recompute the výkazy. */
  deleteDenikRow: (index: number) => void
  /** Fill ONLY the `minule` column of both statements from a prior-year file. */
  importMinule: (m: MinuleJson) => void
  clearDenik: () => void
  /** Assemble the COMPLETE document (org + values + rozsah + deník rows +
   * overrides) for JSON export — the whole workspace in one file. */
  toDoc: () => VykazyDoc
  loadDoc: (doc: VykazyDoc) => void
  reset: () => void
}

const OrgContext = createContext<OrgContextValue | null>(null)

// --- deník persistence (separate blob, size-guarded) -------------------------

const DENIK_STORAGE_KEY = "vykazy-denik"
const DENIK_MAX_BYTES = 2 * 1024 * 1024

function emptyOverrides(): OverrideSets {
  return {
    "rozvaha-aktiva": new Set(),
    "rozvaha-pasiva": new Set(),
    vzz: new Set(),
  }
}

/** A fresh, fully-blank deník row (all defaults), overlaid with any given seed. */
function blankRow(row?: Partial<DenikRow>): DenikRow {
  return {
    datum: "",
    tpUD: "",
    zdroj: "",
    cislo: "",
    text: "",
    md: "",
    dal: "",
    castka: 0,
    ...row,
  }
}

/**
 * Merge freshly-derived deník values onto the existing statement values, in
 * place of the previous derived numbers, while preserving:
 *  - every NON-derived column (notably `minule` — the prior-year import), and
 *  - any cell the user overrode (kept from `prev`, not from `derived`).
 * Non-overridden derived cells absent from `derived` are cleared, so removing a
 * posting cleanly drops its stale value.
 */
function mergeSourced(
  prev: VykazValues,
  derived: VykazValues,
  overrideSet: Set<string>,
): VykazValues {
  const next: VykazValues = {}
  const radky = new Set<string>([...Object.keys(prev), ...Object.keys(derived)])
  for (const rada of radky) {
    const prevCell = prev[rada] ?? {}
    const derivedCell = derived[rada] ?? {}
    const cell: Partial<Record<ColKey, number>> = {}
    // Keep every non-derived column (minule, …) exactly as it was.
    for (const col of Object.keys(prevCell) as ColKey[]) {
      if (!DERIVED_COLS.includes(col)) {
        const v = prevCell[col]
        if (v !== undefined) cell[col] = v
      }
    }
    // Derived columns: an overridden cell keeps the user's value; otherwise the
    // freshly mapped value wins (and absence clears the stale one).
    for (const col of DERIVED_COLS) {
      if (overrideSet.has(`${rada}:${col}`)) {
        const v = prevCell[col]
        if (v !== undefined) cell[col] = v
      } else {
        const v = derivedCell[col]
        if (v !== undefined) cell[col] = v
      }
    }
    if (Object.keys(cell).length > 0) next[rada] = cell
  }
  return next
}

function saveDenikLocal(
  rows: DenikRow[],
  overrides: OverrideSets,
  loaded: boolean,
): void {
  if (typeof window === "undefined") return
  try {
    if (!loaded) {
      window.localStorage.removeItem(DENIK_STORAGE_KEY)
      return
    }
    const payload = JSON.stringify({
      rows,
      loaded,
      overrides: {
        "rozvaha-aktiva": [...overrides["rozvaha-aktiva"]],
        "rozvaha-pasiva": [...overrides["rozvaha-pasiva"]],
        vzz: [...overrides.vzz],
      },
    })
    if (new Blob([payload]).size > DENIK_MAX_BYTES) {
      // Too large to persist — keep it in memory only, drop any stale copy.
      window.localStorage.removeItem(DENIK_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(DENIK_STORAGE_KEY, payload)
  } catch {
    // storage full / unavailable (private mode) — non-fatal.
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function toStringSet(v: unknown): Set<string> {
  if (!Array.isArray(v)) return new Set()
  return new Set(v.filter((x): x is string => typeof x === "string"))
}

/** Light coercion of our own persisted deník rows (trusted origin). */
function coerceRows(v: unknown): DenikRow[] {
  if (!Array.isArray(v)) return []
  const rows: DenikRow[] = []
  for (const raw of v) {
    if (!isRecord(raw)) continue
    rows.push(blankRow(raw as Partial<DenikRow>))
  }
  return rows
}

function loadDenikLocal(): {
  rows: DenikRow[]
  overrides: OverrideSets
  loaded: boolean
} | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(DENIK_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !Array.isArray(parsed.rows)) return null
    const overridesRaw = isRecord(parsed.overrides) ? parsed.overrides : {}
    return {
      rows: coerceRows(parsed.rows),
      overrides: {
        "rozvaha-aktiva": toStringSet(overridesRaw["rozvaha-aktiva"]),
        "rozvaha-pasiva": toStringSet(overridesRaw["rozvaha-pasiva"]),
        vzz: toStringSet(overridesRaw.vzz),
      },
      loaded: parsed.loaded !== false,
    }
  } catch {
    return null
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<VykazyDoc>(emptyDoc)
  const [hideEmpty, setHideEmpty] = useState(false)
  const [denikRows, setDenikRows] = useState<DenikRow[]>([])
  const [predvaha, setPredvaha] = useState<Predvaha>(EMPTY_PREDVAHA)
  const [denikUnmapped, setDenikUnmapped] = useState<string[]>([])
  const [denikMeta, setDenikMeta] = useState<DenikMeta | null>(null)
  const [denikLoaded, setDenikLoaded] = useState(false)
  const [overrides, setOverrides] = useState<OverrideSets>(emptyOverrides)
  const hydrated = useRef(false)

  // Refs mirror the latest state so the imperative deník operations can read the
  // current rows/overrides/loaded flag synchronously (they run outside render and
  // often chain a recompute in the same tick, before React re-renders).
  const denikRowsRef = useRef<DenikRow[]>([])
  const overridesRef = useRef<OverrideSets>(emptyOverrides())
  const denikLoadedRef = useRef(false)

  const writeRows = useCallback((rows: DenikRow[]) => {
    denikRowsRef.current = rows
    setDenikRows(rows)
  }, [])

  const writeOverrides = useCallback((next: OverrideSets) => {
    overridesRef.current = next
    setOverrides(next)
  }, [])

  const writeDenikLoaded = useCallback((loaded: boolean) => {
    denikLoadedRef.current = loaded
    setDenikLoaded(loaded)
  }, [])

  // The single recompute path shared by import + every row edit. Rebuilds the
  // předvaha, maps it onto the leaves, links the VZZ result into rozvaha A.V.
  // (022), then merges those derived numbers into the value maps — preserving
  // `minule` and any overridden cell.
  const recomputeFromDenik = useCallback((rows: DenikRow[]) => {
    const pv = buildPredvaha(rows)
    const mapped = mapPredvahaToValues(pv.ucty)
    const vh = computeColumn(VZZ, "bezne", mapped.vzz)["055"] ?? 0
    mapped.rozvahaPasiva["022"] = {
      ...(mapped.rozvahaPasiva["022"] ?? {}),
      bezne: vh,
    }
    const ov = overridesRef.current
    setDoc((prev) => ({
      ...prev,
      values: {
        rozvahaAktiva: mergeSourced(
          prev.values.rozvahaAktiva,
          mapped.rozvahaAktiva,
          ov["rozvaha-aktiva"],
        ),
        rozvahaPasiva: mergeSourced(
          prev.values.rozvahaPasiva,
          mapped.rozvahaPasiva,
          ov["rozvaha-pasiva"],
        ),
        vzz: mergeSourced(prev.values.vzz, mapped.vzz, ov.vzz),
      },
    }))
    setPredvaha(pv)
    setDenikUnmapped(mapped.unmapped)
  }, [])

  const applyRows = useCallback(
    (rows: DenikRow[]) => {
      writeRows(rows)
      recomputeFromDenik(rows)
    },
    [writeRows, recomputeFromDenik],
  )

  // Hydrate both the document and the deník after mount (server render uses the
  // empty doc so the first client render matches — no hydration mismatch). The
  // stored doc already carries the recomputed values, so only the předvaha /
  // unmapped list are re-derived from the rows here (no value recompute).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot client-only localStorage hydration on mount; server render intentionally starts from the empty doc */
    const stored = loadLocal()
    if (stored) setDoc(stored)
    const storedDenik = loadDenikLocal()
    if (storedDenik) {
      const pv = buildPredvaha(storedDenik.rows)
      writeRows(storedDenik.rows)
      setPredvaha(pv)
      setDenikUnmapped(mapPredvahaToValues(pv.ucty).unmapped)
      writeOverrides(storedDenik.overrides)
      writeDenikLoaded(storedDenik.loaded)
    }
    hydrated.current = true
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [writeRows, writeOverrides, writeDenikLoaded])

  // Persist after hydration so the initial empty state never clobbers stored data.
  useEffect(() => {
    if (!hydrated.current) return
    saveLocal(doc)
  }, [doc])

  useEffect(() => {
    if (!hydrated.current) return
    saveDenikLocal(denikRows, overrides, denikLoaded)
  }, [denikRows, overrides, denikLoaded])

  const setOrgText = useCallback((key: OrgTextKey, value: string) => {
    setDoc((prev) => {
      const org: OrgConfig = { ...prev.org, [key]: value }
      return { ...prev, org }
    })
  }, [])

  const patchOrg = useCallback((partial: Partial<OrgConfig>) => {
    setDoc((prev) => ({ ...prev, org: { ...prev.org, ...partial } }))
  }, [])

  const setVTisicich = useCallback((value: boolean) => {
    setDoc((prev) => ({ ...prev, org: { ...prev.org, vTisicich: value } }))
  }, [])

  const setRozsah = useCallback((rozsah: Rozsah) => {
    setDoc((prev) => ({ ...prev, rozsah }))
  }, [])

  const setCell = useCallback(
    (
      statement: StatementKey,
      rada: string,
      col: ColKey,
      value: number | null,
    ) => {
      const key = VALUES_KEY[statement]
      setDoc((prev) => {
        const statementValues: VykazValues = { ...prev.values[key] }
        const cell: Partial<Record<ColKey, number>> = {
          ...statementValues[rada],
        }
        if (value === null) {
          delete cell[col]
        } else {
          cell[col] = value
        }
        if (Object.keys(cell).length === 0) {
          delete statementValues[rada]
        } else {
          statementValues[rada] = cell
        }
        return {
          ...prev,
          values: { ...prev.values, [key]: statementValues },
        }
      })
      // A manual edit while a deník is loaded turns this leaf into an override,
      // flipping it back from grey/derived to a normal editable cell and keeping
      // it from being clobbered by the next recompute.
      if (denikLoadedRef.current) {
        const okey = `${rada}:${col}`
        const cur = overridesRef.current
        if (!cur[statement].has(okey)) {
          const nextSet = new Set(cur[statement])
          nextSet.add(okey)
          writeOverrides({ ...cur, [statement]: nextSet })
        }
      }
    },
    [writeOverrides],
  )

  const isSourced = useCallback(
    (statement: StatementKey, rada: string, col: ColKey): boolean => {
      if (!denikLoaded) return false
      if (overrides[statement].has(`${rada}:${col}`)) return false
      return doc.values[VALUES_KEY[statement]][rada]?.[col] !== undefined
    },
    [denikLoaded, overrides, doc.values],
  )

  const overrideCell = useCallback(
    (statement: StatementKey, rada: string, col: ColKey) => {
      const okey = `${rada}:${col}`
      const cur = overridesRef.current
      if (cur[statement].has(okey)) return
      const nextSet = new Set(cur[statement])
      nextSet.add(okey)
      writeOverrides({ ...cur, [statement]: nextSet })
    },
    [writeOverrides],
  )

  const importDenik = useCallback(
    (result: DenikParseResult) => {
      // A fresh import starts from a clean slate: no overrides carried over.
      writeOverrides(emptyOverrides())
      writeDenikLoaded(true)
      setDenikMeta({
        ignoredColumns: result.ignoredColumns,
        warnings: result.warnings,
        headerOk: result.headerOk,
        missingHeaders: result.missingHeaders,
      })
      applyRows(result.rows)
    },
    [writeOverrides, writeDenikLoaded, applyRows],
  )

  const updateDenikRow = useCallback(
    (index: number, patch: Partial<DenikRow>) => {
      const cur = denikRowsRef.current
      const target = cur[index]
      if (!target) return
      const next = cur.slice()
      next[index] = { ...target, ...patch }
      // Only the accounting fields (md/dal/castka/zdroj) can move the předvaha.
      // A patch disjoint from them (datum, text, firma, …) just updates the rows
      // (persisted via the deník effect) and skips the full recompute.
      const touchesAccounting = Object.keys(patch).some((k) =>
        ACCOUNTING_KEYS.has(k),
      )
      if (touchesAccounting) {
        applyRows(next)
      } else {
        writeRows(next)
      }
    },
    [applyRows, writeRows],
  )

  const addDenikRow = useCallback(
    (row?: Partial<DenikRow>) => {
      if (!denikLoadedRef.current) writeDenikLoaded(true)
      applyRows([...denikRowsRef.current, blankRow(row)])
    },
    [writeDenikLoaded, applyRows],
  )

  const deleteDenikRow = useCallback(
    (index: number) => {
      const cur = denikRowsRef.current
      if (index < 0 || index >= cur.length) return
      applyRows(cur.filter((_, i) => i !== index))
    },
    [applyRows],
  )

  const importMinule = useCallback((m: MinuleJson) => {
    setDoc((prev) => {
      const apply = (
        current: VykazValues,
        entries: Record<string, number>,
      ): VykazValues => {
        const next: VykazValues = { ...current }
        for (const [rada, value] of Object.entries(entries)) {
          next[rada] = { ...next[rada], minule: value }
        }
        return next
      }
      return {
        ...prev,
        values: {
          rozvahaAktiva: apply(
            prev.values.rozvahaAktiva,
            m.minule.rozvahaAktiva,
          ),
          rozvahaPasiva: apply(
            prev.values.rozvahaPasiva,
            m.minule.rozvahaPasiva,
          ),
          vzz: apply(prev.values.vzz, m.minule.vzz),
        },
      }
    })
  }, [])

  const clearDenik = useCallback(() => {
    // Clear ONLY the deník-derived columns through the same merge path a recompute
    // uses (empty derived mapping), so the independently-imported `minule` column
    // and every manually-overridden cell survive — exactly as recomputeFromDenik
    // preserves them. Non-overridden derived cells fall away; overridden ones keep
    // their value (they were manual entries). Then wipe the deník + override state.
    const ov = overridesRef.current
    setDoc((prev) => ({
      ...prev,
      values: {
        rozvahaAktiva: mergeSourced(
          prev.values.rozvahaAktiva,
          {},
          ov["rozvaha-aktiva"],
        ),
        rozvahaPasiva: mergeSourced(
          prev.values.rozvahaPasiva,
          {},
          ov["rozvaha-pasiva"],
        ),
        vzz: mergeSourced(prev.values.vzz, {}, ov.vzz),
      },
    }))
    writeRows([])
    writeOverrides(emptyOverrides())
    writeDenikLoaded(false)
    setPredvaha(EMPTY_PREDVAHA)
    setDenikUnmapped([])
    setDenikMeta(null)
  }, [writeRows, writeOverrides, writeDenikLoaded])

  // Assemble the full document for export: the form doc plus the current deník
  // rows and override sets (mapped from the in-memory kebab StatementKeys to the
  // doc's camelCase keys). Deník + overrides are included only when a deník is
  // loaded with rows — an override without a deník is inert.
  const toDoc = useCallback((): VykazyDoc => {
    const full: VykazyDoc = {
      version: DOC_VERSION,
      org: doc.org,
      values: doc.values,
      rozsah: doc.rozsah,
    }
    if (denikLoaded && denikRows.length > 0) {
      full.denik = denikRows
      full.overrides = {
        rozvahaAktiva: [...overrides["rozvaha-aktiva"]],
        rozvahaPasiva: [...overrides["rozvaha-pasiva"]],
        vzz: [...overrides.vzz],
      }
    }
    return full
  }, [doc, denikLoaded, denikRows, overrides])

  // Restore a full document: org + values + rozsah as before, and — when the doc
  // carries deník rows — restore the rows, rebuild the předvaha + unmapped list
  // from them, re-mark the panel as loaded, and restore the override sets. The
  // výkaz numbers (mapped + minulé + overrides) already live in `values`, so the
  // mapping is NOT re-run — the stored values reproduce exactly. No deník rows =
  // clear all deník state.
  const loadDoc = useCallback(
    (next: VykazyDoc) => {
      setDoc({
        version: next.version,
        org: next.org,
        values: next.values,
        rozsah: next.rozsah,
      })
      const rows = next.denik ?? []
      setDenikMeta(null)
      if (rows.length > 0) {
        const pv = buildPredvaha(rows)
        writeRows(rows)
        setPredvaha(pv)
        setDenikUnmapped(mapPredvahaToValues(pv.ucty).unmapped)
        writeOverrides({
          "rozvaha-aktiva": new Set(next.overrides?.rozvahaAktiva ?? []),
          "rozvaha-pasiva": new Set(next.overrides?.rozvahaPasiva ?? []),
          vzz: new Set(next.overrides?.vzz ?? []),
        })
        writeDenikLoaded(true)
      } else {
        writeRows([])
        setPredvaha(EMPTY_PREDVAHA)
        setDenikUnmapped([])
        writeOverrides(emptyOverrides())
        writeDenikLoaded(false)
      }
    },
    [writeRows, writeOverrides, writeDenikLoaded],
  )

  const reset = useCallback(() => {
    setDoc(emptyDoc())
    writeRows([])
    writeOverrides(emptyOverrides())
    writeDenikLoaded(false)
    setPredvaha(EMPTY_PREDVAHA)
    setDenikUnmapped([])
    setDenikMeta(null)
  }, [writeRows, writeOverrides, writeDenikLoaded])

  const value: OrgContextValue = {
    doc,
    org: doc.org,
    rozsah: doc.rozsah,
    values: doc.values,
    hideEmpty,
    denik: denikRows,
    predvaha,
    denikUnmapped,
    denikLoaded,
    denikMeta,
    setOrgText,
    patchOrg,
    setVTisicich,
    setRozsah,
    setHideEmpty,
    setCell,
    isSourced,
    overrideCell,
    importDenik,
    updateDenikRow,
    addDenikRow,
    deleteDenikRow,
    importMinule,
    clearDenik,
    toDoc,
    loadDoc,
    reset,
  }

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error("useOrg must be used within an OrgProvider")
  return ctx
}
