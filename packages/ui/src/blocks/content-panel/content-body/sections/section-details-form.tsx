import { type SectionDescriptor, defineSection } from "./section"

/** How many of the right grid's 6 columns a field occupies (1–6). */
export type DetailsFormFieldSpan = 1 | 2 | 3 | 4 | 5 | 6

/** One option in a `select` control. */
export interface DetailsFormSelectOption {
  readonly label: string
  readonly value: string
}

/**
 * A field's control, described AS DATA — a closed discriminated union, never a
 * ReactNode or callback smuggled through props. This is the "interactivity as
 * data" seam (Doc-01 §6): the grid does not constrain WHICH controls appear
 * (add an arm here + its render case in the renderer), only that every control
 * is plain, serialisable data the closed renderer dispatches.
 */
export type DetailsFormFieldControl =
  | {
      readonly kind: "text"
      readonly placeholder?: string
      readonly value?: string
      readonly inputMode?: "text" | "numeric"
      readonly disabled?: boolean
    }
  | {
      readonly kind: "select"
      readonly placeholder?: string
      readonly value?: string
      readonly options?: readonly DetailsFormSelectOption[]
      readonly disabled?: boolean
    }

/**
 * Rich hover explanation for a field, shown in a HoverCard over the CONTROL
 * (never the label — the label is not decorated/underlined). Content is data,
 * not a ReactNode: an optional bold lead line + a body paragraph.
 */
export interface DetailsFormFieldHover {
  readonly title?: string
  readonly description: string
}

/** One labelled field placed on the section's 6-column grid. */
export interface DetailsFormField {
  readonly label: string
  /** Grid columns this field occupies (1–6). Defaults to a full row (6). */
  readonly span?: DetailsFormFieldSpan
  readonly control: DetailsFormFieldControl
  /** Optional stable id — becomes the control's `id`/`name`. */
  readonly name?: string
  /** Optional rich hover explanation shown over the control (HoverCard). */
  readonly hover?: DetailsFormFieldHover
}

export interface SectionDetailsFormProps {
  /** Left-column heading for the group. */
  readonly title: string
  /** Left-column supporting copy under the heading. */
  readonly description?: string
  /** Fields laid out on the right, wrapping across the 6-column grid. */
  readonly fields: readonly DetailsFormField[]
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
}

/**
 * The sole constructor for a Details Form-section descriptor. Server-safe (no
 * `"use client"`), so an archetype can mint it on either side of the RSC
 * boundary — but a branded descriptor must be CONSUMED within the same client
 * boundary that mints it (the `Symbol` brand does not survive RSC
 * serialisation). The renderer lives in `./section-details-form-renderer`.
 */
export function sectionDetailsForm({
  anchor,
  ...props
}: SectionDetailsFormProps): SectionDescriptor<
  "details-form",
  SectionDetailsFormProps
> {
  return defineSection("details-form", props, { anchor })
}
