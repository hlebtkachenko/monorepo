import type { Meta, StoryObj } from "@storybook/react"

import { ShellSkeleton } from "./skeletons/shell-skeleton"
import { ErrorShell } from "./skeletons/error-shell"

const meta: Meta = {
  title: "Blocks/AppShell",
  parameters: { layout: "fullscreen" },
}
export default meta

type SkeletonStory = StoryObj<typeof ShellSkeleton>
type ErrorStory = StoryObj<typeof ErrorShell>

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
