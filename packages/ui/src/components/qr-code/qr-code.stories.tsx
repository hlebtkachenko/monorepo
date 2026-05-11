import type { Meta, StoryObj } from "@storybook/react"
import {
  QRCode,
  QRCodeCanvas,
  QRCodeDownload,
  QRCodeImage,
  QRCodeOverlay,
  QRCodeSkeleton,
  QRCodeSvg,
} from "./qr-code"
import { Button } from "@workspace/ui/components/button"

const meta: Meta<typeof QRCode> = {
  title: "Components/QRCode",
  component: QRCode,
}
export default meta
type Story = StoryObj<typeof QRCode>

export const Default: Story = {
  args: { value: "https://example.com" },
  render: (args) => (
    <QRCode {...args}>
      <QRCodeSkeleton />
      <QRCodeCanvas />
    </QRCode>
  ),
}

export const Svg: Story = {
  args: { value: "https://example.com", size: 180 },
  render: (args) => (
    <QRCode {...args}>
      <QRCodeSvg />
    </QRCode>
  ),
}

export const Image: Story = {
  args: { value: "https://example.com", size: 160 },
  render: (args) => (
    <QRCode {...args}>
      <QRCodeImage />
    </QRCode>
  ),
}

export const WithOverlay: Story = {
  args: { value: "https://example.com", size: 220, level: "H" },
  render: (args) => (
    <QRCode {...args}>
      <QRCodeCanvas />
      <QRCodeOverlay className="size-12 border border-border">
        <div className="size-8 rounded-sm bg-primary" />
      </QRCodeOverlay>
    </QRCode>
  ),
}

export const WithDownload: Story = {
  args: { value: "https://example.com" },
  render: (args) => (
    <QRCode {...args}>
      <QRCodeCanvas />
      <div className="flex gap-2">
        <QRCodeDownload asChild>
          <Button size="sm" variant="outline">
            Download PNG
          </Button>
        </QRCodeDownload>
        <QRCodeDownload asChild format="svg">
          <Button size="sm" variant="outline">
            Download SVG
          </Button>
        </QRCodeDownload>
      </div>
    </QRCode>
  ),
}

export const HighErrorCorrection: Story = {
  args: { value: "Important data", level: "H" },
  render: (args) => (
    <QRCode {...args}>
      <QRCodeCanvas />
    </QRCode>
  ),
}
