import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { getBetaTranslations } from "@/i18n/translations-server"
import { listOfficeUsers } from "@/lib/data/office/users"
import { requireOffice } from "@/lib/data/scope"

import { SectionTitle } from "../../_components/page-header"

import { grantOwnerEverywhereAction } from "../_actions/memberships"
import {
  createUserAction,
  issueUserLinkAction,
  setUserDisabledAction,
  setUserStaffAction,
} from "../_actions/users"
import { AdminActionForm } from "../_components/admin-action-form"

/**
 * Uživatelé — every account in the portal (spec §3.5).
 *
 * `is_staff` IS SET HERE AND NOWHERE ELSE. It is not a fifth role and has no
 * other UI surface: it gates this very area and is the database precondition
 * for an `owner` membership, so office-ness can only ever originate from an
 * office user (plan Part 4).
 *
 * "Aktivován" is the column that explains the rest of the screen. Creating an
 * account writes an IDENTITY, not a login — public sign-up is off and Better
 * Auth's `disableSignUp` blocks the server-side path too (B4-1), so the
 * credential only exists once an `account_setup` link has been consumed. Until
 * then the row is real, invisible to its owner, and claimable ONLY through a
 * staff-issued link.
 */
export default async function AdminUsersPage() {
  const office = await requireOffice()
  const [t, users] = await Promise.all([
    getBetaTranslations(),
    listOfficeUsers(office),
  ])

  return (
    <div className="grid gap-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("admin.createUserTitle")}
          </CardTitle>
          <CardDescription>{t("admin.createUserHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminActionForm
            action={createUserAction}
            submitLabel={t("admin.createUserSubmit")}
            className="sm:grid-cols-2"
          >
            <div className="grid gap-2">
              <Label htmlFor="email">{t("admin.fieldEmail")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">{t("admin.fieldName")}</Label>
              <Input id="name" name="name" autoComplete="off" />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="isStaff" name="isStaff" />
              <Label htmlFor="isStaff" className="font-normal">
                {t("admin.fieldIsStaff")}
              </Label>
            </div>
          </AdminActionForm>
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <SectionTitle>{t("admin.usersTitle")}</SectionTitle>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.noRows")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.columnPerson")}</TableHead>
                <TableHead>{t("admin.columnState")}</TableHead>
                <TableHead className="text-right">
                  {t("admin.columnMemberships")}
                </TableHead>
                <TableHead>{t("admin.columnActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.userId}>
                  <TableCell>
                    <span className="block font-medium">{user.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </TableCell>
                  <TableCell className="space-x-1">
                    {user.disabled ? (
                      <Badge variant="destructive">
                        {t("admin.stateDisabled")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        {t("admin.stateActive")}
                      </Badge>
                    )}
                    {user.staff ? (
                      <Badge variant="outline">{t("admin.stateStaff")}</Badge>
                    ) : null}
                    {user.activated ? null : (
                      <Badge variant="outline">
                        {t("admin.stateNotActivated")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {user.membershipCount}
                    {user.ownerOfCount > 0 ? ` (${user.ownerOfCount}×⌂)` : ""}
                  </TableCell>
                  <TableCell>
                    <div className="grid gap-2">
                      <AdminActionForm
                        action={setUserStaffAction}
                        submitLabel={
                          user.staff
                            ? t("admin.revokeStaff")
                            : t("admin.grantStaff")
                        }
                        submitVariant="outline"
                        layout="row"
                      >
                        <input
                          type="hidden"
                          name="userId"
                          value={user.userId}
                        />
                        <input
                          type="hidden"
                          name="staff"
                          value={user.staff ? "false" : "true"}
                        />
                      </AdminActionForm>

                      <AdminActionForm
                        action={setUserDisabledAction}
                        submitLabel={
                          user.disabled
                            ? t("admin.enableUser")
                            : t("admin.disableUser")
                        }
                        submitVariant="outline"
                        layout="row"
                      >
                        <input
                          type="hidden"
                          name="userId"
                          value={user.userId}
                        />
                        <input
                          type="hidden"
                          name="disabled"
                          value={user.disabled ? "false" : "true"}
                        />
                      </AdminActionForm>

                      {user.staff && !user.disabled ? (
                        <AdminActionForm
                          action={grantOwnerEverywhereAction}
                          submitLabel={t("admin.ownerEverywhere")}
                          submitVariant="outline"
                          layout="row"
                        >
                          <input
                            type="hidden"
                            name="userId"
                            value={user.userId}
                          />
                        </AdminActionForm>
                      ) : null}

                      {user.disabled ? null : (
                        <AdminActionForm
                          action={issueUserLinkAction}
                          submitLabel={
                            user.activated
                              ? t("admin.issueResetLink")
                              : t("admin.issueSetupLink")
                          }
                          submitVariant="outline"
                          layout="row"
                        >
                          <input
                            type="hidden"
                            name="email"
                            value={user.email}
                          />
                          <input
                            type="hidden"
                            name="activated"
                            value={user.activated ? "true" : "false"}
                          />
                        </AdminActionForm>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}
