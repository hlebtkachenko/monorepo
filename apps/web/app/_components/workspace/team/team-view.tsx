"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  ContentStatusBar,
  ContentToolbarLegacy,
} from "@workspace/ui/blocks/content-panel"
import { initialsOf } from "@workspace/ui/blocks/app-header"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { toast } from "@workspace/ui/components/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useIcons } from "@workspace/ui/icon-packs"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { ToolbarSearch } from "../_shared/toolbar-search"

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
        <ContentHeader title="Members" />
      </AppPageHeader>
      <ContentPanel
        bodyClassName="flex min-h-0 flex-col p-0"
        toolbar={
          <ContentToolbarLegacy
            left={
              <ToolbarSearch
                value={search}
                onChange={setSearch}
                placeholder="Search team…"
              />
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
        <div className="min-h-0 flex-1 overflow-auto [&_[data-slot=table-container]]:overflow-visible">
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
                      <Avatar size="sm">
                        <AvatarImage src={m.image} alt={m.name} />
                        <AvatarFallback>{initialsOf(m.name)}</AvatarFallback>
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
          {shown.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <icons.Users />
                </EmptyMedia>
                <EmptyTitle>No members found</EmptyTitle>
                <EmptyDescription>
                  Try a different search term.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </div>
      </ContentPanel>
    </>
  )
}
