"use client"

/**
 * Ported from hlebtkachenko/starter (src/components/ui/visually-hidden-input.tsx)
 * for evaluation — NOT yet in packages/ui.
 *
 * An accessibility bridge: renders a visually-hidden native <input> that mirrors
 * the value/checked state of a custom control so the control participates in
 * native form submission and validation. It reflects the wrapped control's box
 * size (via ResizeObserver) and re-dispatches native input/click events using
 * the prototype setter so libraries listening on the real element still fire.
 */

import * as React from "react"

type InputValue = string[] | string

interface VisuallyHiddenInputProps<T = InputValue> extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "checked" | "onReset"
> {
  value?: T
  checked?: boolean
  control: HTMLElement | null
  bubbles?: boolean
}

function VisuallyHiddenInput<T = InputValue>(
  props: VisuallyHiddenInputProps<T>,
) {
  const {
    control,
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
    value: T | boolean | undefined
    previous: T | boolean | undefined
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

  const [controlSize, setControlSize] = React.useState<{
    width?: number
    height?: number
  }>({})

  React.useLayoutEffect(() => {
    if (!control) {
      setControlSize({})
      return
    }

    setControlSize({ width: control.offsetWidth, height: control.offsetHeight })

    if (typeof window === "undefined") return

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const borderSizeEntry = entry.borderBoxSize
      const borderSize = Array.isArray(borderSizeEntry)
        ? borderSizeEntry[0]
        : borderSizeEntry
      if (borderSize) {
        setControlSize({
          width: borderSize.inlineSize,
          height: borderSize.blockSize,
        })
      } else {
        setControlSize({
          width: control.offsetWidth,
          height: control.offsetHeight,
        })
      }
    })

    resizeObserver.observe(control, { box: "border-box" })
    return () => resizeObserver.disconnect()
  }, [control])

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
      ...(controlSize.width !== undefined && controlSize.height !== undefined
        ? controlSize
        : {}),
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
    [style, controlSize],
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
export type { VisuallyHiddenInputProps }
