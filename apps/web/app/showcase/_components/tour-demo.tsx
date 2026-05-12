"use client"

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
  TourStep,
  TourTitle,
  TourTooltip,
} from "@workspace/ui/components/tour"

export function TourDemo() {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => setOpen(true)}>Start product tour</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <div
          id="tour-demo-target-1"
          className="rounded-md border border-border bg-card p-4 text-sm"
        >
          Dashboard
        </div>
        <div
          id="tour-demo-target-2"
          className="rounded-md border border-border bg-card p-4 text-sm"
        >
          Invoices
        </div>
        <div
          id="tour-demo-target-3"
          className="rounded-md border border-border bg-card p-4 text-sm"
        >
          Settings
        </div>
      </div>

      <Tour open={open} onOpenChange={setOpen}>
        {open && (
          <div
            aria-hidden
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          />
        )}
        <TourPortal>
          <TourSpotlight />

          <TourStep target="#tour-demo-target-1">
            <TourClose />
            <TourTooltip>
              <TourHeader>
                <TourTitle>Dashboard</TourTitle>
                <TourDescription>
                  Your daily overview lives here. Quick stats and pending tasks.
                </TourDescription>
              </TourHeader>
              <TourActions>
                <TourProgress className="me-auto" />
                <TourPrev />
                <TourNext />
              </TourActions>
            </TourTooltip>
          </TourStep>

          <TourStep target="#tour-demo-target-2">
            <TourClose />
            <TourTooltip>
              <TourHeader>
                <TourTitle>Invoices</TourTitle>
                <TourDescription>
                  Create, send, and track invoices for your clients.
                </TourDescription>
              </TourHeader>
              <TourActions>
                <TourProgress className="me-auto" />
                <TourPrev />
                <TourNext />
              </TourActions>
            </TourTooltip>
          </TourStep>

          <TourStep target="#tour-demo-target-3">
            <TourClose />
            <TourTooltip>
              <TourHeader>
                <TourTitle>Settings</TourTitle>
                <TourDescription>
                  Configure your workspace, team, and integrations here.
                </TourDescription>
              </TourHeader>
              <TourActions>
                <TourProgress className="me-auto" />
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
