"use client"

import * as React from "react"
import { Check, Upload, X } from "@workspace/ui/lib/icons"

import { cn } from "@workspace/ui/lib/utils"
import { formatNumber, parseNumber } from "@workspace/ui/lib/format-number"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui/components/command"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"

import {
  type DataGridCellProps,
  type FileCellData,
  formatDateForDisplay,
  formatDateToString,
  formatFileSize,
  getFileIcon,
  getUrlHref,
  parseLocalDate,
} from "./data-grid"
import { DataGridCellWrapper } from "./data-grid-cell-wrapper"

export function ShortTextCell<TData>(props: DataGridCellProps<TData>) {
  const {
    cell,
    tableMeta,
    rowIndex,
    columnId,
    rowHeight,
    isEditing,
    isFocused,
    isSelected,
    readOnly,
  } = props
  const initialValue = (cell.getValue() as string) ?? ""
  const [value, setValue] = React.useState(initialValue)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const prevInitialRef = React.useRef(initialValue)
  if (initialValue !== prevInitialRef.current) {
    prevInitialRef.current = initialValue
    setValue(initialValue)
  }

  React.useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  const commit = React.useCallback(() => {
    if (!readOnly && value !== initialValue) {
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value })
    }
    tableMeta?.onCellEditingStop?.()
  }, [tableMeta, rowIndex, columnId, value, initialValue, readOnly])

  return (
    <DataGridCellWrapper<TData>
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={isEditing}
      isFocused={isFocused}
      isSelected={isSelected}
      readOnly={readOnly}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={value}
          className="size-full border-none bg-transparent p-0 outline-none"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault()
              commit()
            } else if (e.key === "Escape") {
              e.preventDefault()
              setValue(initialValue)
              tableMeta?.onCellEditingStop?.()
            }
          }}
        />
      ) : (
        <span data-slot="data-grid-cell-content">{value}</span>
      )}
    </DataGridCellWrapper>
  )
}

export function LongTextCell<TData>(props: DataGridCellProps<TData>) {
  const {
    cell,
    tableMeta,
    rowIndex,
    columnId,
    rowHeight,
    isEditing,
    isFocused,
    isSelected,
    readOnly,
  } = props
  const initialValue = (cell.getValue() as string) ?? ""
  const [value, setValue] = React.useState(initialValue)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const prevInitialRef = React.useRef(initialValue)
  if (initialValue !== prevInitialRef.current) {
    prevInitialRef.current = initialValue
    setValue(initialValue)
  }

  const commit = React.useCallback(() => {
    if (!readOnly && value !== initialValue) {
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value })
    }
    tableMeta?.onCellEditingStop?.()
  }, [tableMeta, rowIndex, columnId, value, initialValue, readOnly])

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (!open) commit()
      }}
    >
      <PopoverAnchor asChild>
        <DataGridCellWrapper<TData>
          tableMeta={tableMeta}
          rowIndex={rowIndex}
          columnId={columnId}
          rowHeight={rowHeight}
          isEditing={isEditing}
          isFocused={isFocused}
          isSelected={isSelected}
          readOnly={readOnly}
        >
          <span data-slot="data-grid-cell-content">{value}</span>
        </DataGridCellWrapper>
      </PopoverAnchor>
      <PopoverContent
        data-grid-cell-editor=""
        align="start"
        side="bottom"
        className="w-[360px] p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          textareaRef.current?.focus()
        }}
      >
        <Textarea
          ref={textareaRef}
          value={value}
          placeholder="Enter text..."
          className="min-h-[140px] resize-none border-0 shadow-none focus-visible:ring-0"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              setValue(initialValue)
              tableMeta?.onCellEditingStop?.()
            } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              commit()
            }
            e.stopPropagation()
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export function NumberCell<TData>(props: DataGridCellProps<TData>) {
  const {
    cell,
    tableMeta,
    rowIndex,
    columnId,
    rowHeight,
    isEditing,
    isFocused,
    isSelected,
    readOnly,
  } = props
  const initialValue = cell.getValue() as number | null
  const [value, setValue] = React.useState(
    initialValue == null ? "" : String(initialValue),
  )
  const inputRef = React.useRef<HTMLInputElement>(null)
  const opts = cell.column.columnDef.meta?.cell
  const numberOpts = opts?.variant === "number" ? opts : null

  const prevInitialRef = React.useRef(initialValue)
  if (initialValue !== prevInitialRef.current) {
    prevInitialRef.current = initialValue
    setValue(initialValue == null ? "" : String(initialValue))
  }

  React.useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  const commit = React.useCallback(() => {
    const num = value === "" ? null : parseNumber(value)
    if (!readOnly && num !== initialValue) {
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: num })
    }
    tableMeta?.onCellEditingStop?.()
  }, [tableMeta, rowIndex, columnId, value, initialValue, readOnly])

  return (
    <DataGridCellWrapper<TData>
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={isEditing}
      isFocused={isFocused}
      isSelected={isSelected}
      readOnly={readOnly}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={value}
          min={numberOpts?.min}
          max={numberOpts?.max}
          step={numberOpts?.step}
          className="size-full border-none bg-transparent p-0 outline-none"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault()
              commit()
            } else if (e.key === "Escape") {
              e.preventDefault()
              setValue(initialValue == null ? "" : String(initialValue))
              tableMeta?.onCellEditingStop?.()
            }
          }}
        />
      ) : (
        <span data-slot="data-grid-cell-content">
          {initialValue == null
            ? ""
            : formatNumber(initialValue, {
                minimumFractionDigits: numberOpts?.decimals,
                maximumFractionDigits: numberOpts?.decimals,
              })}
        </span>
      )}
    </DataGridCellWrapper>
  )
}

