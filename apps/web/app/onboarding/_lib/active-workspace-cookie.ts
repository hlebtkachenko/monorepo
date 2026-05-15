import { cookies } from "next/headers"
import {
  signActiveWorkspaceToken,
  verifyActiveWorkspaceToken,
} from "@workspace/auth/tokens"

/**
 * Active-workspace cookie helpers. Read by the onboarding resume
 * helper + by future workspace-scoped server actions to know which
 * workspace the user is operating in without an ORDER BY-based DB
 * fallback. Path "/" so it's available everywhere in-app.
 */
export const ACTIVE_WORKSPACE_COOKIE = "app-active-workspace"
const COOKIE_PATH = "/"
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 90

export async function setActiveWorkspaceCookie(
  workspaceId: string,
): Promise<void> {
  const token = await signActiveWorkspaceToken(workspaceId, COOKIE_TTL_SECONDS)
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: COOKIE_TTL_SECONDS,
  })
}

export async function readActiveWorkspaceCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value
  if (!token) return null
  try {
    const claims = await verifyActiveWorkspaceToken(token)
    return claims.workspaceId
  } catch {
    return null
  }
}

export async function clearActiveWorkspaceCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete({ name: ACTIVE_WORKSPACE_COOKIE, path: COOKIE_PATH })
}
