"use client"

import * as React from "react"

import { useTranslations } from "@workspace/i18n/client"
import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import {
  ContentHeader,
  useOptimisticFavorite,
} from "@workspace/ui/blocks/content-panel"
import type {
  ContentHeaderBreadcrumbItem,
  ContentHeaderFavoriteToggle,
} from "@workspace/ui/blocks/content-panel"
import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { toast } from "@workspace/ui/components/sonner"

import { orgHref } from "@/lib/org/href"
import { allocateDokladNumber } from "@/lib/org/doklad-allocator-actions"

/** One selectable doklad type + the číselná řada it draws its numbers from. */
export interface AllocatorType {
  id: string
  code: string
  name: string
  /** Zkratka of the type's default DOCUMENT série (never null — the page only
   *  passes types that have one, since only those can allocate). */
  seriesCode: string
}

/** One allocated Označení, newest first (a running proof of the gapless chain). */
interface AllocatedRow {
  key: number
  typeCode: string
  seriesCode: string
  designation: string
}

/**
 * DokladAllocatorView — Debug tool that proves the typ→řada→číslo chain: pick a
 * typ dokladu, and the page shows the číselná řada it is wired to (its default
 * série, configured on the Dokladové řady page) and — on "Přidělit číslo" —
 * allocates that série's next gapless Označení in the active účetní období,
 * appending it to a running list. Really advances the counter (behind the Debug
 * gate). A raw-body page (no Table archetype): header portal + a small form.
 */
export function DokladAllocatorView({
  slug,
  title,
  types,
  periodLabel,
  favorite,
}: {
  slug: string
  title: string
  types: readonly AllocatorType[]
  periodLabel: string | null
  favorite: ContentHeaderFavoriteToggle
}) {
  const tn = useTranslations("org.nav")
  const tp = useTranslations("debug.dokladAllocator")
  const favoriteControlled = useOptimisticFavorite(favorite)

  const [typeId, setTypeId] = React.useState<string>("")
  const [busy, setBusy] = React.useState(false)
  const [allocated, setAllocated] = React.useState<AllocatedRow[]>([])
  const seqRef = React.useRef(0)

  const byId = React.useMemo(
    () => new Map(types.map((t) => [t.id, t])),
    [types],
  )
  const selected = typeId ? byId.get(typeId) : undefined

  const breadcrumb: ContentHeaderBreadcrumbItem[] = [
    {
      label: tn("debug"),
      href: orgHref(slug, "debug"),
      icon: "ChevronsLeftRightSquare",
    },
  ]

  const onAllocate = React.useCallback(() => {
    if (!typeId) return
    const type = byId.get(typeId)
    if (!type) return
    setBusy(true)
    void allocateDokladNumber({ slug, typeId }).then((r) => {
      setBusy(false)
      if (r.ok) {
        seqRef.current += 1
        setAllocated((prev) => [
          {
            key: seqRef.current,
            typeCode: type.code,
            seriesCode: r.seriesCode,
            designation: r.designation,
          },
          ...prev,
        ])
        toast.success(tp("allocated", { designation: r.designation }))
      } else {
        toast.error(tp("allocateError"))
      }
    })
  }, [typeId, byId, slug, tp])

  return (
    <>
      <AppPageHeader>
        <ContentHeader
          title={title}
          breadcrumb={breadcrumb}
          favorite={favoriteControlled}
        />
      </AppPageHeader>

      <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-6 overflow-y-auto p-6">
        <p className="text-sm text-muted-foreground">{tp("intro")}</p>

        <div className="flex flex-col gap-3 rounded-xl border border-border-subtle p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">
              {tp("typeLabel")}
            </label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={tp("typePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.code} · {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{tp("seriesLabel")}</span>
            <span className="font-medium text-foreground tabular-nums">
              {selected ? selected.seriesCode : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{tp("periodLabel")}</span>
            <span className="font-medium text-foreground">
              {periodLabel ?? tp("noPeriod")}
            </span>
          </div>

          <Button
            className="mt-1 self-start"
            size="sm"
            disabled={!typeId || busy}
            onClick={onAllocate}
          >
            {tp("allocate")}
          </Button>
        </div>

        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tp("noTypes")}</p>
        ) : null}

        {allocated.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {tp("resultsHeading")}
            </h2>
            <ul className="flex flex-col gap-1">
              {allocated.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">
                    {row.typeCode} · {row.seriesCode}
                  </span>
                  <span className="font-medium text-foreground tabular-nums">
                    {row.designation}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </>
  )
}
