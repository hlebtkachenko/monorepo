import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Panel scaffolding — a visual map of the three context PANELS the app
 * shell exposes (sidebar / content / assistant), each split into its
 * SECTIONS. Vocabulary: a Panel contains Sections. Pure colour rectangles
 * with one label each, NO real content — used to agree the structure
 * before any business UI is built.
 *
 * The 44px header bar at the top of every panel is shell chrome (rendered
 * by AppShell, holds the open/close toggles), so these scaffolds map only
 * the BODY sections that sit below that header.
 */

// One labelled Section: a colour rectangle inside a Panel. `grow` lets the
// scrolling work-area section soak up the leftover vertical space; chrome
// sections pass an explicit height class.
function Section({
  label,
  color,
  className,
}: {
  label: string
  color: string
  className?: string
}) {
  return (
    <div
      data-section={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-sm px-2 text-center text-[11px] leading-tight font-semibold text-white/95",
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {label}
    </div>
  )
}

// A Panel wrapper: the tint shows through the gap + padding, so spacing
// reads as the panel's own colour between its sections.
function Panel({
  name,
  tint,
  children,
}: {
  name: "sidebar" | "content" | "assistant"
  tint: string
  children: React.ReactNode
}) {
  return (
    <div
      data-panel={name}
      className="flex h-full flex-col gap-2 p-2"
      style={{ backgroundColor: tint }}
    >
      {children}
    </div>
  )
}

// Distinct hue per panel: sidebar=indigo, content=emerald, assistant=amber.
const TINT = {
  sidebar: "#e0e7ff",
  content: "#d1fae5",
  assistant: "#fef3c7",
}

export function SidebarScaffold() {
  return (
    <Panel name="sidebar" tint={TINT.sidebar}>
      <Section
        label="Section nav (active area)"
        color="#4f46e5"
        className="grow"
      />
      <Section label="Saved views / filters" color="#7c3aed" className="h-24" />
      <Section
        label="Sidebar footer (settings)"
        color="#4338ca"
        className="h-10"
      />
    </Panel>
  )
}

export function ContentScaffold() {
  return (
    <Panel name="content" tint={TINT.content}>
      <Section
        label="Toolbar (tabs · search · view · filters)"
        color="#0d9488"
        className="h-10"
      />
      <Section
        label="Body (table / cards / detail)"
        color="#10b981"
        className="grow"
      />
      <Section
        label="Status bar / pagination"
        color="#047857"
        className="h-9"
      />
    </Panel>
  )
}

export function AssistantScaffold() {
  return (
    <Panel name="assistant" tint={TINT.assistant}>
      <Section
        label="Context chips (org · page · selection)"
        color="#ea580c"
        className="h-12"
      />
      <Section
        label="Conversation (message stream)"
        color="#f59e0b"
        className="grow"
      />
      <Section
        label="Composer (input · send · tools)"
        color="#b45309"
        className="h-24"
      />
    </Panel>
  )
}
