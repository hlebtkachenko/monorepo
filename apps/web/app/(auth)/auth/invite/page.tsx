import { cookies, headers as nextHeaders } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { verifyInviteToken, TokenError } from "@workspace/auth/tokens"
import { auth } from "@workspace/auth/server"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export const metadata = {
  title: "Invitation",
}

const INVITE_TOKEN_COOKIE = "app-invite-token"

/**
 * Welcome card for invite recipients. Reads the invite token from the
 * HttpOnly cookie set by /auth/invite/start (route handler). Server
 * Components cannot write cookies under Next 16.
 */
export default async function InviteWelcomePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(INVITE_TOKEN_COOKIE)?.value
  if (!token) {
    redirect("/auth/login?error=missing-invite-token")
  }

  let claims
  try {
    claims = await verifyInviteToken(token)
  } catch (err) {
    if (err instanceof TokenError) {
      redirect("/auth/login?error=" + err.code.toLowerCase())
    }
    throw err
  }

  const session = await auth.api.getSession({ headers: await nextHeaders() })
  const alreadySignedIn =
    session?.user.email?.toLowerCase() === claims.email.toLowerCase()

  return (
    <Card>
      <CardHeader>
        <CardTitle>You have been invited</CardTitle>
        <CardDescription>
          You will join as{" "}
          <strong className="text-foreground">{claims.role}</strong> on the
          organization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link
            href={
              alreadySignedIn ? "/auth/invite/accept" : "/auth/invite/profile"
            }
          >
            {alreadySignedIn ? "Accept invitation" : "Continue"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
