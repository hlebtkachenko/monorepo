"use server"

import { cookies, headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import { verifySignupToken, TokenError } from "@workspace/auth/tokens"
import { withAdminBypass } from "@workspace/db"
import { workspace, workspace_membership } from "@workspace/db/schema"

const SIGNUP_TOKEN_COOKIE = "app-signup-token"

export interface SignupResult {
  ok: boolean
  error?: string
}

export async function completeSignupAction(input: {
  name: string
  password: string
}): Promise<SignupResult> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SIGNUP_TOKEN_COOKIE)?.value
  if (!token) {
    return { ok: false, error: "Signup session expired. Start over." }
  }

  let email: string
  let workspaceName: string
  try {
    const claims = await verifySignupToken(token)
    email = claims.email
    workspaceName = claims.workspace
  } catch (err) {
    cookieStore.delete(SIGNUP_TOKEN_COOKIE)
    return {
      ok: false,
      error:
        err instanceof TokenError
          ? `Signup token ${err.code.toLowerCase()}.`
          : "Invalid signup token.",
    }
  }

  if (input.password.length < 12) {
    return { ok: false, error: "Password must be at least 12 characters." }
  }
  const trimmedName = input.name.trim()
  if (trimmedName.length < 2) {
    return { ok: false, error: "Enter your full name." }
  }

  // 1) Create the Better Auth user (no auto sign-in, we sign in below
  //    so we control the redirect target).
  let userId: string
  try {
    const signUp = await auth.api.signUpEmail({
      body: {
        email,
        password: input.password,
        name: trimmedName,
      },
    })
    userId = signUp.user.id
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "Could not create account.",
    }
  }

  // 2) Create the workspace + owner membership inside withAdminBypass:
  //    no tenancy context exists yet, and the workspace RLS policy gates
  //    on app.workspace_id which is unset at this moment.
  try {
    await withAdminBypass(async (db) => {
      const [ws] = await db
        .insert(workspace)
        .values({
          display_name: workspaceName,
          contact_email: email,
          onboarding_completed_at: new Date(),
          created_by_user_id: userId,
        })
        .returning()
      if (!ws) {
        throw new Error("workspace insert returned no row")
      }
      await db.insert(workspace_membership).values({
        workspace_id: ws.id,
        user_id: userId,
        role: "owner",
      })
    })
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "Could not create workspace.",
    }
  }

  // 3) Sign in (issues session cookie) so the client redirect lands on
  //    /workspace already authenticated.
  try {
    await auth.api.signInEmail({
      body: { email, password: input.password },
      headers: await headers(),
    })
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "Account created, but sign-in failed.",
    }
  }

  cookieStore.delete(SIGNUP_TOKEN_COOKIE)
  return { ok: true }
}
