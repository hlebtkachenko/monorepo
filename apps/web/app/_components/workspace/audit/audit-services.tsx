"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  ContentStatusBar,
} from "@workspace/ui/blocks/content-panel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { toast } from "@workspace/ui/components/sonner"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import {
  AUDIT_COMPANIES,
  AUDIT_PERIODS,
  AUDIT_SERVICES,
  type AuditEngagement,
  type AuditService,
} from "./data"

/**
 * Audit → Services. The orderable service catalog as a responsive card grid,
 * plus an order-flow `Dialog`: pick a service, select which companies it covers
 * + a period, review a summary, and confirm — which appends a new engagement to
 * this page's local state and toasts. MOCK end to end. Title "Services"; no body
 * `<h1>`.
 */
export function AuditServices() {
  // Appended engagements live here so a fresh order feels real within the
  // session; the Engagements page reads the canonical fixtures separately.
  const [ordered, setOrdered] = React.useState<AuditEngagement[]>([])
  const [orderingService, setOrderingService] =
    React.useState<AuditService | null>(null)

  const statusBar = (
    <ContentStatusBar
      left={<span>{AUDIT_SERVICES.length} services</span>}
      right={
        ordered.length > 0 ? (
          <span>{ordered.length} ordered this session</span>
        ) : (
          <span>Delivered by the Afframe audit team</span>
        )
      }
    />
  )

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Services" />
      </AppPageHeader>
      <ContentPanel statusBar={statusBar}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Paid add-on services delivered by Afframe&apos;s independent audit
            team. Order a service, then choose which of your companies it
            covers.
          </p>
          <div className="@container">
            <div className="grid gap-4 @md:grid-cols-2 @4xl:grid-cols-3">
              {AUDIT_SERVICES.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onOrder={() => setOrderingService(service)}
                />
              ))}
            </div>
          </div>
        </div>
      </ContentPanel>

      <OrderDialog
        service={orderingService}
        onOpenChange={(open) => {
          if (!open) setOrderingService(null)
        }}
        onConfirm={(engagement) => {
          setOrdered((prev) => [engagement, ...prev])
          setOrderingService(null)
          toast.success("Engagement requested")
        }}
      />
    </>
  )
}

function ServiceCard({
  service,
  onOrder,
}: {
  service: AuditService
  onOrder: () => void
}) {
  const icons = useIcons()
  const Icon = icons[service.icon]

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
            <Icon className="size-5" />
          </span>
          {service.popular ? <Badge variant="secondary">Popular</Badge> : null}
        </div>
        <CardTitle className="mt-3">{service.name}</CardTitle>
        <CardDescription>{service.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="font-heading text-lg font-semibold tabular-nums">
          {service.price}
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={onOrder}>
          <icons.Plus />
          Order
        </Button>
      </CardFooter>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Order flow — a two-step dialog: select → summary.                           */
/* -------------------------------------------------------------------------- */

type OrderStep = "select" | "summary"

function OrderDialog({
  service,
  onOpenChange,
  onConfirm,
}: {
  service: AuditService | null
  onOpenChange: (open: boolean) => void
  onConfirm: (engagement: AuditEngagement) => void
}) {
  const icons = useIcons()
  const [step, setStep] = React.useState<OrderStep>("select")
  const [companies, setCompanies] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [period, setPeriod] = React.useState(AUDIT_PERIODS[0]!)

  // Reset the flow whenever a new service opens the dialog.
  React.useEffect(() => {
    if (service) {
      setStep("select")
      setCompanies(new Set())
      setPeriod(AUDIT_PERIODS[0]!)
    }
  }, [service])

  const toggleCompany = (name: string) => {
    setCompanies((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const selected = Array.from(companies)
  const canContinue = selected.length > 0

  const confirm = () => {
    if (!service || selected.length === 0) return
    // One engagement per selected company keeps the model consistent with the
    // per-company engagement fixtures; the first drives the toast + append here.
    const first = selected[0]!
    const engagement: AuditEngagement = {
      id: `eng-new-${service.id}-${first}`,
      company:
        selected.length === 1 ? first : `${first} +${selected.length - 1}`,
      service: service.name,
      status: "Awaiting docs",
      stage: "Requested",
      period,
      price: service.price,
      documentsRequested: [],
      findings: [],
      deliveryEta: `${Number(period) + 1}-04-01T00:00:00.000Z`,
      updated: "2026-07-02T00:00:00.000Z",
    }
    onConfirm(engagement)
  }

  return (
    <Dialog open={service != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === "select" ? "Order" : "Review order"}
            {service ? ` · ${service.name}` : ""}
          </DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Choose which companies this service covers and the period."
              : "Confirm the engagement details before requesting."}
          </DialogDescription>
        </DialogHeader>

        {step === "select" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Companies
              </span>
              <div className="flex flex-col gap-1">
                {AUDIT_COMPANIES.map((name) => {
                  const checked = companies.has(name)
                  return (
                    <label
                      key={name}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border border-border-subtle px-3 py-2 text-sm",
                        checked && "border-primary bg-primary/5",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleCompany(name)}
                      />
                      <icons.Building2 className="size-4 text-muted-foreground" />
                      <span className="min-w-0 truncate">{name}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Period
              </span>
              <div className="flex flex-wrap gap-2">
                {AUDIT_PERIODS.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={p === period ? "default" : "outline"}
                    onClick={() => setPeriod(p)}
                    className="tabular-nums"
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <dl className="flex flex-col gap-3 text-sm">
            <SummaryRow label="Service" value={service?.name ?? ""} />
            <SummaryRow
              label="Companies"
              value={
                <span className="flex flex-col gap-1">
                  {selected.map((name) => (
                    <span key={name} className="flex items-center gap-2">
                      <icons.Check className="size-4 text-primary" />
                      {name}
                    </span>
                  ))}
                </span>
              }
            />
            <SummaryRow label="Period" value={period} />
            <SummaryRow
              label="Price"
              value={
                <span className="tabular-nums">{service?.price ?? ""}</span>
              }
            />
          </dl>
        )}

        <DialogFooter>
          {step === "select" ? (
            <Button onClick={() => setStep("summary")} disabled={!canContinue}>
              Continue
              <icons.ChevronRight />
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button onClick={confirm}>
                <icons.Check />
                Confirm request
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
