import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"
import { getBuildVersion } from "@workspace/ui/brand-assets"
import {
  getUtilityPageDefinition,
  isUtilityPageId,
  UtilityPage,
} from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "../../_components/language-picker"

interface PageProps {
  params: Promise<{ state: string }>
  searchParams: Promise<{
    next?: string | string[]
    retry?: string | string[]
  }>
}

function safeNext(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return null
  }
  if (/^\/[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)) return null
  return value
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { state } = await params
  if (!isUtilityPageId(state))
    return { robots: { index: false, follow: false } }

  const t = await getTranslations()
  return {
    title: t(getUtilityPageDefinition(state).title),
    robots: { index: false, follow: false },
  }
}

export default async function UtilityStatePage({
  params,
  searchParams,
}: PageProps) {
  const { state } = await params
  if (!isUtilityPageId(state)) notFound()

  const definition = getUtilityPageDefinition(state)
  const query = await searchParams
  const next = safeNext(query.next)
  const retry = safeNext(query.retry)
  const signInHref = next
    ? `/auth/login?next=${encodeURIComponent(next)}`
    : "/auth/login"

  return (
    <UtilityPage
      state={state}
      runtime={{
        application: "admin",
        surface: "global",
        buildVersion: getBuildVersion(),
        automaticReport: false,
        actionHrefs: { sign_in: signInHref, retry: retry ?? undefined },
        report:
          definition.telemetry.report === "automatic_with_user_feedback"
            ? {
                payload: {
                  message: `Utility page: ${state}`,
                  source: "admin-utility",
                },
              }
            : undefined,
      }}
      footerControl={<LanguagePicker />}
    />
  )
}
