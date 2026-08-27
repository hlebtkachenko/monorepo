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
import { peopleForScope } from "@/lib/data/people"

import { PageHeader } from "../../../../_components/page-header"

import { resolveOrgScope } from "../../_lib/org-scope"
import {
  changeMemberRoleAction,
  inviteMemberAction,
  setMemberActiveAction,
} from "../_actions/people"
import { ROLE_LABEL_KEY } from "../_components/labels"

import { MemberStateBadges } from "./_components/member-state-badges"
import { PeopleActionForm } from "./_components/people-action-form"

/**
 * Nastavení › Lidé (spec §2.10, §5) — the client-facing people surface, and the
 * one place a company administers its own access.
 *
 * WHO REACHES IT. `peopleForScope` answers 404 for a `member` or a `guest`
 * rather than rendering an empty page: they have no business here (§5), and the
 * seam's doctrine is that a surface someone may not use does not exist for them.
 * The tab is hidden for the same viewers (`nastaveniNavFor`), but the 404 is the
 * enforcement — the URL is guessable and the nav is not a gate.
 *
 * WHAT IS RENDERED IS WHAT THE SERVER SAID IS ALLOWED. Every control on this
 * page is driven by a boolean or a list computed in `lib/data/people.ts` from
 * `lib/auth/invite-policy.ts` — `invitableRoles` fills the invite select,
 * `assignableRoles` fills each row's, `deactivatable` decides whether the
 * activate button is live. This component contains no rule of its own, so there
 * is no second version of the ceiling to disagree with the first. And it is only
 * the DISPLAY half: the three actions behind these forms re-resolve the scope
 * and re-derive every verdict against the role as stored, because a form control
 * is a suggestion to a browser and never a constraint on a POST.
 *
 * THE LAST OWNER IS EXPLAINED, NOT JUST BLOCKED (§2.10 "last-owner protection
 * surfaced"). `beta_prevent_last_owner_removal` (migration 0002) refuses the
 * demotion and the deactivation that would leave the book with no accountant;
 * without a badge saying so, the client meets that invariant as an error message
 * after a click, on the one action they most expect to work.
 */
export default async function LidePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)
  const { members, invitableRoles } = await peopleForScope(scope)

  const t = await getBetaTranslations()

  return (
    <div className="grid gap-6">
      <PageHeader title={t("nastaveni.navLide")} />

      <section className="grid gap-3">
        <h2 className="text-base font-medium text-foreground">
          {t("nastaveni.peopleTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("nastaveni.peopleHint")}
        </p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("nastaveni.columnPerson")}</TableHead>
              <TableHead>{t("nastaveni.columnState")}</TableHead>
              <TableHead>{t("nastaveni.columnRole")}</TableHead>
              <TableHead>{t("nastaveni.columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>
                  <span className="block font-medium">
                    {member.name}
                    {member.self ? (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {t("nastaveni.stateYou")}
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {member.email}
                  </span>
                </TableCell>

                <TableCell className="space-x-1">
                  <MemberStateBadges
                    active={member.active}
                    lastOwner={member.lastOwner}
                    employeeSeat={member.employeeSeat}
                  />
                </TableCell>

                <TableCell>
                  {/* No assignable role ⇒ no select at all. A disabled dropdown
                      showing the roles you may not pick is an invitation to try;
                      the current label is the whole truth for that row. */}
                  {member.assignableRoles.length === 0 ? (
                    <span className="text-sm">
                      {t(ROLE_LABEL_KEY[member.role])}
                    </span>
                  ) : (
                    <PeopleActionForm
                      action={changeMemberRoleAction}
                      orgSlug={orgSlug}
                      submitLabel={t("nastaveni.save")}
                      submitVariant="outline"
                      layout="row"
                    >
                      <input
                        type="hidden"
                        name="userId"
                        value={member.userId}
                      />
                      <NativeSelect
                        name="role"
                        defaultValue={member.role}
                        aria-label={t("nastaveni.columnRole")}
                      >
                        {member.assignableRoles.map((role) => (
                          <NativeSelectOption key={role} value={role}>
                            {t(ROLE_LABEL_KEY[role])}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </PeopleActionForm>
                  )}
                </TableCell>

                <TableCell>
                  <PeopleActionForm
                    action={setMemberActiveAction}
                    orgSlug={orgSlug}
                    submitLabel={
                      member.active
                        ? t("nastaveni.deactivate")
                        : t("nastaveni.activate")
                    }
                    submitVariant="outline"
                    // Reactivating is bounded by the same ceiling as
                    // deactivating (an admin may not switch an owner seat back
                    // on either), so one flag drives both directions.
                    submitDisabled={!member.deactivatable}
                    layout="row"
                  >
                    <input type="hidden" name="userId" value={member.userId} />
                    <input
                      type="hidden"
                      name="active"
                      value={member.active ? "false" : "true"}
                    />
                    {member.lastOwner ? (
                      <span className="text-xs text-muted-foreground">
                        {t("nastaveni.lastOwnerHint")}
                      </span>
                    ) : null}
                  </PeopleActionForm>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="grid gap-3">
        <h3 className="text-sm font-medium text-foreground">
          {t("nastaveni.inviteTitle")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("nastaveni.inviteHint")}
        </p>
        <PeopleActionForm
          action={inviteMemberAction}
          orgSlug={orgSlug}
          submitLabel={t("nastaveni.inviteSubmit")}
          className="sm:grid-cols-2"
        >
          <div className="grid gap-2">
            <Label htmlFor="inviteEmail">{t("nastaveni.fieldEmail")}</Label>
            <Input
              id="inviteEmail"
              name="email"
              type="email"
              required
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inviteRole">{t("nastaveni.columnRole")}</Label>
            <NativeSelect
              id="inviteRole"
              name="role"
              // `guest` is the least privileged role on offer to every issuer,
              // so a mis-click defaults to the smallest grant rather than the
              // largest one the viewer happens to be allowed.
              defaultValue="guest"
              className="w-full"
            >
              {invitableRoles.map((role) => (
                <NativeSelectOption key={role} value={role}>
                  {t(ROLE_LABEL_KEY[role])}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </PeopleActionForm>
      </section>
    </div>
  )
}
