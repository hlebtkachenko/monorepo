import type { Meta, StoryObj } from "@storybook/react"

import { FileIcon } from "@workspace/ui/lib/icons"
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "./attachment"

const meta: Meta<typeof Attachment> = {
  title: "Components/Attachment",
  component: Attachment,
}
export default meta
type Story = StoryObj<typeof Attachment>

function Demo(props: React.ComponentProps<typeof Attachment>) {
  return (
    <Attachment {...props}>
      <AttachmentMedia>
        <FileIcon />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>invoice.pdf</AttachmentTitle>
        <AttachmentDescription>42 KB</AttachmentDescription>
      </AttachmentContent>
    </Attachment>
  )
}

export const Default: Story = { render: () => <Demo /> }
export const Small: Story = { render: () => <Demo size="sm" /> }
export const ExtraSmall: Story = { render: () => <Demo size="xs" /> }
export const Vertical: Story = { render: () => <Demo orientation="vertical" /> }
export const OrientationHorizontal: Story = {
  render: () => <Demo orientation="horizontal" />,
}
export const OrientationVertical: Story = {
  render: () => <Demo orientation="vertical" />,
}
export const Icon: Story = { render: () => <Demo /> }
export const Image: Story = {
  render: () => (
    <Attachment>
      <AttachmentMedia variant="image">
        <img src="https://picsum.photos/80" alt="Document preview" />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>receipt.jpg</AttachmentTitle>
        <AttachmentDescription>128 KB</AttachmentDescription>
      </AttachmentContent>
    </Attachment>
  ),
}
export const Idle: Story = { render: () => <Demo state="idle" /> }
export const Uploading: Story = { render: () => <Demo state="uploading" /> }
export const Processing: Story = { render: () => <Demo state="processing" /> }
export const Error: Story = { render: () => <Demo state="error" /> }
