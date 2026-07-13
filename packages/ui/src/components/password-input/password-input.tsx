"use client"

import * as React from "react"
import { Eye, EyeOff, Sparkles } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

const LOWER = "abcdefghijkmnpqrstuvwxyz"
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
const DIGIT = "23456789"
const SYMBOL = "!@#$%^&*"
const READABLE = LOWER + UPPER + DIGIT

function randomBytes(length: number): Uint32Array {
  const values = new Uint32Array(length)
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    crypto.getRandomValues(values)
  } else {
    for (let i = 0; i < length; i++) {
      values[i] = Math.floor(Math.random() * 0x100000000)
    }
  }
  return values
}

function pick(charset: string, rand: number): string {
  return charset[rand % charset.length]!
}

/**
 * Apple-style suggested password: three hyphen-separated groups of six
 * readable alphanumeric characters (20 chars total).
 *
 *   ab!dEF-12gh3K-mn#q45   (three groups of six, 20 chars)
 *
 * The readable set excludes ambiguous glyphs (l/1/o/0/i). We guarantee at
 * least one uppercase and one digit, and force 1–3 symbols into distinct
 * random slots so PasswordSchema (which requires a symbol) always passes.
 * Apple's own format is alphanumeric-only, so injecting symbols is a
 * deliberate divergence to meet our own rules. Hyphens count toward the
 * length check but are not treated as symbols by Zod's symbol class.
 */
function generatePassword(): string {
  const groupSize = 6
  const groupCount = 3
  const total = groupSize * groupCount
  // Budget: `total` readable fills + one draw for the symbol count + two draws
  // (index + char) for each forced placement (1 uppercase, 1 digit, 1–3
  // symbols = up to 5). `total + 16` covers the worst case with headroom.
  const rand = randomBytes(total + 16)
  let cursor = 0
  const next = () => rand[cursor++ % rand.length]!

  const chars: string[] = new Array(total)
  for (let i = 0; i < total; i++) {
    chars[i] = pick(READABLE, next())
  }

  // Place one uppercase, one digit, and 1–3 symbols at distinct slots so no
  // forced class clobbers another. Linear-probe on collision.
  const symbolCount = 1 + (next() % 3)
  const used = new Set<number>()
  const placeAt = (charset: string) => {
    let idx = next() % total
    while (used.has(idx)) idx = (idx + 1) % total
    used.add(idx)
    chars[idx] = pick(charset, next())
  }

  placeAt(UPPER)
  placeAt(DIGIT)
  for (let s = 0; s < symbolCount; s++) {
    placeAt(SYMBOL)
  }

  const groups: string[] = []
  for (let g = 0; g < groupCount; g++) {
    groups.push(chars.slice(g * groupSize, (g + 1) * groupSize).join(""))
  }
  return groups.join("-")
}

type PasswordInputBaseProps = Omit<
  React.ComponentProps<"input">,
  "type" | "onChange"
> & {
  onGenerate?: (pw: string) => void
  autoComplete?: "new-password" | "current-password"
  inputSize?: "default" | "xl"
  visible?: boolean
  onVisibleChange?: (visible: boolean) => void
}

/**
 * `showGenerate` requires a wired-up value. The generate button hands the new
 * password out through `onValueChange` (it never stores it internally), so both
 * `value` and `onValueChange` are mandatory when `showGenerate` is set —
 * otherwise the generated password has nowhere to land. TypeScript enforces
 * this via the discriminated union below.
 */
export type PasswordInputProps =
  | (PasswordInputBaseProps & {
      showGenerate: true
      value: string
      onValueChange: (next: string) => void
    })
  | (PasswordInputBaseProps & {
      showGenerate?: false
      value?: string
      onValueChange?: (next: string) => void
    })

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      value,
      onValueChange,
      showGenerate = false,
      onGenerate,
      id,
      name,
      required,
      disabled,
      autoComplete = "current-password",
      inputSize,
      visible: controlledVisible,
      onVisibleChange,
      ...props
    },
    ref,
  ) => {
    const [internalVisible, setInternalVisible] = React.useState(false)
    const isControlled = controlledVisible !== undefined
    const visible = isControlled ? controlledVisible : internalVisible

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      onValueChange?.(e.target.value)
    }

    function handleToggleVisibility() {
      const next = !visible
      if (isControlled) {
        onVisibleChange?.(next)
      } else {
        setInternalVisible(next)
      }
    }

    function handleGenerate() {
      const pw = generatePassword()
      onGenerate?.(pw)
      onValueChange?.(pw)
    }

    return (
      <TooltipProvider>
        <InputGroup className={cn(inputSize === "xl" && "h-11", className)}>
          <InputGroupInput
            ref={ref}
            id={id}
            name={name}
            type={visible ? "text" : "password"}
            value={value}
            onChange={handleChange}
            required={required}
            disabled={disabled}
            autoComplete={autoComplete}
            inputSize={inputSize}
            {...props}
          />

          <InputGroupAddon align="inline-end" className="gap-0.5">
            {showGenerate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <InputGroupButton
                    type="button"
                    aria-label="Generate password"
                    onClick={handleGenerate}
                    disabled={disabled}
                  >
                    <Sparkles className="size-3.5" />
                  </InputGroupButton>
                </TooltipTrigger>
                <TooltipContent side="top">Generate password</TooltipContent>
              </Tooltip>
            )}

            <InputGroupButton
              type="button"
              aria-label={visible ? "Hide password" : "Show password"}
              onClick={handleToggleVisibility}
              disabled={disabled}
            >
              {visible ? (
                <Eye className="size-3.5" />
              ) : (
                <EyeOff className="size-3.5" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </TooltipProvider>
    )
  },
)

PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
