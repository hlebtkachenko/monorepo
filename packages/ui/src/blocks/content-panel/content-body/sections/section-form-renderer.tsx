"use client"

import { useId } from "react"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import { Input } from "@workspace/ui/components/input"
import { CircleHelp } from "@workspace/ui/lib/icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

import type {
  FormField,
  FormFieldControl,
  FormFieldSpan,
  SectionFormProps,
} from "./section-form"

/**
 * Static span → col-span map, keyed on the SECTION container width (not the
 * viewport) via `@…/section` — the Content Panel can be narrow at any viewport
 * (resizable panels, open inspector). Below `@xl` (36rem container) every field
 * is a full row; at `@xl`+ the field takes its requested span out of the 6-col
 * grid. Tailwind needs literal class names, so the six spans are enumerated.
 */
const SPAN_CLASS: Record<FormFieldSpan, string> = {
  1: "col-span-6 @xl/section:col-span-1",
  2: "col-span-6 @xl/section:col-span-2",
  3: "col-span-6 @xl/section:col-span-3",
  4: "col-span-6 @xl/section:col-span-4",
  5: "col-span-6 @xl/section:col-span-5",
  6: "col-span-6",
}

function FormControl({
  id,
  name,
  control,
}: {
  id: string
  name?: string
  control: FormFieldControl
}) {
  switch (control.kind) {
    case "text":
      return (
        <Input
          id={id}
          name={name}
          defaultValue={control.value}
          placeholder={control.placeholder}
          inputMode={control.inputMode}
          disabled={control.disabled}
        />
      )
    case "select":
      return (
        <Select
          name={name}
          defaultValue={control.value}
          disabled={control.disabled}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={control.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {(control.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    default:
      // Exhaustiveness guard: a new control arm without a render case fails here.
      return control satisfies never
  }
}

/**
 * One grid cell: a labelled control that spans 1–6 columns. The cell stretches
 * to its grid row (`h-full`) and pins the control to the bottom (`mt-auto`), so
 * every control in a row lines up on one baseline even when a neighbour's label
 * wraps to two lines — no floating inputs. A `useId` fallback keeps the label
 * associated with its control when the field carries no explicit `name`.
 */
function FormFieldCell({ field }: { field: FormField }) {
  const generatedId = useId()
  const controlId = field.name ?? generatedId
  // The control sits at the bottom of the (stretched) cell so a row's inputs
  // align even when a neighbour's label wraps.
  const control = (
    <div className="mt-auto">
      <FormControl id={controlId} name={field.name} control={field.control} />
    </div>
  )
  return (
    <Field className={cn("h-full", SPAN_CLASS[field.span ?? 6])}>
      <div className="flex items-center gap-1">
        <FieldLabel htmlFor={controlId}>{field.label}</FieldLabel>
        {field.hover != null ? (
          // A visible "?" affordance next to the label — NOT on the control and
          // NOT an underline. Opens on hover or keyboard focus; content is plain
          // data, never a ReactNode.
          <HoverCard openDelay={150} closeDelay={100}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                aria-label={`About ${field.label}`}
                className="inline-flex rounded-sm text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <CircleHelp className="size-3.5" aria-hidden />
              </button>
            </HoverCardTrigger>
            <HoverCardContent align="start" className="w-56 text-xs">
              {field.hover.title != null ? (
                <p className="mb-1 font-medium text-foreground">
                  {field.hover.title}
                </p>
              ) : null}
              <p className="leading-relaxed text-muted-foreground">
                {field.hover.description}
              </p>
            </HoverCardContent>
          </HoverCard>
        ) : null}
      </div>
      {control}
    </Field>
  )
}

/**
 * SectionForm — a two-column form group: a title + description block, and a
 * 6-column field grid. It is a container-query context (`@container/section`):
 * the two columns stack (title above the fields) until the panel is wide enough
 * (`@3xl`, 48rem) to place them side by side, so a narrow panel never crams the
 * inputs. When side by side the left column is capped (≤18rem) so it never grows
 * wider than the title/description need — the fields take all remaining width;
 * below `@3xl` it shrinks and stacks. Fields declare their own span (1–6) and
 * wrap. Horizontal padding is 3× the panel header's (`px-6` = 24px).
 */
export function SectionFormRenderer({ props }: { props: SectionFormProps }) {
  return (
    <div className="@container/section px-6 py-4">
      <div className="grid grid-cols-1 gap-y-6 @3xl/section:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] @3xl/section:items-start @3xl/section:gap-x-12">
        <div>
          <Heading level={4}>{props.title}</Heading>
          {props.description != null ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {props.description}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-6 gap-x-6 gap-y-6">
          {props.fields.map((field, index) => (
            <FormFieldCell
              key={field.name ?? `${field.label}-${index}`}
              field={field}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
