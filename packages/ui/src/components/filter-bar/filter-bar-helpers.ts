import { isBefore } from "date-fns"
import type { Column, ColumnOption } from "./filter-bar-types"

/* ----------------------------- array helpers ----------------------------- */

export function intersection<T>(a: T[], b: T[]): T[] {
  return a.filter((x) => b.includes(x))
}

function deepHash(
  value: unknown,
  cache = new WeakMap<object, string>(),
): string {
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  const type = typeof value
  if (type === "number" || type === "boolean" || type === "string") {
    return `${type}:${String(value)}`
  }
  if (type === "function") {
    return `function:${(value as () => unknown).toString()}`
  }
  if (type === "object") {
    const obj = value as object
    if (cache.has(obj)) {
      return cache.get(obj) as string
    }
    let hash: string
    if (Array.isArray(obj)) {
      hash = `array:[${obj.map((v) => deepHash(v, cache)).join(",")}]`
    } else {
      const record = obj as Record<string, unknown>
      const keys = Object.keys(record).sort()
      const props = keys
        .map((k) => `${k}:${deepHash(record[k], cache)}`)
        .join(",")
      hash = `object:{${props}}`
    }
    cache.set(obj, hash)
    return hash
  }
  return `${type}:${String(value)}`
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null || a === undefined || b === undefined)
    return false

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  if (typeof a === "object") {
    if (typeof b !== "object") return false
    const aRec = a as Record<string, unknown>
    const bRec = b as Record<string, unknown>
    const aKeys = Object.keys(aRec).sort()
    const bKeys = Object.keys(bRec).sort()
    if (aKeys.length !== bKeys.length) return false
    for (let i = 0; i < aKeys.length; i++) {
      if (aKeys[i] !== bKeys[i]) return false
      if (!deepEqual(aRec[aKeys[i]!]!, bRec[bKeys[i]!]!)) return false
    }
    return true
  }

  return false
}

export function uniq<T>(arr: T[]): T[] {
  const seen = new Map<string, T[]>()
  const result: T[] = []

  for (const item of arr) {
    const hash = deepHash(item)
    if (seen.has(hash)) {
      const itemsWithHash = seen.get(hash) as T[]
      let duplicateFound = false
      for (const existing of itemsWithHash) {
        if (deepEqual(existing, item)) {
          duplicateFound = true
          break
        }
      }
      if (!duplicateFound) {
        itemsWithHash.push(item)
        result.push(item)
      }
    } else {
      seen.set(hash, [item])
      result.push(item)
    }
  }

  return result
}

export function take<T>(a: T[], n: number): T[] {
  return a.slice(0, n)
}

export function addUniq<T>(arr: T[], values: T[]): T[] {
  return uniq([...arr, ...values])
}

export function removeUniq<T>(arr: T[], values: T[]): T[] {
  return arr.filter((v) => !values.includes(v))
}

export function isAnyOf<T>(value: T, values: T[]): boolean {
  return values.includes(value)
}

/* -------------------------------- memo ----------------------------------- */

export function memo<TDeps extends readonly unknown[], TResult>(
  getDeps: () => TDeps,
  compute: (deps: TDeps) => TResult,
  _options: { key: string },
): () => TResult {
  let prevDeps: TDeps | undefined
  let cachedResult: TResult | undefined

  return () => {
    const deps = getDeps()
    if (!prevDeps || !shallowEqual(prevDeps, deps)) {
      cachedResult = compute(deps)
      prevDeps = deps
    }
    return cachedResult as TResult
  }
}

function shallowEqual<T>(arr1: readonly T[], arr2: readonly T[]): boolean {
  if (arr1 === arr2) return true
  if (arr1.length !== arr2.length) return false
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false
  }
  return true
}

/* ------------------------------ debounce --------------------------------- */

type ControlFunctions = {
  cancel: () => void
  flush: () => void
  isPending: () => boolean
}

type DebounceOptions = {
  leading?: boolean
  trailing?: boolean
  maxWait?: number
}

