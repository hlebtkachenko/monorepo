"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

export type InviteRole = "admin" | "member"

export interface InviteRowProps {
  email: string
  role: InviteRole
  onEmailChange: (value: string) => void
  onRoleChange: (value: InviteRole) => void
  onRemove: () => void
  removable?: boolean
  emailLabel?: string
  roleLabel?: string
  removeLabel?: string
  adminLabel?: string
  memberLabel?: string
  className?: string
}

function InviteRow({
  email,
  role,
  onEmailChange,
  onRoleChange,
  onRemove,
  removable = true,
  emailLabel = "Email",
  roleLabel = "Role",
  removeLabel = "Remove",
  adminLabel = "Admin",
  memberLabel = "Member",
  className,
}: InviteRowProps) {
  return (
    <div
      data-slot="invite-row"
      className={cn(
        "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] sm:gap-3",
        className,
      )}
    >
      <Input
        type="email"
        aria-label={emailLabel}
        placeholder={emailLabel}
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
      />
      <Select value={role} onValueChange={(v) => onRoleChange(v as InviteRole)}>
        <SelectTrigger aria-label={roleLabel} className="w-full sm:w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">{adminLabel}</SelectItem>
          <SelectItem value="member">{memberLabel}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="destructive"
        size="icon"
        aria-label={removeLabel}
        disabled={!removable}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  )
}

export interface InviteRowAddButtonProps {
  onClick: () => void
  label?: string
  className?: string
}

function InviteRowAddButton({
  onClick,
  label = "Add member",
  className,
}: InviteRowAddButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={cn(
        "w-full border-dashed text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Plus />
      {label}
    </Button>
  )
}

export { InviteRow, InviteRowAddButton }
