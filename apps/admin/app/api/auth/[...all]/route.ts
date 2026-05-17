import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@workspace/auth/server"

/**
 * Better Auth catchall for the admin surface.
 *
 * The same `@workspace/auth/server` instance the web app uses; admin runs it
 * under its own origin (`BETTER_AUTH_URL=https://admin.afframe.com`) so the
 * session cookie is host-scoped — admin login is independent of web login.
 */
export const { GET, POST } = toNextJsHandler(auth.handler)
