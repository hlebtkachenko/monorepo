"use client"

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
} from "@workspace/ui/components/banner"

export function BannerDemo() {
  return (
    <div className="flex flex-col gap-3">
      <Banner variant="info">
        <BannerIcon>
          <InfoIcon />
        </BannerIcon>
        <BannerContent>
          <BannerTitle>New version available</BannerTitle>
          <BannerDescription>Refresh to load the latest.</BannerDescription>
        </BannerContent>
        <BannerActions>
          <Button size="sm" variant="outline">
            Refresh
          </Button>
          <BannerClose />
        </BannerActions>
      </Banner>
      <Banner variant="success">
        <BannerIcon>
          <CheckCircle2Icon />
        </BannerIcon>
        <BannerContent>
          <BannerTitle>Saved successfully</BannerTitle>
        </BannerContent>
        <BannerActions>
          <BannerClose />
        </BannerActions>
      </Banner>
      <Banner variant="warning">
        <BannerIcon>
          <TriangleAlertIcon />
        </BannerIcon>
        <BannerContent>
          <BannerTitle>Storage almost full</BannerTitle>
          <BannerDescription>You have used 92% of quota.</BannerDescription>
        </BannerContent>
        <BannerActions>
          <BannerClose />
        </BannerActions>
      </Banner>
      <Banner variant="destructive">
        <BannerIcon>
          <AlertCircleIcon />
        </BannerIcon>
        <BannerContent>
          <BannerTitle>Payment failed</BannerTitle>
        </BannerContent>
        <BannerActions>
          <BannerClose />
        </BannerActions>
      </Banner>
    </div>
  )
}
