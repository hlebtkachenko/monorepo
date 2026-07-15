"use client"

import * as React from "react"

import { Field, FieldLabel, FieldTitle } from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Button } from "@workspace/ui/components/button"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import { Input } from "@workspace/ui/components/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { PhoneInput } from "@workspace/ui/components/input-phone"
import { ImageCropper } from "@workspace/ui/components/image-cropper"
import { SignaturePad } from "@workspace/ui/components/signature-pad"
import { toast } from "@workspace/ui/components/sonner"
import {
  CircleCheckIcon,
  CircleHelp,
  XCircleIcon,
} from "@workspace/ui/lib/icons"
import {
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import {
  ComboboxItemCreatable,
  CreatableCombobox,
  isCreatableItem,
  type CreatableItem,
} from "@workspace/ui/components/creatable-combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

import type {
  DetailsFormField,
  DetailsFormFieldControl,
  DetailsFormSelectOption,
  DetailsFormFieldSpan,
} from "./section-details-form"
import { useSectionAction } from "./section-action-context"

/**
 * Static span → col-span map, keyed on the SECTION container width (not the
 * viewport) via `@…/section` — the Content Panel can be narrow at any viewport
 * (resizable panels, open inspector). Below `@xl` (36rem container) every field
 * is a full row; at `@xl`+ the field takes its requested span out of the 6-col
 * grid. Tailwind needs literal class names, so the six spans are enumerated.
 */
const SPAN_CLASS: Record<DetailsFormFieldSpan, string> = {
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
  control: DetailsFormFieldControl
}) {
  const dispatch = useSectionAction()

  switch (control.kind) {
    case "text":
      return (
        <Input
          id={id}
          name={name}
          placeholder={control.placeholder}
          inputMode={control.inputMode}
          type={control.type}
          autoComplete={control.autoComplete}
          maxLength={control.maxLength}
          required={control.required}
          disabled={control.disabled}
          {...(control.changeActionId != null
            ? {
                value: control.value ?? "",
                onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                  dispatch({
                    id: control.changeActionId as string,
                    payload: event.target.value,
                  }),
              }
            : { defaultValue: control.value })}
        />
      )
    case "status": {
      const Icon = control.tone === "success" ? CircleCheckIcon : XCircleIcon
      return (
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <Icon
              className={cn(
                "size-4",
                control.tone === "success"
                  ? "text-success"
                  : "text-destructive",
              )}
              aria-hidden
            />
          </InputGroupAddon>
          <InputGroupInput
            id={id}
            name={name}
            value={control.value}
            readOnly
            aria-readonly="true"
          />
        </InputGroup>
      )
    }
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
    case "creatable-combobox": {
      const items =
        control.value &&
        !control.options.some((option) => option.value === control.value)
          ? [{ label: control.value, value: control.value }, ...control.options]
          : [...control.options]
      const selected =
        items.find((option) => option.value === control.value) ?? null
      return (
        <CreatableCombobox
          items={items}
          value={selected}
          disabled={control.disabled}
          onValueChange={(next) => {
            const option = next as DetailsFormSelectOption | null
            dispatch({
              id: control.changeActionId,
              payload: option?.value ?? "",
            })
          }}
          onCreateValue={(value) =>
            dispatch({ id: control.changeActionId, payload: value })
          }
        >
          <ComboboxInput
            id={id}
            name={name}
            className="w-full"
            placeholder={control.placeholder}
            disabled={control.disabled}
          />
          <ComboboxContent>
            <ComboboxList>
              {(item: DetailsFormSelectOption | CreatableItem) =>
                isCreatableItem(item) ? (
                  <ComboboxItemCreatable key="__create__" value={item} />
                ) : (
                  <ComboboxItem key={item.value} value={item}>
                    {item.label}
                  </ComboboxItem>
                )
              }
            </ComboboxList>
          </ComboboxContent>
        </CreatableCombobox>
      )
    }
    case "action":
      return (
        <Button asChild variant={control.variant ?? "outline"}>
          <a id={id} href={control.href}>
            {control.label}
          </a>
        </Button>
      )
    case "phone":
      return (
        <PhoneInput
          id={id}
          name={name}
          defaultValue={control.value}
          defaultCountry={control.defaultCountry ?? "CZ"}
          disabled={control.disabled}
          onValueChange={
            control.changeActionId != null
              ? (value) =>
                  dispatch({
                    id: control.changeActionId as string,
                    payload: value,
                  })
              : undefined
          }
        />
      )
    case "avatar":
      return (
        <Avatar id={id} className="size-16">
          <AvatarImage src={control.src} alt={control.alt} />
          <AvatarFallback>{control.fallback}</AvatarFallback>
        </Avatar>
      )
    case "button":
      return (
        <Button
          id={id}
          type="button"
          variant={control.variant ?? "default"}
          disabled={control.disabled || control.busy}
          onClick={() => dispatch({ id: control.actionId })}
        >
          {control.busy ? (control.busyLabel ?? "Working…") : control.label}
        </Button>
      )
    case "signature":
      return (
        <SignaturePad
          key={JSON.stringify(control.paths)}
          id={id}
          defaultPaths={[...control.paths]}
          disabled={control.disabled}
          onDrawEnd={(details) =>
            dispatch({ id: control.changeActionId, payload: details.paths })
          }
          onClear={() => dispatch({ id: control.changeActionId, payload: [] })}
        />
      )
    case "image-upload":
      return (
        <ImageUploadControl key={control.resetKey} id={id} control={control} />
      )
    default:
      // Exhaustiveness guard: a new control arm without a render case fails here.
      return control satisfies never
  }
}

