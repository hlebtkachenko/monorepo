import { redirect } from "next/navigation"

/**
 * Root entrypoint. Forwards to /workspace, which handles the auth gate via
 * its layout (redirects to /auth/login when no session) and renders the
 * workspace chooser when signed in. Keeping the policy in one place
 * avoids drift between two auth-aware landings.
 */
export default function RootPage() {
  redirect("/workspace")
}
