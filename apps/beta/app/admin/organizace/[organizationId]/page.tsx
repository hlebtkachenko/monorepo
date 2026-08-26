import { notFound } from "next/navigation"

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
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { getBetaTranslations } from "@/i18n/translations-server"
import { listOrganizationMembers } from "@/lib/data/office/memberships"
import { officeOrganization } from "@/lib/data/office/organizations"
import { requireOffice } from "@/lib/data/scope"

import {
  changeMemberRoleAction,
  inviteToOrganizationAction,
  setMemberActiveAction,
} from "../../_actions/memberships"
import { isUuid } from "../../_actions/input"
import {
  setOrganizationArchivedAction,
  updateOrganizationSettingsAction,
} from "../../_actions/organizations"
import { AdminActionForm } from "../../_components/admin-action-form"
import { ROLE_LABEL_KEY, ROLE_OPTIONS } from "../../_components/labels"

/**
 * One client book: its office-owned settings, its people, and the invites into
 * it (spec §3.5, §2.10 Lidé).
 *
 * The role select offers all four roles because the reader of this page is
 * office staff and the office may grant any of them — the matrix that narrows
 * it for a company admin is the same one (`invite-policy.ts`), read from the
 * organization door in PR 22. The database refuses an owner grant to a
 * non-staff account whichever door it came through, which is why the grid shows
 * the staff flag next to the role: an owner row that could not exist is not a
 * mystery, it is visible.
 *
 * ARCHIVE, NOT DELETE. Deleting a book is an owner act inside it, behind a
 * multistep typed confirmation, and has to purge S3 including noncurrent
 * versions (plan Part 4 / B4-5) — PR 37, with PR 38's storage.
 */
