import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { IconProvider } from "@workspace/ui/icon-packs"

import {
  InspectorDetail,
  InspectorDetailList,
  InspectorLineItem,
  InspectorSection,
  InspectorSheet,
} from "./inspector-sheet"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

const body = (
  <InspectorSection title="Details">
    <InspectorDetailList>
      <InspectorDetail label="Partner">Alza.cz a.s.</InspectorDetail>
    </InspectorDetailList>
  </InspectorSection>
)

describe("InspectorSheet", () => {
  it("does not render its content when closed", () => {
    wrap(
      <InspectorSheet open={false} onOpenChange={() => {}} title="#INV-1">
        {body}
      </InspectorSheet>,
    )
    expect(screen.queryByText("Partner")).not.toBeInTheDocument()
    expect(screen.queryByText("#INV-1")).not.toBeInTheDocument()
  })

  it("renders the title, subtitle, meta grid, body and footer when open", () => {
    wrap(
      <InspectorSheet
        open
        onOpenChange={() => {}}
        title="#INV-1"
        subtitle="Invoice details"
        meta={[
          { label: "Issued", value: "1 Jun 2026" },
          { label: "Status", value: <Badge>Posted</Badge> },
        ]}
        footer={<Button>Approve</Button>}
      >
        {body}
      </InspectorSheet>,
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("#INV-1")).toBeInTheDocument()
    expect(screen.getByText("Invoice details")).toBeInTheDocument()
    expect(screen.getByText("Issued")).toBeInTheDocument()
    expect(screen.getByText("Posted")).toBeInTheDocument()
    expect(screen.getByText("Alza.cz a.s.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument()
  })

  it("fires onCopyTitle from the copy affordance and onOpenChange(false) from close", () => {
    const onCopyTitle = vi.fn()
    const onOpenChange = vi.fn()
    wrap(
      <InspectorSheet
        open
        onOpenChange={onOpenChange}
        title="#INV-1"
        onCopyTitle={onCopyTitle}
      >
        {body}
      </InspectorSheet>,
    )
    fireEvent.click(screen.getByRole("button", { name: /copy/i }))
    expect(onCopyTitle).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("omits the copy affordance when onCopyTitle is absent", () => {
    wrap(
      <InspectorSheet open onOpenChange={() => {}} title="#INV-1">
        {body}
      </InspectorSheet>,
    )
    expect(
      screen.queryByRole("button", { name: /copy/i }),
    ).not.toBeInTheDocument()
  })

  it("renders section count badge and a line item with its amount", () => {
    wrap(
      <InspectorSheet open onOpenChange={() => {}} title="#INV-1">
        <InspectorSection title="Line items" count={2}>
          <InspectorLineItem
            title="Taxable supply"
            quantity={1}
            amount="10 248 Kč"
          />
        </InspectorSection>
      </InspectorSheet>,
    )
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("Taxable supply")).toBeInTheDocument()
    expect(screen.getByText("10 248 Kč")).toBeInTheDocument()
  })
})
