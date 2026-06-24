import type { Meta, StoryObj } from "@storybook/react"

import { cn } from "@workspace/ui/lib/utils"

import { AppShell } from "./app-shell"
import {
  AssistantScaffold,
  ContentScaffold,
  SidebarScaffold,
} from "./panel-scaffold"

/**
 * Panel scaffolding — a visual map of the three context panels the app
 * shell exposes (sidebar / content / assistant). Pure colour rectangles
 * with a single label each; NO real content. Used to agree the region
 * structure before any business UI is built.
 *
 *   - `Regions`  → each panel as one flat tint, so the bare three-panel
 *     geometry + the shell's spacing (rail, header, insets, card gaps)
 *     are visible at a glance.
 *   - `Sections` → each panel broken into the proposed labelled blocks
 *     (the real `*Scaffold` blocks the web app mounts).
 *
 * Design artifact, not a shipped feature.
 */
const meta: Meta = {
  title: "Scaffold/App Shell Panels",
  parameters: { layout: "fullscreen" },
}
export default meta

type ShellStory = StoryObj<typeof AppShell>

const HeaderStrip = ({ label }: { label: string }) => (
  <div className="flex size-full items-center px-3 text-[11px] font-semibold text-muted-foreground">
    {label}
  </div>
)
const RailStrip = () => (
  <div className="flex size-full items-center justify-center bg-muted/40 text-center text-[10px] font-semibold text-muted-foreground">
    rail
  </div>
)

// ── Story 1: bare regions ────────────────────────────────────────────────
// Each panel is one flat block — reveals the three-panel geometry plus the
// shell's spacing system (rail / header / insets / card hairlines).

const RegionFill = ({ label, color }: { label: string; color: string }) => (
  <div className="size-full p-2">
    <div
      className={cn(
        "flex size-full items-center justify-center rounded-sm px-2 text-center text-[13px] font-semibold text-white/95",
      )}
      style={{ backgroundColor: color }}
    >
      {label}
    </div>
  </div>
)

export const Regions: ShellStory = {
  render: () => (
    <AppShell
      header={<HeaderStrip label="header · app-shell-header · 40px tall" />}
      rail={<RailStrip />}
      sidebar={
        <RegionFill
          label="SIDEBAR · app-shell-sidebar · 236px (160–360, drag)"
          color="#4f46e5"
        />
      }
      assistant={
        <RegionFill
          label="ASSISTANT · app-shell-assistant · 400px (200–800, drag)"
          color="#d97706"
        />
      }
      defaultAssistantOpen
    >
      <RegionFill
        label="CONTENT · app-shell-main · flex-1 (fills remaining width)"
        color="#059669"
      />
    </AppShell>
  ),
}

// ── Story 2: proposed sections ───────────────────────────────────────────
// The real *Scaffold blocks — same components the web app mounts. All three
// panel headers share one height + top offset, forming one aligned band.

export const Sections: ShellStory = {
  render: () => (
    <AppShell
      header={<HeaderStrip label="header" />}
      rail={<RailStrip />}
      sidebar={<SidebarScaffold />}
      assistant={<AssistantScaffold />}
      defaultAssistantOpen
    >
      <ContentScaffold />
    </AppShell>
  ),
}