function ImageUploadControl({
  id,
  control,
}: {
  id: string
  control: Extract<DetailsFormFieldControl, { kind: "image-upload" }>
}) {
  const dispatch = useSectionAction()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [cropFile, setCropFile] = React.useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)

  const clearPreview = React.useCallback(() => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }, [])

  React.useEffect(() => clearPreview, [clearPreview])

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      toast.error("Choose a PNG or JPEG image")
      return
    }
    if (file.size > (control.maxSourceBytes ?? 5 * 1024 * 1024)) {
      toast.error("Image must be 5 MB or smaller")
      return
    }
    setCropFile(file)
  }

  function finishCrop(blob: Blob) {
    clearPreview()
    setPreviewUrl(URL.createObjectURL(blob))
    setCropFile(null)
    dispatch({ id: control.changeActionId, payload: blob })
  }

  const shownUrl = previewUrl ?? control.src
  return (
    <div id={id} className="flex flex-wrap items-center gap-6">
      <Avatar className="size-24">
        <AvatarImage src={shownUrl} alt={control.alt} />
        <AvatarFallback>{control.fallback}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col items-start gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={pickFile}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
        >
          {control.chooseLabel ?? "Choose photo"}
        </Button>
        {shownUrl ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              clearPreview()
              dispatch({ id: control.removeActionId })
            }}
          >
            {control.removeLabel ?? "Remove photo"}
          </Button>
        ) : null}
      </div>
      <ImageCropper
        open={cropFile !== null}
        file={cropFile}
        cropShape="round"
        title="Crop profile photo"
        onCancel={() => setCropFile(null)}
        onRemove={() => setCropFile(null)}
        onCropComplete={finishCrop}
      />
    </div>
  )
}

/**
 * One grid cell: a labelled control that spans 1–6 columns. The cell stretches
 * to its grid row (`h-full`) and pins the control to the bottom (`mt-auto`), so
 * every control in a row lines up on one baseline even when a neighbour's label
 * wraps to two lines — no floating inputs. A `useId` fallback keeps the label
 * associated with its control when the field carries no explicit `name`. An
 * optional `hover` surfaces a visible "?" (never the label) opening a HoverCard.
 */
function FormFieldCell({ field }: { field: DetailsFormField }) {
  const generatedId = React.useId()
  const controlId = field.name ?? generatedId
  const labelTargetsControl =
    ["text", "select", "phone"].includes(field.control.kind) ||
    ["status", "creatable-combobox"].includes(field.control.kind)
  const control = (
    <div className="mt-auto">
      <FormControl id={controlId} name={field.name} control={field.control} />
    </div>
  )
  return (
    <Field
      className={cn(
        "h-full",
        SPAN_CLASS[field.span ?? 6],
        field.startNewRow && "@xl/section:col-start-1",
      )}
    >
      <div className="flex items-center gap-1">
        {labelTargetsControl ? (
          <FieldLabel htmlFor={controlId}>{field.label}</FieldLabel>
        ) : (
          <FieldTitle>{field.label}</FieldTitle>
        )}
        {field.hover != null ? (
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

/** The 6-column field grid shared by the Details Form and Details Tabs sections. */
export function FieldGrid({ fields }: { fields: readonly DetailsFormField[] }) {
  return (
    <div className="grid grid-cols-6 gap-x-6 gap-y-6">
      {fields.map((field, index) => (
        <FormFieldCell
          key={field.name ?? `${field.label}-${index}`}
          field={field}
        />
      ))}
    </div>
  )
}

/**
 * SectionTwoCol — the shared settings-section shell: a title + description block
 * and a content column. A container-query context (`@container/section`): the
 * two columns stack (title above) until the panel is wide enough (`@3xl`, 48rem)
 * to place them side by side; the left column is capped (≤18rem) so the content
 * takes the remaining width. `px-6` (3× the panel header) / `py-8` padding.
 * Shared by every `details-*` content section (Form, Tabs, Table).
 */
export function SectionTwoCol({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="@container/section px-6 py-8">
      <div className="grid grid-cols-1 gap-y-6 @3xl/section:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] @3xl/section:items-start @3xl/section:gap-x-12">
        <div>
          <Heading level={4}>{title}</Heading>
          {description != null ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  )
}
