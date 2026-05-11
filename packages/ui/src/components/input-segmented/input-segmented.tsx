"use client"

import { cva, type VariantProps } from "class-variance-authority"
import {
  Direction as DirectionPrimitive,
  Slot as SlotPrimitive,
} from "radix-ui"
import * as React from "react"

import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

const ROOT_NAME = "InputSegmented"
const ITEM_NAME = "InputSegmentedItem"

type Direction = "ltr" | "rtl"
type Orientation = "horizontal" | "vertical"
type Size = "default" | "sm" | "lg"
type Position = "isolated" | "first" | "middle" | "last"

interface InputSegmentedContextValue {
  dir: Direction
  orientation: Orientation
  size: Size
  disabled: boolean
  invalid: boolean
  required: boolean
}

const InputSegmentedContext =
  React.createContext<InputSegmentedContextValue | null>(null)

function useInputSegmentedContext(consumerName: string) {
  const context = React.useContext(InputSegmentedContext)
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``)
  }
  return context
}

interface InputSegmentedProps extends React.ComponentProps<"div"> {
  dir?: Direction
  orientation?: Orientation
  size?: Size
  asChild?: boolean
  disabled?: boolean
  invalid?: boolean
  required?: boolean
}

function InputSegmented(props: InputSegmentedProps) {
  const {
    size = "default",
    dir: dirProp,
    orientation = "horizontal",
    children,
    className,
    asChild,
    disabled = false,
    invalid = false,
    required = false,
    ...rootProps
  } = props

  const dir = DirectionPrimitive.useDirection(dirProp)

  const contextValue = React.useMemo<InputSegmentedContextValue>(
    () => ({
      dir,
      orientation,
      size,
      disabled,
      invalid,
      required,
    }),
    [dir, orientation, size, disabled, invalid, required],
  )

  const childrenArray = React.Children.toArray(children)
  const childrenCount = childrenArray.length

  const inputSegmentedItems = React.Children.map(children, (child, index) => {
    if (React.isValidElement<InputSegmentedItemProps>(child)) {
      if (!child.props.position) {
        let position: Position

        if (childrenCount === 1) {
          position = "isolated"
        } else if (index === 0) {
          position = "first"
        } else if (index === childrenCount - 1) {
          position = "last"
        } else {
          position = "middle"
        }

        return React.cloneElement(child, { position })
      }
    }
    return child
  })

  const RootPrimitive = asChild ? SlotPrimitive.Slot : "div"

  return (
    <InputSegmentedContext.Provider value={contextValue}>
      <RootPrimitive
        role="group"
        aria-orientation={orientation}
        data-slot="input-segmented"
        data-orientation={orientation}
        data-disabled={disabled ? "" : undefined}
        data-invalid={invalid ? "" : undefined}
        data-required={required ? "" : undefined}
        dir={dir}
        {...rootProps}
        className={cn(
          "flex",
          orientation === "horizontal" ? "flex-row" : "flex-col",
          className,
        )}
      >
        {inputSegmentedItems}
      </RootPrimitive>
    </InputSegmentedContext.Provider>
  )
}

const inputSegmentedItemVariants = cva("", {
  variants: {
    position: {
      isolated: "",
      first: "rounded-e-none",
      middle: "-ms-px rounded-none border-l-0",
      last: "-ms-px rounded-s-none border-l-0",
    },
    orientation: {
      horizontal: "",
      vertical: "",
    },
    size: {
      sm: "h-7 px-2 text-xs",
      default: "h-8 px-2.5",
      lg: "h-9 px-3",
    },
  },
  compoundVariants: [
    {
      position: "first",
      orientation: "vertical",
      class: "ms-0 rounded-e-md rounded-b-none border-l",
    },
    {
      position: "middle",
      orientation: "vertical",
      class: "ms-0 -mt-px rounded-none border-t-0 border-l",
    },
    {
      position: "last",
      orientation: "vertical",
      class: "ms-0 -mt-px rounded-s-md rounded-t-none border-t-0 border-l",
    },
  ],
  defaultVariants: {
    position: "isolated",
    orientation: "horizontal",
    size: "default",
  },
})

interface InputSegmentedItemProps
  extends
    React.ComponentProps<"input">,
    Omit<VariantProps<typeof inputSegmentedItemVariants>, "size"> {
  asChild?: boolean
}

function InputSegmentedItem(props: InputSegmentedItemProps) {
  const { asChild, className, position, disabled, required, ...inputProps } =
    props
  const context = useInputSegmentedContext(ITEM_NAME)

  const isDisabled = disabled ?? context.disabled
  const isRequired = required ?? context.required

  const ItemPrimitive = asChild ? SlotPrimitive.Slot : Input

  return (
    <ItemPrimitive
      aria-invalid={context.invalid}
      aria-required={isRequired}
      data-disabled={isDisabled ? "" : undefined}
      data-invalid={context.invalid ? "" : undefined}
      data-orientation={context.orientation}
      data-position={position}
      data-required={isRequired ? "" : undefined}
      data-slot="input-segmented-item"
      disabled={isDisabled}
      required={isRequired}
      {...inputProps}
      className={cn(
        inputSegmentedItemVariants({
          position,
          orientation: context.orientation,
          size: context.size,
          className,
        }),
      )}
    />
  )
}

export { InputSegmented, InputSegmentedItem, type InputSegmentedProps }
