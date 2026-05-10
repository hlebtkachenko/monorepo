import type { Meta, StoryObj } from "@storybook/react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./resizable"

const meta: Meta<typeof ResizablePanelGroup> = {
  title: "Components/Resizable",
  component: ResizablePanelGroup,
}
export default meta
type Story = StoryObj<typeof ResizablePanelGroup>

export const Default: Story = {
  render: () => (
    <ResizablePanelGroup orientation="horizontal" className="min-h-48 border rounded-lg">
      <ResizablePanel defaultSize={50}>
        <div className="flex items-center justify-center h-full p-4">
          <span className="text-sm font-medium">Left Panel</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}>
        <div className="flex items-center justify-center h-full p-4">
          <span className="text-sm font-medium">Right Panel</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
}

export const Vertical: Story = {
  render: () => (
    <ResizablePanelGroup orientation="vertical" className="min-h-48 border rounded-lg">
      <ResizablePanel defaultSize={40}>
        <div className="flex items-center justify-center h-full p-4">
          <span className="text-sm font-medium">Top Panel</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={60}>
        <div className="flex items-center justify-center h-full p-4">
          <span className="text-sm font-medium">Bottom Panel</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
}

export const ThreePanels: Story = {
  render: () => (
    <ResizablePanelGroup orientation="horizontal" className="min-h-48 border rounded-lg">
      <ResizablePanel defaultSize={25}>
        <div className="flex items-center justify-center h-full p-4 text-sm">Sidebar</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={50}>
        <div className="flex items-center justify-center h-full p-4 text-sm">Main</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={25}>
        <div className="flex items-center justify-center h-full p-4 text-sm">Detail</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
}
