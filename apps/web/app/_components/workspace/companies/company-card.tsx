"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { DetailField } from "@workspace/ui/blocks/content-panel"
import { initialsOf } from "@workspace/ui/blocks/app-header"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardDescription, CardTitle } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { toast } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"
import { useIcons } from "@workspace/ui/icon-packs"

import { setActivePeriodAction } from "@/lib/org/period-actions-legacy"
import { setCompanyAssigneeAction } from "../../../workspace/actions"
import {
  archiveOrgAction,
  unarchiveOrgAction,
} from "../../../workspace/organizations/actions"
import { useCompanies } from "./context"
import { type CompanyAssignee, STATUS_BADGE, type CompanyRow } from "./data"

const CARD_ARCHIVE_ERROR: Record<string, string> = {
  sessionExpired: "Your session expired. Please sign in again.",
  noActiveWorkspace: "No active workspace.",
  notFound: "That company could not be found.",
  forbidden: "Only an owner or admin can archive a company.",
}

const ASSIGN_ERROR: Record<string, string> = {
  sessionExpired: "Your session expired. Please sign in again.",
  noActiveWorkspace: "No active workspace.",
  notFound: "That company could not be found.",
  invalidAssignee: "That person is not an active member of this workspace.",
  forbidden: "Only an owner or admin can reassign a company.",
}

const UNASSIGNED = "__unassigned__"

/**
 * The company's responsible-accountant field. Read-only text for a plain
 * member; a real `Select` (calling `setCompanyAssigneeAction`) for a
 * workspace owner/admin. Shared by the card and the Companies table
 * inspector (`companies-table.tsx`).
 */
