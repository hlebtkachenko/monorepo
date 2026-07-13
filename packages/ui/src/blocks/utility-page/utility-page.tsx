"use client"

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { useTranslations } from "@workspace/i18n/client"
import {
  BRAND_ADMIN_URL,
  BRAND_API_URL,
  BRAND_APP_URL,
  BrandName,
  Logo,
} from "@workspace/ui/brand-assets"
import { AuthShellChromeFooter } from "@workspace/ui/blocks/auth"
import {
  AuthShell,
  AuthShellAside,
  AuthShellBody,
  AuthShellFooter,
  AuthShellHeader,
  AuthShellLeft,
} from "@workspace/ui/blocks/auth-shell"
import { Button } from "@workspace/ui/components/button"
import { FieldSeparator } from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"
import { ArrowUpRight } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

import {
  resolveUtilityActionHref,
  UTILITY_ACTIONS,
} from "./utility-page.actions"
import { getUtilityPageDefinition } from "./utility-page.catalog"
import type {
  UtilityActionId,
  UtilityApplication,
  UtilityPageId,
  UtilityPageRuntime,
} from "./utility-page.types"

const APPLICATION_URLS = {
  app: BRAND_APP_URL,
  admin: BRAND_ADMIN_URL,
  api: BRAND_API_URL,
} satisfies Record<UtilityApplication, string>

const UtilityPageFeedback = lazy(() =>
  import("./utility-page-feedback").then((module) => ({
    default: module.UtilityPageFeedback,
  })),
)

export interface UtilityPageProps {
  state: UtilityPageId
  runtime?: UtilityPageRuntime
  /** App-owned footer control, normally the same LanguagePicker used by Auth. */
  footerControl?: ReactNode
  className?: string
}

function runAction(action: UtilityActionId, runtime: UtilityPageRuntime) {
  const definition = UTILITY_ACTIONS[action]
  if (!("behavior" in definition)) return

  if (definition.behavior === "retry") {
    if (runtime.onRetry) runtime.onRetry()
    else window.location.reload()
  } else {
    window.location.reload()
  }
}

function UtilityAction({
  action,
  runtime,
  backHref,
}: {
  action: UtilityActionId
  runtime: UtilityPageRuntime
  backHref: string
}) {
  const t = useTranslations()
  const definition = UTILITY_ACTIONS[action]
  const href =
    action === "go_back" ? backHref : resolveUtilityActionHref(action, runtime)

  if (href) {
    return (
      <Button asChild variant={definition.variant} size="xl" className="w-full">
        <a href={href}>{t(definition.label)}</a>
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant={definition.variant}
      size="xl"
      className="w-full"
      onClick={() => runAction(action, runtime)}
    >
      {t(definition.label)}
    </Button>
  )
}

function isAfframeApplicationHost(hostname: string) {
  return /^(app|admin|api)(-staging)?\.afframe\.com$/u.test(hostname)
}

function safeUrl(value: string, base?: string) {
  try {
    return new URL(value, base)
  } catch {
    return null
  }
}

const subscribeToHydration = () => () => {}

function useNavigationTargets(runtime: UtilityPageRuntime) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  const defaultApplicationUrl = APPLICATION_URLS[runtime.application ?? "app"]
  const fallbackBackHref = runtime.actionHrefs?.go_back ?? defaultApplicationUrl
  const defaultTarget = new URL(defaultApplicationUrl)
  const fallbackTargets = {
    applicationHref: defaultTarget.origin,
    applicationHost: defaultTarget.hostname,
    backHref: fallbackBackHref,
  }

  if (!hydrated) return fallbackTargets

  const current = new URL(window.location.href)
  const referrer = safeUrl(document.referrer)
  const trustedReferrer =
    referrer &&
    referrer.href !== current.href &&
    (referrer.origin === current.origin ||
      isAfframeApplicationHost(referrer.hostname))
      ? referrer
      : null
  const sourceApplication =
    trustedReferrer && isAfframeApplicationHost(trustedReferrer.hostname)
      ? trustedReferrer
      : isAfframeApplicationHost(current.hostname)
        ? current
        : defaultTarget
  const fallback = safeUrl(fallbackBackHref, current.origin)

  return {
    applicationHref: sourceApplication.origin,
    applicationHost: sourceApplication.hostname,
    backHref:
      trustedReferrer?.href ??
      (fallback ? fallbackBackHref : sourceApplication.origin),
  }
}

function HeaderChrome({
  fallback,
  applicationHref,
  applicationHost,
}: {
  fallback: boolean
  applicationHref: string
  applicationHost: string
}) {
  const t = useTranslations("utilityPage")

  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div>
        <Logo
          variant="horizontal"
          tone="primary"
          className="h-6 w-auto"
          aria-hidden="true"
        />
        {!fallback ? (
          <span className="sr-only">
            <BrandName />
          </span>
        ) : null}
      </div>
      <a
        href={applicationHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowUpRight className="size-4" aria-hidden="true" />
        {t("returnTo", { host: applicationHost })}
      </a>
    </div>
  )
}

function LocalizedFooter({
  version,
  control,
}: {
  version: string
  control?: ReactNode
}) {
  const t = useTranslations("layout.footer")
  return (
    <AuthShellChromeFooter
      brand={<BrandName />}
      version={version}
      labels={{
        privacy: t("privacy"),
        terms: t("terms"),
        status: t("status"),
      }}
    >
      {control}
    </AuthShellChromeFooter>
  )
}

