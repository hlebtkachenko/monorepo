import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@workspace/auth/server"

/**
 * Better Auth catchall route.
 *
 * Mounts ~25 endpoints under `/api/auth/*`:
 *   /api/auth/sign-in/email     /api/auth/sign-up/email
 *   /api/auth/sign-out          /api/auth/get-session
 *   /api/auth/reset-password    /api/auth/verify-email
 *   /api/auth/two-factor/*      /api/auth/admin/*
 *
 * Custom signup + invite token flows do NOT go here — they live as server
 * actions under `/auth/signup/*` and `/auth/invite/*` because they wrap
 * Better Auth's signUp.email() with our own token verification + workspace/
 * organization membership creation.
 */
const handlers = toNextJsHandler(auth.handler)

export const GET = handlers.GET

/**
 * Public registration is CLOSED — there is no self-service signup. Accounts are
 * created only through the token-gated server actions referenced above, which
 * call `auth.api.signUpEmail` in-process; that path never traverses this HTTP
 * route.
 *
 * The web container cannot set `disableSignUp` the way the admin container does
 * (`AUTH_DISABLE_SIGNUP=1`) — on web that flag would also block the in-process
 * `auth.api.signUpEmail` the onboarding flow depends on. So the raw Better Auth
 * `POST /api/auth/sign-up/email` endpoint would otherwise stay open. Reject it
 * here with the exact response Better Auth emits when `disableSignUp` is set, so
 * the public surface is closed and account existence stays non-enumerable.
 */
export async function POST(request: Request): Promise<Response> {
  if (new URL(request.url).pathname.endsWith("/sign-up/email")) {
    return Response.json(
      {
        message: "Email and password sign up is not enabled",
        code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
      },
      { status: 400 },
    )
  }
  return handlers.POST(request)
}
