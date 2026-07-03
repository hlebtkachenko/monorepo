"use client"

import * as React from "react"
import Link from "next/link"

import { DetailField } from "@workspace/ui/blocks/app-content"
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
import { toast } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"
import { useIcons } from "@workspace/ui/icon-packs"

import { COMPANY_PERIODS, STATUS_BADGE, type CompanyRow } from "./data"

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
 * straight into the book at a period), and a whole-card click-to-open overlay.
 * Avatars + periods are mock (no org logo / accounting_period columns yet);
 * members are real.
 */
export function CompanyCard({ company }: { company: CompanyRow }) {
  const icons = useIcons()
  const CalendarIcon = icons.CalendarClock
  const ChevronIcon = icons.ChevronDown
  const LockIcon = icons.Lock
  const LockOpenIcon = icons.LockOpen
  const InviteIcon = icons.UserPlus

  const [manageOpen, setManageOpen] = React.useState(false)

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
        <DetailField label="Assigned" value={company.assignee} />
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
              className="relative z-10 h-8 gap-1.5"
            >
              <CalendarIcon className="text-muted-foreground" />
              Open period
              <ChevronIcon className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuLabel>Open period</DropdownMenuLabel>
            {COMPANY_PERIODS.map((p) => {
              const Glyph = p.open ? LockOpenIcon : LockIcon
              return (
                <DropdownMenuItem key={p.value} asChild>
                  <Link href={`/${company.slug}?period=${p.value}`}>
                    <Glyph
                      className={cn(
                        "size-4",
                        p.open ? "text-foreground" : "text-muted-foreground",
                      )}
                    />
                    {p.label}
                  </Link>
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
