import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { ContentHeader } from "./content-header"
import type { ViewTab } from "./content-header-view-tabs"

/**
 * `ContentHeader` is the content panel's closed chrome for every page: a flat
 * flex row of `⟨back │⟩ ⟨trail ›⟩ Title ⟨│ view tabs⟩ … {Favorite}`. Its only
 * right-aligned action is the FAVORITE star, which is fully controlled: pass
 * `favorite={{ active, onToggle }}` to render a star the caller toggles; omit it
 * and the header shows no star.
 */
const meta: Meta<typeof ContentHeader> = {
  title: "Blocks/Content Panel/ContentHeader",
  component: ContentHeader,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <IconProvider>
        <div className="h-11 rounded-md border border-border-subtle bg-shell-surface px-2">
          <Story />
        </div>
      </IconProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ContentHeader>

const TABS: ViewTab[] = [
  { value: "all", label: "All", count: 12 },
  { value: "tax", label: "Tax documents", count: 3 },
]

/** Title only — no star (no `favorite` prop wired). */
export const Default: Story = {
  args: { title: "Received invoices" },
}

/** With a decorative leading title icon. */
export const WithTitleIcon: Story = {
  args: { title: "Received invoices", titleIcon: "Inbox" },
}

/** With an ancestor breadcrumb trail. */
export const WithBreadcrumb: Story = {
  args: {
    title: "Received",
    breadcrumb: [{ label: "Accounting", href: "#" }, { label: "Documents" }],
  },
}

/** With the view-tabs strip + the "Add view" button. */
export const WithViewTabs: Story = {
  args: {
    title: "Invoices",
    viewTabs: TABS,
    value: "all",
    onAddView: () => {},
  },
}

/** The `‹ Back to {label}` link (Single archetype). */
export const WithBackLink: Story = {
  args: {
    title: "#20260602",
    backTo: { label: "Issued invoices", href: "#" },
  },
}

/** The controlled favorite star, inactive — click stars the page. */
export const FavoriteInactive: Story = {
  render: () => {
    const [active, setActive] = React.useState(false)
    return (
      <ContentHeader
        title="Periods"
        favorite={{ active, onToggle: () => setActive((v) => !v) }}
      />
    )
  },
}

/** The controlled favorite star, active — the star is filled. */
export const FavoriteActive: Story = {
  render: () => {
    const [active, setActive] = React.useState(true)
    return (
      <ContentHeader
        title="Periods"
        favorite={{ active, onToggle: () => setActive((v) => !v) }}
      />
    )
  },
}
