"use client"

// React context holding the whole editable /fakturace document. State lives only
// in memory; the sole persistence is the explicit local XML working file
// (see xml.ts) the user saves and reloads — nothing is written to browser
// storage, so no data (incl. bank details) is ever persisted client-side.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import type {
  BankInfo,
  FakturaceDoc,
  Filing,
  InvoiceMeta,
  Party,
  ReportMetric,
  ServiceItem,
  ServiceKind,
  Zaloha,
} from "./types"
import { computeTotals, type Totals } from "./calc"
import { emptyDoc, newFiling, newMetric, newService, newZaloha } from "./xml"

/** Which party block a mutation targets. */
export type PartyKey = "supplier" | "customer"

interface FakturaceContextValue {
  doc: FakturaceDoc
  totals: Totals
  setParty: (which: PartyKey, patch: Partial<Party>) => void
  setBank: (patch: Partial<BankInfo>) => void
  addService: (kind: ServiceKind) => void
  updateService: (id: string, patch: Partial<ServiceItem>) => void
  removeService: (id: string) => void
  addZaloha: () => void
  updateZaloha: (id: string, patch: Partial<Zaloha>) => void
  removeZaloha: (id: string) => void
  addMetric: () => void
  updateMetric: (id: string, patch: Partial<ReportMetric>) => void
  removeMetric: (id: string) => void
  addFiling: () => void
  updateFiling: (id: string, patch: Partial<Filing>) => void
  removeFiling: (id: string) => void
  setMeta: (patch: Partial<InvoiceMeta>) => void
  /** Replace the whole document (working-file import). */
  loadDoc: (doc: FakturaceDoc) => void
  /** Wipe everything back to a blank document. */
  resetAll: () => void
  /** Clear only services + zálohy + meta, keeping the parties + bank. */
  resetServices: () => void
}

const FakturaceContext = createContext<FakturaceContextValue | null>(null)

export function FakturaceProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<FakturaceDoc>(emptyDoc)

  const totals = useMemo(() => computeTotals(doc), [doc])

  const setParty = useCallback((which: PartyKey, patch: Partial<Party>) => {
    setDoc((prev) => ({ ...prev, [which]: { ...prev[which], ...patch } }))
  }, [])

  const setBank = useCallback((patch: Partial<BankInfo>) => {
    setDoc((prev) => ({ ...prev, bank: { ...prev.bank, ...patch } }))
  }, [])

  const addService = useCallback((kind: ServiceKind) => {
    setDoc((prev) => ({
      ...prev,
      services: [...prev.services, newService(kind)],
    }))
  }, [])

  const updateService = useCallback(
    (id: string, patch: Partial<ServiceItem>) => {
      setDoc((prev) => ({
        ...prev,
        services: prev.services.map((s) =>
          s.id === id ? { ...s, ...patch } : s,
        ),
      }))
    },
    [],
  )

  const removeService = useCallback((id: string) => {
    setDoc((prev) => ({
      ...prev,
      services: prev.services.filter((s) => s.id !== id),
    }))
  }, [])

  const addZaloha = useCallback(() => {
    setDoc((prev) => ({ ...prev, zalohy: [...prev.zalohy, newZaloha()] }))
  }, [])

  const updateZaloha = useCallback((id: string, patch: Partial<Zaloha>) => {
    setDoc((prev) => ({
      ...prev,
      zalohy: prev.zalohy.map((z) => (z.id === id ? { ...z, ...patch } : z)),
    }))
  }, [])

  const removeZaloha = useCallback((id: string) => {
    setDoc((prev) => ({
      ...prev,
      zalohy: prev.zalohy.filter((z) => z.id !== id),
    }))
  }, [])

  const addMetric = useCallback(() => {
    setDoc((prev) => ({
      ...prev,
      reportMetrics: [...prev.reportMetrics, newMetric()],
    }))
  }, [])

  const updateMetric = useCallback(
    (id: string, patch: Partial<ReportMetric>) => {
      setDoc((prev) => ({
        ...prev,
        reportMetrics: prev.reportMetrics.map((m) =>
          m.id === id ? { ...m, ...patch } : m,
        ),
      }))
    },
    [],
  )

  const removeMetric = useCallback((id: string) => {
    setDoc((prev) => ({
      ...prev,
      reportMetrics: prev.reportMetrics.filter((m) => m.id !== id),
    }))
  }, [])

  const addFiling = useCallback(() => {
    setDoc((prev) => ({ ...prev, filings: [...prev.filings, newFiling()] }))
  }, [])

  const updateFiling = useCallback((id: string, patch: Partial<Filing>) => {
    setDoc((prev) => ({
      ...prev,
      filings: prev.filings.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }))
  }, [])

  const removeFiling = useCallback((id: string) => {
    setDoc((prev) => ({
      ...prev,
      filings: prev.filings.filter((f) => f.id !== id),
    }))
  }, [])

  const setMeta = useCallback((patch: Partial<InvoiceMeta>) => {
    setDoc((prev) => ({ ...prev, meta: { ...prev.meta, ...patch } }))
  }, [])

  const loadDoc = useCallback((next: FakturaceDoc) => {
    setDoc(next)
  }, [])

  const resetAll = useCallback(() => {
    setDoc(emptyDoc())
  }, [])

  const resetServices = useCallback(() => {
    setDoc((prev) => ({
      ...emptyDoc(),
      supplier: prev.supplier,
      bank: prev.bank,
      customer: prev.customer,
    }))
  }, [])

  const value: FakturaceContextValue = {
    doc,
    totals,
    setParty,
    setBank,
    addService,
    updateService,
    removeService,
    addZaloha,
    updateZaloha,
    removeZaloha,
    addMetric,
    updateMetric,
    removeMetric,
    addFiling,
    updateFiling,
    removeFiling,
    setMeta,
    loadDoc,
    resetAll,
    resetServices,
  }

  return (
    <FakturaceContext.Provider value={value}>
      {children}
    </FakturaceContext.Provider>
  )
}

export function useFakturace(): FakturaceContextValue {
  const ctx = useContext(FakturaceContext)
  if (!ctx) {
    throw new Error("useFakturace must be used within a FakturaceProvider")
  }
  return ctx
}