export function UrlCell<TData>(props: DataGridCellProps<TData>) {
  const {
    cell,
    tableMeta,
    rowIndex,
    columnId,
    rowHeight,
    isEditing,
    isFocused,
    isSelected,
    readOnly,
  } = props
  const initialValue = (cell.getValue() as string) ?? ""
  const [value, setValue] = React.useState(initialValue)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const prevInitialRef = React.useRef(initialValue)
  if (initialValue !== prevInitialRef.current) {
    prevInitialRef.current = initialValue
    setValue(initialValue)
  }

  React.useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  const commit = React.useCallback(() => {
    const trimmed = value.trim()
    if (!readOnly && trimmed !== initialValue) {
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: trimmed || null })
    }
    tableMeta?.onCellEditingStop?.()
  }, [tableMeta, rowIndex, columnId, value, initialValue, readOnly])

  const href = !isEditing && value ? getUrlHref(value) : ""
  const isDangerous = !isEditing && value && !href

  return (
    <DataGridCellWrapper<TData>
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={isEditing}
      isFocused={isFocused}
      isSelected={isSelected}
      readOnly={readOnly}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={value}
          className="size-full border-none bg-transparent p-0 outline-none"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault()
              commit()
            } else if (e.key === "Escape") {
              e.preventDefault()
              setValue(initialValue)
              tableMeta?.onCellEditingStop?.()
            }
          }}
        />
      ) : value ? (
        <a
          data-slot="data-grid-cell-content"
          href={isDangerous ? undefined : href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "truncate text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary/60",
            isDangerous &&
              "cursor-not-allowed text-destructive decoration-destructive/40",
          )}
          onClick={(e) => {
            if (isDangerous) {
              e.preventDefault()
              tableMeta?.onError?.("URL contains a dangerous protocol")
              return
            }
            e.stopPropagation()
          }}
        >
          {value}
        </a>
      ) : (
        <span data-slot="data-grid-cell-content" />
      )}
    </DataGridCellWrapper>
  )
}

