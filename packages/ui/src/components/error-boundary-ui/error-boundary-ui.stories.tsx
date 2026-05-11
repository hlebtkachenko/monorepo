import type { Meta, StoryObj } from "@storybook/react"
import { ErrorBoundaryUi } from "./error-boundary-ui"

const meta: Meta<typeof ErrorBoundaryUi> = {
  title: "Components/ErrorBoundaryUi",
  component: ErrorBoundaryUi,
}
export default meta
type Story = StoryObj<typeof ErrorBoundaryUi>

function makeError() {
  const err = new Error("Cannot read property 'name' of undefined")
  err.name = "TypeError"
  err.stack = `TypeError: Cannot read property 'name' of undefined
    at UserCard (/src/components/UserCard.tsx:42:11)
    at renderWithProvider (/src/lib/render.ts:88:5)
    at /src/pages/index.tsx:18:3`
  return err
}

const componentStack = `    in UserCard (at index.tsx:18)
    in Provider (at index.tsx:14)
    in App`

export const Default: Story = {
  args: { error: makeError(), isDev: true },
}

export const Production: Story = {
  args: { error: makeError(), isDev: false },
}

export const WithReset: Story = {
  args: {
    error: makeError(),
    resetError: () => console.log("reset"),
    isDev: true,
  },
}

export const WithComponentStack: Story = {
  args: {
    error: makeError(),
    componentStack,
    isDev: true,
  },
}
