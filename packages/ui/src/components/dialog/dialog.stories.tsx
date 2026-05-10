import type { Meta, StoryObj } from "@storybook/react"
import { expect, userEvent, within } from "storybook/test"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog"

const meta: Meta<typeof Dialog> = {
  title: "Components/Dialog",
  component: Dialog,
}
export default meta
type Story = StoryObj<typeof Dialog>

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger className="rounded-md border px-4 py-2 text-sm">
        Open Dialog
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Action</DialogTitle>
          <DialogDescription>
            This action cannot be undone. Are you sure you want to continue?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
            Confirm
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: /open dialog/i })
    await userEvent.click(trigger)
    const dialog = await within(document.body).findByRole("dialog")
    await expect(dialog).toBeInTheDocument()
    await expect(within(dialog).getByText("Confirm Action")).toBeInTheDocument()
  },
}