export function CheckboxCell<TData>(
  props: Omit<DataGridCellProps<TData>, "isEditing">,
) {
  const {
    cell,
    tableMeta,
    rowIndex,
    columnId,
    rowHeight,
    isFocused,
    isSelected,
    readOnly,
  } = props
  const initialValue = Boolean(cell.getValue())
  const [value, setValue] = React.useState(initialValue)

  const prevInitialRef = React.useRef(initialValue)
  if (initialValue !== prevInitialRef.current) {
    prevInitialRef.current = initialValue
    setValue(initialValue)
  }

  const onCheckedChange = React.useCallback(
    (checked: boolean) => {
      if (readOnly) return
      setValue(checked)
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: checked })
    },
    [tableMeta, rowIndex, columnId, readOnly],
  )

  return (
    <DataGridCellWrapper<TData>
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={false}
      isFocused={isFocused}
      isSelected={isSelected}
      readOnly={readOnly}
      className="flex size-full justify-center"
      onKeyDown={(e) => {
        if (isFocused && !readOnly && (e.key === " " || e.key === "Enter")) {
          e.preventDefault()
          e.stopPropagation()
          onCheckedChange(!value)
        }
      }}
    >
      <Checkbox
        checked={value}
        disabled={readOnly}
        onCheckedChange={(c) => onCheckedChange(Boolean(c))}
        onClick={(e) => e.stopPropagation()}
      />
    </DataGridCellWrapper>
  )
}

export function SelectCell<TData>(props: DataGridCellProps<TData>) {
  const {
    cell,
    tableMeta,
    rowIndex,
    columnId,
    rowHeight,
    isEditing,
    isFocused,
    isSelected,
    readOnly,
  } = props
  const initialValue = (cell.getValue() as string) ?? ""
  const [value, setValue] = React.useState(initialValue)
  const opts = cell.column.columnDef.meta?.cell
  const options = opts?.variant === "select" ? opts.options : []

  const prevInitialRef = React.useRef(initialValue)
  if (initialValue !== prevInitialRef.current) {
    prevInitialRef.current = initialValue
    setValue(initialValue)
  }

  const onValueChange = React.useCallback(
    (next: string) => {
      if (readOnly) return
      setValue(next)
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: next })
      tableMeta?.onCellEditingStop?.()
    },
    [tableMeta, rowIndex, columnId, readOnly],
  )

  const onOpenChange = React.useCallback(
    (open: boolean) => {
      if (open && !readOnly) tableMeta?.onCellEditingStart?.(rowIndex, columnId)
      else tableMeta?.onCellEditingStop?.()
    },
    [tableMeta, rowIndex, columnId, readOnly],
  )

  const label = options.find((o) => o.value === value)?.label ?? value

  return (
    <DataGridCellWrapper<TData>
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={isEditing}
      isFocused={isFocused}
      isSelected={isSelected}
      readOnly={readOnly}
    >
      {isEditing ? (
        <Select
          value={value}
          onValueChange={onValueChange}
          open
          onOpenChange={onOpenChange}
        >
          <SelectTrigger
            size="sm"
            className="size-full border-none p-0 shadow-none focus-visible:ring-0 [&_svg]:hidden"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent data-grid-cell-editor="" align="start">
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : label ? (
        <Badge
          data-slot="data-grid-cell-content"
          variant="secondary"
          className="px-1.5 py-px"
        >
          {label}
        </Badge>
      ) : (
        <span data-slot="data-grid-cell-content" />
      )}
    </DataGridCellWrapper>
  )
}

