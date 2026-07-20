"use client"

import * as React from "react"

import { useTranslations } from "@workspace/i18n/client"
import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"
import type {
  PeriodCloseCheck,
  PeriodCloseReadiness,
} from "@workspace/accounting"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  MultiStepLoader,
  type LoadingState,
} from "@workspace/ui/components/multi-step-loader"
import { Switch } from "@workspace/ui/components/switch"
import { toast } from "@workspace/ui/components/sonner"
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineDot,
  TimelineHeader,
  TimelineItem,
  TimelineTitle,
} from "@workspace/ui/components/timeline"
import { CircleCheckBig } from "@workspace/ui/lib/icons"

import { orgHref } from "@/lib/org/href"
import { closePeriodAction } from "@/lib/org/period-actions"

/**
 * ClosingCloseWizard — the bespoke "spuštění účetní závěrky" page body.
 *
 * A hand-composed Content Panel (ONE `ContentHeader` portalled through
 * `AppPageHeader`, then a `Timeline`), NOT a wrapped archetype: an archetype
 * mounts its own page header, which would double the header. The Timeline walks
 * three steps — Konfigurace (a review of the fixed close config), Kontrola (the
 * readiness checklist), and Spuštění (run the seal) — with `activeIndex` driving
 * the completed/active/pending dots.
 *
 * The run calls `closePeriodAction({ slug, periodId })`, which takes ONLY those
 * two fields: the účty and the informational toggles below are a fixed, statutory
 * configuration the domain applies itself, never client-supplied parameters. The
 * action is owner/admin- + readiness-gated server-side; the wizard mirrors both
 * gates client-side (hide/disable) purely for affordance.
 */

/**
 * The účty the year-end close posts to — the statutory ČÚS 002 set, mirrored
 * from `UZAVERKA_ACCOUNT` in `@workspace/accounting`. Presentational only: the
 * domain owns the real numbers; the close does not accept overrides.
 */
const CLOSE_ACCOUNTS = [
  { number: "702", labelKey: "balanceClose" },
  { number: "701", labelKey: "opening" },
  { number: "710", labelKey: "resultClose" },
  { number: "431", labelKey: "result" },
] as const

/**
 * The informational toggles the plan lists. `closePeriodAction` ignores them, so
 * they render DISABLED with an explicit caption: they preview planned close
 * options, they do not alter this run.
 */
const CLOSE_TOGGLES = [
  "revaluation",
  "cashReconciliation",
  "inventory",
] as const

const STEP_CONFIG = 0
const STEP_REVIEW = 1
const STEP_RUN = 2

type RunPhase = "idle" | "running" | "done" | "forbidden" | "error"

function statusBadgeVariant(
  status: PeriodCloseCheck["status"],
): "secondary" | "destructive" | "outline" {
  if (status === "FAIL") return "destructive"
  if (status === "UNAVAILABLE") return "outline"
  return "secondary"
}

