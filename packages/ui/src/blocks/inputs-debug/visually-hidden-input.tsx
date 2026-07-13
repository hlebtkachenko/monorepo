"use client"

/**
 * Ported from hlebtkachenko/starter (src/components/ui/visually-hidden-input.tsx)
 * for evaluation on the inputs debug board.
 *
 * An accessibility bridge: renders a visually-hidden native <input> that mirrors
 * the value/checked state of a custom control so the control participates in
 * native form submission and validation. It re-dispatches native input/click
 * events using the prototype setter so libraries listening on the real element
 * still fire.
 */

import * as React from "react"

type InputValue = string[] | string

interface VisuallyHiddenInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "checked" | "onReset"
> {
  value?: InputValue
  checked?: boolean
  bubbles?: boolean
}

function VisuallyHiddenInput(props: VisuallyHiddenInputProps) {
  const {
    value,
    checked,
    bubbles = true,
    type = "hidden",
    style,
    ...inputProps
  } = props

  const isCheckInput = React.useMemo(
    () => type === "checkbox" || type === "radio",
    [type],
  )
  const inputRef = React.useRef<HTMLInputElement>(null)

  const prevValueRef = React.useRef<{
    value: InputValue | boolean | undefined
    previous: InputValue | boolean | undefined
  }>({
    value: isCheckInput ? checked : value,
    previous: isCheckInput ? checked : value,
  })

  const prevValue = React.useMemo(() => {
    const currentValue = isCheckInput ? checked : value
    if (prevValueRef.current.value !== currentValue) {
      prevValueRef.current.previous = prevValueRef.current.value
      prevValueRef.current.value = currentValue
    }
    return prevValueRef.current.previous
  }, [isCheckInput, value, checked])

  React.useEffect(() => {
    const input = inputRef.current
    if (!input) return

    const inputProto = window.HTMLInputElement.prototype
    const propertyKey = isCheckInput ? "checked" : "value"
    const eventType = isCheckInput ? "click" : "input"
    const currentValue = isCheckInput ? checked : value

    const serializedCurrentValue = isCheckInput
      ? checked
      : typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : value

    const descriptor = Object.getOwnPropertyDescriptor(inputProto, propertyKey)
    const setter = descriptor?.set

    if (prevValue !== currentValue && setter) {
      const event = new Event(eventType, { bubbles })
      setter.call(input, serializedCurrentValue)
      input.dispatchEvent(event)
    }
  }, [prevValue, value, checked, bubbles, isCheckInput])

  const composedStyle = React.useMemo<React.CSSProperties>(
    () => ({
      ...style,
      border: 0,
      clip: "rect(0 0 0 0)",
      clipPath: "inset(50%)",
      height: "1px",
      margin: "-1px",
      overflow: "hidden",
      padding: 0,
      position: "absolute",
      whiteSpace: "nowrap",
      width: "1px",
    }),
    [style],
  )

  return (
    <input
      type={type}
      {...inputProps}
      ref={inputRef}
      aria-hidden={isCheckInput}
      tabIndex={-1}
      defaultChecked={isCheckInput ? checked : undefined}
      style={composedStyle}
    />
  )
}

export { VisuallyHiddenInput }