export function MultiSelectCell<TData>(props: DataGridCellProps<TData>) {
  const {
    cell,
    tableMeta,
    rowIndex,
    columnId,
    rowHeight,
    isEditing,
    isFocused,
    isSelected,
    readOnly,
  } = props
  const initial = React.useMemo(
    () => (cell.getValue() as string[]) ?? [],
    [cell],
  )
  const [selected, setSelected] = React.useState<string[]>(initial)
  const [search, setSearch] = React.useState("")
  const opts = cell.column.columnDef.meta?.cell
  const options = opts?.variant === "multi-select" ? opts.options : []

  const prevInitialRef = React.useRef(initial)
  if (initial !== prevInitialRef.current) {
    prevInitialRef.current = initial
    setSelected(initial)
  }

  const toggle = React.useCallback(
    (val: string) => {
      if (readOnly) return
      const next = selected.includes(val)
        ? selected.filter((v) => v !== val)
        : [...selected, val]
      setSelected(next)
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: next })
      setSearch("")
    },
    [readOnly, selected, tableMeta, rowIndex, columnId],
  )

  const clear = React.useCallback(() => {
    if (readOnly) return
    setSelected([])
    tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: [] })
  }, [readOnly, tableMeta, rowIndex, columnId])

  const onOpenChange = React.useCallback(
    (open: boolean) => {
      if (open && !readOnly) tableMeta?.onCellEditingStart?.(rowIndex, columnId)
      else {
        setSearch("")
        tableMeta?.onCellEditingStop?.()
      }
    },
    [tableMeta, rowIndex, columnId, readOnly],
  )

  const selectedSet = new Set(selected)
  const labels = selected.map(
    (v) => options.find((o) => o.value === v)?.label ?? v,
  )

  return (
    <Popover open={isEditing} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <DataGridCellWrapper<TData>
          tableMeta={tableMeta}
          rowIndex={rowIndex}
          columnId={columnId}
          rowHeight={rowHeight}
          isEditing={isEditing}
          isFocused={isFocused}
          isSelected={isSelected}
          readOnly={readOnly}
        >
          {labels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 overflow-hidden">
              {labels.map((label, i) => (
                <Badge
                  key={selected[i]}
                  variant="secondary"
                  className="px-1.5 py-px"
                  data-slot="data-grid-cell-content"
                >
                  {label}
                </Badge>
              ))}
            </div>
          ) : (
            <span data-slot="data-grid-cell-content" />
          )}
        </DataGridCellWrapper>
      </PopoverAnchor>
      <PopoverContent
        data-grid-cell-editor=""
        align="start"
        className="w-[280px] p-0"
      >
        <Command>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search..."
          />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isOn = selectedSet.has(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                  >
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded-sm border border-primary",
                        isOn
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Check className="size-3" />
                    </div>
                    <span>{option.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={clear}
                    className="justify-center text-muted-foreground"
                  >
                    Clear all
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function DateCell<TData>(props: DataGridCellProps<TData>) {
  const {
    cell,
    tableMeta,
    rowIndex,
    columnId,
    rowHeight,
    isEditing,
    isFocused,
    isSelected,
    readOnly,
  } = props
  const initialValue = (cell.getValue() as string) ?? ""
  const [value, setValue] = React.useState(initialValue)

  const prevInitialRef = React.useRef(initialValue)
  if (initialValue !== prevInitialRef.current) {
    prevInitialRef.current = initialValue
    setValue(initialValue)
  }

  const selectedDate = value ? (parseLocalDate(value) ?? undefined) : undefined

  const onSelect = React.useCallback(
    (date: Date | undefined) => {
      if (!date || readOnly) return
      const formatted = formatDateToString(date)
      setValue(formatted)
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: formatted })
      tableMeta?.onCellEditingStop?.()
    },
    [readOnly, tableMeta, rowIndex, columnId],
  )

  const onOpenChange = React.useCallback(
    (open: boolean) => {
      if (open && !readOnly) tableMeta?.onCellEditingStart?.(rowIndex, columnId)
      else tableMeta?.onCellEditingStop?.()
    },
    [tableMeta, rowIndex, columnId, readOnly],
  )

  return (
    <Popover open={isEditing} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <DataGridCellWrapper<TData>
          tableMeta={tableMeta}
          rowIndex={rowIndex}
          columnId={columnId}
          rowHeight={rowHeight}
          isEditing={isEditing}
          isFocused={isFocused}
          isSelected={isSelected}
          readOnly={readOnly}
        >
          <span data-slot="data-grid-cell-content">
            {formatDateForDisplay(value)}
          </span>
        </DataGridCellWrapper>
      </PopoverAnchor>
      <PopoverContent
        data-grid-cell-editor=""
        align="start"
        className="w-auto p-0"
      >
        <Calendar
          autoFocus
          mode="single"
          captionLayout="dropdown"
          defaultMonth={selectedDate ?? new Date()}
          selected={selectedDate}
          onSelect={onSelect}
        />
      </PopoverContent>
    </Popover>
  )
}

