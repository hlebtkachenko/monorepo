"use client"

import * as React from "react"
import { Input } from "@workspace/ui/components/input"
import { debounce } from "./filter-bar-helpers"

type DebouncedInputProps = {
  value: string | number
  onChange: (value: string | number) => void
  debounceMs?: number
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange">

export function DebouncedInput({
  value: initialValue,
  onChange,
  debounceMs = 500,
  ...props
}: DebouncedInputProps) {
  const [value, setValue] = React.useState<string | number>(initialValue)

  React.useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  const debouncedOnChange = React.useMemo(
    () =>
      debounce((newValue: string | number) => {
        onChange(newValue)
      }, debounceMs),
    [debounceMs, onChange],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setValue(newValue)
    debouncedOnChange(newValue)
  }

  return <Input {...props} value={value} onChange={handleChange} />
}
