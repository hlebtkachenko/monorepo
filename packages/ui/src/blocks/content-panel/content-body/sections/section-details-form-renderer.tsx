"use client"

import { FieldGrid, SectionTwoCol } from "./section-details-parts"
import type { SectionDetailsFormProps } from "./section-details-form"

/**
 * SectionDetailsForm — a two-column form group: a title + description block on
 * the left, a 6-column field grid on the right. The layout shell (`SectionTwoCol`)
 * and the grid (`FieldGrid`) are shared with the Details Tabs and Details Table
 * sections. Fields declare their own span (1–6) and wrap; the grid never
 * constrains which control a field carries. Fields can carry an optional `?`
 * hover explanation.
 */
export function SectionDetailsFormRenderer({
  props,
}: {
  props: SectionDetailsFormProps
}) {
  return (
    <SectionTwoCol title={props.title} description={props.description}>
      <FieldGrid fields={props.fields} />
    </SectionTwoCol>
  )
}
