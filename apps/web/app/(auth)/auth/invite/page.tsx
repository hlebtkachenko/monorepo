import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { verifyInviteToken, TokenError } from "@workspace/auth/tokens"
import { auth } from "@workspace/auth/server"
import { headers as nextHeaders } from "next/headers"
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

export default async function InviteWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
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

  const cookieStore = await cookies()
  cookieStore.set(INVITE_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth/invite",
    maxAge: 60 * 60 * 24,
  })

  // If user is already signed in with the same email, accept directly.
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
