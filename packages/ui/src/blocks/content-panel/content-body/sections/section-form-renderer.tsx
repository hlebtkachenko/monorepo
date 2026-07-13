"use client"

import { FieldGrid, SectionTwoCol } from "./section-form-parts"
import type { SectionFormProps } from "./section-form"

/**
 * SectionForm — a two-column form group: a title + description block on the
 * left, a 6-column field grid on the right. The layout shell (`SectionTwoCol`)
 * and the grid (`FieldGrid`) are shared with the Tabs section. Fields declare
 * their own span (1–6) and wrap; the grid never constrains which control a field
 * carries. Fields can carry an optional `?` hover explanation.
 */
export function SectionFormRenderer({ props }: { props: SectionFormProps }) {
  return (
    <SectionTwoCol title={props.title} description={props.description}>
      <FieldGrid fields={props.fields} />
    </SectionTwoCol>
  )
}
