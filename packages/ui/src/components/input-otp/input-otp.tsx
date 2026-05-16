"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import {
  OTPInput,
  OTPInputContext,
  REGEXP_ONLY_CHARS,
  REGEXP_ONLY_DIGITS,
  REGEXP_ONLY_DIGITS_AND_CHARS,
} from "input-otp"

import { cn } from "@workspace/ui/lib/utils"
import { MinusIcon } from "@workspace/ui/lib/icons"

const InputOTPSizeContext = React.createContext<"default" | "xl">("default")

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "cn-input-otp flex items-center has-disabled:opacity-50",
        containerClassName,
      )}
      spellCheck={false}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

function InputOTPGroup({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "xl" }) {
  return (
    <InputOTPSizeContext.Provider value={size}>
      <div
        data-slot="input-otp-group"
        data-size={size}
        className={cn(
          "flex items-center rounded-lg has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40",
          size === "xl" && "w-full gap-2",
          className,
        )}
        {...props}
      />
    </InputOTPSizeContext.Provider>
  )
}

const slotVariants = cva(
  "relative flex items-center justify-center border-input transition-all outline-none aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-3 data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40",
  {
    variants: {
      size: {
        default:
          "size-8 border-y border-r text-sm first:rounded-l-lg first:border-l last:rounded-r-lg",
        xl: "h-14 flex-1 rounded-xl border text-2xl font-medium",
      },
    },
    defaultVariants: { size: "default" },
  },
)

function InputOTPSlot({
  index,
  className,
  size,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof slotVariants> & {
    index: number
  }) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const groupSize = React.useContext(InputOTPSizeContext)
  const resolvedSize = size ?? groupSize
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-size={resolvedSize}
      data-active={isActive}
      className={cn(slotVariants({ size: resolvedSize }), className)}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "w-px animate-caret-blink bg-foreground duration-1000",
              resolvedSize === "xl" ? "h-7" : "h-4",
            )}
          />
        </div>
      )}
    </div>
  )
}

function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-separator"
      className="flex items-center [&_svg:not([class*='size-'])]:size-4"
      role="separator"
      {...props}
    >
      <MinusIcon />
    </div>
  )
}

/**
 * Built-in character-set patterns for the underlying `OTPInput`. Pass any
 * of these via the `pattern` prop on `<InputOTP>` to constrain the
 * acceptable characters (digits-only is the most common for TOTP / SMS
 * verification codes).
 *
 *   <InputOTP maxLength={6} pattern={INPUT_OTP_PATTERNS.numeric}>...</InputOTP>
 *
 * Pair with `inputMode="numeric"` so mobile keyboards show the digit pad.
 */
const INPUT_OTP_PATTERNS = {
  numeric: REGEXP_ONLY_DIGITS,
  alphabetic: REGEXP_ONLY_CHARS,
  alphanumeric: REGEXP_ONLY_DIGITS_AND_CHARS,
} as const

export {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
  INPUT_OTP_PATTERNS,
}
