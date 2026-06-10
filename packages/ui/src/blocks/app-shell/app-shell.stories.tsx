import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { AppShell } from "./app-shell"
import { AppShellBottomNav } from "./app-shell-bottom-nav"
import { ShellSkeleton } from "./skeletons/shell-skeleton"
import { ErrorShell } from "./skeletons/error-shell"

const meta: Meta = {
  title: "Blocks/AppShell",
  parameters: { layout: "fullscreen" },
}
export default meta

type SkeletonStory = StoryObj<typeof ShellSkeleton>
type ErrorStory = StoryObj<typeof ErrorShell>
type ShellStory = StoryObj<typeof AppShell>

const RailPlaceholder = () => (
  <div className="size-full" data-testid="rail-placeholder" />
)
const HeaderPlaceholder = () => (
  <div className="size-full" data-testid="header-placeholder" />
)
const SidebarPlaceholder = () => (
  <div className="size-full" data-testid="sidebar-placeholder" />
)
const AssistantPlaceholder = () => (
  <div className="size-full" data-testid="assistant-placeholder" />
)

export const Shell: ShellStory = {
  render: () => (
    <AppShell
      header={<HeaderPlaceholder />}
      rail={<RailPlaceholder />}
      sidebar={<SidebarPlaceholder />}
      assistant={<AssistantPlaceholder />}
    />
  ),
}

export const ShellAssistantOpen: ShellStory = {
  render: () => (
    <AppShell
      header={<HeaderPlaceholder />}
      rail={<RailPlaceholder />}
      sidebar={<SidebarPlaceholder />}
      assistant={<AssistantPlaceholder />}
      defaultAssistantOpen
    />
  ),
}

export const ShellSidebarCollapsed: ShellStory = {
  render: () => (
    <AppShell
      header={<HeaderPlaceholder />}
      rail={<RailPlaceholder />}
      sidebar={<SidebarPlaceholder />}
      assistant={<AssistantPlaceholder />}
      defaultSidebarOpen={false}
    />
  ),
}

export const AssistantVariantShell: ShellStory = {
  render: () => (
    <AppShell
      header={<HeaderPlaceholder />}
      rail={<RailPlaceholder />}
      sidebar={<SidebarPlaceholder />}
      assistant={<AssistantPlaceholder />}
      assistantVariant="shell"
      defaultAssistantOpen
    />
  ),
}

export const AssistantVariantDropdown: ShellStory = {
  render: () => (
    <AppShell
      header={<HeaderPlaceholder />}
      rail={<RailPlaceholder />}
      sidebar={<SidebarPlaceholder />}
      assistant={<AssistantPlaceholder />}
      assistantVariant="dropdown"
      defaultAssistantOpen
    />
  ),
}

/**
 * Mobile (<md): rail hidden, sidebar/assistant open as Sheets via the
 * main-card toggles, bottom nav bar from the navigation-bottom-mobile
 * component. View at a phone viewport — at desktop widths this story
 * looks identical to `Shell`.
 */
export const ShellMobile: ShellStory = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  render: () => (
    <IconProvider>
      <AppShell
        header={<HeaderPlaceholder />}
        rail={<RailPlaceholder />}
        sidebar={<SidebarPlaceholder />}
        assistant={<AssistantPlaceholder />}
        bottomNav={
          <AppShellBottomNav
            currentPath="/acme/accounting"
            items={[
              { label: "Company", icon: "Goal", href: "/acme" },
              {
                label: "Accounting",
                icon: "Calculator",
                href: "/acme/accounting",
              },
              {
                label: "Records",
                icon: "FolderBookmark",
                href: "/acme/documents",
              },
              { label: "Finance", icon: "PiggyBank", href: "/acme/finance" },
              { label: "Settings", icon: "Settings", href: "/acme/settings" },
            ]}
          />
        }
      />
    </IconProvider>
  ),
}

export const Skeleton: SkeletonStory = {
  render: () => <ShellSkeleton />,
  parameters: { layout: "fullscreen" },
}

export const Error404: ErrorStory = {
  render: () => <ErrorShell variant="404" homeHref="/" />,
}

export const ErrorGeneric: ErrorStory = {
  render: () => (
    <ErrorShell errorId="abc123" homeHref="/" onReset={() => undefined} />
  ),
}

export const ErrorForbidden: ErrorStory = {
  render: () => <ErrorShell variant="forbidden" homeHref="/" />,
}
