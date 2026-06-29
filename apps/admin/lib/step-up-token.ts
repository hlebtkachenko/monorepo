import { createHmac, timingSafeEqual } from "node:crypto"

import type { StepUpLevel } from "./capabilities"

/**
 * Pure HMAC + base64url codec for the step-up cookie. Extracted so unit
 * tests can drive it without mocking `next/headers` + Better Auth.
 *
 * Caller injects the HMAC secret to keep this side-effect-free.
 */
export interface StepUpPayload {
  user_id: string
  session_id: string
  level: StepUpLevel
  exp: number
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64")
}

export function signStepUpToken(
  payload: StepUpPayload,
  secret: string,
): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  const mac = createHmac("sha256", secret).update(body).digest()
  return `${body}.${b64url(mac)}`
}

export function verifyStepUpToken(
  token: string,
  secret: string,
): StepUpPayload | null {
  const dot = token.indexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac("sha256", secret).update(body).digest()
  let given: Buffer
  try {
    given = b64urlDecode(sig)
  } catch {
    return null
  }
  if (given.length !== expected.length) return null
  if (!timingSafeEqual(given, expected)) return null
  try {
    const parsed = JSON.parse(b64urlDecode(body).toString("utf-8"))
    if (
      typeof parsed?.user_id !== "string" ||
      parsed.user_id.length === 0 ||
      typeof parsed?.session_id !== "string" ||
      parsed.session_id.length === 0 ||
      (parsed?.level !== "password" && parsed?.level !== "twofa") ||
      typeof parsed?.exp !== "number" ||
      !Number.isFinite(parsed.exp)
    ) {
      return null
    }
    return parsed as StepUpPayload
  } catch {
    return null
  }
}
