"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { initialsOf } from "@workspace/ui/blocks/app-header"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
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
import { toast } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"
import { useIcons } from "@workspace/ui/icon-packs"

import { COMPANY_PERIODS, type CompanyRow, type CompanyStatus } from "./data"

const STATUS_BADGE: Record<
  CompanyStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  Active: "default",
  Onboarding: "secondary",
  Archived: "outline",
}

/** Grey rounded-square company mark (initial) — a stand-in until org logos land. */
function CompanyAvatar({ name }: { name: string }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-base font-semibold text-foreground">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  )
}

/** Overlapping member avatars, capped, with a +N overflow chip. */
function MemberStack({ members }: { members: CompanyRow["members"] }) {
  const shown = members.slice(0, 5)
  const extra = members.length - shown.length
  if (members.length === 0) {
    return <span className="text-xs text-muted-foreground">No members</span>
  }
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((m) => (
          <Avatar key={m.userId} className="size-7 ring-2 ring-card">
            <AvatarImage src={m.image} alt={m.name} />
            <AvatarFallback className="text-[10px]">
              {initialsOf(m.name)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      {extra > 0 ? (
        <span className="ml-1.5 text-xs text-muted-foreground">+{extra}</span>
      ) : null}
    </div>
  )
}

/** Small labelled fact for the card body. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate text-sm text-foreground">{value}</div>
    </div>
  )
}

/**
 * The Companies "big card" — one company book with its identity, a real member
 * stack, a period quick-switcher (jump straight into the book at a period), an
 * Open action, and a Manage-members dialog. Avatars + periods are mock (no org
 * logo / accounting_period columns yet); members are real.
 */
export function CompanyCard({ company }: { company: CompanyRow }) {
  const router = useRouter()
  const icons = useIcons()
  const CalendarIcon = icons.CalendarClock
  const ChevronIcon = icons.ChevronDown
  const LockIcon = icons.Lock
  const LockOpenIcon = icons.LockOpen
  const UsersIcon = icons.Users
  const InviteIcon = icons.UserPlus

  const [manageOpen, setManageOpen] = React.useState(false)
  const [period, setPeriod] = React.useState(
    COMPANY_PERIODS.find((p) => p.open)?.value ?? COMPANY_PERIODS[0]!.value,
  )

  const openBook = (periodValue?: string) => {
    if (periodValue) setPeriod(periodValue)
    router.push(`/${company.slug}`)
  }

  return (
    <div className="flex flex-col rounded-xl bg-card p-4 ring-1 ring-border-subtle transition-shadow hover:shadow-sm">
      {/* Identity */}
      <div className="flex items-start gap-3">
        <CompanyAvatar name={company.legalName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-foreground">
              {company.legalName}
            </h3>
            <Badge variant={STATUS_BADGE[company.status]} className="shrink-0">
              {company.status}
            </Badge>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {company.typeLabel} · /{company.slug}
          </div>
        </div>
      </div>

      {/* Facts */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Fact label="VAT regime" value={company.vatRegime} />
        <Fact label="Fiscal year" value={company.fiscalYear} />
        <Fact label="Next deadline" value={company.nextDeadline} />
        <Fact label="Assigned" value={company.assignee} />
      </div>

      {/* Members */}
      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
        <MemberStack members={company.members} />
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => setManageOpen(true)}
        >
          <UsersIcon />
          Manage
        </Button>
      </div>

      {/* Actions — period quick-switch + Open */}
      <div className="mt-3 flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <CalendarIcon className="text-muted-foreground" />
              {period}
              <ChevronIcon className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            <DropdownMenuLabel>Open period</DropdownMenuLabel>
            {COMPANY_PERIODS.map((p) => {
              const Glyph = p.open ? LockOpenIcon : LockIcon
              return (
                <DropdownMenuItem
                  key={p.value}
                  onSelect={() => openBook(p.value)}
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

        <Button asChild size="sm" className="ml-auto h-8">
          <Link href={`/${company.slug}`}>Open</Link>
        </Button>
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
                  <Avatar className="size-7">
                    <AvatarImage src={m.image} alt={m.name} />
                    <AvatarFallback className="text-[10px]">
                      {initialsOf(m.name)}
                    </AvatarFallback>
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
            <Button onClick={() => openBook()}>Open</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
