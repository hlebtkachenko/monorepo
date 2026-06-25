"use server"

import { assertAdminCaller } from "../../assert-admin-caller"

import { requireAdminCapability } from "@/lib/admin-capability"

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:3010"

export interface OutboxMessage {
  at: string
  to: string
  from: string
  subject: string
  text?: string
  html?: string
  url?: string
}

const OUTBOX_FETCH_TIMEOUT_MS = 5000

export async function fetchOutboxAction(): Promise<OutboxMessage[]> {
  await assertAdminCaller()
  await requireAdminCapability("admin:read")
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OUTBOX_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${WEB_BASE_URL}/api/dev/outbox`, {
      cache: "no-store",
      signal: controller.signal,
    })
    if (!res.ok) return []
    const data = (await res.json()) as { messages?: OutboxMessage[] }
    return data.messages ?? []
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}
