"use server"

import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import type { CreateFeedbackRequest } from "@workspace/shared/api"
import type { BugReportPayload } from "@workspace/ui/blocks/app-context-menu"

/**
 * Server action: forward an in-app bug report to the canonical
 * `POST /v1/feedback` on apps/api. Runs on the web server (same-origin
 * RPC from the client dialog — no browser CORS), then calls the api
 * server-to-server over the internal network.
 *
 * `API_INTERNAL_URL` is a SERVER-ONLY base URL for apps/api (e.g.
 * `http://localhost:3001` in local dev, the internal task address in
 * Fargate). It is never exposed to the browser.
 *
 * The reporter identity is resolved here from the session and attached
 * as advisory context — `/v1/feedback` is public and never trusts client
 * input for scoping.
 */
const API_BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3001"

export async function reportFeedback(
  payload: BugReportPayload,
): Promise<{ referenceId: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    throw new Error("You must be signed in to send feedback.")
  }

  const body: CreateFeedbackRequest = {
    type: payload.type,
    message: payload.message,
    email: payload.email ?? session.user.email ?? undefined,
    context: {
      page: payload.page,
      scope: {
        org_slug: payload.scope.org_slug,
        reporter_id: session.user.id,
        reporter_email: session.user.email ?? undefined,
      },
      element: payload.element,
      selection: payload.selection,
      surrounding: payload.surrounding,
      viewport: payload.viewport,
      client: payload.client,
    },
  }

  const res = await fetch(`${API_BASE}/v1/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(
      `Feedback failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    )
  }
  const data = (await res.json()) as { received: boolean; referenceId: string }
  return { referenceId: data.referenceId }
}
