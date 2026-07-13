"use client"

import { useState } from "react"

import { useTranslations } from "@workspace/i18n/client"
import { Button } from "@workspace/ui/components/button"
import { ArrowUpRight } from "@workspace/ui/lib/icons"

import type { UtilityPageId, UtilityPageReport } from "./utility-page.types"

type FeedbackState = "idle" | "sending" | "sent" | "failed"

export function UtilityPageFeedback({
  report,
  state: utilityState,
}: {
  report: UtilityPageReport
  state: UtilityPageId
}) {
  const t = useTranslations("utilityPage.feedback")
  const [state, setState] = useState<FeedbackState>("idle")

  async function send() {
    setState("sending")
    try {
      const id =
        report.payload.id ??
        `utility_${Math.random().toString(36).slice(2, 10)}`
      const message = [
        report.payload.message,
        `Utility state: ${utilityState}`,
        `Report ID: ${id}`,
        report.payload.source ? `Source: ${report.payload.source}` : null,
        report.payload.digest ? `Digest: ${report.payload.digest}` : null,
      ]
        .filter(Boolean)
        .join("\n")

      const response = await fetch(report.endpoint ?? "/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "bug",
          message,
          id,
          source: report.payload.source,
          digest: report.payload.digest,
          context: {
            page: {
              url: window.location.href.slice(0, 2048),
              pathname: window.location.pathname.slice(0, 512),
              title: document.title.slice(0, 500) || null,
              locale: document.documentElement.lang.slice(0, 16) || null,
              theme: document.documentElement.classList.contains("dark")
                ? "dark"
                : "light",
              referrer: document.referrer.slice(0, 2048) || null,
            },
            viewport: {
              width: Math.min(20_000, Math.max(0, window.innerWidth)),
              height: Math.min(20_000, Math.max(0, window.innerHeight)),
              scroll_y: Math.min(
                1_000_000,
                Math.max(0, Math.round(window.scrollY)),
              ),
              device_pixel_ratio: Math.min(
                8,
                Math.max(0, window.devicePixelRatio),
              ),
            },
            client: {
              user_agent: navigator.userAgent.slice(0, 800),
              platform: navigator.platform.slice(0, 128) || null,
              language: navigator.language.slice(0, 32) || null,
              timezone: Intl.DateTimeFormat()
                .resolvedOptions()
                .timeZone.slice(0, 64),
              online: navigator.onLine,
              prefers_dark: window.matchMedia("(prefers-color-scheme: dark)")
                .matches,
            },
          },
        }),
        keepalive: true,
      })
      setState(response.ok ? "sent" : "failed")
    } catch {
      setState("failed")
    }
  }

  return (
    <Button
      type="button"
      variant="link"
      className="h-auto gap-0.5 rounded-none p-0 align-baseline text-foreground"
      disabled={state === "sending" || state === "sent"}
      onClick={() => void send()}
    >
      {state === "sending"
        ? t("sending")
        : state === "sent"
          ? t("sent")
          : state === "failed"
            ? t("failed")
            : t("send")}
      <ArrowUpRight className="size-3" aria-hidden="true" />
    </Button>
  )
}
