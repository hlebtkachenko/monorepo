"use client"

import * as React from "react"

import {
  PhoneInput,
  PhoneInputCountry,
  PhoneInputField,
} from "@workspace/ui/components/input-phone"

export function InputPhoneDemo() {
  const [value, setValue] = React.useState("+420")

  return (
    <div className="w-full max-w-sm">
      <PhoneInput value={value} onValueChange={setValue} defaultCountry="CZ">
        <PhoneInputCountry />
        <PhoneInputField />
      </PhoneInput>
      <p className="mt-2 text-xs text-muted-foreground">Value: {value}</p>
    </div>
  )
}