export function FileCell<TData>(props: DataGridCellProps<TData>) {
  const {
    cell,
    tableMeta,
    rowIndex,
    columnId,
    rowHeight,
    isEditing,
    isFocused,
    isSelected,
    readOnly,
  } = props
  const initial = React.useMemo(
    () => (cell.getValue() as FileCellData[]) ?? [],
    [cell],
  )
  const [files, setFiles] = React.useState<FileCellData[]>(initial)
  const opts = cell.column.columnDef.meta?.cell
  const fileOpts = opts?.variant === "file" ? opts : null
  const maxFileSize = fileOpts?.maxFileSize ?? 10 * 1024 * 1024
  const maxFiles = fileOpts?.maxFiles ?? 10
  const accept = fileOpts?.accept
  const multiple = fileOpts?.multiple ?? true
  const inputRef = React.useRef<HTMLInputElement>(null)

  const prevInitialRef = React.useRef(initial)
  if (initial !== prevInitialRef.current) {
    prevInitialRef.current = initial
    setFiles(initial)
  }

  const addFiles = React.useCallback(
    (incoming: File[]) => {
      if (readOnly) return
      if (files.length + incoming.length > maxFiles) {
        tableMeta?.onError?.(`Maximum ${maxFiles} files allowed`)
        return
      }
      const accepted: FileCellData[] = []
      for (const file of incoming) {
        if (file.size > maxFileSize) {
          tableMeta?.onError?.(
            `${file.name} exceeds ${formatFileSize(maxFileSize)}`,
          )
          continue
        }
        accepted.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          name: file.name,
          size: file.size,
          type: file.type,
        })
      }
      const next = [...files, ...accepted]
      setFiles(next)
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: next })
    },
    [files, maxFiles, maxFileSize, readOnly, tableMeta, rowIndex, columnId],
  )

  const removeFile = React.useCallback(
    (id: string) => {
      if (readOnly) return
      const next = files.filter((f) => f.id !== id)
      setFiles(next)
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: next })
    },
    [files, readOnly, tableMeta, rowIndex, columnId],
  )

  const onOpenChange = React.useCallback(
    (open: boolean) => {
      if (open && !readOnly) tableMeta?.onCellEditingStart?.(rowIndex, columnId)
      else tableMeta?.onCellEditingStop?.()
    },
    [tableMeta, rowIndex, columnId, readOnly],
  )

  return (
    <Popover open={isEditing} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <DataGridCellWrapper<TData>
          tableMeta={tableMeta}
          rowIndex={rowIndex}
          columnId={columnId}
          rowHeight={rowHeight}
          isEditing={isEditing}
          isFocused={isFocused}
          isSelected={isSelected}
          readOnly={readOnly}
        >
          {files.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 overflow-hidden">
              {files.map((file) => {
                const FileIconComp = getFileIcon(file.type)
                return (
                  <Badge
                    key={file.id}
                    variant="secondary"
                    className="gap-1 px-1.5 py-px"
                    data-slot="data-grid-cell-content"
                  >
                    <FileIconComp className="size-3 shrink-0" />
                    <span className="max-w-[100px] truncate">{file.name}</span>
                  </Badge>
                )
              })}
            </div>
          ) : (
            <span data-slot="data-grid-cell-content" />
          )}
        </DataGridCellWrapper>
      </PopoverAnchor>
      <PopoverContent
        data-grid-cell-editor=""
        align="start"
        className="w-[360px] p-3"
      >
        <div className="flex flex-col gap-2">
          <div
            role="button"
            tabIndex={0}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-sm hover:bg-accent/30"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
          >
            <Upload className="size-6 text-muted-foreground" />
            <p className="font-medium">Drag files here or click to browse</p>
            <p className="text-xs text-muted-foreground">
              Max size {formatFileSize(maxFileSize)} - Max {maxFiles} files
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple={multiple}
            accept={accept}
            className="sr-only"
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? [])
              if (selected.length > 0) addFiles(selected)
              e.target.value = ""
            }}
          />
          {files.length > 0 && (
            <div className="flex max-h-[180px] flex-col gap-1 overflow-y-auto">
              {files.map((file) => {
                const FileIconComp = getFileIcon(file.type)
                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1.5"
                  >
                    <FileIconComp className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-sm">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5"
                      onClick={() => removeFile(file.id)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Unused but kept available for callers that prefer the explicit Input primitive
export { Input as DataGridCellInput }
