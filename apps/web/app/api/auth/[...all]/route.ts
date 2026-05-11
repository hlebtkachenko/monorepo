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
export const { GET, POST } = toNextJsHandler(auth.handler)
