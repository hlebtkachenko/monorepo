import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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
import { listAgentKeys } from "@/lib/data/office/agent-keys"
import { listOfficeOrganizations } from "@/lib/data/office/organizations"
import { requireOffice } from "@/lib/data/scope"

import {
  issueAgentKeyAction,
  revokeAgentKeyAction,
} from "../_actions/agent-keys"
import { AdminActionForm } from "../_components/admin-action-form"

/**
 * Agentní klíče — the registry of office agent keys (spec §3.2).
 *
 * IT CANNOT SHOW A KEY. The table holds `sha256(secret)`; the secret is rendered
 * exactly once, in the response to the form above it. A lost key is reissued and
 * the old one revoked.
 *
 * A KEY ACTS AS ITS ISSUER, so there is no "act as" picker: the credential
 * carries the authority of whoever pressed the button and reaches exactly the
 * books that person is účetní of. The one choice on the form is REACH — one book
 * or the whole office — and it can only ever narrow.
 */
export default async function AdminAgentKeysPage() {
  const office = await requireOffice()
  const [t, keys, organizations] = await Promise.all([
    getBetaTranslations(),
    listAgentKeys(office),
    listOfficeOrganizations(office),
  ])

  return (
    <div className="grid gap-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("admin.agentKeyIssueTitle")}
          </CardTitle>
          <CardDescription>{t("admin.agentKeyIssueHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminActionForm
            action={issueAgentKeyAction}
            submitLabel={t("admin.agentKeyIssueSubmit")}
            className="sm:grid-cols-2"
          >
            <div className="grid gap-2">
              <Label htmlFor="label">{t("admin.fieldAgentKeyLabel")}</Label>
              <Input id="label" name="label" required autoComplete="off" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="organizationId">
                {t("admin.fieldAgentKeyScope")}
              </Label>
              <NativeSelect
                id="organizationId"
                name="organizationId"
                defaultValue=""
                className="w-full"
              >
                <NativeSelectOption value="">
                  {t("admin.agentKeyScopeOffice")}
                </NativeSelectOption>
                {organizations
                  .filter((org) => !org.archived)
                  .map((org) => (
                    <NativeSelectOption key={org.id} value={org.id}>
                      {org.legalName}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </div>
          </AdminActionForm>
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <h2 className="font-heading text-base font-semibold">
          {t("admin.agentKeysTitle")}
        </h2>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.noRows")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.columnAgentKeyLabel")}</TableHead>
                <TableHead>{t("admin.columnAgentKeyScope")}</TableHead>
                <TableHead>{t("admin.columnAgentKeyActingUser")}</TableHead>
                <TableHead>{t("admin.columnState")}</TableHead>
                <TableHead>{t("admin.columnAgentKeyLastUsed")}</TableHead>
                <TableHead>{t("admin.columnActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="text-sm font-medium">
                    {key.label}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {key.organizationName ?? t("admin.agentKeyScopeOffice")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {key.actingUserEmail ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={key.revoked ? "outline" : "secondary"}>
                      {key.revoked
                        ? t("admin.agentKeyStateRevoked")
                        : t("admin.agentKeyStateLive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {key.lastUsedAt
                      ? new Date(key.lastUsedAt).toLocaleString("cs-CZ")
                      : t("admin.agentKeyNeverUsed")}
                  </TableCell>
                  <TableCell>
                    {key.revoked ? null : (
                      <AdminActionForm
                        action={revokeAgentKeyAction}
                        submitLabel={t("admin.revokeLink")}
                        submitVariant="outline"
                        layout="row"
                      >
                        <input type="hidden" name="keyId" value={key.id} />
                      </AdminActionForm>
                    )}
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
