"use client"

import { useId } from "react"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
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
 * Static span → col-span map. Tailwind needs literal class names, so the six
 * spans are enumerated. Below the `sm` breakpoint every field is a full row;
 * at `sm`+ the field takes its requested span out of the 6-column grid.
 */
const SPAN_CLASS: Record<FormFieldSpan, string> = {
  1: "col-span-6 sm:col-span-1",
  2: "col-span-6 sm:col-span-2",
  3: "col-span-6 sm:col-span-3",
  4: "col-span-6 sm:col-span-4",
  5: "col-span-6 sm:col-span-5",
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
  return (
    <Field className={cn("h-full", SPAN_CLASS[field.span ?? 6])}>
      <FieldLabel htmlFor={controlId}>{field.label}</FieldLabel>
      <div className="mt-auto">
        <FormControl id={controlId} name={field.name} control={field.control} />
      </div>
    </Field>
  )
}

/**
 * SectionForm — a two-column form group: a title + description block on the
 * left, and a 6-column field grid on the right. The left title and the right
 * grid's first row share the same top edge; fields declare their own span (1–6)
 * and wrap. The grid never constrains which control a field carries.
 * The reusable Section behind settings-style pages.
 */
export function SectionFormRenderer({ props }: { props: SectionFormProps }) {
  return (
    <div className="grid items-start gap-x-14 gap-y-6 px-11 py-8 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div>
        <h3 className="text-base font-semibold tracking-tight">
          {props.title}
        </h3>
        {props.description != null ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
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
  )
}
