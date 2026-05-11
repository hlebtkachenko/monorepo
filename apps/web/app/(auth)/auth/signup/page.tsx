import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { verifySignupToken, TokenError } from "@workspace/auth/tokens"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export const metadata = {
  title: "Welcome",
}

const SIGNUP_TOKEN_COOKIE = "app-signup-token"

/**
 * Welcome card. Reads the signup token from the HttpOnly cookie set by
 * `/auth/signup/start`. Server Components cannot write cookies under Next
 * 16; the route handler at /auth/signup/start owns the write.
 */
export default async function SignupWelcomePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SIGNUP_TOKEN_COOKIE)?.value
  if (!token) {
    redirect("/auth/login?error=missing-signup-token")
  }
  try {
    const claims = await verifySignupToken(token)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>
            You have been invited to set up the workspace
            <strong className="text-foreground"> {claims.workspace}</strong>.
            Continue to create your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/auth/signup/profile">Continue</Link>
          </Button>
        </CardContent>
      </Card>
    )
  } catch (err) {
    if (err instanceof TokenError) {
      redirect("/auth/login?error=" + err.code.toLowerCase())
    }
    throw err
  }
}
