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
 * Apple-style suggested password: four hyphen-separated groups,
 * readable mixed alphanumeric, with guaranteed uppercase, lowercase,
 * digit, and symbol to satisfy app password rules.
 *
 *   abcdEF-12gh3K-mnPq45-xy!Z67    (18 chars + 3 hyphens, 21 total)
 *
 * Hyphens count toward the rules-checker's length (>=12) but are not
 * treated as symbols by Zod's symbol class. We inject one explicit
 * symbol into a random slot so PasswordSchema.symbol passes.
 */
function generatePassword(): string {
  const groupSize = 6
  const groupCount = 3
  const total = groupSize * groupCount
  const rand = randomBytes(total + 4)

  const chars: string[] = new Array(total)
  for (let i = 0; i < total; i++) {
    chars[i] = pick(READABLE, rand[i]!)
  }

  // Guarantee at least one of each required class.
  chars[rand[total]! % total] = pick(UPPER, rand[total + 1]!)
  chars[rand[total + 2]! % total] = pick(DIGIT, rand[total + 3]!)
  // Force one symbol slot (overrides one readable char). PasswordSchema
  // requires at least one symbol; without this the readable charset
  // alone would never satisfy it.
  const symIdx = rand[total + 1]! % total
  chars[symIdx] = pick(SYMBOL, rand[total + 3]!)

  const groups: string[] = []
  for (let g = 0; g < groupCount; g++) {
    groups.push(chars.slice(g * groupSize, (g + 1) * groupSize).join(""))
  }
  return groups.join("-")
}

export interface PasswordInputProps extends Omit<
  React.ComponentProps<"input">,
  "type" | "onChange"
> {
  value?: string
  onValueChange?: (next: string) => void
  showGenerate?: boolean
  onGenerate?: (pw: string) => void
  autoComplete?: "new-password" | "current-password"
}

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
      ...props
    },
    ref,
  ) => {
    const [visible, setVisible] = React.useState(false)

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      onValueChange?.(e.target.value)
    }

    function handleToggleVisibility() {
      setVisible((v) => !v)
    }

    function handleGenerate() {
      const pw = generatePassword()
      onGenerate?.(pw)
      onValueChange?.(pw)
    }

    return (
      <TooltipProvider>
        <InputGroup className={cn(className)}>
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
