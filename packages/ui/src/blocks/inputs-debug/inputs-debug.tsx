"use client"

/**
 * Input & input-related component debug board.
 *
 * Every entry shows the exact code name (the export you import) and a one-line
 * note on what makes that variant / prop different, next to a live instance you
 * can interact with. Rendered by the admin Debug → Input Fields page
 * (blocked in production builds).
 */

import * as React from "react"
import {
  AtSign,
  Check,
  Copy,
  CreditCard,
  Hash,
  Layers,
  Mail,
  Search,
  Shield,
  Smile,
  Tag,
  Tags,
  Type,
  X,
} from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Label } from "@workspace/ui/components/label"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { PasswordInput } from "@workspace/ui/components/password-input"
import { PasswordChecklist } from "@workspace/ui/components/password-checklist"
import {
  INPUT_OTP_PATTERNS,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp"
import {
  InputTags,
  InputTagsInput,
  InputTagsItem,
  InputTagsLabel,
  InputTagsList,
} from "@workspace/ui/components/input-tags"
import {
  InputSegmented,
  InputSegmentedItem,
} from "@workspace/ui/components/input-segmented"
import { DatePicker } from "@workspace/ui/components/date-picker"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@workspace/ui/components/popover"
import {
  PhoneInput,
  PhoneInputCountry,
  PhoneInputField,
} from "@workspace/ui/components/input-phone"
import {
  Mention,
  MentionContent,
  MentionInput,
  MentionItem,
  MentionLabel,
} from "@workspace/ui/components/mention"
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "@workspace/ui/components/autocomplete"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
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
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import { Switch } from "@workspace/ui/components/switch"
import { Slider } from "@workspace/ui/components/slider"
import { Toggle } from "@workspace/ui/components/toggle"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  ChoiceCard,
  ChoiceCardGrid,
} from "@workspace/ui/components/choice-card"
import { ColorPicker } from "@workspace/ui/components/color-picker"
import { Button } from "@workspace/ui/components/button"
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  FileUploadTrigger,
} from "@workspace/ui/components/file-upload"
import { SignaturePad } from "@workspace/ui/components/signature-pad"
import { ImageCropper } from "@workspace/ui/components/image-cropper"
import {
  KeyValue,
  KeyValueAdd,
  KeyValueError,
  KeyValueItem,
  KeyValueKeyInput,
  KeyValueList,
  KeyValueRemove,
  KeyValueValueInput,
  type KeyValueItemData,
} from "@workspace/ui/components/key-value"
import { EnvEditor } from "@workspace/ui/components/env-editor"
import { ColorSwatch } from "@workspace/ui/components/color-swatch"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  FilterBar,
  createColumnConfigHelper,
  useFilterBar,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"
import { Spinner } from "@workspace/ui/components/spinner"
import { Kbd } from "@workspace/ui/components/kbd"
import { VisuallyHiddenInput } from "./visually-hidden-input"

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

function Section({
  title,
  blurb,
  children,
}: {
  title: string
  blurb?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {blurb ? (
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{blurb}</p>
      ) : null}
      <div className="mt-3 rounded-xl border border-border">{children}</div>
    </section>
  )
}