export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params
  const office = await requireOffice()

  // The segment is request input. Postgres answers a non-uuid `= $1` on a uuid
  // column with 22P02 (invalid input syntax), which surfaces as a 500 — a
  // typo'd URL must be a 404, and a probe must not be able to tell the two
  // apart. Same rule the actions apply to every id they receive.
  if (!isUuid(organizationId)) notFound()

  const organization = await officeOrganization(office, organizationId)
  if (!organization) notFound()

  const [t, members] = await Promise.all([
    getBetaTranslations(),
    listOrganizationMembers(office, organization.id),
  ])

  return (
    <div className="grid gap-8">
      <header className="grid gap-1">
        <h1 className="font-heading text-xl font-semibold">
          {organization.legalName}
        </h1>
        <p className="font-mono text-xs text-muted-foreground">
          /{organization.slug}
          {organization.ico ? ` · IČO ${organization.ico}` : ""}
        </p>
        <div className="flex gap-1 pt-1">
          {organization.archived ? (
            <Badge variant="outline">{t("admin.stateArchived")}</Badge>
          ) : (
            <Badge variant="secondary">{t("admin.stateLive")}</Badge>
          )}
          {organization.isDemo ? (
            <Badge variant="outline">{t("admin.stateDemo")}</Badge>
          ) : null}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("admin.organizationSettingsTitle")}
          </CardTitle>
          <CardDescription>
            {t("admin.organizationSettingsHint")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <AdminActionForm
            action={updateOrganizationSettingsAction}
            submitLabel={t("admin.save")}
            className="sm:grid-cols-2"
          >
            <input
              type="hidden"
              name="organizationId"
              value={organization.id}
            />
            <div className="grid gap-2">
              <Label htmlFor="vatRegime">{t("admin.fieldVatRegime")}</Label>
              <NativeSelect
                id="vatRegime"
                name="vatRegime"
                defaultValue={organization.vatRegime}
                className="w-full"
              >
                <NativeSelectOption value="neplatce">
                  {t("admin.vatNeplatce")}
                </NativeSelectOption>
                <NativeSelectOption value="platce">
                  {t("admin.vatPlatce")}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vatRegisteredFrom">
                {t("admin.fieldVatRegisteredFrom")}
              </Label>
              {/*
                `defaultValue` is what stops an unrelated save — toggling the
                demo flag — from nulling this. The regime and its date are
                written as a pair (`organizationVatPayload`), so an empty input
                is indistinguishable from "clear it".
              */}
              <Input
                id="vatRegisteredFrom"
                name="vatRegisteredFrom"
                type="date"
                defaultValue={organization.vatRegisteredFrom ?? ""}
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                id="isDemo"
                name="isDemo"
                defaultChecked={organization.isDemo}
              />
              <Label htmlFor="isDemo" className="font-normal">
                {t("admin.fieldIsDemo")}
              </Label>
            </div>
          </AdminActionForm>

          <AdminActionForm
            action={setOrganizationArchivedAction}
            submitLabel={
              organization.archived ? t("admin.unarchive") : t("admin.archive")
            }
            submitVariant="outline"
            layout="row"
          >
            <input
              type="hidden"
              name="organizationId"
              value={organization.id}
            />
            <input
              type="hidden"
              name="archived"
              value={organization.archived ? "false" : "true"}
            />
            <span className="text-sm text-muted-foreground">
              {t("admin.archiveHint")}
            </span>
          </AdminActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("admin.inviteTitle")}
          </CardTitle>
          <CardDescription>{t("admin.inviteHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminActionForm
            action={inviteToOrganizationAction}
            submitLabel={t("admin.inviteSubmit")}
            className="sm:grid-cols-2"
          >
            <input
              type="hidden"
              name="organizationId"
              value={organization.id}
            />
            <div className="grid gap-2">
              <Label htmlFor="inviteEmail">{t("admin.fieldEmail")}</Label>
              <Input
                id="inviteEmail"
                name="email"
                type="email"
                required
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inviteRole">{t("admin.fieldRole")}</Label>
              <NativeSelect
                id="inviteRole"
                name="role"
                defaultValue="member"
                className="w-full"
              >
                {ROLE_OPTIONS.map((role) => (
                  <NativeSelectOption key={role} value={role}>
                    {t(ROLE_LABEL_KEY[role])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </AdminActionForm>
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <h2 className="font-heading text-base font-semibold">
          {t("admin.membersTitle")}
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.noRows")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.columnPerson")}</TableHead>
                <TableHead>{t("admin.columnState")}</TableHead>
                <TableHead>{t("admin.columnRole")}</TableHead>
                <TableHead>{t("admin.columnActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell>
                    <span className="block font-medium">{member.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {member.email}
                    </span>
                  </TableCell>
                  <TableCell className="space-x-1">
                    {member.active ? (
                      <Badge variant="secondary">
                        {t("admin.stateActive")}
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        {t("admin.stateInactive")}
                      </Badge>
                    )}
                    {member.staff ? (
                      <Badge variant="outline">{t("admin.stateStaff")}</Badge>
                    ) : null}
                    {member.disabled ? (
                      <Badge variant="destructive">
                        {t("admin.stateDisabled")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <AdminActionForm
                      action={changeMemberRoleAction}
                      submitLabel={t("admin.save")}
                      submitVariant="outline"
                      layout="row"
                    >
                      <input
                        type="hidden"
                        name="organizationId"
                        value={organization.id}
                      />
                      <input
                        type="hidden"
                        name="userId"
                        value={member.userId}
                      />
                      <NativeSelect
                        name="role"
                        defaultValue={member.role}
                        aria-label={t("admin.fieldRole")}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <NativeSelectOption key={role} value={role}>
                            {t(ROLE_LABEL_KEY[role])}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </AdminActionForm>
                  </TableCell>
                  <TableCell>
                    <AdminActionForm
                      action={setMemberActiveAction}
                      submitLabel={
                        member.active
                          ? t("admin.deactivate")
                          : t("admin.activate")
                      }
                      submitVariant="outline"
                      layout="row"
                    >
                      <input
                        type="hidden"
                        name="organizationId"
                        value={organization.id}
                      />
                      <input
                        type="hidden"
                        name="userId"
                        value={member.userId}
                      />
                      <input
                        type="hidden"
                        name="active"
                        value={member.active ? "false" : "true"}
                      />
                    </AdminActionForm>
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
