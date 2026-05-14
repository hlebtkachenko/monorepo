"use client"

import * as React from "react"
import { PlusIcon, Trash2Icon } from "@workspace/ui/lib/icons"
import { Slot } from "radix-ui"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { useAsRef } from "@workspace/ui/hooks/use-as-ref"
import { useIsomorphicLayoutEffect } from "@workspace/ui/hooks/use-isomorphic-layout-effect"
import { useLazyRef } from "@workspace/ui/hooks/use-lazy-ref"
import { cn } from "@workspace/ui/lib/utils"
import { makeId } from "@workspace/ui/lib/id"

const ROOT_NAME = "KeyValue"
const LIST_NAME = "KeyValueList"
const ITEM_NAME = "KeyValueItem"
const KEY_INPUT_NAME = "KeyValueKeyInput"
const VALUE_INPUT_NAME = "KeyValueValueInput"
const REMOVE_NAME = "KeyValueRemove"
const ADD_NAME = "KeyValueAdd"
const ERROR_NAME = "KeyValueError"

type Orientation = "vertical" | "horizontal"
type Field = "key" | "value"

interface DivProps extends React.ComponentProps<"div"> {
  asChild?: boolean
}

interface ItemData {
  id: string
  key: string
  value: string
}

interface KeyValueState {
  value: ItemData[]
  focusedId: string | null
  errors: Record<string, { key?: string; value?: string }>
}

interface Store {
  subscribe: (cb: () => void) => () => void
  getState: () => KeyValueState
  setState: <K extends keyof KeyValueState>(
    key: K,
    value: KeyValueState[K],
  ) => void
  notify: () => void
}

const StoreContext = React.createContext<Store | null>(null)

function useStoreContext(consumerName: string) {
  const ctx = React.useContext(StoreContext)
  if (!ctx)
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``)
  return ctx
}

function useStore<T>(
  selector: (state: KeyValueState) => T,
  override?: Store | null,
): T {
  const fromContext = React.useContext(StoreContext)
  const store = override ?? fromContext
  if (!store)
    throw new Error(`\`useStore\` must be used within \`${ROOT_NAME}\``)
  const getSnapshot = React.useCallback(
    () => selector(store.getState()),
    [store, selector],
  )
  return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

interface KeyValueContextValue {
  onPaste?: (event: ClipboardEvent, items: ItemData[]) => void
  onAdd?: (value: ItemData) => void
  onRemove?: (value: ItemData) => void
  onKeyValidate?: (key: string, value: ItemData[]) => string | undefined
  onValueValidate?: (
    value: string,
    key: string,
    items: ItemData[],
  ) => string | undefined
  rootId: string
  maxItems?: number
  minItems: number
  keyPlaceholder: string
  valuePlaceholder: string
  allowDuplicateKeys: boolean
  enablePaste: boolean
  trim: boolean
  stripQuotes: boolean
  disabled: boolean
  readOnly: boolean
  required: boolean
}

const KeyValueContext = React.createContext<KeyValueContextValue | null>(null)

function useKeyValueContext(consumerName: string) {
  const ctx = React.useContext(KeyValueContext)
  if (!ctx)
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``)
  return ctx
}

function getErrorId(rootId: string, itemId: string, field: Field) {
  return `${rootId}-${itemId}-${field}-error`
}

function removeQuotes(s: string, strip: boolean): string {
  if (!strip) return s
  const t = s.trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1)
  }
  return t
}

interface KeyValueProps extends Omit<DivProps, "onPaste" | "defaultValue"> {
  id?: string
  defaultValue?: ItemData[]
  value?: ItemData[]
  onValueChange?: (value: ItemData[]) => void
  maxItems?: number
  minItems?: number
  keyPlaceholder?: string
  valuePlaceholder?: string
  allowDuplicateKeys?: boolean
  enablePaste?: boolean
  trim?: boolean
  stripQuotes?: boolean
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  onPaste?: (event: ClipboardEvent, items: ItemData[]) => void
  onAdd?: (value: ItemData) => void
  onRemove?: (value: ItemData) => void
  onKeyValidate?: (key: string, value: ItemData[]) => string | undefined
  onValueValidate?: (
    value: string,
    key: string,
    items: ItemData[],
  ) => string | undefined
}

