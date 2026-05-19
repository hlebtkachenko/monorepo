"use server"

import { cookies } from "next/headers"
import { auth } from "@workspace/auth/server"
import {
  identifyEmail,
  readLoginEmailFromStore,
  clearLoginEmail,
  consumeLoginEmail,
} from "@workspace/auth/login-flow"

export type { IdentifyEmailResult } from "@workspace/auth/login-flow"

export async function identifyEmailAction(input: {
  email: string
}): Promise<{ ok: boolean; errorKey?: string }> {
  const store = await cookies()
  return identifyEmail(input, store)
}

export async function readLoginEmail(): Promise<string | null> {
  const store = await cookies()
  return readLoginEmailFromStore(store)
}

export async function clearLoginEmailAction(): Promise<void> {
  const store = await cookies()
  // Redeem the auth_token row so the audit trail records 'consumed'.
  await consumeLoginEmail(store)
  clearLoginEmail(store)
}

export async function sendMagicLinkAction(
  email: string,
  callbackURL: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { headers } = await import("next/headers")
    const h = await headers()
    await auth.api.signInMagicLink({
      body: { email, callbackURL },
      headers: h,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
