"use client"

import { useMemo, useState } from "react"

import { useTranslations } from "@workspace/i18n/client"
import {
  UTILITY_PAGE_BINDINGS,
  UTILITY_PAGE_CATALOG,
  UtilityPage,
  type UtilityPageId,
  type UtilityPageSurface,
} from "@workspace/ui/blocks/utility-page"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { LanguagePicker } from "../../../../_components/language-picker"

const DEFINITIONS = Object.values(UTILITY_PAGE_CATALOG)

export function UtilityPageCatalog() {
  const t = useTranslations()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<UtilityPageId>("route_not_found")
  const [surface, setSurface] = useState<UtilityPageSurface>("global")

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return DEFINITIONS
    return DEFINITIONS.filter((definition) =>
      [
        definition.id,
        definition.errorType,
        t(definition.codeLabel),
        t(definition.title),
      ].some((value) => value.toLowerCase().includes(normalized)),
    )
  }, [query, t])

  const active = UTILITY_PAGE_CATALOG[selected]
  const activeBinding = UTILITY_PAGE_BINDINGS[selected]

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(32rem,0.9fr)]">
      <section className="min-w-0" aria-label="Utility page definitions">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by state, type, code, or title"
            aria-label="Filter utility page states"
            className="max-w-md"
          />
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {visible.length} of {DEFINITIONS.length}
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>State</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>Surface</TableHead>
                <TableHead>Wiring</TableHead>
                <TableHead>Recovery</TableHead>
                <TableHead>Reporting</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((definition) => (
                <TableRow
                  key={definition.id}
                  data-state={
                    definition.id === selected ? "selected" : undefined
                  }
                >
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto max-w-56 flex-col items-start gap-0.5 px-0 py-1 text-left"
                      aria-pressed={definition.id === selected}
                      onClick={() => {
                        setSelected(definition.id)
                        setSurface(definition.defaultSurface)
                      }}
                    >
                      <span className="font-mono text-xs">{definition.id}</span>
                      <span className="text-xs whitespace-normal text-muted-foreground">
                        {t(definition.title)}
                      </span>
                    </Button>
                  </TableCell>
                  <TableCell>{definition.errorType}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {definition.httpStatus ?? "client"}
                  </TableCell>
                  <TableCell>{definition.defaultSurface}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Badge
                        variant={
                          UTILITY_PAGE_BINDINGS[definition.id].status ===
                          "active"
                            ? "default"
                            : "outline"
                        }
                      >
                        {UTILITY_PAGE_BINDINGS[definition.id].status.replaceAll(
                          "_",
                          " ",
                        )}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {UTILITY_PAGE_BINDINGS[definition.id].applications.join(
                          ", ",
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {definition.recovery.replaceAll("_", " ")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        definition.telemetry.report === "none"
                          ? "outline"
                          : "secondary"
                      }
                    >
                      {definition.telemetry.report.replaceAll("_", " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <aside className="min-w-0 2xl:sticky 2xl:top-6 2xl:self-start">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-muted-foreground">
              {active.id}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {active.errorType}, {active.condition}, {active.duration},{" "}
              {active.tone}, log {active.telemetry.log}, reference{" "}
              {active.reference.replaceAll("_", " ")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeBinding.status.replaceAll("_", " ")} in{" "}
              {activeBinding.applications.join(", ")}:{" "}
              {activeBinding.triggers.join("; ")}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            <Button asChild type="button" size="sm" variant="outline">
              <a href={`/utility/${selected}`}>Open production page</a>
            </Button>
            <div className="flex gap-1" aria-label="Preview surface">
              {(["global", "shell", "auth"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={surface === option ? "secondary" : "ghost"}
                  onClick={() => setSurface(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-h-[46rem] overflow-auto rounded-lg border border-border bg-background">
          <UtilityPage
            state={selected}
            runtime={{
              application: "admin",
              surface,
              automaticReport: false,
              referenceId: "example_01J8Y3M7W2",
              retryAfterSeconds:
                active.duration === "temporary" ? 30 : undefined,
              buildVersion: "preview",
              onRetry: () => undefined,
              report:
                active.telemetry.report === "automatic_with_user_feedback"
                  ? { payload: { message: "Preview diagnostic" } }
                  : undefined,
            }}
            footerControl={<LanguagePicker />}
          />
        </div>
      </aside>
    </div>
  )
}
