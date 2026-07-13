"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { FieldGrid, SectionTwoCol } from "./section-form-parts"
import type { SectionTabsPayload } from "./section-tabs"

/**
 * SectionTabs — the Form section with its right column wrapped in Tabs (default
 * segmented variant). Each tab holds its own field grid; switching is Radix's
 * internal state seeded from `defaultTab`. The left title/description block and
 * the field grid are the same shared parts the Form section uses.
 */
export function SectionTabsRenderer({ props }: { props: SectionTabsPayload }) {
  const defaultValue = props.defaultTab ?? props.tabs[0]?.id
  return (
    <SectionTwoCol title={props.title} description={props.description}>
      <Tabs defaultValue={defaultValue} className="w-full gap-0">
        <TabsList>
          {props.tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {props.tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-6">
            <FieldGrid fields={tab.fields} />
          </TabsContent>
        ))}
      </Tabs>
    </SectionTwoCol>
  )
}
