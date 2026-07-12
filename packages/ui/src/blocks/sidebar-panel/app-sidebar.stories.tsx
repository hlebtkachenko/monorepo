import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { AppSidebar } from "./app-sidebar"
import {
  InsightChecklist,
  InsightMedia,
  InsightProgress,
} from "./insight-templates"
import type { SidebarFooterLink } from "./sidebar-footer"
import type { SidebarNavEntry } from "./sidebar-nav"
import type { SidebarReminder } from "./sidebar-reminders"

/**
 * The sidebar panel body (sections 2–5 below the shell's 45px header):
 * Reminders · Module nav · Insight · Footer. Every section self-hides when its
 * data is empty, so the same block collapses cleanly from the full stack down
 * to nav-only. Data-driven — the app wrapper feeds nav/reminders/footer + the
 * live pathname for active state.
 */
const meta: Meta<typeof AppSidebar> = {
  title: "Blocks/AppSidebar",
  component: AppSidebar,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <IconProvider>
        {/* Mimic the sidebar panel column: fixed width, full height, the shell
            surface + hairline border so active rows read in context. */}
        <div className="h-svh w-[236px] border-r border-border-subtle bg-shell-surface">
          <Story />
        </div>
      </IconProvider>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof AppSidebar>

const reminders: SidebarReminder[] = [
  {
    id: "vat-return-q4",
    kind: "action",
    title: "VAT return due",
    description: "Your Q4 VAT return is due in 3 days.",
    actionLabel: "File",
  },
  {
    id: "dph-threshold",
    kind: "info",
    title: "Approaching the DPH threshold",
    description:
      "You're nearing the turnover limit for mandatory VAT registration.",
    href: "https://example.com/dph",
  },
]

// Nav exercises all three shapes: a flat Page, a Page that expands to Subpages,
// and a labelled Group of Pages.
const nav: SidebarNavEntry[] = [
  { label: "Overview", href: "/acme", icon: "Goal" },
  { label: "Tasks", href: "/acme/tasks", icon: "CalendarClock", badge: 3 },
  {
    label: "Automations",
    href: "/acme/automations",
    icon: "Workflow",
    badge: 2,
    subpages: [
      { label: "Sequences", href: "/acme/automations/sequences" },
      { label: "Workflows", href: "/acme/automations/workflows" },
    ],
  },
  {
    label: "Filings",
    pages: [
      { label: "VAT returns", href: "/acme/vat", icon: "ReceiptEuro" },
      { label: "Control statement", href: "/acme/control", icon: "FileText" },
    ],
  },
  {
    label: "Documents",
    href: "/acme/documents",
    icon: "FolderBookmark",
    badge: "New",
  },
]

const footer: SidebarFooterLink[] = [
  { icon: "Settings", label: "Module settings", href: "/acme/settings" },
  { icon: "CircleHelp", label: "Help", href: "/acme/help" },
]

/** The full stack: reminders + nav (Tasks active) + a media insight + footer. */
export const Default: Story = {
  render: () => (
    <AppSidebar
      currentPath="/acme/tasks"
      reminders={reminders}
      remindersStorageKey="storybook-default"
      nav={nav}
      footer={footer}
      insight={
        <InsightMedia
          title="New: reconciliation view"
          description="Match bank lines to invoices in one pass: suggested matches, bulk actions, and a faster path to a clean ledger."
        />
      }
    />
  ),
}

/** Nav only — every other section self-hides when its data is empty. */
export const NavOnly: Story = {
  render: () => <AppSidebar currentPath="/acme" nav={nav} />,
}

/** A nested subpage active: the parent Page auto-opens to reveal it. */
export const SubpageActive: Story = {
  render: () => (
    <AppSidebar
      currentPath="/acme/automations/workflows"
      nav={nav}
      footer={footer}
    />
  ),
}

/** The progress insight template (trial → upgrade pattern). */
export const ProgressInsight: Story = {
  render: () => (
    <AppSidebar
      currentPath="/acme"
      nav={nav}
      footer={footer}
      insight={
        <InsightProgress
          title="Trial ends in 5 days"
          meta="7 of 10 seats used"
          value={70}
          actionLabel="Upgrade"
        />
      }
    />
  ),
}

/** The checklist insight template (read-only onboarding tasks). */
export const ChecklistInsight: Story = {
  render: () => (
    <AppSidebar
      currentPath="/acme"
      nav={nav}
      footer={footer}
      insight={
        <InsightChecklist
          title="Finish setup"
          items={[
            { label: "Create your organization", done: true },
            { label: "Invite your team", done: true },
            { label: "Connect your bank", done: false },
          ]}
        />
      }
    />
  ),
}
