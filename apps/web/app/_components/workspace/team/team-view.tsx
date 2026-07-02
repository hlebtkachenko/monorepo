"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  ContentStatusBar,
  ContentToolbar,
} from "@workspace/ui/blocks/app-content"
import { initialsOf } from "@workspace/ui/blocks/app-header"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Search } from "@workspace/ui/lib/icons"
import { useIcons } from "@workspace/ui/icon-packs"

import { AppPageHeader } from "../../app-page-header"
import { PageHeaderActions } from "../../_shared/content-header-extras"

export interface TeamMember {
  userId: string
  name: string
  email: string
  image?: string
  role: "owner" | "admin" | "member"
  active: boolean
}

const ROLE_LABEL: Record<TeamMember["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

const ROLE_BADGE: Record<
  TeamMember["role"],
  React.ComponentProps<typeof Badge>["variant"]
> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
}

/**
 * Team — the workspace members list. Real membership rows (workspace_membership
 * ⋈ app_user, resolved server-side) shown in a plain `Table` (a small office
 * team doesn't need the TanStack DataGridView machinery reserved for the client
 * list). Title lives in the portaled `ContentHeader`, never a body heading.
 */
export function TeamView({ members }: { members: TeamMember[] }) {
  const icons = useIcons()
  const PlusIcon = icons.UserPlus
  const [search, setSearch] = React.useState("")

  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) =>
      [m.name, m.email, ROLE_LABEL[m.role]].some((v) =>
        v.toLowerCase().includes(q),
      ),
    )
  }, [members, search])

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Members" actions={<PageHeaderActions />} />
      </AppPageHeader>
      <ContentPanel
        bodyClassName="flex min-h-0 flex-col p-0"
        toolbar={
          <ContentToolbar
            left={
              <div className="relative flex h-7 w-72 items-center">
                <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
                <Input
                  placeholder="Search team…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-7 w-full pl-8"
                />
              </div>
            }
            right={
              <Button
                size="sm"
                onClick={() => toast("Invite member — coming soon")}
              >
                <PlusIcon />
                Invite member
              </Button>
            }
          />
        }
        statusBar={
          <ContentStatusBar
            left={
              <span>
                {shown.length} {shown.length === 1 ? "member" : "members"}
              </span>
            }
          />
        }
      >
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-6">
                        <AvatarImage src={m.image} alt={m.name} />
                        <AvatarFallback className="text-[10px]">
                          {initialsOf(m.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{m.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ROLE_BADGE[m.role]}>
                      {ROLE_LABEL[m.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        m.active ? "text-foreground" : "text-muted-foreground"
                      }
                    >
                      {m.active ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ContentPanel>
    </>
  )
}
