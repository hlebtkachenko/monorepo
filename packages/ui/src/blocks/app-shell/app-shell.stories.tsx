import type { Meta, StoryObj } from "@storybook/react"

import { AppShell } from "./app-shell"
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