function KeyValue({
  value: valueProp,
  defaultValue,
  onValueChange,
  onPaste,
  onAdd,
  onRemove,
  onKeyValidate,
  onValueValidate,
  maxItems,
  minItems = 0,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  allowDuplicateKeys = false,
  asChild,
  enablePaste = true,
  trim = true,
  stripQuotes = true,
  disabled = false,
  readOnly = false,
  required = false,
  className,
  id,
  ...rootProps
}: KeyValueProps) {
  const instanceId = React.useId()
  const rootId = id ?? instanceId

  const listenersRef = useLazyRef(() => new Set<() => void>())
  const stateRef = useLazyRef<KeyValueState>(() => ({
    value: valueProp ??
      defaultValue ?? [{ id: makeId("kv"), key: "", value: "" }],
    focusedId: null,
    errors: {},
  }))
  const propsRef = useAsRef({ onValueChange })

  const store = React.useMemo<Store>(() => {
    return {
      subscribe: (cb) => {
        listenersRef.current.add(cb)
        return () => {
          listenersRef.current.delete(cb)
        }
      },
      getState: () => stateRef.current,
      setState: (key, val) => {
        if (Object.is(stateRef.current[key], val)) return
        if (key === "value" && Array.isArray(val)) {
          stateRef.current.value = val as ItemData[]
          propsRef.current.onValueChange?.(val as ItemData[])
        } else {
          stateRef.current[key] = val
        }
        store.notify()
      },
      notify: () => {
        for (const cb of listenersRef.current) cb()
      },
    }
  }, [listenersRef, stateRef, propsRef])

  const errors = useStore((s) => s.errors, store)
  const isInvalid = Object.keys(errors).length > 0

  useIsomorphicLayoutEffect(() => {
    if (valueProp !== undefined) {
      store.setState("value", valueProp)
    }
  }, [valueProp])

  const contextValue = React.useMemo<KeyValueContextValue>(() => {
    const v: KeyValueContextValue = {
      rootId,
      minItems,
      keyPlaceholder,
      valuePlaceholder,
      allowDuplicateKeys,
      enablePaste,
      trim,
      stripQuotes,
      disabled,
      readOnly,
      required,
    }
    if (onPaste) v.onPaste = onPaste
    if (onAdd) v.onAdd = onAdd
    if (onRemove) v.onRemove = onRemove
    if (onKeyValidate) v.onKeyValidate = onKeyValidate
    if (onValueValidate) v.onValueValidate = onValueValidate
    if (maxItems !== undefined) v.maxItems = maxItems
    return v
  }, [
    onPaste,
    onAdd,
    onRemove,
    onKeyValidate,
    onValueValidate,
    rootId,
    disabled,
    readOnly,
    required,
    maxItems,
    minItems,
    keyPlaceholder,
    valuePlaceholder,
    allowDuplicateKeys,
    enablePaste,
    trim,
    stripQuotes,
  ])

  const Comp = asChild ? Slot.Root : "div"

  return (
    <StoreContext.Provider value={store}>
      <KeyValueContext.Provider value={contextValue}>
        <Comp
          id={id}
          data-slot="key-value"
          data-disabled={disabled ? "" : undefined}
          data-invalid={isInvalid ? "" : undefined}
          data-readonly={readOnly ? "" : undefined}
          {...rootProps}
          className={cn("flex flex-col gap-2", className)}
        />
      </KeyValueContext.Provider>
    </StoreContext.Provider>
  )
}

interface KeyValueListProps extends DivProps {
  orientation?: Orientation
}

function KeyValueList({
  orientation = "vertical",
  asChild,
  className,
  children,
  ...listProps
}: KeyValueListProps) {
  const value = useStore((s) => s.value)
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      role="list"
      aria-orientation={orientation}
      data-slot="key-value-list"
      data-orientation={orientation}
      {...listProps}
      className={cn(
        "flex",
        orientation === "vertical" ? "flex-col gap-2" : "flex-row gap-2",
        className,
      )}
    >
      {value.map((item) => (
        <KeyValueItemContext.Provider key={item.id} value={item}>
          {children}
        </KeyValueItemContext.Provider>
      ))}
    </Comp>
  )
}

const KeyValueItemContext = React.createContext<ItemData | null>(null)

