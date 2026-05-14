"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"

export function AccordionDemo() {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">
          Single, collapsible
        </h4>
        <Accordion
          type="single"
          collapsible
          defaultValue="item-1"
          className="w-full"
        >
          <AccordionItem value="item-1">
            <AccordionTrigger>How does billing work?</AccordionTrigger>
            <AccordionContent>
              Billing is monthly and based on your selected plan. Upgrade or
              downgrade at any time.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>Can I cancel anytime?</AccordionTrigger>
            <AccordionContent>
              Yes. Access continues until the end of the billing period.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>Is there a free trial?</AccordionTrigger>
            <AccordionContent>
              A 14-day free trial with full feature access. No card required.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">
          Multiple open
        </h4>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>Overview</AccordionTrigger>
            <AccordionContent>
              High-level summary of the workspace and recent activity.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>Members</AccordionTrigger>
            <AccordionContent>
              Invite teammates and manage their roles per workspace.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>Integrations</AccordionTrigger>
            <AccordionContent>
              Connect external services and configure webhooks.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}
