import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifyInviteToken, TokenError } from "@workspace/auth/tokens"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { InviteProfileForm } from "./invite-profile-form"

export const metadata = {
  title: "Create your account",
}

const INVITE_TOKEN_COOKIE = "app-invite-token"

export default async function InviteProfilePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(INVITE_TOKEN_COOKIE)?.value
  if (!token) {
    redirect("/auth/login?error=invite-session-expired")
  }
  try {
    const claims = await verifyInviteToken(token)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Set a password for {claims.email}. Your invitation will activate
            after you complete this step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteProfileForm email={claims.email} />
        </CardContent>
      </Card>
    )
  } catch (err) {
    if (err instanceof TokenError) {
      cookieStore.delete(INVITE_TOKEN_COOKIE)
      redirect("/auth/login?error=" + err.code.toLowerCase())
    }
    throw err
  }
}
