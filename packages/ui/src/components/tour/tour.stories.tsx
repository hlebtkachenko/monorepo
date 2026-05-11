import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Tour,
  TourActions,
  TourClose,
  TourDescription,
  TourHeader,
  TourNext,
  TourPortal,
  TourPrev,
  TourProgress,
  TourSpotlight,
  TourSpotlightRing,
  TourStep,
  TourTitle,
  TourTooltip,
} from "./tour"

const meta: Meta<typeof Tour> = {
  title: "Components/Tour",
  component: Tour,
}
export default meta
type Story = StoryObj<typeof Tour>

function Demo({
  withProgress = false,
  sticky,
}: {
  withProgress?: boolean
  sticky?: "partial" | "always"
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-6 p-8">
      <Button onClick={() => setOpen(true)}>Start tour</Button>
      <div className="flex gap-4">
        <div
          id="tour-target-1"
          className="rounded-md border border-border bg-card p-4"
        >
          Step 1 target
        </div>
        <div
          id="tour-target-2"
          className="rounded-md border border-border bg-card p-4"
        >
          Step 2 target
        </div>
        <div
          id="tour-target-3"
          className="rounded-md border border-border bg-card p-4"
        >
          Step 3 target
        </div>
      </div>

      <Tour open={open} onOpenChange={setOpen}>
        <TourPortal>
          <TourSpotlight />
          <TourSpotlightRing />

          <TourStep target="#tour-target-1" {...(sticky ? { sticky } : {})}>
            <TourClose />
            <TourTooltip>
              <TourHeader>
                <TourTitle>Welcome</TourTitle>
                <TourDescription>
                  This is the first step of the tour.
                </TourDescription>
              </TourHeader>
              <TourActions>
                {withProgress ? <TourProgress className="me-auto" /> : null}
                <TourPrev />
                <TourNext />
              </TourActions>
            </TourTooltip>
          </TourStep>

          <TourStep target="#tour-target-2">
            <TourClose />
            <TourTooltip>
              <TourHeader>
                <TourTitle>Second step</TourTitle>
                <TourDescription>
                  Here is a second highlighted area.
                </TourDescription>
              </TourHeader>
              <TourActions>
                {withProgress ? <TourProgress className="me-auto" /> : null}
                <TourPrev />
                <TourNext />
              </TourActions>
            </TourTooltip>
          </TourStep>

          <TourStep target="#tour-target-3">
            <TourClose />
            <TourTooltip>
              <TourHeader>
                <TourTitle>Last step</TourTitle>
                <TourDescription>Finish the tour.</TourDescription>
              </TourHeader>
              <TourActions>
                {withProgress ? <TourProgress className="me-auto" /> : null}
                <TourPrev />
                <TourNext />
              </TourActions>
            </TourTooltip>
          </TourStep>
        </TourPortal>
      </Tour>
    </div>
  )
}

export const Default: Story = {
  render: () => <Demo />,
}

export const MultiStep: Story = {
  render: () => <Demo />,
}

export const WithProgress: Story = {
  render: () => <Demo withProgress />,
}

export const StickyPartial: Story = {
  render: () => <Demo sticky="partial" />,
}

export const StickyAlways: Story = {
  render: () => <Demo sticky="always" />,
}
