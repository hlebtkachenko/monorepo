import type { Meta, StoryObj } from "@storybook/react"
import { ThemeProvider } from "./theme-provider"

const meta: Meta<typeof ThemeProvider> = {
  title: "Components/ThemeProvider",
  component: ThemeProvider,
}
export default meta

type Story = StoryObj<typeof ThemeProvider>

export const Default: Story = {
  render: () => (
    <ThemeProvider>
      <div className="space-y-2 p-4">
        <p className="text-foreground">
          Foreground text on background
        </p>
        <p className="text-muted-foreground">Muted foreground text</p>
        <div className="rounded-lg border bg-card p-4 text-card-foreground">
          Card surface
        </div>
        <div className="rounded-lg bg-primary px-3 py-1 text-primary-foreground">
          Primary
        </div>
      </div>
    </ThemeProvider>
  ),
}
