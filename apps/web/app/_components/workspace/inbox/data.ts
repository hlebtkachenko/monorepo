/**
 * Inbox feed data contract for the workspace tier. Entirely MOCK: no
 * notifications/invites tables back the workspace inbox yet. The rows are a
 * static, deterministic array (no `Math.random` / `Date.now`) so renders never
 * drift and the surface reads as a clear placeholder until real sources land.
 * A notifications feed is a plain list — it uses the `<Table>` primitive inside
 * a `ContentPanel`, not the heavy `useDataTable` machinery (reserved for the
 * Clients list).
 */

import type { IconName } from "@workspace/ui/icon-packs"

export type InboxType = "Invite" | "System" | "Billing" | "Deadline" | "Agent"

export interface InboxMessage {
  id: string
  type: InboxType
  subject: string
  /** Short one-line preview of the body. */
  preview: string
  /** Sender — a person's name or a system source. */
  from: string
  /** ISO date string (deterministic, no `Date.now`). */
  date: string
  read: boolean
}

export interface InboxTab {
  value: string
  label: string
}

export const INBOX_TABS: InboxTab[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
]

/**
 * Per-type presentation: the leading icon (from the ICON_NAMES union) and the
 * Badge variant. Kept as a lookup so the view stays declarative.
 */
export const INBOX_TYPE_META: Record<
  InboxType,
  { icon: IconName; badgeVariant: "secondary" | "outline" | "destructive" }
> = {
  Invite: { icon: "UserPlus", badgeVariant: "secondary" },
  System: { icon: "Info", badgeVariant: "outline" },
  Billing: { icon: "CreditCard", badgeVariant: "outline" },
  Deadline: { icon: "CalendarClock", badgeVariant: "destructive" },
  Agent: { icon: "Sparkles", badgeVariant: "secondary" },
}

/** MOCK feed — ~12 workspace notifications, newest first. */
export const INBOX_MESSAGES: InboxMessage[] = [
  {
    id: "msg-01",
    type: "Invite",
    subject: "Lucie Dvořáková invited you to Novák & Partners",
    preview: "Accept to start collaborating on the client book.",
    from: "Lucie Dvořáková",
    date: "2026-07-01T09:14:00.000Z",
    read: false,
  },
  {
    id: "msg-02",
    type: "Deadline",
    subject: "VAT return for Acme s.r.o. due in 3 days",
    preview: "Period June 2026 · file by the 25th.",
    from: "Deadlines",
    date: "2026-06-30T07:00:00.000Z",
    read: false,
  },
  {
    id: "msg-03",
    type: "Agent",
    subject: "12 received invoices auto-booked",
    preview: "Review the 2 low-confidence entries flagged for you.",
    from: "Afframe Agent",
    date: "2026-06-29T16:42:00.000Z",
    read: false,
  },
  {
    id: "msg-04",
    type: "Billing",
    subject: "Workspace invoice VF-2026-06 is ready",
    preview: "1 480 Kč · charged to the card ending 4242.",
    from: "Billing",
    date: "2026-06-28T11:20:00.000Z",
    read: true,
  },
  {
    id: "msg-05",
    type: "System",
    subject: "Two-factor authentication enabled",
    preview: "TOTP is now required for your account sign-ins.",
    from: "System",
    date: "2026-06-27T18:05:00.000Z",
    read: false,
  },
  {
    id: "msg-06",
    type: "Deadline",
    subject: "Control statement for Kovář OSVČ due in 5 days",
    preview: "Kontrolní hlášení · period June 2026.",
    from: "Deadlines",
    date: "2026-06-26T07:00:00.000Z",
    read: true,
  },
  {
    id: "msg-07",
    type: "Agent",
    subject: "Bank statement reconciled",
    preview: "34 of 36 transactions matched automatically.",
    from: "Afframe Agent",
    date: "2026-06-25T13:31:00.000Z",
    read: true,
  },
  {
    id: "msg-08",
    type: "Invite",
    subject: "Tomáš Novák accepted your invitation",
    preview: "He now has the Accountant role in this workspace.",
    from: "Tomáš Novák",
    date: "2026-06-24T10:12:00.000Z",
    read: true,
  },
  {
    id: "msg-09",
    type: "System",
    subject: "New sign-in from Prague, CZ",
    preview: "Chrome on macOS · if this wasn't you, review sessions.",
    from: "System",
    date: "2026-06-23T21:47:00.000Z",
    read: false,
  },
  {
    id: "msg-10",
    type: "Billing",
    subject: "Payment method expiring soon",
    preview: "The card ending 4242 expires next month.",
    from: "Billing",
    date: "2026-06-22T08:00:00.000Z",
    read: true,
  },
  {
    id: "msg-11",
    type: "Agent",
    subject: "Chart of accounts extended",
    preview: "Added account 518300 for a recurring supplier.",
    from: "Afframe Agent",
    date: "2026-06-21T15:09:00.000Z",
    read: true,
  },
  {
    id: "msg-12",
    type: "System",
    subject: "Welcome to your workspace",
    preview: "Set up your first client book to get started.",
    from: "System",
    date: "2026-06-20T09:00:00.000Z",
    read: true,
  },
]

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

/** Formats an ISO date string as e.g. "01 Jul 2026" (deterministic). */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso))
}
