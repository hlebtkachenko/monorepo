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
      readonly type?: "text" | "email"
      readonly autoComplete?: string
      readonly maxLength?: number
      readonly required?: boolean
      readonly disabled?: boolean
      /** Optional action emitted with the next string value. */
      readonly changeActionId?: string
    }
  | {
      /** Read-only status value with a semantic leading icon. */
      readonly kind: "status"
      readonly value: string
      readonly tone: "success" | "destructive"
    }
  | {
      readonly kind: "select"
      readonly placeholder?: string
      readonly value?: string
      readonly options?: readonly DetailsFormSelectOption[]
      readonly disabled?: boolean
    }
  | {
      /** Searchable single-select that can create a new string option. */
      readonly kind: "creatable-combobox"
      readonly placeholder?: string
      readonly value?: string
      readonly options: readonly DetailsFormSelectOption[]
      readonly disabled?: boolean
      readonly changeActionId: string
    }
  | {
      /** A navigation action belonging to this field. */
      readonly kind: "action"
      readonly label: string
      readonly href: string
      readonly variant?: "default" | "outline"
    }
  | {
      /** International phone input with country selection and formatting. */
      readonly kind: "phone"
      readonly value?: string
      readonly defaultCountry?: string
      readonly disabled?: boolean
      /** Optional action emitted with the normalized E.164 value. */
      readonly changeActionId?: string
    }
  | {
      /** Read-only account avatar preview. */
      readonly kind: "avatar"
      readonly src?: string
      readonly alt: string
      readonly fallback: string
    }
  | {
      /** A normal-sized command button dispatched by action id. */
      readonly kind: "button"
      readonly label: string
      readonly actionId: string
      readonly variant?: "default" | "outline" | "destructive"
      readonly disabled?: boolean
      readonly busy?: boolean
      readonly busyLabel?: string
    }
  | {
      /** Drawn signature paths managed by the archetype through an action id. */
      readonly kind: "signature"
      readonly paths: readonly string[]
      readonly changeActionId: string
      readonly disabled?: boolean
    }
  | {
      /** Croppable image picker with plain-data configuration. */
      readonly kind: "image-upload"
      readonly src?: string
      readonly alt: string
      readonly fallback: string
      readonly changeActionId: string
      readonly removeActionId: string
      readonly resetKey?: number
      readonly maxSourceBytes?: number
      readonly chooseLabel?: string
      readonly removeLabel?: string
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
  /** Start this field on a new grid row at the multi-column breakpoint. */
  readonly startNewRow?: boolean
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
