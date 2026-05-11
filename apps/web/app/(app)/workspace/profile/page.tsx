import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@workspace/auth/server"
import { Button } from "@workspace/ui/components/button"

export const metadata = {
  title: "Your profile",
}

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/auth/login")
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <dl className="text-sm">
        <div className="flex gap-4 py-1">
          <dt className="w-24 text-muted-foreground">Name</dt>
          <dd>{session.user.name}</dd>
        </div>
        <div className="flex gap-4 py-1">
          <dt className="w-24 text-muted-foreground">Email</dt>
          <dd>{session.user.email}</dd>
        </div>
      </dl>
      <div className="space-y-2 pt-2">
        <h2 className="text-base font-medium">Two-factor authentication</h2>
        <p className="text-sm text-muted-foreground">
          {session.user.twoFactorEnabled
            ? "Two-factor is enabled on this account."
            : "Protect your account with a TOTP authenticator app."}
        </p>
        {!session.user.twoFactorEnabled ? (
          <Button asChild variant="outline">
            <Link href="/auth/mfa/setup">Set up two-factor</Link>
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Profile editing (name, avatar, locale) lands later.
      </p>
    </div>
  )
}