function useKeyValueItemContext(consumerName: string) {
  const ctx = React.useContext(KeyValueItemContext)
  if (!ctx)
    throw new Error(`\`${consumerName}\` must be used within \`${LIST_NAME}\``)
  return ctx
}

interface KeyValueItemProps extends React.ComponentProps<"div"> {
  asChild?: boolean
}

function KeyValueItem({ asChild, className, ...itemProps }: KeyValueItemProps) {
  const itemData = useKeyValueItemContext(ITEM_NAME)
  const focusedId = useStore((s) => s.focusedId)
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      role="listitem"
      data-slot="key-value-item"
      data-highlighted={focusedId === itemData.id ? "" : undefined}
      {...itemProps}
      className={cn("flex items-center gap-2", className)}
    />
  )
}

interface KeyValueItemIconProps extends React.ComponentProps<"span"> {
  asChild?: boolean
}

function KeyValueItemIcon({
  asChild,
  className,
  ...iconProps
}: KeyValueItemIconProps) {
  const Comp = asChild ? Slot.Root : "span"
  return (
    <Comp
      aria-hidden
      data-slot="key-value-item-icon"
      {...iconProps}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground [&_svg]:size-4",
        className,
      )}
    />
  )
}

function validateItem(
  context: KeyValueContextValue,
  newValue: ItemData[],
  itemId: string,
): { key?: string; value?: string } {
  const item = newValue.find((x) => x.id === itemId)
  if (!item) return {}
  const errors: { key?: string; value?: string } = {}
  if (context.onKeyValidate) {
    const e = context.onKeyValidate(item.key, newValue)
    if (e) errors.key = e
  }
  if (!context.allowDuplicateKeys) {
    const dup = newValue.find(
      (x) => x.id !== item.id && x.key === item.key && item.key !== "",
    )
    if (dup) errors.key = "Duplicate key"
  }
  if (context.onValueValidate) {
    const e = context.onValueValidate(item.value, item.key, newValue)
    if (e) errors.value = e
  }
  return errors
}

interface KeyValueKeyInputProps extends React.ComponentProps<"input"> {
  asChild?: boolean
}

function KeyValueKeyInput({
  onChange: onChangeProp,
  onPaste: onPasteProp,
  asChild,
  disabled,
  readOnly,
  required,
  ...rest
}: KeyValueKeyInputProps) {
  const context = useKeyValueContext(KEY_INPUT_NAME)
  const itemData = useKeyValueItemContext(KEY_INPUT_NAME)
  const store = useStoreContext(KEY_INPUT_NAME)
  const errors = useStore((s) => s.errors)
  const propsRef = useAsRef({ onChange: onChangeProp, onPaste: onPasteProp })

  const isDisabled = disabled || context.disabled
  const isReadOnly = readOnly || context.readOnly
  const isRequired = required || context.required
  const isInvalid = errors[itemData.id]?.key !== undefined

  const onChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const state = store.getState()
      const newValue = state.value.map((item) => {
        if (item.id !== itemData.id) return item
        const updated = { ...item, key: event.target.value }
        if (context.trim) updated.key = updated.key.trim()
        return updated
      })
      store.setState("value", newValue)
      const itemErrors = validateItem(context, newValue, itemData.id)
      const next = { ...state.errors }
      if (Object.keys(itemErrors).length > 0) next[itemData.id] = itemErrors
      else delete next[itemData.id]
      store.setState("errors", next)
      propsRef.current.onChange?.(event)
    },
    [store, itemData.id, context, propsRef],
  )

  const onPaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>) => {
      if (!context.enablePaste) return
      propsRef.current.onPaste?.(event)
      if (event.defaultPrevented) return

      const content = event.clipboardData.getData("text")
      const lines = content.split(/\r?\n/).filter((line) => line.trim())
      if (lines.length <= 1) return

      event.preventDefault()
      const parsed: ItemData[] = []
      for (const line of lines) {
        let key = ""
        let value = ""
        if (line.includes("=")) {
          const parts = line.split("=")
          key = parts[0]?.trim() ?? ""
          value = removeQuotes(
            parts.slice(1).join("=").trim(),
            context.stripQuotes,
          )
        } else if (line.includes(":")) {
          const parts = line.split(":")
          key = parts[0]?.trim() ?? ""
          value = removeQuotes(
            parts.slice(1).join(":").trim(),
            context.stripQuotes,
          )
        } else if (/\s{2,}|\t/.test(line)) {
          const parts = line.split(/\s{2,}|\t/)
          key = parts[0]?.trim() ?? ""
          value = removeQuotes(
            parts.slice(1).join(" ").trim(),
            context.stripQuotes,
          )
        }
        if (key) parsed.push({ id: makeId("kv"), key, value })
      }
      if (parsed.length === 0) return

      const state = store.getState()
      const currentIndex = state.value.findIndex(
        (item) => item.id === itemData.id,
      )
      let newValue: ItemData[]
      if (itemData.key === "" && itemData.value === "") {
        newValue = [
          ...state.value.slice(0, currentIndex),
          ...parsed,
          ...state.value.slice(currentIndex + 1),
        ]
      } else {
        newValue = [
          ...state.value.slice(0, currentIndex + 1),
          ...parsed,
          ...state.value.slice(currentIndex + 1),
        ]
      }
      if (context.maxItems !== undefined)
        newValue = newValue.slice(0, context.maxItems)
      store.setState("value", newValue)
      context.onPaste?.(event.nativeEvent as unknown as ClipboardEvent, parsed)
    },
    [context, store, itemData, propsRef],
  )

  const Comp = asChild ? Slot.Root : Input
  return (
    <Comp
      aria-invalid={isInvalid}
      aria-describedby={
        isInvalid ? getErrorId(context.rootId, itemData.id, "key") : undefined
      }
      data-slot="key-value-key-input"
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      spellCheck="false"
      disabled={isDisabled}
      readOnly={isReadOnly}
      required={isRequired}
      placeholder={context.keyPlaceholder}
      {...rest}
      value={itemData.key}
      onChange={onChange}
      onPaste={onPaste}
    />
  )
}

