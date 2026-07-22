"use client"

// React context holding the whole editable /fakturace document. Auto-persists to
// localStorage on every change (crash recovery) and mirrors the parties to a
// separate key so they survive a services reset / seed next month's invoice.
// Hydrates from localStorage on mount (server render uses the empty doc so the
// first client render matches — no hydration mismatch).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import type {
  BankInfo,
  FakturaceDoc,
  InvoiceMeta,
  Party,
  ServiceItem,
  ServiceKind,
  Sleva,
  Zaloha,
} from "./types"
import { computeTotals, type Totals } from "./calc"
import {
  emptyDoc,
  loadLocal,
  loadParties,
  newService,
  newZaloha,
  saveLocal,
  saveParties,
} from "./xml"

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
  setSleva: (patch: Partial<Sleva>) => void
  setMeta: (patch: Partial<InvoiceMeta>) => void
  /** Replace the whole document (working-file import). */
  loadDoc: (doc: FakturaceDoc) => void
  /** Wipe everything back to a blank document. */
  resetAll: () => void
  /** Clear only services + zálohy + meta, keeping the parties + bank. */
  resetServices: () => void
  /** Seed the parties + bank from the stored parties key; true when applied. */
  loadStoredParties: () => boolean
}

const FakturaceContext = createContext<FakturaceContextValue | null>(null)

export function FakturaceProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<FakturaceDoc>(emptyDoc)
  const hydrated = useRef(false)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot client-only localStorage hydration on mount; server render intentionally starts from the empty doc */
    const stored = loadLocal()
    if (stored) {
      setDoc(stored)
    } else {
      // No prior draft: seed the parties from their own key if present.
      const parties = loadParties()
      if (parties) {
        setDoc((prev) => ({
          ...prev,
          supplier: parties.supplier,
          bank: parties.bank,
          customer: parties.customer,
        }))
      }
    }
    hydrated.current = true
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  // Persist after hydration so the initial empty state never clobbers stored data.
  useEffect(() => {
    if (!hydrated.current) return
    saveLocal(doc)
    saveParties(doc)
  }, [doc])

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

  const setSleva = useCallback((patch: Partial<Sleva>) => {
    setDoc((prev) => ({ ...prev, sleva: { ...prev.sleva, ...patch } }))
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

  const loadStoredParties = useCallback((): boolean => {
    const parties = loadParties()
    if (!parties) return false
    setDoc((prev) => ({
      ...prev,
      supplier: parties.supplier,
      bank: parties.bank,
      customer: parties.customer,
    }))
    return true
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
    setSleva,
    setMeta,
    loadDoc,
    resetAll,
    resetServices,
    loadStoredParties,
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