function Row({
  name,
  desc,
  children,
  className,
}: {
  name: string
  desc: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 last:border-b-0 sm:flex-row sm:items-start sm:gap-6">
      <div className="sm:w-72 sm:shrink-0">
        <code className="text-sm font-medium text-foreground">{name}</code>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {desc}
        </p>
      </div>
      <div
        className={cn("flex flex-1 flex-wrap items-center gap-3", className)}
      >
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Stateful demo wrappers                                              */
/* ------------------------------------------------------------------ */

function TagsDemo({
  editable,
  defaultValue = ["React", "TypeScript", "Tailwind"],
}: {
  editable?: boolean
  defaultValue?: string[]
}) {
  const [tags, setTags] = React.useState(defaultValue)
  return (
    <InputTags
      value={tags}
      onValueChange={setTags}
      editable={editable}
      className="max-w-md"
    >
      <InputTagsLabel className="sr-only">Tags</InputTagsLabel>
      <InputTagsList>
        {tags.map((tag) => (
          <InputTagsItem key={tag} value={tag}>
            {tag}
          </InputTagsItem>
        ))}
        <InputTagsInput placeholder="Add tag..." />
      </InputTagsList>
    </InputTags>
  )
}

/**
 * InputSegmented used as a DD / MM / YYYY date entry. InputSegmented stays a
 * generic joined-input primitive (it has no idea a cell is a day or a year), so
 * the date semantics live here: the three segment values, and a right-click
 * that opens our real `DatePicker` component (anchored on the segments) whose
 * selection fills all three cells.
 */
function SegmentedDateDemo() {
  const [open, setOpen] = React.useState(false)
  const [date, setDate] = React.useState<Date | undefined>(undefined)
  const [dd, setDd] = React.useState("")
  const [mm, setMm] = React.useState("")
  const [yyyy, setYyyy] = React.useState("")

  const onlyDigits = (raw: string) => raw.replace(/\D/g, "")

  const fill = (picked: Date | undefined) => {
    setDate(picked)
    if (!picked) return
    setDd(String(picked.getDate()).padStart(2, "0"))
    setMm(String(picked.getMonth() + 1).padStart(2, "0"))
    setYyyy(String(picked.getFullYear()))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className="inline-flex"
          onContextMenu={(event) => {
            event.preventDefault()
            setOpen(true)
          }}
        >
          <InputSegmented autoAdvance aria-label="Date">
            <InputSegmentedItem
              maxLength={2}
              placeholder="DD"
              inputMode="numeric"
              value={dd}
              onChange={(event) => setDd(onlyDigits(event.target.value))}
              className="w-12 text-center"
            />
            <InputSegmentedItem
              maxLength={2}
              placeholder="MM"
              inputMode="numeric"
              value={mm}
              onChange={(event) => setMm(onlyDigits(event.target.value))}
              className="w-12 text-center"
            />
            <InputSegmentedItem
              maxLength={4}
              placeholder="YYYY"
              inputMode="numeric"
              value={yyyy}
              onChange={(event) => setYyyy(onlyDigits(event.target.value))}
              className="w-16 text-center"
            />
          </InputSegmented>
        </div>
      </PopoverAnchor>
      {/* Frameless: the DatePicker's own Card provides the surface. */}
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-auto border-0 bg-transparent p-0 shadow-none"
      >
        <DatePicker
          orientation="horizontal"
          value={date}
          onValueChange={(picked) => {
            fill(picked)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function PhoneDemo({
  initialValue = "",
  ...props
}: { initialValue?: string } & React.ComponentProps<typeof PhoneInput>) {
  const [value, setValue] = React.useState(initialValue)
  return (
    <div className="max-w-sm">
      <PhoneInput value={value} onValueChange={setValue} {...props}>
        <PhoneInputCountry />
        <PhoneInputField />
      </PhoneInput>
    </div>
  )
}

type Fruit = { label: string; value: string }

function CreatableDemo({ disabled }: { disabled?: boolean }) {
  const [fruits, setFruits] = React.useState<Fruit[]>([
    { label: "Apple", value: "apple" },
    { label: "Banana", value: "banana" },
    { label: "Cherry", value: "cherry" },
  ])
  const [selected, setSelected] = React.useState<Fruit | null>(null)
  return (
    <div className="w-full max-w-sm">
      <CreatableCombobox
        items={fruits}
        value={selected}
        onValueChange={(val) => setSelected(val as Fruit | null)}
        onCreateValue={(value) => {
          const next = {
            label: value,
            value: value.toLowerCase().replace(/\s+/g, "-"),
          }
          setFruits((prev) => [...prev, next])
          setSelected(next)
        }}
      >
        <ComboboxInput placeholder="Search or create..." disabled={disabled} />
        <ComboboxContent>
          <ComboboxList>
            {(item: Fruit | CreatableItem) =>
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
    </div>
  )
}

function ColorDemo() {
  const [color, setColor] = React.useState("#4f46e5")
  return (
    <div className="flex items-center gap-3">
      <ColorPicker color={color} onChange={setColor} />
      <span className="text-xs text-muted-foreground">{color}</span>
    </div>
  )
}

function GenerateDemo() {
  const [pw, setPw] = React.useState("")
  return (
    <PasswordInput
      showGenerate
      value={pw}
      onValueChange={setPw}
      autoComplete="new-password"
      className="max-w-xs"
    />
  )
}

function PasswordChecklistDemo() {
  const [pw, setPw] = React.useState("")
  return (
    <div className="w-full max-w-md space-y-2">
      <PasswordInput
        value={pw}
        onValueChange={setPw}
        showGenerate
        autoComplete="new-password"
        placeholder="Type a password..."
      />
      <PasswordChecklist
        value={pw}
        labels={{
          length: "At least 12 characters",
          number: "One number",
          symbol: "One symbol",
          mixedCase: "Upper + lowercase letters",
        }}
      />
    </div>
  )
}

const FRAMEWORKS = [
  "Next.js",
  "Remix",
  "Astro",
  "Nuxt",
  "SvelteKit",
  "Angular",
  "SolidStart",
]

const FRUITS = ["Apple", "Banana", "Blueberry", "Mango", "Orange", "Peach"]

const USERS = [
  { id: "alice", label: "Alice Johnson" },
  { id: "bob", label: "Bob Smith" },
  { id: "carol", label: "Carol Lee" },
]

/* Native <input type> catalogue. */
const INPUT_TYPES: Array<{ type: string; note: string; placeholder?: string }> =
  [
    { type: "text", note: "plain single-line text", placeholder: "text" },
    { type: "email", note: "email keyboard + email validation" },
    { type: "password", note: "masked characters" },
    { type: "number", note: "numeric + spinner buttons" },
    { type: "search", note: "search semantics + clear affordance" },
    { type: "tel", note: "telephone keypad on mobile" },
    { type: "url", note: "URL keyboard + URL validation" },
    { type: "date", note: "native date picker" },
    { type: "time", note: "native time picker" },
    { type: "datetime-local", note: "date + time picker" },
    { type: "month", note: "month + year picker" },
    { type: "week", note: "ISO week picker" },
    { type: "color", note: "native color swatch picker" },
    { type: "file", note: "file chooser (file:* utility classes)" },
    { type: "range", note: "native slider (prefer <Slider>)" },
  ]

const KV_SAMPLE: KeyValueItemData[] = [
  { id: "1", key: "Subject", value: "Welcome aboard" },
  { id: "2", key: "From", value: "team@example.com" },
]

const ENV_SAMPLE = [
  { key: "DATABASE_URL", value: "postgres://localhost:5432/app" },
  { key: "API_KEY", value: "sk_live_abc123" },
  { key: "NODE_ENV", value: "production" },
]

const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

// Decode base64 to a File without fetch(). Safari/WebKit rejects
// `fetch("data:...")` with "TypeError: Load failed", so build the bytes directly.
function base64ToFile(base64: string, name: string, type: string): File {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], name, { type })
}

function ImageCropperDemo() {
  const [open, setOpen] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const [url, setUrl] = React.useState<string | null>(null)

  function pick() {
    setFile(base64ToFile(SAMPLE_PNG_BASE64, "sample.png", "image/png"))
    setOpen(true)
  }

  return (
    <div className="flex items-center gap-4">
      <Button variant="outline" onClick={pick}>
        Edit avatar
      </Button>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Cropped"
          className="size-12 rounded-full border object-cover"
        />
      ) : null}
      <ImageCropper
        open={open}
        file={file}
        cropShape="round"
        onCancel={() => setOpen(false)}
        onCropComplete={(blob) => {
          setUrl(URL.createObjectURL(blob))
          setOpen(false)
        }}
      />
    </div>
  )
}

type FilterRow = {
  id: string
  name: string
  amount: number
  status: "active" | "inactive" | "pending"
  tags: string[]
}

const FILTER_ROWS: FilterRow[] = [
  {
    id: "1",
    name: "Onboarding flow",
    amount: 1200,
    status: "active",
    tags: ["feature"],
  },
  {
    id: "2",
    name: "Billing migration",
    amount: 8500,
    status: "pending",
    tags: ["bug"],
  },
  {
    id: "3",
    name: "Search rewrite",
    amount: 4200,
    status: "inactive",
    tags: ["feature", "docs"],
  },
]

const filterHelper = createColumnConfigHelper<FilterRow>()
const FILTER_COLUMNS = [
  filterHelper
    .text()
    .id("name")
    .accessor((r) => r.name)
    .displayName("Name")
    .icon(Type)
    .build(),
  filterHelper
    .number()
    .id("amount")
    .accessor((r) => r.amount)
    .displayName("Amount")
    .icon(Hash)
    .min(0)
    .max(10000)
    .build(),
  filterHelper
    .option()
    .id("status")
    .accessor((r) => r.status)
    .displayName("Status")
    .icon(Tag)
    .options([
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "pending", label: "Pending" },
    ])
    .build(),
  filterHelper
    .multiOption()
    .id("tags")
    .accessor((r) => r.tags)
    .displayName("Tags")
    .icon(Tags)
    .options([
      { value: "feature", label: "Feature" },
      { value: "bug", label: "Bug" },
      { value: "docs", label: "Docs" },
    ])
    .build(),
] as const

function FilterBarDemo() {
  const [filters, setFilters] = React.useState<FiltersState>([])
  const { columns, actions, strategy } = useFilterBar({
    strategy: "client" as const,
    data: FILTER_ROWS,
    columnsConfig: FILTER_COLUMNS,
    filters,
    onFiltersChange: setFilters,
  })
  return (
    <div className="w-full space-y-2">
      <FilterBar
        columns={columns}
        filters={filters}
        actions={actions}
        strategy={strategy}
      />
      <p className="text-xs text-muted-foreground">
        Active filters: {filters.length}
      </p>
    </div>
  )
}

function DropdownMenuDemo() {
  const [wrap, setWrap] = React.useState(true)
  const [minimap, setMinimap] = React.useState(false)
  const [density, setDensity] = React.useState("comfortable")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          View options
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52">
        <DropdownMenuLabel>Toggles (checkbox items)</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={wrap} onCheckedChange={setWrap}>
          Word wrap
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={minimap}
          onCheckedChange={setMinimap}
        >
          Minimap
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Density (radio group)</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
          <DropdownMenuRadioItem value="comfortable">
            Comfortable
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function VisuallyHiddenDemo() {
  const [rating, setRating] = React.useState(3)
  const [submitted, setSubmitted] = React.useState<string | null>(null)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        setSubmitted(String(data.get("rating")))
      }}
      className="flex items-center gap-3"
    >
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={cn(
              "size-7 rounded-md border text-sm",
              n <= rating
                ? "border-primary bg-primary/10 text-primary"
                : "border-input text-muted-foreground",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {/* The invisible native input that carries `rating` into the form. */}
      <VisuallyHiddenInput name="rating" value={String(rating)} />
      <Button type="submit" size="sm" variant="outline">
        Submit
      </Button>
      {submitted ? (
        <span className="text-xs text-muted-foreground">
          form got rating={submitted}
        </span>
      ) : null}
    </form>
  )
}

/* ---- Live InputGroup demos worth watching ---- */

const TAKEN_NAMES = ["admin", "root", "test", "hleb"]

function UsernameCheck() {
  const [val, setVal] = React.useState("")
  const [status, setStatus] = React.useState<
    "idle" | "checking" | "ok" | "taken"
  >("idle")

  React.useEffect(() => {
    if (!val.trim()) {
      setStatus("idle")
      return
    }
    setStatus("checking")
    const t = setTimeout(() => {
      setStatus(TAKEN_NAMES.includes(val.trim().toLowerCase()) ? "taken" : "ok")
    }, 700)
    return () => clearTimeout(t)
  }, [val])

  return (
    <InputGroup className="max-w-xs">
      <InputGroupAddon align="inline-start">
        <AtSign />
      </InputGroupAddon>
      <InputGroupInput
        placeholder="try 'admin' or your name"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        autoComplete="off"
      />
      <InputGroupAddon align="inline-end">
        {status === "checking" ? <Spinner /> : null}
        {status === "ok" ? <Check className="size-4 text-emerald-500" /> : null}
        {status === "taken" ? <X className="size-4 text-destructive" /> : null}
      </InputGroupAddon>
    </InputGroup>
  )
}

function CharCounter() {
  const [text, setText] = React.useState("")
  const max = 120
  const over = text.length > max
  return (
    <InputGroup className="max-w-md">
      <InputGroupTextarea
        placeholder="Write a short bio..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={over}
      />
      <InputGroupAddon align="block-end">
        <InputGroupText
          className={cn("ml-auto tabular-nums", over && "text-destructive")}
        >
          {text.length}/{max}
        </InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

function CopyLink() {
  const [copied, setCopied] = React.useState(false)
  const link = "afframe.com/invite/x7k2p9"
  return (
    <InputGroup className="max-w-md">
      <InputGroupAddon align="inline-start" className="pr-0">
        <InputGroupText className="font-normal">https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput readOnly value={link} className="-ml-1" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label="Copy link"
          onClick={() => {
            void navigator.clipboard?.writeText(`https://${link}`)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? <Check className="text-emerald-500" /> : <Copy />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function InputsDebug() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Inputs debug board
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Every input and input-related component from <code>packages/ui</code>.
          Left column = the export name you import; right = a live instance.
          Import path is always{" "}
          <code>@workspace/ui/components/&lt;name&gt;</code>.
        </p>
      </header>

      {/* ---------------- Input ---------------- */}
      <Section
        title="Input"
        blurb="Base text field. One CVA variant: inputSize (default | xl). The native size attribute is left free — the design-system prop is inputSize on purpose. type is the standard HTML attribute."
      >
        <Row name="<Input>" desc="default — inputSize='default', h-9, text-sm">
          <Input placeholder="Placeholder" className="max-w-xs" />
        </Row>
        <Row
          name="inputSize='xl'"
          desc="taller field, h-11 — used on marketing / auth hero forms"
        >
          <Input
            inputSize="xl"
            placeholder="Extra large"
            className="max-w-xs"
          />
        </Row>
        <Row name="value" desc="filled state">
          <Input defaultValue="Filled value" className="max-w-xs" />
        </Row>
        <Row name="disabled" desc="not focusable, dimmed, cursor-not-allowed">
          <Input disabled placeholder="Disabled" className="max-w-xs" />
        </Row>
        <Row name="readOnly" desc="selectable but not editable">
          <Input readOnly defaultValue="Read only" className="max-w-xs" />
        </Row>
        <Row name="aria-invalid" desc="error ring — destructive border + ring">
          <Input aria-invalid placeholder="Invalid" className="max-w-xs" />
        </Row>
        <Row
          name="type='...'"
          desc="native HTML input types — same component, different keyboard / picker / validation"
          className="items-stretch"
        >
          <div className="grid w-full grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {INPUT_TYPES.map(({ type, note, placeholder }) => (
              <label key={type} className="flex flex-col gap-1">
                <span className="text-xs font-medium">
                  type=&quot;{type}&quot;{" "}
                  <span className="font-normal text-muted-foreground">
                    — {note}
                  </span>
                </span>
                <Input type={type} placeholder={placeholder ?? type} />
              </label>
            ))}
          </div>
        </Row>
      </Section>

      {/* ---------------- Textarea ---------------- */}
      <Section
        title="Textarea"
        blurb="Multi-line text. No CVA variants; auto-grows via field-sizing-content. States mirror Input (disabled / aria-invalid)."
      >
        <Row name="<Textarea>" desc="default — min-h-16, auto-sizing">
          <Textarea placeholder="Write something..." className="max-w-md" />
        </Row>
        <Row name="disabled" desc="dimmed, not editable">
          <Textarea disabled placeholder="Disabled" className="max-w-md" />
        </Row>
        <Row name="aria-invalid" desc="error ring">
          <Textarea aria-invalid placeholder="Invalid" className="max-w-md" />
        </Row>
      </Section>

      {/* ---------------- Label ---------------- */}
      <Section
        title="Label"
        blurb="Radix label primitive. Dims automatically when its peer/group control is disabled."
      >
        <Row name="<Label>" desc="bound to a control via htmlFor">
          <div className="grid w-full max-w-xs gap-1.5">
            <Label htmlFor="lbl-demo">Email address</Label>
            <Input id="lbl-demo" type="email" placeholder="you@example.com" />
          </div>
        </Row>
      </Section>

      {/* ---------------- Field ---------------- */}
      <Section
        title="Field"
        blurb="Form-row wrapper family: label + description + error + separators. Field has one CVA variant: orientation (vertical | horizontal | responsive)."
      >
        <Row
          name="<Field orientation='vertical'>"
          desc="default — label stacked above control"
        >
          <Field className="max-w-sm">
            <FieldLabel htmlFor="f-v">Full name</FieldLabel>
            <Input id="f-v" placeholder="Jane Doe" />
            <FieldDescription>As it appears on invoices.</FieldDescription>
          </Field>
        </Row>
        <Row
          name="orientation='horizontal'"
          desc="label + control on one row (used for switches / checkboxes)"
        >
          <Field orientation="horizontal" className="max-w-sm">
            <Switch id="f-h" />
            <FieldContent>
              <FieldLabel htmlFor="f-h">Email notifications</FieldLabel>
              <FieldDescription>Send me product updates.</FieldDescription>
            </FieldContent>
          </Field>
        </Row>
        <Row
          name="orientation='responsive'"
          desc="stacks on narrow, goes horizontal at @md container width"
        >
          <FieldGroup className="max-w-sm">
            <Field orientation="responsive">
              <FieldLabel htmlFor="f-r">Company</FieldLabel>
              <Input id="f-r" placeholder="Afframe s.r.o." />
            </Field>
          </FieldGroup>
        </Row>
        <Row
          name="<FieldError>"
          desc="destructive message; accepts children or an errors[] array"
        >
          <Field data-invalid className="max-w-sm">
            <FieldLabel htmlFor="f-e">Password</FieldLabel>
            <Input id="f-e" aria-invalid type="password" />
            <FieldError>Password is too short.</FieldError>
          </Field>
        </Row>
        <Row
          name="<FieldSet> + <FieldLegend>"
          desc="grouped fieldset with legend heading (legend | label variant)"
        >
          <FieldSet className="max-w-sm">
            <FieldLegend variant="label">Address</FieldLegend>
            <Input placeholder="Street" />
            <Input placeholder="City" />
          </FieldSet>
        </Row>
        <Row
          name="<FieldSeparator>"
          desc="hairline divider between field groups, optional centered label"
        >
          <div className="w-full max-w-sm">
            <FieldSeparator>or</FieldSeparator>
          </div>
        </Row>
        <Row
          name="<FieldTitle>"
          desc="non-label bold title inside a FieldContent (no htmlFor)"
        >
          <Field orientation="horizontal" className="max-w-sm">
            <Checkbox id="f-t" defaultChecked />
            <FieldContent>
              <FieldTitle>Enable feature</FieldTitle>
              <FieldDescription>A plain title, not a Label.</FieldDescription>
            </FieldContent>
          </Field>
        </Row>
      </Section>

      {/* ---------------- InputGroup ---------------- */}
      <Section
        title="InputGroup"
        blurb="Wraps an input/textarea with addons (icon, text, button) on any edge. Addon align: inline-start | inline-end | block-start | block-end. Button size: xs | sm | icon-xs | icon-sm."
      >
        <Row
          name="InputGroupAddon align='inline-start'"
          desc="leading icon inside the border"
        >
          <InputGroup className="max-w-xs">
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search..." />
          </InputGroup>
        </Row>
        <Row
          name="align='inline-end' + InputGroupText"
          desc="trailing static text (unit / suffix)"
        >
          <InputGroup className="max-w-xs">
            <InputGroupInput placeholder="0.00" />
            <InputGroupAddon align="inline-end">
              <InputGroupText>CZK</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </Row>
        <Row
          name="InputGroupButton size='icon-xs'"
          desc="clickable icon button addon"
        >
          <InputGroup className="max-w-xs">
            <InputGroupAddon align="inline-start">
              <Mail />
            </InputGroupAddon>
            <InputGroupInput placeholder="you@example.com" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Send">
                <Search />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Row>
        <Row
          name="align='block-end' + InputGroupTextarea"
          desc="footer addon row under a textarea (toolbar pattern)"
        >
          <InputGroup className="max-w-md">
            <InputGroupTextarea placeholder="Comment..." />
            <InputGroupAddon align="block-end">
              <InputGroupText>Markdown supported</InputGroupText>
              <InputGroupButton size="xs" className="ml-auto">
                Send
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Row>

        {/* Live combos — same primitives, wired to state. */}
        <Row
          name="async availability check"
          desc="debounced check: spinner while 'checking', then ✓ free / ✗ taken. Try 'admin', 'hleb', or a new name."
        >
          <UsernameCheck />
        </Row>
        <Row
          name="live character counter"
          desc="block-end counter tracks length and turns destructive (with error ring) past the limit. Type past 120."
        >
          <CharCounter />
        </Row>
        <Row
          name="copy-to-clipboard"
          desc="https:// prefix + a copy button that flips to a green check for ~1.2s on click"
        >
          <CopyLink />
        </Row>
        <Row
          name="⌘K hint (fades on focus)"
          desc="kbd shortcut hint in an inline-end addon; it fades out while the field is focused via group-focus-within"
        >
          <InputGroup className="max-w-xs">
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search (⌘K)..." />
            <InputGroupAddon align="inline-end">
              <Kbd className="transition-opacity group-focus-within/input-group:opacity-0">
                ⌘K
              </Kbd>
            </InputGroupAddon>
          </InputGroup>
        </Row>
        <Row
          name="both ends + block-start toolbar"
          desc="a leading icon, a block-start toolbar row, and a trailing button — multiple addons on one group"
        >
          <InputGroup className="max-w-md">
            <InputGroupAddon align="block-start">
              <InputGroupText>To:</InputGroupText>
              <InputGroupButton size="xs">Everyone</InputGroupButton>
              <InputGroupButton size="xs">Team</InputGroupButton>
            </InputGroupAddon>
            <InputGroupAddon align="inline-start">
              <Mail />
            </InputGroupAddon>
            <InputGroupInput placeholder="recipient@example.com" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="xs">Add</InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Row>
      </Section>

      {/* ---------------- NativeSelect ---------------- */}
      <Section
        title="NativeSelect"
        blurb="Real <select> styled to match (keeps the native OS picker). Single size (h-9). Options via NativeSelectOption / NativeSelectOptGroup."
      >
        <Row
          name="<NativeSelect>"
          desc="standard height h-9; the dropdown menu is the OS-native one"
        >
          <NativeSelect defaultValue="cz">
            <NativeSelectOption value="cz">Czechia</NativeSelectOption>
            <NativeSelectOption value="sk">Slovakia</NativeSelectOption>
            <NativeSelectOption value="pl">Poland</NativeSelectOption>
          </NativeSelect>
        </Row>
        <Row name="<NativeSelectOptGroup>" desc="grouped options">
          <NativeSelect defaultValue="apple">
            <NativeSelectOptGroup label="Fruit">
              <NativeSelectOption value="apple">Apple</NativeSelectOption>
              <NativeSelectOption value="pear">Pear</NativeSelectOption>
            </NativeSelectOptGroup>
            <NativeSelectOptGroup label="Veg">
              <NativeSelectOption value="carrot">Carrot</NativeSelectOption>
            </NativeSelectOptGroup>
          </NativeSelect>
        </Row>
        <Row name="disabled" desc="dimmed">
          <NativeSelect disabled defaultValue="x">
            <NativeSelectOption value="x">Disabled</NativeSelectOption>
          </NativeSelect>
        </Row>
      </Section>

      {/* ---------------- Select (Radix) ---------------- */}
      <Section
        title="Select"
        blurb="Radix custom-rendered dropdown (styled popup, not native). SelectTrigger size: sm | default. Compose SelectGroup / SelectLabel / SelectItem."
      >
        <Row name="<Select> size='default'" desc="styled popup select">
          <Select>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Pick a fruit" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                <SelectLabel>Fruit</SelectLabel>
                {FRUITS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Row>
        <Row
          name="SelectTrigger size='sm'"
          desc="compact trigger h-8 (shadcn original)"
        >
          <Select>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="Small" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="a">Option A</SelectItem>
              <SelectItem value="b">Option B</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>

      {/* ---------------- PasswordInput ---------------- */}
      <Section
        title="PasswordInput"
        blurb="Input built on InputGroup with a show/hide toggle. showGenerate adds a crypto-random password generator. inputSize: default | xl. Controlled value via value + onValueChange."
      >
        <Row
          name="<PasswordInput>"
          desc="default — masked with show/hide eye toggle"
        >
          <PasswordInput
            defaultValue="hunter2hunter2"
            className="max-w-xs"
            autoComplete="current-password"
          />
        </Row>
        <Row
          name="showGenerate"
          desc="adds a Sparkles button that fills a strong password"
        >
          <GenerateDemo />
        </Row>
        <Row name="inputSize='xl'" desc="taller variant (h-11)">
          <PasswordInput inputSize="xl" className="max-w-xs" />
        </Row>
        <Row name="disabled" desc="dimmed, toggle disabled">
          <PasswordInput disabled defaultValue="secret" className="max-w-xs" />
        </Row>
      </Section>

      {/* ---------------- PasswordChecklist ---------------- */}
      <Section
        title="PasswordChecklist"
        blurb="Live rule checklist driven by evaluatePassword(). Pass value + a labels map keyed by rule (length / lowercase / uppercase / number / symbol). Type below to watch rules flip."
      >
        <Row
          name="<PasswordChecklist>"
          desc="reacts to the password value in real time"
        >
          <PasswordChecklistDemo />
        </Row>
      </Section>

      {/* ---------------- InputOTP ---------------- */}
      <Section
        title="InputOTP"
        blurb="Segmented one-time-code field. InputOTPGroup size: default (separate boxes, the auth style, matched to the input line) | xl (big boxes that fill width) | connected (old joined look). Constrain characters with pattern={INPUT_OTP_PATTERNS.numeric | alphabetic | alphanumeric}."
      >
        <Row
          name="<InputOTP> default 6-digit"
          desc="six separate rounded boxes (size-9/36px, rounded-lg — same size + radius token as the input line), no separator, numeric — the auth style"
        >
          <InputOTP
            maxLength={6}
            pattern={INPUT_OTP_PATTERNS.numeric}
            inputMode="numeric"
          >
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </Row>
        <Row
          name="size='xl'"
          desc="big boxes (h-14) that fill the container — needs containerClassName='w-full' + a width parent (exactly what auth does)"
        >
          <div className="w-full max-w-sm">
            <InputOTP
              maxLength={6}
              pattern={INPUT_OTP_PATTERNS.numeric}
              inputMode="numeric"
              containerClassName="w-full"
            >
              <InputOTPGroup size="xl">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        </Row>
        <Row
          name="size='connected' (alternate view)"
          desc="the old joined look — all six slots share borders as one bar, no separator"
        >
          <InputOTP maxLength={6} pattern={INPUT_OTP_PATTERNS.numeric}>
            <InputOTPGroup size="connected">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </Row>
        <Row
          name="pattern=alphanumeric"
          desc="default separate boxes, accepts letters + digits"
        >
          <InputOTP maxLength={5} pattern={INPUT_OTP_PATTERNS.alphanumeric}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </Row>
      </Section>

      {/* ---------------- InputTags ---------------- */}
      <Section
        title="InputTags"
        blurb="Chip/tag input (@diceui). Value is a string[] via value + onValueChange. editable makes existing chips click-to-edit in place. Each chip has a built-in delete X."
      >
        <Row
          name="<InputTags>"
          desc="add with Enter, remove with the chip X or Backspace"
        >
          <TagsDemo />
        </Row>
        <Row name="editable" desc="click a chip to rename it in place">
          <TagsDemo editable defaultValue={["design", "backend"]} />
        </Row>
        <Row name="empty" desc="starts with no chips">
          <TagsDemo defaultValue={[]} />
        </Row>
      </Section>

      {/* ---------------- InputSegmented ---------------- */}
      <Section
        title="InputSegmented"
        blurb="Multi-cell input (date / time / code) with per-cell focus. Single size only — each cell is a real Input, so it inherits the h-9 / rounded-lg design of the input line (same rule as InputOTP connected). orientation: horizontal | vertical. autoAdvance jumps to the next cell when full; invalid paints the error ring."
      >
        <Row
          name="<InputSegmented autoAdvance>"
          desc="DD / MM / YYYY — auto-advances between cells. Right-click for a date picker (presets + calendar) that fills all three cells."
        >
          <SegmentedDateDemo />
        </Row>
        <Row
          name="orientation='vertical'"
          desc="cells stacked, borders merge vertically"
        >
          <InputSegmented orientation="vertical" aria-label="vertical">
            <InputSegmentedItem maxLength={2} className="w-14 text-center" />
            <InputSegmentedItem maxLength={2} className="w-14 text-center" />
            <InputSegmentedItem maxLength={2} className="w-14 text-center" />
          </InputSegmented>
        </Row>
        <Row name="invalid" desc="error ring across all cells">
          <InputSegmented invalid aria-label="invalid">
            <InputSegmentedItem maxLength={2} className="w-12 text-center" />
            <InputSegmentedItem maxLength={2} className="w-12 text-center" />
          </InputSegmented>
        </Row>
      </Section>

      {/* ---------------- DatePicker ---------------- */}
      <Section
        title="DatePicker"
        blurb="The shadcn 'Calendar with presets' picker as one component: a Card + Calendar with controlled month (presets navigate) and fixedWeeks. Our rounded-lg surface radius, 2px cell gap. Replaces the Button+Popover+Calendar composition that was copy-pasted per usage."
      >
        <Row
          name="<DatePicker> (vertical)"
          desc="default — presets stacked below the calendar"
        >
          <DatePicker />
        </Row>
        <Row
          name='orientation="horizontal"'
          desc="presets column to the left of the calendar"
        >
          <DatePicker orientation="horizontal" />
        </Row>
        <Row name="presets={[]}" desc="presets hidden, calendar only">
          <DatePicker presets={[]} />
        </Row>
      </Section>

      {/* ---------------- InputPhone ---------------- */}
      <Section
        title="InputPhone (PhoneInput)"
        blurb="International phone field with a country selector + flag. Compose PhoneInputCountry + PhoneInputField. Pick a country to rewrite the dial code (keeps the local part); typing an international number auto-detects the flag. value/onValueChange is the E.164 string."
      >
        <Row
          name="<PhoneInput> controlled"
          desc="country popover + tel formatting; live value below"
        >
          <PhoneDemo initialValue="+420777123456" />
        </Row>
        <Row
          name="defaultCountry"
          desc="empty field, flag seeded from the country"
        >
          <PhoneDemo defaultCountry="DE" />
        </Row>
        <Row name="disabled" desc="whole group dimmed">
          <PhoneDemo initialValue="+491511234567" disabled />
        </Row>
        <Row name="readOnly" desc="value shown, not editable">
          <PhoneDemo initialValue="+441632960961" readOnly />
        </Row>
        <Row name="invalid" desc="error ring">
          <PhoneDemo initialValue="+33612345678" invalid />
        </Row>
      </Section>

      {/* ---------------- Mention ---------------- */}
      <Section
        title="Mention"
        blurb="Text input with @-triggered autocomplete. Type @ to open the suggestion list. Compose MentionInput + MentionContent + MentionItem (+ optional MentionLabel heading)."
      >
        <Row name="<Mention>" desc="type @ to pick a user">
          <div className="w-full max-w-md">
            <Mention>
              <MentionInput placeholder="Type @ to mention..." />
              <MentionContent>
                <MentionLabel>Team</MentionLabel>
                {USERS.map((u) => (
                  <MentionItem key={u.id} value={u.label}>
                    {u.label}
                  </MentionItem>
                ))}
              </MentionContent>
            </Mention>
          </div>
        </Row>
      </Section>

      {/* ---------------- Autocomplete ---------------- */}
      <Section
        title="Autocomplete"
        blurb="Free-text input with a filtered suggestion popup. items feeds the list; render each with a function child. AutocompleteInput flags: showClear (X) and showTrigger (dropdown caret). mode='list' + openOnInputClick shown here."
      >
        <Row
          name="<Autocomplete> showClear"
          desc="filter-as-you-type, clear button"
        >
          <div className="w-full max-w-sm">
            <Autocomplete items={FRAMEWORKS} mode="list" openOnInputClick>
              <AutocompleteInput placeholder="Search frameworks..." showClear />
              <AutocompletePopup>
                <AutocompleteList>
                  {(fw: string) => (
                    <AutocompleteItem key={fw} value={fw}>
                      {fw}
                    </AutocompleteItem>
                  )}
                </AutocompleteList>
                <AutocompleteEmpty>No frameworks found.</AutocompleteEmpty>
              </AutocompletePopup>
            </Autocomplete>
          </div>
        </Row>
        <Row
          name="showTrigger"
          desc="adds a caret button to open the full list"
        >
          <div className="w-full max-w-sm">
            <Autocomplete items={FRAMEWORKS} mode="list" openOnInputClick>
              <AutocompleteInput
                placeholder="Pick a framework..."
                showTrigger
              />
              <AutocompletePopup>
                <AutocompleteList>
                  {(fw: string) => (
                    <AutocompleteItem key={fw} value={fw}>
                      {fw}
                    </AutocompleteItem>
                  )}
                </AutocompleteList>
                <AutocompleteEmpty>No frameworks found.</AutocompleteEmpty>
              </AutocompletePopup>
            </Autocomplete>
          </div>
        </Row>
        <Row name="disabled" desc="field dimmed, not interactive">
          <div className="w-full max-w-sm">
            <Autocomplete items={FRAMEWORKS} mode="list" disabled>
              <AutocompleteInput
                placeholder="Search frameworks..."
                showTrigger
              />
              <AutocompletePopup>
                <AutocompleteList>
                  {(fw: string) => (
                    <AutocompleteItem key={fw} value={fw}>
                      {fw}
                    </AutocompleteItem>
                  )}
                </AutocompleteList>
                <AutocompleteEmpty>No frameworks found.</AutocompleteEmpty>
              </AutocompletePopup>
            </Autocomplete>
          </div>
        </Row>
      </Section>

      {/* ---------------- Combobox ---------------- */}
      <Section
        title="Combobox"
        blurb="Select-with-search. Unlike Autocomplete the value must be one of the items. Pass items to Combobox for filtering and render each via a function child in ComboboxList (ComboboxEmpty is a sibling of the list)."
      >
        <Row name="<Combobox>" desc="type to filter, pick a fruit">
          <div className="w-full max-w-sm">
            <Combobox items={FRUITS}>
              <ComboboxInput placeholder="Search fruit..." />
              <ComboboxContent>
                <ComboboxEmpty>No fruit found.</ComboboxEmpty>
                <ComboboxList>
                  {(f: string) => (
                    <ComboboxItem key={f} value={f}>
                      {f}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        </Row>
        <Row name="disabled" desc="input disabled">
          <div className="w-full max-w-sm">
            <Combobox items={FRUITS}>
              <ComboboxInput disabled placeholder="Disabled" />
              <ComboboxContent>
                <ComboboxEmpty>No fruit found.</ComboboxEmpty>
                <ComboboxList>
                  {(f: string) => (
                    <ComboboxItem key={f} value={f}>
                      {f}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        </Row>
      </Section>

      {/* ---------------- CreatableCombobox ---------------- */}
      <Section
        title="CreatableCombobox"
        blurb="Combobox that can create a new item from the typed text. items are {label,value}; onCreateValue fires when you accept the '+ Create' row. Uses ComboboxItemCreatable + isCreatableItem() to branch the render."
      >
        <Row name="<CreatableCombobox>" desc="type a new fruit and create it">
          <CreatableDemo />
        </Row>
        <Row name="disabled" desc="input disabled">
          <CreatableDemo disabled />
        </Row>
      </Section>

      {/* ---------------- Checkbox ---------------- */}
      <Section
        title="Checkbox"
        blurb="Radix checkbox. States via checked / defaultChecked (true | false | 'indeterminate'). No size variants."
      >
        <Row name="<Checkbox>" desc="unchecked default">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox /> Unchecked
          </label>
        </Row>
        <Row name="defaultChecked" desc="checked">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox defaultChecked /> Checked
          </label>
        </Row>
        <Row name="checked='indeterminate'" desc="mixed / partial state">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked="indeterminate" /> Indeterminate
          </label>
        </Row>
        <Row name="disabled" desc="dimmed, not clickable">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox disabled /> Disabled
          </label>
        </Row>
        <Row name="aria-invalid" desc="error border">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox aria-invalid /> Invalid
          </label>
        </Row>
      </Section>

      {/* ---------------- RadioGroup ---------------- */}
      <Section
        title="RadioGroup"
        blurb="Single-choice group. RadioGroup holds value/defaultValue; each RadioGroupItem has a value. Pair items with a Label."
      >
        <Row name="<RadioGroup>" desc="pick exactly one">
          <RadioGroup defaultValue="standard" className="gap-2">
            {["standard", "express", "pickup"].map((v) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={v} /> {v}
              </label>
            ))}
          </RadioGroup>
        </Row>
        <Row name="disabled item" desc="one option disabled">
          <RadioGroup defaultValue="a" className="gap-2">
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="a" /> Enabled
            </label>
            <label className="flex items-center gap-2 text-sm opacity-70">
              <RadioGroupItem value="b" disabled /> Disabled
            </label>
          </RadioGroup>
        </Row>
      </Section>

      {/* ---------------- Switch ---------------- */}
      <Section
        title="Switch"
        blurb="On/off toggle. checked / defaultChecked, disabled. No size variants."
      >
        <Row name="<Switch>" desc="off (default)">
          <Switch />
        </Row>
        <Row name="defaultChecked" desc="on">
          <Switch defaultChecked />
        </Row>
        <Row name="disabled" desc="dimmed">
          <Switch disabled />
        </Row>
        <Row name="disabled + checked" desc="on and locked">
          <Switch disabled defaultChecked />
        </Row>
      </Section>

      {/* ---------------- Slider ---------------- */}
      <Section
        title="Slider"
        blurb="Range slider (Radix). defaultValue is number[] — pass two values for a range. min / max / step, and orientation='vertical'."
      >
        <Row name="<Slider>" desc="single thumb, 0–100">
          <Slider defaultValue={[40]} className="w-64" />
        </Row>
        <Row name="range (two thumbs)" desc="defaultValue with two values">
          <Slider defaultValue={[25, 75]} className="w-64" />
        </Row>
        <Row name="step={10}" desc="snaps to 10s">
          <Slider defaultValue={[50]} step={10} className="w-64" />
        </Row>
        <Row name="disabled" desc="dimmed, not draggable">
          <Slider defaultValue={[30]} disabled className="w-64" />
        </Row>
        <Row name="orientation='vertical'" desc="vertical track (min-h-40)">
          <Slider defaultValue={[60]} orientation="vertical" className="h-40" />
        </Row>
      </Section>

      {/* ---------------- Toggle ---------------- */}
      <Section
        title="Toggle"
        blurb="Single pressable button. variant: default | outline. size: sm | default (h-9, matches input). State via pressed / defaultPressed."
      >
        <Row
          name="<Toggle> variant='default'"
          desc="borderless, muted when pressed"
        >
          <Toggle aria-label="Bold">B</Toggle>
        </Row>
        <Row name="variant='outline'" desc="bordered">
          <Toggle variant="outline" aria-label="Italic">
            I
          </Toggle>
        </Row>
        <Row name="size sm / default" desc="two heights (default = h-9)">
          <div className="flex items-center gap-2">
            <Toggle size="sm" variant="outline">
              sm
            </Toggle>
            <Toggle size="default" variant="outline">
              default
            </Toggle>
          </div>
        </Row>
        <Row name="defaultPressed" desc="starts pressed">
          <Toggle defaultPressed variant="outline">
            On
          </Toggle>
        </Row>
        <Row name="disabled" desc="dimmed">
          <Toggle disabled variant="outline">
            Off
          </Toggle>
        </Row>
      </Section>

      {/* ---------------- ToggleGroup ---------------- */}
      <Section
        title="ToggleGroup"
        blurb="Set of toggles. type='single' picks one, type='multiple' allows many. variant + size cascade from the group to items."
      >
        <Row
          name="type='single'"
          desc="one active at a time (segmented control)"
        >
          <ToggleGroup type="single" defaultValue="center" variant="outline">
            <ToggleGroupItem value="left">Left</ToggleGroupItem>
            <ToggleGroupItem value="center">Center</ToggleGroupItem>
            <ToggleGroupItem value="right">Right</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row name="type='multiple'" desc="any number active">
          <ToggleGroup type="multiple" defaultValue={["b"]} variant="outline">
            <ToggleGroupItem value="b">B</ToggleGroupItem>
            <ToggleGroupItem value="i">I</ToggleGroupItem>
            <ToggleGroupItem value="u">U</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row name="size='sm'" desc="compact group">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            defaultValue="1"
          >
            <ToggleGroupItem value="1">1</ToggleGroupItem>
            <ToggleGroupItem value="2">2</ToggleGroupItem>
            <ToggleGroupItem value="3">3</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Section>

      {/* ---------------- ChoiceCard ---------------- */}
      <Section
        title="ChoiceCard"
        blurb="Large radio card with title / description / icon. Must live inside a RadioGroup (it is a styled RadioGroupItem). ChoiceCardGrid lays them out (columns: 1 | 2)."
      >
        <Row
          name="<ChoiceCard> in <ChoiceCardGrid>"
          desc="click a card to select; checked card highlights"
        >
          <RadioGroup defaultValue="new" className="w-full">
            <ChoiceCardGrid columns={2}>
              <ChoiceCard
                value="new"
                title="New to accounting"
                description="Plain-language guidance"
                icon={<Smile />}
              />
              <ChoiceCard
                value="pro"
                title="Accountant"
                description="Full control, terse UI"
                icon={<Shield />}
              />
              <ChoiceCard
                value="team"
                title="Team"
                description="Shared workspace"
                icon={<Layers />}
              />
              <ChoiceCard
                value="dis"
                title="Disabled"
                description="Cannot pick this"
                icon={<CreditCard />}
                disabled
              />
            </ChoiceCardGrid>
          </RadioGroup>
        </Row>
      </Section>

      {/* ---------------- ColorPicker ---------------- */}
      <Section
        title="ColorPicker"
        blurb="HSL area picker with hue slider, hex/HSL text input, and preset swatches inside a popover. Controlled via color + onChange. Optional presets."
      >
        <Row
          name="<ColorPicker>"
          desc="pick a color; value echoed on the right"
        >
          <ColorDemo />
        </Row>
      </Section>

      {/* ================================================================ */}
      {/* Added round 2 — components we own but the first board skipped,    */}
      {/* plus filter / selection-menu inputs and a starter-repo port.      */}
      {/* ================================================================ */}

      {/* ---------------- FileUpload ---------------- */}
      <Section
        title="FileUpload"
        blurb="Drag-and-drop file input with dropzone, list, per-item preview / progress / delete. maxFiles, maxSize, accept, multiple. Compose FileUploadDropzone + FileUploadTrigger + FileUploadList."
      >
        <Row
          name="<FileUpload multiple>"
          desc="drop or browse; up to 5 files, 5 MB each"
        >
          <div className="w-full max-w-md">
            <FileUpload maxFiles={5} maxSize={5 * 1024 * 1024} multiple>
              <FileUploadDropzone>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm font-medium">Drag & drop files here</p>
                  <p className="text-xs text-muted-foreground">
                    or click to browse (max 5, 5 MB each)
                  </p>
                </div>
                <FileUploadTrigger asChild>
                  <Button variant="outline" size="sm" className="mt-2">
                    Choose files
                  </Button>
                </FileUploadTrigger>
              </FileUploadDropzone>
              <FileUploadList />
            </FileUpload>
          </div>
        </Row>
        <Row name="accept='image/*' single" desc="one image only, 2 MB cap">
          <div className="w-full max-w-md">
            <FileUpload accept="image/*" maxSize={2 * 1024 * 1024}>
              <FileUploadDropzone>
                <p className="text-sm font-medium">Upload an image</p>
                <p className="text-xs text-muted-foreground">
                  PNG/JPG up to 2 MB
                </p>
              </FileUploadDropzone>
              <FileUploadList />
            </FileUpload>
          </div>
        </Row>
      </Section>

      {/* ---------------- SignaturePad ---------------- */}
      <Section
        title="SignaturePad"
        blurb="Canvas signature capture (draw with mouse / touch). Sub-parts: SignaturePadControl (reset), SignaturePadGuide, SignaturePadSegment. disabled locks it."
      >
        <Row name="<SignaturePad>" desc="draw above; reset icon clears">
          <div className="w-full max-w-sm">
            <SignaturePad />
          </div>
        </Row>
        <Row name="disabled" desc="read-only canvas">
          <div className="w-full max-w-sm">
            <SignaturePad disabled />
          </div>
        </Row>
      </Section>

      {/* ---------------- ImageCropper ---------------- */}
      <Section
        title="ImageCropper"
        blurb="Dialog-based crop/zoom for a picked File. Controlled via open + file; cropShape 'round' | 'rect'; onCropComplete returns a Blob. Renders nothing until a file is set."
      >
        <Row
          name="<ImageCropper>"
          desc="opens a crop dialog for a sample image, returns cropped avatar"
        >
          <ImageCropperDemo />
        </Row>
      </Section>

      {/* ---------------- KeyValue ---------------- */}
      <Section
        title="KeyValue"
        blurb="Editable list of key/value pairs (headers, metadata). value is KeyValueItemData[]. Compose KeyValueList > KeyValueItem > KeyValueKeyInput + KeyValueValueInput + KeyValueRemove, plus KeyValueAdd. Built-in validation via KeyValueError."
      >
        <Row
          name="<KeyValue defaultValue>"
          desc="edit rows, add / remove pairs"
        >
          <div className="w-full max-w-xl">
            <KeyValue defaultValue={KV_SAMPLE}>
              <KeyValueList>
                <KeyValueItem>
                  <div className="flex w-40 flex-col gap-1">
                    <KeyValueKeyInput />
                    <KeyValueError field="key" />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <KeyValueValueInput />
                    <KeyValueError field="value" />
                  </div>
                  <KeyValueRemove />
                </KeyValueItem>
              </KeyValueList>
              <KeyValueAdd />
            </KeyValue>
          </div>
        </Row>
      </Section>

      {/* ---------------- EnvEditor ---------------- */}
      <Section
        title="EnvEditor"
        blurb="Specialized KeyValue for .env variables: paste-parses KEY=VALUE, masks secret values by default. Props: value (EnvVariable[]), masked, readOnly, onChange."
      >
        <Row
          name="<EnvEditor masked>"
          desc="values hidden behind dots (default)"
        >
          <div className="w-full max-w-xl">
            <EnvEditor value={ENV_SAMPLE} />
          </div>
        </Row>
        <Row name="masked={false}" desc="plain-text values">
          <div className="w-full max-w-xl">
            <EnvEditor value={ENV_SAMPLE} masked={false} />
          </div>
        </Row>
        <Row name="readOnly" desc="view-only, no editing">
          <div className="w-full max-w-xl">
            <EnvEditor value={ENV_SAMPLE} readOnly />
          </div>
        </Row>
      </Section>

      {/* ---------------- ColorSwatch ---------------- */}
      <Section
        title="ColorSwatch"
        blurb="Small color chip (the picker's building block / a read-out). size: sm | default | lg. color accepts any CSS color; alpha shows a checkerboard."
      >
        <Row name="<ColorSwatch size>" desc="three sizes">
          <div className="flex items-center gap-3">
            <ColorSwatch color="#10b981" size="sm" />
            <ColorSwatch color="#3b82f6" />
            <ColorSwatch color="#f59e0b" size="lg" />
          </div>
        </Row>
        <Row name="alpha color" desc="semi-transparent over a checkerboard">
          <ColorSwatch color="rgb(239 68 68 / 0.4)" size="lg" />
        </Row>
      </Section>

      {/* ---------------- DropdownMenu (selection items) ---------------- */}
      <Section
        title="DropdownMenu — checkbox & radio items"
        blurb="Dropdowns aren't only navigation: DropdownMenuCheckboxItem and DropdownMenuRadioGroup / DropdownMenuRadioItem are real selection inputs (toggles + single-choice) — the pattern behind table column toggles, density pickers, sort menus."
      >
        <Row
          name="CheckboxItem + RadioGroup"
          desc="checkbox items toggle; radio group picks one — open the menu"
        >
          <DropdownMenuDemo />
        </Row>
      </Section>

      {/* ---------------- FilterBar ---------------- */}
      <Section
        title="FilterBar"
        blurb="Table filter bar: pill chips with per-column operator + value editors (text / number / date / option / multi-option), all debounced. Columns declared via createColumnConfigHelper; wired with useFilterBar. This is the filter/sort input surface."
      >
        <Row
          name="<FilterBar>"
          desc="click '+ Filter' to add a column filter; each chip has an operator + value editor"
          className="items-stretch"
        >
          <FilterBarDemo />
        </Row>
      </Section>

      {/* ---------------- VisuallyHiddenInput (ported from starter) ------ */}
      <Section
        title="VisuallyHiddenInput — ported from hlebtkachenko/starter"
        blurb="Not in packages/ui yet. An a11y bridge: an invisible native <input> that mirrors a custom control's value/checked into a real form field (so custom widgets submit + validate natively). It has NO visual of its own — the demo shows a custom rating control whose value it feeds into the form on submit."
      >
        <Row
          name="<VisuallyHiddenInput>"
          desc="custom star buttons → hidden input → native FormData"
        >
          <VisuallyHiddenDemo />
        </Row>
      </Section>

      <footer className="mt-16 border-t border-border/60 pt-4 text-xs text-muted-foreground">
        Admin Debug → Input Fields · blocked in production builds.
      </footer>
    </div>
  )
}