interface KeyValueValueInputProps extends Omit<
  React.ComponentProps<"textarea">,
  "rows"
> {
  multiline?: boolean
  maxRows?: number
  asChild?: boolean
}

function KeyValueValueInput({
  onChange: onChangeProp,
  asChild,
  disabled,
  readOnly,
  required,
  className,
  multiline = false,
  maxRows,
  style,
  ...rest
}: KeyValueValueInputProps) {
  const context = useKeyValueContext(VALUE_INPUT_NAME)
  const itemData = useKeyValueItemContext(VALUE_INPUT_NAME)
  const store = useStoreContext(VALUE_INPUT_NAME)
  const errors = useStore((s) => s.errors)
  const propsRef = useAsRef({ onChange: onChangeProp })

  const isDisabled = disabled || context.disabled
  const isReadOnly = readOnly || context.readOnly
  const isRequired = required || context.required
  const isInvalid = errors[itemData.id]?.value !== undefined
  const maxHeight = maxRows ? `calc(${maxRows} * 1.5em + 1rem)` : undefined

  const onChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      propsRef.current.onChange?.(
        event as React.ChangeEvent<HTMLTextAreaElement>,
      )
      const state = store.getState()
      const newValue = state.value.map((item) => {
        if (item.id !== itemData.id) return item
        const updated = { ...item, value: event.target.value }
        if (context.trim) updated.value = updated.value.trim()
        return updated
      })
      store.setState("value", newValue)
      const itemErrors = validateItem(context, newValue, itemData.id)
      const next = { ...state.errors }
      if (Object.keys(itemErrors).length > 0) next[itemData.id] = itemErrors
      else delete next[itemData.id]
      store.setState("errors", next)
    },
    [store, itemData.id, context, propsRef],
  )

  const commonProps = {
    "aria-invalid": isInvalid,
    "aria-describedby": isInvalid
      ? getErrorId(context.rootId, itemData.id, "value")
      : undefined,
    "data-slot": "key-value-value-input",
    autoCapitalize: "off",
    autoComplete: "off",
    autoCorrect: "off",
    spellCheck: "false" as const,
    disabled: isDisabled,
    readOnly: isReadOnly,
    required: isRequired,
    placeholder: context.valuePlaceholder,
    value: itemData.value,
    onChange,
  }

  if (asChild) {
    return (
      <Slot.Root
        {...rest}
        {...commonProps}
        className={className}
        style={style}
      />
    )
  }

  if (multiline) {
    return (
      <Textarea
        {...(rest as React.ComponentProps<"textarea">)}
        {...commonProps}
        className={cn(
          "field-sizing-content min-h-8 resize-none",
          maxRows && "overflow-y-auto",
          className,
        )}
        style={{ ...style, ...(maxHeight && { maxHeight }) }}
      />
    )
  }

  return (
    <Input
      {...(rest as React.ComponentProps<"input">)}
      {...commonProps}
      className={cn("h-8", className)}
      style={style}
    />
  )
}

