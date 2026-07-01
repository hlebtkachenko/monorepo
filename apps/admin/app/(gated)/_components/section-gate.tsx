import type { ReactNode } from "react"

import { requireSection } from "@/lib/require-section"

import { AccessDenied } from "./access-denied"

/**
 * Server-side section gate. Wrap a section's `layout.tsx` children in this
 * to enforce role-based access. On deny: audits + renders `<AccessDenied />`
 * instead of children. Server actions inside the section ALSO call
 * `requireSection` (or `requireAdminCapability`) so a bypassed layout
 * doesn't open the action endpoint.
 */
export async function SectionGate({
  path,
  children,
}: {
  path: string
  children: ReactNode
}) {
  const { allowed } = await requireSection(path)
  if (!allowed) return <AccessDenied />
  return <>{children}</>
}