export function debounce<TArgs extends unknown[], TRet>(
  func: (...args: TArgs) => TRet,
  wait: number,
  options: DebounceOptions = {},
): ((...args: TArgs) => TRet | undefined) & ControlFunctions {
  const { leading = false, trailing = true, maxWait } = options
  let timeout: ReturnType<typeof setTimeout> | null = null
  let lastArgs: TArgs | null = null
  let lastThis: unknown = undefined
  let result: TRet | undefined
  let lastCallTime: number | null = null
  let lastInvokeTime = 0

  const maxWaitTime = maxWait !== undefined ? Math.max(wait, maxWait) : null

  function invokeFunc(time: number): TRet | undefined {
    if (lastArgs === null) return undefined
    const args = lastArgs
    const thisArg = lastThis
    lastArgs = null
    lastThis = undefined
    lastInvokeTime = time
    result = func.apply(thisArg, args)
    return result
  }

  function shouldInvoke(time: number): boolean {
    if (lastCallTime === null) return false
    const timeSinceLastCall = time - lastCallTime
    const timeSinceLastInvoke = time - lastInvokeTime
    return (
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0 ||
      (maxWaitTime !== null && timeSinceLastInvoke >= maxWaitTime)
    )
  }

  function startTimer(pendingFunc: () => void, waitTime: number) {
    return setTimeout(pendingFunc, waitTime)
  }

  function remainingWait(time: number): number {
    if (lastCallTime === null) return wait
    const timeSinceLastCall = time - lastCallTime
    const timeSinceLastInvoke = time - lastInvokeTime
    const timeWaiting = wait - timeSinceLastCall
    return maxWaitTime !== null
      ? Math.min(timeWaiting, maxWaitTime - timeSinceLastInvoke)
      : timeWaiting
  }

  function timerExpired() {
    const time = Date.now()
    if (shouldInvoke(time)) {
      return trailingEdge(time)
    }
    timeout = startTimer(timerExpired, remainingWait(time))
  }

  function leadingEdge(time: number): TRet | undefined {
    lastInvokeTime = time
    timeout = startTimer(timerExpired, wait)
    return leading ? invokeFunc(time) : undefined
  }

  function trailingEdge(time: number): TRet | undefined {
    timeout = null
    if (trailing && lastArgs) {
      return invokeFunc(time)
    }
    lastArgs = null
    lastThis = undefined
    return result
  }

  function debounced(this: unknown, ...args: TArgs): TRet | undefined {
    const time = Date.now()
    const isInvoking = shouldInvoke(time)

    lastArgs = args
    lastThis = this
    lastCallTime = time

    if (isInvoking) {
      if (timeout === null) {
        return leadingEdge(lastCallTime)
      }
      if (maxWaitTime !== null) {
        timeout = startTimer(timerExpired, wait)
        return invokeFunc(lastCallTime)
      }
    }
    if (timeout === null) {
      timeout = startTimer(timerExpired, wait)
    }
    return result
  }

  debounced.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout)
    }
    lastInvokeTime = 0
    lastArgs = null
    lastThis = undefined
    lastCallTime = null
    timeout = null
  }

  debounced.flush = () => {
    return timeout === null ? result : trailingEdge(Date.now())
  }

  debounced.isPending = () => {
    return timeout !== null
  }

  return debounced
}

/* ----------------------------- value helpers ----------------------------- */

export function getColumn<TData>(columns: Column<TData>[], id: string) {
  const column = columns.find((c) => c.id === id)
  if (!column) {
    throw new Error(`Column with id ${id} not found`)
  }
  return column
}

export function createNumberFilterValue(
  values: number[] | undefined,
): number[] {
  if (!values || values.length === 0) return []
  if (values.length === 1) return [values[0]!]
  if (values.length === 2) return createNumberRange(values)
  return [values[0]!, values[1]!]
}

export function createDateFilterValue(
  values: [Date, Date] | [Date] | [] | undefined,
): Date[] {
  if (!values || values.length === 0) return []
  if (values.length === 1) return [values[0]!]
  if (values.length === 2) return createDateRange(values)
  throw new Error("Cannot create date filter value from more than 2 values")
}

export function createDateRange(values: [Date, Date]): Date[] {
  const [a, b] = values
  const [min, max] = isBefore(a, b) ? [a, b] : [b, a]
  return [min, max]
}

export function createNumberRange(values: number[] | undefined): number[] {
  let a = 0
  let b = 0
  if (!values || values.length === 0) return [a, b]
  if (values.length === 1) {
    a = values[0]!
  } else {
    a = values[0]!
    b = values[1]!
  }
  const [min, max] = a < b ? [a, b] : [b, a]
  return [min, max]
}

export function isColumnOption(value: unknown): value is ColumnOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "label" in value
  )
}

export function isColumnOptionArray(value: unknown): value is ColumnOption[] {
  return Array.isArray(value) && value.every(isColumnOption)
}

export function isColumnOptionMap(
  value: unknown,
): value is Map<string, number> {
  if (!(value instanceof Map)) return false
  for (const key of value.keys()) {
    if (typeof key !== "string") return false
  }
  for (const val of value.values()) {
    if (typeof val !== "number") return false
  }
  return true
}

export function isMinMaxTuple(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  )
}
