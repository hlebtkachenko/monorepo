"use client"

import { initialsOf } from "@workspace/ui/blocks/app-header"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

/**
 * Minimal header identity for the rebuilt tree — avatar with initials fallback.
 * The full profile menu (theme, language, sign out, help) is rebuilt during the
 * execution phase; the foundation only needs to prove the signed-in user is
 * resolved and shown.
 */
export function HeaderUser({
  userName,
  userImage,
}: {
  userName?: string
  userImage?: string
}) {
  return (
    <Avatar className="size-7">
      <AvatarImage src={userImage} alt={userName ?? "Profile"} />
      <AvatarFallback className="text-[11px] font-medium">
        {initialsOf(userName)}
      </AvatarFallback>
    </Avatar>
  )
}