type KeyValueRemoveProps = React.ComponentProps<typeof Button>

function KeyValueRemove({
  onClick: onClickProp,
  children,
  ...rest
}: KeyValueRemoveProps) {
  const context = useKeyValueContext(REMOVE_NAME)
  const itemData = useKeyValueItemContext(REMOVE_NAME)
  const store = useStoreContext(REMOVE_NAME)
  const propsRef = useAsRef({ onClick: onClickProp })
  const value = useStore((s) => s.value)
  const isDisabled = context.disabled || value.length <= context.minItems

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      propsRef.current.onClick?.(event)
      const state = store.getState()
      if (state.value.length <= context.minItems) return
      const toRemove = state.value.find((x) => x.id === itemData.id)
      if (!toRemove) return
      const newValue = state.value.filter((x) => x.id !== itemData.id)
      const newErrors = { ...state.errors }
      delete newErrors[itemData.id]
      store.setState("value", newValue)
      store.setState("errors", newErrors)
      context.onRemove?.(toRemove)
    },
    [store, context, itemData.id, propsRef],
  )

  return (
    <Button
      type="button"
      data-slot="key-value-remove"
      variant="ghost"
      size="icon-sm"
      disabled={isDisabled}
      aria-label="Remove row"
      {...rest}
      className={cn(
        "shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        rest.className,
      )}
      onClick={onClick}
    >
      {children ?? <Trash2Icon />}
    </Button>
  )
}

function KeyValueAdd({
  onClick: onClickProp,
  children,
  ...rest
}: React.ComponentProps<typeof Button>) {
  const context = useKeyValueContext(ADD_NAME)
  const store = useStoreContext(ADD_NAME)
  const propsRef = useAsRef({ onClick: onClickProp })
  const value = useStore((s) => s.value)
  const isDisabled =
    context.disabled ||
    (context.maxItems !== undefined && value.length >= context.maxItems)

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      propsRef.current.onClick?.(event)
      const state = store.getState()
      if (
        context.maxItems !== undefined &&
        state.value.length >= context.maxItems
      )
        return
      const newItem: ItemData = { id: makeId("kv"), key: "", value: "" }
      store.setState("value", [...state.value, newItem])
      store.setState("focusedId", newItem.id)
      context.onAdd?.(newItem)
    },
    [store, context, propsRef],
  )

  return (
    <Button
      type="button"
      data-slot="key-value-add"
      variant="outline"
      disabled={isDisabled}
      {...rest}
      onClick={onClick}
    >
      {children ?? (
        <>
          <PlusIcon />
          Add
        </>
      )}
    </Button>
  )
}

interface KeyValueErrorProps extends DivProps {
  field: Field
}

function KeyValueError({
  field,
  asChild,
  className,
  ...rest
}: KeyValueErrorProps) {
  const context = useKeyValueContext(ERROR_NAME)
  const itemData = useKeyValueItemContext(ERROR_NAME)
  const errors = useStore((s) => s.errors)
  const error = errors[itemData.id]?.[field]
  if (!error) return null
  const Comp = asChild ? Slot.Root : "span"
  return (
    <Comp
      id={getErrorId(context.rootId, itemData.id, field)}
      role="alert"
      {...rest}
      className={cn("text-sm font-medium text-destructive", className)}
    >
      {error}
    </Comp>
  )
}

export {
  KeyValue,
  KeyValueAdd,
  KeyValueError,
  KeyValueItem,
  KeyValueItemIcon,
  KeyValueKeyInput,
  KeyValueList,
  KeyValueRemove,
  KeyValueValueInput,
  useStore as useKeyValueStore,
}
export type { KeyValueProps, ItemData as KeyValueItemData }
