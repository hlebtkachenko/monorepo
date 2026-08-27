/**
 * `restoreDefaultsFrom` — the pure DOM-restamping half of
 * `usePreserveFormValues` (`usePreserveFormValues` itself is a thin
 * `useCallback` wrapper with no logic of its own worth a hook-rendering
 * test). Driven against plain mock elements — see the export's own doc
 * comment for why `instanceof HTMLInputElement` is not used here.
 */
import { describe, expect, it } from "vitest"

import { restoreDefaultsFrom } from "./preserve-form-values"

type MockInput = {
  tagName: "INPUT"
  type: string
  name: string
  value: string
  defaultValue: string
  defaultChecked: boolean
}

type MockTextarea = {
  tagName: "TEXTAREA"
  name: string
  defaultValue: string
}

type MockOption = { value: string; defaultSelected: boolean }

type MockSelect = {
  tagName: "SELECT"
  name: string
  options: MockOption[]
}

type MockNoName = { tagName: "INPUT"; type: "text" }

function input(overrides: Partial<MockInput> & { name: string }): MockInput {
  return {
    tagName: "INPUT",
    type: "text",
    value: "",
    defaultValue: "",
    defaultChecked: false,
    ...overrides,
  }
}

function fd(entries: Array<[string, string]>): FormData {
  const data = new FormData()
  for (const [key, value] of entries) data.append(key, value)
  return data
}

/** Builds a `form.elements`-shaped iterable from a plain array. */
function elementsOf(items: readonly unknown[]): HTMLFormElement["elements"] {
  return items as unknown as HTMLFormElement["elements"]
}

describe("restoreDefaultsFrom", () => {
  it("re-stamps a text input's defaultValue with what was submitted", () => {
    const institution = input({ name: "institution", defaultValue: "" })
    const form = { elements: elementsOf([institution]) } as HTMLFormElement

    restoreDefaultsFrom(form, fd([["institution", "Česká spořitelna"]]))

    expect(institution.defaultValue).toBe("Česká spořitelna")
  })

  it("blanks a text input's defaultValue when the field was not submitted", () => {
    const noteClient = input({ name: "noteClient", defaultValue: "stale" })
    const form = { elements: elementsOf([noteClient]) } as HTMLFormElement

    restoreDefaultsFrom(form, fd([["institution", "X"]]))

    expect(noteClient.defaultValue).toBe("")
  })

  it("re-stamps a checkbox's defaultChecked from the submitted value", () => {
    const isMinor = input({
      name: "isMinor",
      type: "checkbox",
      value: "on",
      defaultChecked: false,
    })
    const form = { elements: elementsOf([isMinor]) } as HTMLFormElement

    restoreDefaultsFrom(form, fd([["isMinor", "on"]]))
    expect(isMinor.defaultChecked).toBe(true)

    restoreDefaultsFrom(form, fd([]))
    expect(isMinor.defaultChecked).toBe(false)
  })

  it("re-stamps a radio group so only the submitted option stays checked", () => {
    const loan = input({
      name: "loanKind",
      type: "radio",
      value: "loan",
      defaultChecked: true,
    })
    const lease = input({
      name: "loanKind",
      type: "radio",
      value: "lease",
      defaultChecked: false,
    })
    const form = { elements: elementsOf([loan, lease]) } as HTMLFormElement

    restoreDefaultsFrom(form, fd([["loanKind", "lease"]]))

    expect(loan.defaultChecked).toBe(false)
    expect(lease.defaultChecked).toBe(true)
  })

  it("re-stamps a textarea's defaultValue", () => {
    const note: MockTextarea = {
      tagName: "TEXTAREA",
      name: "noteClient",
      defaultValue: "",
    }
    const form = { elements: elementsOf([note]) } as HTMLFormElement

    restoreDefaultsFrom(form, fd([["noteClient", "Splátky odloženy"]]))

    expect(note.defaultValue).toBe("Splátky odloženy")
  })

  it("re-stamps a select so only the submitted option stays defaultSelected", () => {
    const machine: MockOption = { value: "machine", defaultSelected: true }
    const vehicle: MockOption = { value: "vehicle", defaultSelected: false }
    const category: MockSelect = {
      tagName: "SELECT",
      name: "category",
      options: [machine, vehicle],
    }
    const form = { elements: elementsOf([category]) } as HTMLFormElement

    restoreDefaultsFrom(form, fd([["category", "vehicle"]]))

    expect(machine.defaultSelected).toBe(false)
    expect(vehicle.defaultSelected).toBe(true)
  })

  it("skips an element with no name — a hidden hasNoName-shaped node never crashes the walk", () => {
    const anonymous: MockNoName = { tagName: "INPUT", type: "text" }
    const named = input({ name: "institution", defaultValue: "" })
    const form = {
      elements: elementsOf([anonymous, named]),
    } as HTMLFormElement

    expect(() =>
      restoreDefaultsFrom(form, fd([["institution", "X"]])),
    ).not.toThrow()
    expect(named.defaultValue).toBe("X")
  })
})
