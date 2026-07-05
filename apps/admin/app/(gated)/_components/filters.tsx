"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

interface FilterField {
  name: string
  label: string
  type: "search" | "select"
  options?: Array<{ label: string; value: string }>
  placeholder?: string
}

export interface FilterSchema {
  fields: FilterField[]
}

export interface FiltersProps {
  schema: FilterSchema
  current: Record<string, string>
}

const SEARCH_DEBOUNCE_MS = 300

export function Filters({ schema, current }: FiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const searchFieldNames = useMemo(
    () => schema.fields.filter((f) => f.type === "search").map((f) => f.name),
    [schema.fields],
  )

  const [localSearch, setLocalSearch] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const name of searchFieldNames) init[name] = current[name] ?? ""
    return init
  })

  // Resync local search state when URL searchParams change externally
  // (back/forward, programmatic clear, navigation). Compare to a stable
  // signature of the incoming `current` slice for search fields.
  const externalSignature = useMemo(
    () => searchFieldNames.map((n) => `${n}=${current[n] ?? ""}`).join("&"),
    [current, searchFieldNames],
  )

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const name of searchFieldNames) next[name] = current[name] ?? ""
    setLocalSearch(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSignature])

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushRaw = useCallback(
    (next: Record<string, string>) => {
      const sp = new URLSearchParams()
      for (const [k, v] of Object.entries(next)) {
        if (v && v.length > 0) sp.set(k, v)
      }
      sp.delete("page")
      const qs = sp.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router],
  )

  const cancelPendingPush = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
  }, [])

  useEffect(() => {
    return () => cancelPendingPush()
  }, [cancelPendingPush])

  function setSearchField(name: string, value: string) {
    setLocalSearch((prev) => ({ ...prev, [name]: value }))
    cancelPendingPush()
    debounceTimer.current = setTimeout(() => {
      pushRaw({ ...current, ...localSearch, [name]: value })
    }, SEARCH_DEBOUNCE_MS)
  }

  function setSelectField(name: string, value: string) {
    cancelPendingPush()
    pushRaw({ ...current, ...localSearch, [name]: value })
  }

  function clearAll() {
    cancelPendingPush()
    const cleared: Record<string, string> = {}
    for (const name of searchFieldNames) cleared[name] = ""
    setLocalSearch(cleared)
    pushRaw({})
  }

  const hasAny =
    Object.values(current).some((v) => v && v.length > 0) ||
    Object.values(localSearch).some((v) => v && v.length > 0)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {schema.fields.map((f) => {
        if (f.type === "search") {
          const value = localSearch[f.name] ?? ""
          return (
            <Input
              key={f.name}
              type="search"
              value={value}
              placeholder={f.placeholder ?? f.label}
              onChange={(e) => setSearchField(f.name, e.target.value)}
              className="w-56"
            />
          )
        }
        const value = current[f.name] ?? ""
        return (
          <Select
            key={f.name}
            value={value || "__all__"}
            onValueChange={(v) =>
              setSelectField(f.name, v === "__all__" ? "" : v)
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">
                All {f.label.toLowerCase()}
              </SelectItem>
              {(f.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      })}
      {hasAny ? (
        <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
          Clear all
        </Button>
      ) : null}
    </div>
  )
}
