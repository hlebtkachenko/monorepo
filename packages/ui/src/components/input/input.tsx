import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Sizing cva. The prop is named `inputSize` rather than `size` because
 * `<input size>` is a real HTML attribute (display width in characters)
 * and shadowing it would force every consumer that wants the native
 * attribute to cast around the variant type. `inputSize` keeps both
 * usable: native sizing via the standard attr, design-system sizing via
 * the variant.
 */
const inputVariants = cva(
  "w-full min-w-0 rounded-lg border border-input bg-transparent transition-colors outline-none file:inline-flex file:border-0 file:bg-transparent file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      inputSize: {
        default: "h-8 px-2.5 py-1 text-base file:h-6 file:text-sm md:text-sm",
        xl: "h-11 px-3.5 py-2 text-base file:h-9 file:text-sm",
      },
    },
    defaultVariants: {
      inputSize: "default",
    },
  },
)

type InputProps = React.ComponentProps<"input"> &
  VariantProps<typeof inputVariants>

function Input({ className, type, inputSize, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={inputSize ?? "default"}
      className={cn(inputVariants({ inputSize }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
export type { InputProps }