export function CompanyAssigneeField({
  company,
  canAssign,
  assignableMembers,
}: {
  company: CompanyRow
  canAssign: boolean
  assignableMembers: CompanyAssignee[]
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  if (!canAssign) {
    return (
      <span className="text-sm font-medium">
        {company.assignee?.name ?? "Unassigned"}
      </span>
    )
  }

  return (
    <Select
      value={company.assignee?.userId ?? UNASSIGNED}
      disabled={pending}
      onValueChange={(value) => {
        const userId = value === UNASSIGNED ? null : value
        startTransition(async () => {
          const res = await setCompanyAssigneeAction(company.slug, userId)
          if (res.ok) {
            toast.success(userId ? "Assignee updated" : "Company unassigned")
            router.refresh()
          } else {
            toast.error(
              (res.errorKey && ASSIGN_ERROR[res.errorKey]) ||
                "Could not update the assignee.",
            )
          }
        })
      }}
    >
      <SelectTrigger
        size="sm"
        className="relative z-10 h-7 w-full text-xs"
        aria-label={`Assignee for ${company.legalName}`}
      >
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {assignableMembers.map((m) => (
          <SelectItem key={m.userId} value={m.userId}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Grey rounded-square company mark (initial) — a stand-in until org logos land. */
function CompanyAvatar({ name }: { name: string }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-base font-semibold text-foreground">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  )
}

/**
 * The Companies "big card" — one company book with its identity, a real member
 * stack (also the Manage-members trigger), a period quick-switcher (jump
 * straight into the book at a period, persisting the choice via
 * `setActivePeriodAction`), and a whole-card click-to-open overlay. Members and
 * periods are real; only the avatar (a grey initial mark) is a stand-in until
 * org logos land.
 */
export function CompanyCard({ company }: { company: CompanyRow }) {
  const router = useRouter()
  const { canAssign, assignableMembers } = useCompanies()
  const icons = useIcons()
  const CalendarIcon = icons.CalendarClock
  const ChevronIcon = icons.ChevronDown
  const LockIcon = icons.Lock
  const LockOpenIcon = icons.LockOpen
  const InviteIcon = icons.UserPlus
  const MenuIcon = icons.Ellipsis
  const ArchiveIcon = icons.Archive
  const RestoreIcon = icons.RotateCcw

  const [manageOpen, setManageOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const toggleArchived = () => {
    startTransition(async () => {
      const res = company.archived
        ? await unarchiveOrgAction(company.id)
        : await archiveOrgAction(company.id)
      if (res.ok) {
        toast.success(
          company.archived ? "Company restored" : "Company archived",
        )
        router.refresh()
      } else {
        toast.error(
          (res.errorKey && CARD_ARCHIVE_ERROR[res.errorKey]) ||
            "Could not update the company.",
        )
      }
    })
  }

  const selectPeriod = (periodId: string) => {
    startTransition(async () => {
      const res = await setActivePeriodAction(company.slug, periodId)
      if (res.ok) router.push(`/${company.slug}`)
    })
  }

  const shownMembers = company.members.slice(0, 4)
  const extraMembers = company.members.length - shownMembers.length

  return (
    <Card
      className={cn(
        "group/card @container relative gap-0 p-4 transition-colors hover:ring-foreground/20",
        company.status === "Archived" && "opacity-70",
      )}
    >
      {/* Whole-card click target — opens the company book. */}
      <Link
        href={`/${company.slug}`}
        aria-label={company.legalName}
        className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {/* Identity */}
      <div className="flex items-start gap-3">
        <CompanyAvatar name={company.legalName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CardTitle className="truncate">{company.legalName}</CardTitle>
            <Badge variant={STATUS_BADGE[company.status]} className="shrink-0">
              {company.status}
            </Badge>
          </div>
          <CardDescription className="truncate">
            {company.typeLabel}
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Actions for ${company.legalName}`}
              disabled={pending}
              className="relative z-10 -mr-1 shrink-0 text-muted-foreground"
            >
              <MenuIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem onSelect={toggleArchived} disabled={pending}>
              {company.archived ? <RestoreIcon /> : <ArchiveIcon />}
              {company.archived ? "Restore" : "Archive"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Facts */}
      <div className="mt-4 grid grid-cols-1 gap-3 @xs:grid-cols-2">
        <DetailField
          label="Next deadline"
          value={
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarIcon className="size-4 text-muted-foreground" />
              {company.nextDeadline}
            </span>
          }
        />
        <DetailField label="VAT regime" value={company.vatRegime} />
        <DetailField
          label="Assigned"
          value={
            <CompanyAssigneeField
              company={company}
              canAssign={canAssign}
              assignableMembers={assignableMembers}
            />
          }
        />
      </div>

      {/* Members + period quick-switch */}
      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
        {company.members.length === 0 ? (
          <button
            type="button"
            aria-label="Manage members"
            onClick={() => setManageOpen(true)}
            className="relative z-10 rounded-md text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            No members
          </button>
        ) : (
          <button
            type="button"
            aria-label="Manage members"
            onClick={() => setManageOpen(true)}
            className="relative z-10 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AvatarGroup>
              {shownMembers.map((m) => (
                <Avatar key={m.userId} size="sm">
                  <AvatarImage src={m.image} alt={m.name} />
                  <AvatarFallback>{initialsOf(m.name)}</AvatarFallback>
                </Avatar>
              ))}
              {extraMembers > 0 ? (
                <AvatarGroupCount>+{extraMembers}</AvatarGroupCount>
              ) : null}
            </AvatarGroup>
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={pending || company.periods.length === 0}
              className="relative z-10 h-8 gap-1.5"
            >
              <CalendarIcon className="text-muted-foreground" />
              Open period
              <ChevronIcon className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuLabel>Open period</DropdownMenuLabel>
            {company.periods.map((p) => {
              const Glyph = p.open ? LockOpenIcon : LockIcon
              return (
                <DropdownMenuItem
                  key={p.value}
                  disabled={pending}
                  onSelect={() => selectPeriod(p.value)}
                >
                  <Glyph
                    className={cn(
                      "size-4",
                      p.open ? "text-foreground" : "text-muted-foreground",
                    )}
                  />
                  {p.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Manage-members dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Members of {company.legalName}</DialogTitle>
            <DialogDescription>
              People with access to this company&apos;s book.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1 py-1">
            {company.members.length === 0 ? (
              <li className="py-2 text-sm text-muted-foreground">
                No members yet.
              </li>
            ) : (
              company.members.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center gap-2 rounded-md px-1 py-1.5"
                >
                  <Avatar size="sm">
                    <AvatarImage src={m.image} alt={m.name} />
                    <AvatarFallback>{initialsOf(m.name)}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-sm">{m.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-muted-foreground"
                    onClick={() => toast("Remove member — coming soon")}
                  >
                    Remove
                  </Button>
                </li>
              ))
            )}
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => toast("Invite member — coming soon")}
            >
              <InviteIcon />
              Invite member
            </Button>
            <Button onClick={() => setManageOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
