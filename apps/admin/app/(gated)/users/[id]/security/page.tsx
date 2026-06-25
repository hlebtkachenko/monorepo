import "server-only"

import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { app_user, auth_account, two_factor } from "@workspace/db/schema"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import { Section } from "@/app/(gated)/_components"
import { auditAdminAction } from "@/lib/admin-audit"

export const metadata = { title: "User security" }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params

  const data = await withAdminBypass(async (db) => {
    const [user] = await db
      .select()
      .from(app_user)
      .where(eq(app_user.id, id))
      .limit(1)

    if (!user) return null

    const [mfaRows, passwordAccount] = await Promise.all([
      db.select().from(two_factor).where(eq(two_factor.user_id, id)).limit(10),
      db
        .select({
          updated_at: auth_account.updated_at,
          has_password: auth_account.password,
        })
        .from(auth_account)
        .where(eq(auth_account.user_id, id))
        .limit(10),
    ])

    return { user, mfaRows, passwordAccount }
  })

  if (!data) notFound()

  const { user, mfaRows, passwordAccount } = data

  await auditAdminAction({
    action: "admin.user.security_viewed",
    payload: { user_id: id },
  })

  const totpRow = mfaRows.find((r) => r.enabled)
  const totpEnabled = totpRow !== undefined
  const backupCodesCount = (() => {
    if (!totpRow?.backup_codes) return 0
    try {
      const parsed: unknown = JSON.parse(totpRow.backup_codes)
      return Array.isArray(parsed) ? parsed.length : 0
    } catch {
      return 0
    }
  })()

  const credAccount = passwordAccount.find((a) => a.has_password !== null)
  const passwordLastSet = credAccount?.updated_at ?? null

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* MFA */}
      <Section
        title="MFA"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title="Force MFA reset ships in M5"
          >
            Force MFA reset
          </Button>
        }
      >
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">TOTP enabled</dt>
          <dd>
            {totpEnabled ? (
              <Badge variant="default">Enabled</Badge>
            ) : (
              <Badge variant="outline">Disabled</Badge>
            )}
          </dd>
          {totpEnabled ? (
            <>
              <dt className="text-muted-foreground">Backup codes remaining</dt>
              <dd>{backupCodesCount}</dd>
              {totpRow?.enrolled_at ? (
                <>
                  <dt className="text-muted-foreground">Enrolled at</dt>
                  <dd className="font-mono text-xs">
                    {totpRow.enrolled_at.toISOString()}
                  </dd>
                </>
              ) : null}
              {totpRow?.last_used_at ? (
                <>
                  <dt className="text-muted-foreground">Last used</dt>
                  <dd className="font-mono text-xs">
                    {totpRow.last_used_at.toISOString()}
                  </dd>
                </>
              ) : null}
            </>
          ) : null}
        </dl>
      </Section>

      {/* Account state */}
      <Section
        title="Account state"
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              title="Ban/unban ships in M5"
            >
              {user.banned ? "Unban" : "Ban"}
            </Button>
          </div>
        }
      >
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Email verified</dt>
          <dd>
            {user.email_verified ? (
              <Badge variant="default">Verified</Badge>
            ) : (
              <Badge variant="outline">Unverified</Badge>
            )}
          </dd>
          <dt className="text-muted-foreground">Banned</dt>
          <dd>
            {user.banned ? (
              <Badge variant="destructive">Banned</Badge>
            ) : (
              <Badge variant="secondary">Active</Badge>
            )}
          </dd>
          {user.ban_reason ? (
            <>
              <dt className="text-muted-foreground">Ban reason</dt>
              <dd>{user.ban_reason}</dd>
            </>
          ) : null}
          {user.ban_expires ? (
            <>
              <dt className="text-muted-foreground">Ban expires</dt>
              <dd className="font-mono text-xs">
                {user.ban_expires.toISOString()}
              </dd>
            </>
          ) : null}
        </dl>
      </Section>

      {/* Password */}
      <Section
        title="Password"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title="Reset password ships in M5"
          >
            Reset password
          </Button>
        }
      >
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Last set</dt>
          <dd className="font-mono text-xs">
            {passwordLastSet ? (
              passwordLastSet.toISOString()
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </dl>
      </Section>
    </div>
  )
}