function FallbackFooter({
  version,
  control,
}: {
  version: string
  control?: ReactNode
}) {
  const t = useTranslations("layout.footer")

  return (
    <AuthShellChromeFooter
      brand={
        <Logo
          variant="wordmark"
          tone="mono"
          className="inline-block h-3 w-auto"
          aria-hidden="true"
        />
      }
      version={version}
      labels={{
        privacy: t("privacy"),
        terms: t("terms"),
        status: t("status"),
      }}
    >
      {control}
    </AuthShellChromeFooter>
  )
}

export function UtilityPage({
  state,
  runtime: runtimeProp,
  footerControl,
  className,
}: UtilityPageProps) {
  const t = useTranslations()
  const definition = getUtilityPageDefinition(state)
  const runtime = runtimeProp ?? {}
  const surface = runtime.surface ?? definition.defaultSurface
  const navigation = useNavigationTargets(runtime)
  const automaticReportKey = useRef<string | null>(null)
  const feedbackReport =
    definition.telemetry.report === "automatic_with_user_feedback" &&
    runtime.report
      ? {
          ...runtime.report,
          payload: {
            ...runtime.report.payload,
            id: runtime.report.payload.id ?? runtime.referenceId,
          },
        }
      : null

  useEffect(() => {
    if (definition.recovery !== "automatic_retry" || !runtime.onRetry) {
      return
    }
    const timeout = window.setTimeout(
      runtime.onRetry,
      (runtime.retryAfterSeconds ?? 5) * 1000,
    )
    return () => window.clearTimeout(timeout)
  }, [definition.recovery, runtime.onRetry, runtime.retryAfterSeconds])

  useEffect(() => {
    if (
      definition.telemetry.report === "none" ||
      !runtime.report ||
      runtime.automaticReport === false
    ) {
      return
    }

    const { endpoint, payload } = runtime.report
    const reportId = payload.id ?? runtime.referenceId
    const key = [state, reportId, payload.message, payload.digest].join(":")
    if (automaticReportKey.current === key) return
    automaticReportKey.current = key

    void fetch(endpoint ?? "/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, id: reportId }),
      keepalive: true,
    }).catch(() => {})
  }, [
    definition.telemetry.report,
    runtime.automaticReport,
    runtime.referenceId,
    runtime.report,
    state,
  ])

  const visualCode =
    definition.httpStatus?.toString() ?? t(definition.codeLabel)
  const numericCode = /^\d{3}$/u.test(visualCode)
  const content = (
    <section
      className="flex w-full flex-col gap-8"
      aria-labelledby="utility-title"
    >
      <span
        data-slot="utility-page-mobile-code"
        className={cn(
          "block max-w-full text-center font-heading leading-none font-semibold break-words text-foreground md:hidden",
          numericCode
            ? "[text-indent:0.1em] text-[clamp(4.5rem,25vw,7rem)] tracking-[0.1em]"
            : "text-4xl tracking-tight",
        )}
        aria-hidden="true"
      >
        {visualCode}
      </span>

      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0" id="utility-title">
          {t(definition.title)}
        </Heading>
        <Text variant="muted">{t(definition.description)}</Text>
      </header>

      {definition.actions.length > 0 ? (
        <div className="flex flex-col gap-3">
          {definition.actions.map((action) => (
            <UtilityAction
              key={action}
              action={action}
              runtime={runtime}
              backHref={navigation.backHref}
            />
          ))}
        </div>
      ) : null}

      {feedbackReport ? (
        <div className="flex flex-col gap-5">
          <FieldSeparator>
            {t("utilityPage.feedback.sectionTitle")}
          </FieldSeparator>
          <Text variant="muted">
            {t("utilityPage.feedback.description")}{" "}
            <Suspense
              fallback={
                <Button
                  type="button"
                  variant="link"
                  className="h-auto gap-0.5 rounded-none p-0 align-baseline text-foreground"
                  disabled
                >
                  {t("utilityPage.feedback.loading")}
                </Button>
              }
            >
              <UtilityPageFeedback report={feedbackReport} state={state} />
            </Suspense>
          </Text>
        </div>
      ) : null}
    </section>
  )

  const embedded = surface === "shell"
  const fallbackChrome = runtime.fallbackChrome ?? false

  return (
    <AuthShell
      data-slot="utility-page"
      data-state={state}
      data-surface={surface}
      data-tone={definition.tone}
      className={cn(embedded && "h-full min-h-0 md:h-full", className)}
    >
      <AuthShellLeft className={cn(embedded && "h-full min-h-0 md:h-full")}>
        <AuthShellHeader>
          <HeaderChrome
            fallback={fallbackChrome}
            applicationHref={navigation.applicationHref}
            applicationHost={navigation.applicationHost}
          />
        </AuthShellHeader>
        <AuthShellBody>{content}</AuthShellBody>
        <AuthShellFooter>
          {fallbackChrome ? (
            <FallbackFooter
              version={runtime.buildVersion ?? "unknown"}
              control={footerControl}
            />
          ) : (
            <LocalizedFooter
              version={runtime.buildVersion ?? "unknown"}
              control={footerControl}
            />
          )}
        </AuthShellFooter>
      </AuthShellLeft>
      <AuthShellAside>
        <div
          className={cn(
            "flex h-full items-center justify-center overflow-hidden text-foreground md:min-h-0",
            embedded ? "min-h-0" : "min-h-[60vh]",
          )}
          aria-hidden="true"
        >
          <span
            className={cn(
              "max-w-full px-[6%] text-center font-heading leading-[0.82] font-semibold break-words",
              numericCode
                ? "[text-indent:0.1em] text-[clamp(9rem,18vw,22rem)] tracking-[0.1em]"
                : "text-[clamp(4rem,9vw,10rem)] tracking-tight",
            )}
          >
            {visualCode}
          </span>
        </div>
      </AuthShellAside>
    </AuthShell>
  )
}
