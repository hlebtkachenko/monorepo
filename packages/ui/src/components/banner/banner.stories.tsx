import type { Meta, StoryObj } from "@storybook/react"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Banner,
  BannerActions,
  BannerClose,
  BannerContent,
  BannerDescription,
  BannerIcon,
  BannerTitle,
} from "./banner"

const meta: Meta<typeof Banner> = {
  title: "Components/Banner",
  component: Banner,
}
export default meta
type Story = StoryObj<typeof Banner>

export const Default: Story = {
  render: () => (
    <Banner>
      <BannerIcon>
        <InfoIcon />
      </BannerIcon>
      <BannerContent>
        <BannerTitle>New version available</BannerTitle>
        <BannerDescription>
          Refresh the page to get the latest features.
        </BannerDescription>
      </BannerContent>
      <BannerActions>
        <Button size="sm" variant="outline">
          Refresh
        </Button>
        <BannerClose />
      </BannerActions>
    </Banner>
  ),
}

export const Info: Story = {
  render: () => (
    <Banner variant="info">
      <BannerIcon>
        <InfoIcon />
      </BannerIcon>
      <BannerContent>
        <BannerTitle>Maintenance scheduled</BannerTitle>
        <BannerDescription>
          We will be deploying changes on Sunday at 02:00 UTC.
        </BannerDescription>
      </BannerContent>
      <BannerActions>
        <BannerClose />
      </BannerActions>
    </Banner>
  ),
}

export const Success: Story = {
  render: () => (
    <Banner variant="success">
      <BannerIcon>
        <CheckCircle2Icon />
      </BannerIcon>
      <BannerContent>
        <BannerTitle>Saved successfully</BannerTitle>
        <BannerDescription>Your changes are now live.</BannerDescription>
      </BannerContent>
      <BannerActions>
        <BannerClose />
      </BannerActions>
    </Banner>
  ),
}

export const Warning: Story = {
  render: () => (
    <Banner variant="warning">
      <BannerIcon>
        <TriangleAlertIcon />
      </BannerIcon>
      <BannerContent>
        <BannerTitle>Storage almost full</BannerTitle>
        <BannerDescription>
          You have used 92% of your storage quota.
        </BannerDescription>
      </BannerContent>
      <BannerActions>
        <Button size="sm" variant="outline">
          Upgrade
        </Button>
        <BannerClose />
      </BannerActions>
    </Banner>
  ),
}

export const Destructive: Story = {
  render: () => (
    <Banner variant="destructive">
      <BannerIcon>
        <AlertCircleIcon />
      </BannerIcon>
      <BannerContent>
        <BannerTitle>Payment failed</BannerTitle>
        <BannerDescription>
          We could not charge your saved card. Please update your billing.
        </BannerDescription>
      </BannerContent>
      <BannerActions>
        <Button size="sm" variant="outline">
          Update billing
        </Button>
        <BannerClose />
      </BannerActions>
    </Banner>
  ),
}

export const NonDismissible: Story = {
  render: () => (
    <Banner variant="info" dismissible={false}>
      <BannerIcon>
        <InfoIcon />
      </BannerIcon>
      <BannerContent>
        <BannerTitle>Read-only system</BannerTitle>
        <BannerDescription>This banner cannot be dismissed.</BannerDescription>
      </BannerContent>
    </Banner>
  ),
}
