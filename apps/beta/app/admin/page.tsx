import Link from "next/link"

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
import { listOfficeOrganizations } from "@/lib/data/office/organizations"
import { RESERVED_ORG_SLUGS } from "@/lib/data/org-slug"
import { requireOffice } from "@/lib/data/scope"

import { createOrganizationAction } from "./_actions/organizations"
import { AdminActionForm } from "./_components/admin-action-form"

/**
 * Organizace — every client book the office keeps (spec §3.5).
 *
 * The grid shows the ownership invariant rather than hiding it: `ownerCount` is
 * the number the last-owner trigger defends, and an office that can see it is
 * an office that never wonders why a demotion was refused.
 *
 * Creating a book seats its creator as owner in the same transaction — see
 * `createOfficeOrganization` for why that is not optional.
 */
export default async function AdminOrganizationsPage() {
  const office = await requireOffice()
  const [t, organizations] = await Promise.all([
    getBetaTranslations(),
    listOfficeOrganizations(office),
  ])

  return (
    <div className="grid gap-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("admin.createOrganizationTitle")}
          </CardTitle>
          <CardDescription>
            {t("admin.createOrganizationHint")}{" "}
            <span className="font-mono text-xs">
              {RESERVED_ORG_SLUGS.join(", ")}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminActionForm
            action={createOrganizationAction}
            submitLabel={t("admin.createOrganizationSubmit")}
            className="sm:grid-cols-2"
          >
            <div className="grid gap-2">
              <Label htmlFor="legalName">{t("admin.fieldLegalName")}</Label>
              <Input id="legalName" name="legalName" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">{t("admin.fieldSlug")}</Label>
              <Input
                id="slug"
                name="slug"
                required
                inputMode="url"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ico">{t("admin.fieldIco")}</Label>
              <Input id="ico" name="ico" inputMode="numeric" maxLength={8} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vatRegime">{t("admin.fieldVatRegime")}</Label>
              <NativeSelect
                id="vatRegime"
                name="vatRegime"
                defaultValue="neplatce"
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
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="isDemo" name="isDemo" />
              <Label htmlFor="isDemo" className="font-normal">
                {t("admin.fieldIsDemo")}
              </Label>
            </div>
          </AdminActionForm>
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <h2 className="font-heading text-base font-semibold">
          {t("admin.organizationsTitle")}
        </h2>
        {organizations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.noRows")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.columnOrganization")}</TableHead>
                <TableHead>{t("admin.columnSlug")}</TableHead>
                <TableHead>{t("admin.columnVatRegime")}</TableHead>
                <TableHead className="text-right">
                  {t("admin.columnMembers")}
                </TableHead>
                <TableHead className="text-right">
                  {t("admin.columnOwners")}
                </TableHead>
                <TableHead>{t("admin.columnState")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((organization) => (
                <TableRow key={organization.id}>
                  <TableCell>
                    <Link
                      href={`/admin/organizace/${organization.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {organization.legalName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {organization.slug}
                  </TableCell>
                  <TableCell>
                    {organization.vatRegime === "platce"
                      ? t("admin.vatPlatce")
                      : t("admin.vatNeplatce")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {organization.memberCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {organization.ownerCount}
                  </TableCell>
                  <TableCell className="space-x-1">
                    {organization.archived ? (
                      <Badge variant="outline">
                        {t("admin.stateArchived")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t("admin.stateLive")}</Badge>
                    )}
                    {organization.isDemo ? (
                      <Badge variant="outline">{t("admin.stateDemo")}</Badge>
                    ) : null}
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