function ReadinessCheckList({ checks }: { checks: PeriodCloseCheck[] }) {
  const t = useTranslations("org.closeWizard")
  return (
    <ul className="space-y-2">
      {checks.map((check) => (
        <li
          key={check.code}
          className="rounded-lg border border-border px-3 py-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {check.label}
              </p>
              <p className="text-xs text-muted-foreground">{check.message}</p>
            </div>
            <Badge variant={statusBadgeVariant(check.status)}>
              {check.status === "PASS"
                ? t("status.pass")
                : check.status === "FAIL"
                  ? t("status.blocked")
                  : t("status.unavailable")}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function ClosingCloseWizard({
  slug,
  periodId,
  readiness: initialReadiness,
  canManage,
}: {
  slug: string
  periodId: string
  readiness: PeriodCloseReadiness
  canManage: boolean
}) {
  const t = useTranslations("org.closeWizard")
  const [step, setStep] = React.useState(STEP_CONFIG)
  const [readiness, setReadiness] = React.useState(initialReadiness)
  const [phase, setPhase] = React.useState<RunPhase>("idle")

  const blockers = readiness.checks.filter((c) => c.severity === "BLOCKER")
  const warnings = readiness.checks.filter((c) => c.severity === "WARNING")
  const failingBlockers = blockers.filter((c) => c.status !== "PASS")
  const ready = readiness.ready
  const running = phase === "running"
  const canRun = canManage && ready && !running

  const periodsHref = orgHref(slug, "closing/periods")

  const loadingStates: LoadingState[] = [
    { text: t("run.loading.result") },
    { text: t("run.loading.balance") },
    { text: t("run.loading.carryover") },
    { text: t("run.loading.sealing") },
  ]

  async function onRun() {
    if (!canRun) return
    setPhase("running")
    const result = await closePeriodAction({ slug, periodId })
    if (result.ok) {
      setPhase("done")
      return
    }
    if ("blocked" in result) {
      setReadiness(result.readiness)
      setStep(STEP_REVIEW)
      setPhase("idle")
      toast.error(t("run.blockedToast"))
      return
    }
    if ("forbidden" in result) {
      setPhase("forbidden")
      return
    }
    setPhase("error")
  }

  return (
    <>
      <AppPageHeader>
        <ContentHeader
          title={t("title")}
          backTo={{ label: t("backTo"), href: periodsHref }}
        />
      </AppPageHeader>

      <div data-slot="content-panel" className="flex h-full min-h-0 flex-col">
        <div className="min-w-0 flex-1 overflow-auto p-6">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
            {phase === "done" ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <CircleCheckBig className="size-12 text-success" />
                  <h2 className="text-lg font-semibold text-foreground">
                    {t("done.title")}
                  </h2>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {t("done.description")}
                  </p>
                  <Button asChild size="sm" className="mt-2">
                    <a href={periodsHref}>{t("done.backToPeriods")}</a>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Timeline activeIndex={step}>
                {/* Step 1 — Konfigurace (review of the fixed close config). */}
                <TimelineItem>
                  <TimelineDot />
                  <TimelineConnector />
                  <TimelineContent>
                    <TimelineHeader>
                      <TimelineTitle>{t("config.title")}</TimelineTitle>
                      <TimelineDescription>
                        {t("config.description")}
                      </TimelineDescription>
                    </TimelineHeader>
                    <div className="mt-3 flex flex-col gap-4">
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {CLOSE_ACCOUNTS.map((account) => (
                          <li
                            key={account.number}
                            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                          >
                            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
                              {account.number}
                            </span>
                            <span className="min-w-0 text-xs text-muted-foreground">
                              {t(`config.accounts.${account.labelKey}`)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t("config.togglesHint")}
                        </p>
                        {CLOSE_TOGGLES.map((toggle) => (
                          <div
                            key={toggle}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 opacity-70"
                          >
                            <span className="text-sm text-foreground">
                              {t(`config.toggles.${toggle}`)}
                            </span>
                            <Switch
                              disabled
                              aria-label={t(`config.toggles.${toggle}`)}
                            />
                          </div>
                        ))}
                      </div>
                      {step === STEP_CONFIG ? (
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => setStep(STEP_REVIEW)}
                          >
                            {t("config.next")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </TimelineContent>
                </TimelineItem>

                {/* Step 2 — Kontrola (readiness checklist). */}
                <TimelineItem>
                  <TimelineDot />
                  <TimelineConnector />
                  <TimelineContent>
                    <TimelineHeader>
                      <TimelineTitle>{t("review.title")}</TimelineTitle>
                      <TimelineDescription>
                        {ready
                          ? t("review.ready")
                          : t("review.blocked", {
                              count: failingBlockers.length,
                            })}
                      </TimelineDescription>
                    </TimelineHeader>
                    <div className="mt-3 flex flex-col gap-4">
                      <ReadinessCheckList checks={blockers} />
                      {warnings.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("review.limitations")}
                          </p>
                          <ReadinessCheckList checks={warnings} />
                        </div>
                      ) : null}
                      {step === STEP_REVIEW ? (
                        <div className="flex justify-between">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStep(STEP_CONFIG)}
                          >
                            {t("back")}
                          </Button>
                          <Button
                            size="sm"
                            disabled={!ready}
                            onClick={() => setStep(STEP_RUN)}
                          >
                            {t("review.next")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </TimelineContent>
                </TimelineItem>

                {/* Step 3 — Spuštění (run the seal). */}
                <TimelineItem>
                  <TimelineDot />
                  <TimelineConnector />
                  <TimelineContent>
                    <TimelineHeader>
                      <TimelineTitle>{t("run.title")}</TimelineTitle>
                      <TimelineDescription>
                        {t("run.description")}
                      </TimelineDescription>
                    </TimelineHeader>
                    <div className="mt-3 flex flex-col gap-3">
                      {!canManage ? (
                        <p
                          role="alert"
                          className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground"
                        >
                          {t("run.forbidden")}
                        </p>
                      ) : null}
                      {phase === "forbidden" ? (
                        <p
                          role="alert"
                          className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive"
                        >
                          {t("run.forbidden")}
                        </p>
                      ) : null}
                      {phase === "error" ? (
                        <p
                          role="alert"
                          className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive"
                        >
                          {t("run.error")}
                        </p>
                      ) : null}
                      {step === STEP_RUN ? (
                        <div className="flex justify-between">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={running}
                            onClick={() => setStep(STEP_REVIEW)}
                          >
                            {t("back")}
                          </Button>
                          <Button
                            size="sm"
                            disabled={!canRun}
                            onClick={() => void onRun()}
                          >
                            {t("run.action")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </TimelineContent>
                </TimelineItem>
              </Timeline>
            )}
          </div>
        </div>
      </div>

      {/* The transient run animation. Loops while the server action runs; our own
          "done" state (above) replaces MultiStepLoader's hardcoded English one. */}
      <MultiStepLoader
        loadingStates={loadingStates}
        loading={running}
        loop
        duration={1200}
      />
    </>
  )
}
