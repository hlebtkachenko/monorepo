import type { Meta, StoryObj } from "@storybook/react"
import { Browser } from "./browser"

const meta: Meta<typeof Browser> = {
  title: "Components/Browser",
  component: Browser,
}
export default meta
type Story = StoryObj<typeof Browser>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="h-[480px] w-full max-w-4xl">{children}</div>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <Browser />
    </Frame>
  ),
}

export const WithWindowControls: Story = {
  render: () => (
    <Frame>
      <Browser showWindowControls />
    </Frame>
  ),
}

export const WithTabs: Story = {
  render: () => (
    <Frame>
      <Browser
        enableTabManagement
        initialTabs={[
          { id: "1", title: "Docs", url: "https://docs.example.com" },
          { id: "2", title: "Repo", url: "https://github.com/example" },
        ]}
      />
    </Frame>
  ),
}

export const WithBookmarksBar: Story = {
  render: () => (
    <Frame>
      <Browser showWindowControls enableTabManagement showBookmarksBar />
    </Frame>
  ),
}

export const NewTab: Story = {
  render: () => (
    <Frame>
      <Browser initialUrl="about:blank" />
    </Frame>
  ),
}

export const CustomRender: Story = {
  render: () => (
    <Frame>
      <Browser
        initialUrl="https://example.com"
        renderContent={(url, loading) => (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {loading ? "Loading…" : `Custom content for ${url}`}
          </div>
        )}
      />
    </Frame>
  ),
}
