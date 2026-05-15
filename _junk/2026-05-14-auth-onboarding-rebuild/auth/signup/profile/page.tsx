import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySignupToken, TokenError } from "@workspace/auth/tokens"
import { SignupProfileForm } from "./profile-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export const metadata = {
  title: "Create your account",
}

const SIGNUP_TOKEN_COOKIE = "app-signup-token"

export default async function SignupProfilePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SIGNUP_TOKEN_COOKIE)?.value
  if (!token) {
    redirect("/auth/login?error=signup-session-expired")
  }
  try {
    const claims = await verifySignupToken(token)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Set a password for {claims.email}. You will own the workspace after
            this step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupProfileForm email={claims.email} />
        </CardContent>
      </Card>
    )
  } catch (err) {
    if (err instanceof TokenError) {
      cookieStore.delete(SIGNUP_TOKEN_COOKIE)
      redirect("/auth/login?error=" + err.code.toLowerCase())
    }
    throw err
  }
}
