"use client"

import { useId } from "react"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
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
        <NativeSelect
          id={id}
          name={name}
          className="w-full"
          defaultValue={control.value ?? ""}
          disabled={control.disabled}
        >
          {control.placeholder != null ? (
            <NativeSelectOption value="" disabled hidden>
              {control.placeholder}
            </NativeSelectOption>
          ) : null}
          {(control.options ?? []).map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )
    default:
      // Exhaustiveness guard: a new control arm without a render case fails here.
      return control satisfies never
  }
}

/**
 * One grid cell: a labelled control that spans 1–6 columns. A `useId` fallback
 * guarantees the label associates with its control even when the field carries
 * no explicit `name`.
 */
function FormFieldCell({ field }: { field: FormField }) {
  const generatedId = useId()
  const controlId = field.name ?? generatedId
  return (
    <Field className={cn(SPAN_CLASS[field.span ?? 6])}>
      <FieldLabel htmlFor={controlId}>{field.label}</FieldLabel>
      <FormControl id={controlId} name={field.name} control={field.control} />
    </Field>
  )
}

/**
 * SectionForm — a two-column form group: a title + description block on the
 * left, and a 6-column field grid on the right. Fields declare their own span
 * (1–6) and wrap; the grid never constrains which control a field carries.
 * The reusable Section behind settings-style pages.
 */
export function SectionFormRenderer({ props }: { props: SectionFormProps }) {
  return (
    <div className="grid gap-x-8 gap-y-6 p-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div className="space-y-1.5">
        <h3 className="text-base leading-none font-semibold">{props.title}</h3>
        {props.description != null ? (
          <p className="text-sm leading-normal text-muted-foreground">
            {props.description}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-6 gap-x-4 gap-y-5">
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
