import type { Meta, StoryObj } from "@storybook/react"

import { Button } from "@workspace/ui/components/button"
import {
  FloatingPanel,
  FloatingPanelBody,
  FloatingPanelContent,
  FloatingPanelControl,
  FloatingPanelHeader,
  FloatingPanelMaximize,
  FloatingPanelMinimize,
  FloatingPanelRestore,
  FloatingPanelTitle,
  FloatingPanelTrigger,
} from "./floating-panel"

const meta: Meta<typeof FloatingPanel> = {
  title: "Components/FloatingPanel",
  component: FloatingPanel,
}
export default meta
type Story = StoryObj<typeof FloatingPanel>

export const Default: Story = {
  render: () => (
    <FloatingPanel defaultOpen>
      <FloatingPanelTrigger asChild>
        <Button variant="outline">Open panel</Button>
      </FloatingPanelTrigger>
      <FloatingPanelContent>
        <FloatingPanelHeader>
          <FloatingPanelTitle>Floating panel</FloatingPanelTitle>
          <FloatingPanelControl>
            <FloatingPanelMinimize />
            <FloatingPanelRestore />
            <FloatingPanelMaximize />
          </FloatingPanelControl>
        </FloatingPanelHeader>
        <FloatingPanelBody>
          <p className="text-sm text-muted-foreground">
            Drag me by the header. Resize from any edge.
          </p>
        </FloatingPanelBody>
      </FloatingPanelContent>
    </FloatingPanel>
  ),
}

export const WithRestore: Story = {
  render: () => (
    <FloatingPanel defaultOpen>
      <FloatingPanelTrigger asChild>
        <Button variant="outline">Open panel</Button>
      </FloatingPanelTrigger>
      <FloatingPanelContent>
        <FloatingPanelHeader>
          <FloatingPanelTitle>Stage controls</FloatingPanelTitle>
          <FloatingPanelControl>
            <FloatingPanelMinimize />
            <FloatingPanelRestore />
            <FloatingPanelMaximize />
          </FloatingPanelControl>
        </FloatingPanelHeader>
        <FloatingPanelBody>
          <p className="text-sm text-muted-foreground">
            Minimize, maximize, or restore via the header controls.
          </p>
        </FloatingPanelBody>
      </FloatingPanelContent>
    </FloatingPanel>
  ),
}

export const CustomSize: Story = {
  render: () => (
    <FloatingPanel defaultSize={{ width: 480, height: 320 }} defaultOpen>
      <FloatingPanelTrigger asChild>
        <Button variant="outline">Open large panel</Button>
      </FloatingPanelTrigger>
      <FloatingPanelContent>
        <FloatingPanelHeader>
          <FloatingPanelTitle>Custom dimensions</FloatingPanelTitle>
          <FloatingPanelControl>
            <FloatingPanelMinimize />
            <FloatingPanelRestore />
            <FloatingPanelMaximize />
          </FloatingPanelControl>
        </FloatingPanelHeader>
        <FloatingPanelBody>
          <p className="text-sm text-muted-foreground">
            Opens at 480 by 320 by default.
          </p>
        </FloatingPanelBody>
      </FloatingPanelContent>
    </FloatingPanel>
  ),
}
