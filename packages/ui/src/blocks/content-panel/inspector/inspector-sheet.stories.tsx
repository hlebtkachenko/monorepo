import type { Meta, StoryObj } from "@storybook/react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { IconProvider } from "@workspace/ui/icon-packs"
import { FileText, LinkIcon, ListChecksIcon } from "@workspace/ui/lib/icons"

import {
  InspectorDetail,
  InspectorDetailList,
  InspectorDropzone,
  InspectorEvidenceItem,
  InspectorLineItem,
  InspectorSection,
  InspectorSheet,
} from "./inspector-sheet"

const meta = {
  title: "Blocks/Content Panel/Inspector Sheet",
  component: InspectorSheet,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <IconProvider>
        <div className="h-[720px] w-full bg-canvas" />
        <Story />
      </IconProvider>
    ),
  ],
} satisfies Meta<typeof InspectorSheet>

export default meta
type Story = StoryObj<typeof meta>

const meta3 = [
  { label: "Issued", value: "1 Jun 2026" },
  {
    label: "Payment",
    value: (
      <Badge variant="secondary" className="bg-success/10 text-success">
        Paid
      </Badge>
    ),
  },
  {
    label: "Status",
    value: (
      <Badge variant="secondary" className="gap-1.5 bg-info/10 text-info">
        <span className="size-1.5 rounded-full bg-current" />
        Posted
      </Badge>
    ),
  },
]

const body = (
  <>
    <InspectorSection title="Details">
      <InspectorDetailList>
        <InspectorDetail label="Partner">Alza.cz a.s.</InspectorDetail>
        <InspectorDetail label="Kind">Tax document</InspectorDetail>
        <InspectorDetail label="Net">10 248 Kč</InspectorDetail>
        <InspectorDetail label="VAT">2 152 Kč</InspectorDetail>
        <InspectorDetail label="Total">
          <span className="font-semibold">12 400 Kč</span>
        </InspectorDetail>
      </InspectorDetailList>
    </InspectorSection>

    <InspectorSection title="Review">
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Ensure the invoice is complete and evidence is attached before
        submitting it for approval.
      </p>
      <Button variant="outline">Submit for review</Button>
    </InspectorSection>

    <InspectorSection title="Line items" count={2}>
      <InspectorLineItem
        title="Taxable supply"
        subtitle="Alza.cz a.s."
        quantity={1}
        amount="10 248 Kč"
        onEdit={() => {}}
      />
      <InspectorLineItem
        title="VAT 21%"
        subtitle="Tax"
        quantity={1}
        amount="2 152 Kč"
        onEdit={() => {}}
      />
    </InspectorSection>

    <InspectorSection title="Evidence">
      <InspectorEvidenceItem
        icon={<FileText />}
        name="FP-2026-0001.pdf"
        meta={<Badge variant="outline">Source</Badge>}
        onDownload={() => {}}
        onMore={() => {}}
      />
      <div className="my-4 border-t border-dashed border-border" />
      <InspectorDropzone
        hint="Drag and drop, or browse files"
        sizeHint="Up to 20 MB"
        onBrowse={() => {}}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm">
          <LinkIcon />
          Add link
        </Button>
        <Button variant="outline" size="sm">
          <ListChecksIcon />
          Link evidence
        </Button>
      </div>
    </InspectorSection>
  </>
)

const footer = (
  <>
    <Button variant="outline" className="flex-1">
      Reject
    </Button>
    <Button variant="outline" className="flex-1">
      Edit
    </Button>
    <Button className="flex-1">Approve</Button>
  </>
)

export const Default: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    title: "#FP-2026-0001",
    onCopyTitle: () => {},
    subtitle: "Invoice details",
    meta: meta3,
    footer,
    children: body,
  },
}

export const NoFooter: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    title: "#FP-2026-0002",
    subtitle: "Invoice details",
    meta: meta3,
    children: body,
  },
}

export const Minimal: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    title: "#FP-2026-0003",
    children: (
      <InspectorSection title="Details">
        <InspectorDetailList>
          <InspectorDetail label="Partner">O2 Czech Republic</InspectorDetail>
          <InspectorDetail label="Total">3 000 Kč</InspectorDetail>
        </InspectorDetailList>
      </InspectorSection>
    ),
  },
}
