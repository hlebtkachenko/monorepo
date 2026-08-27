import { describe, expect, it } from "vitest"

import {
  EMPTY_ADD_ACCOUNT_FORM,
  isAddFormValid,
  toAddAccountInput,
  validateAddForm,
  type AddAccountForm,
} from "./chart-of-accounts-add"

const base: AddAccountForm = {
  ...EMPTY_ADD_ACCOUNT_FORM,
  number: "311",
  name: "Odběratelé",
  nature: "ASSET",
}

describe("validateAddForm", () => {
  it("accepts a synthetic and an analytical number", () => {
    expect(validateAddForm(base)).toEqual({})
    expect(validateAddForm({ ...base, number: "311.001" })).toEqual({})
  })

  it("flags a malformed number", () => {
    expect(validateAddForm({ ...base, number: "31" }).number).toBe(true)
    expect(validateAddForm({ ...base, number: "3111" }).number).toBe(true)
    expect(validateAddForm({ ...base, number: "abc" }).number).toBe(true)
    expect(validateAddForm({ ...base, number: "" }).number).toBe(true)
  })

  it("flags a blank name and an unchosen nature", () => {
    expect(validateAddForm({ ...base, name: "   " }).name).toBe(true)
    expect(validateAddForm({ ...base, nature: "" }).nature).toBe(true)
  })

  it("isAddFormValid mirrors validateAddForm", () => {
    expect(isAddFormValid(base)).toBe(true)
    expect(isAddFormValid({ ...base, number: "x" })).toBe(false)
  })
})

describe("toAddAccountInput", () => {
  it("maps a full form, trimming and narrowing selects", () => {
    expect(
      toAddAccountInput({
        parentId: "syn-1",
        number: " 311.001 ",
        name: "  Odběratelé tuzemsko  ",
        nature: "ASSET",
        normalBalance: "DEBIT",
        tracksOpenItems: "yes",
        taxRelevant: "yes",
      }),
    ).toEqual({
      parentId: "syn-1",
      number: "311.001",
      name: "Odběratelé tuzemsko",
      nature: "ASSET",
      normalBalance: "DEBIT",
      tracksOpenItems: true,
      taxRelevant: true,
    })
  })

  it("drops empty parent + normalBalance and clears tax to null (F3)", () => {
    expect(toAddAccountInput(base)).toEqual({
      parentId: null,
      number: "311",
      name: "Odběratelé",
      nature: "ASSET",
      normalBalance: undefined,
      tracksOpenItems: false,
      taxRelevant: null,
    })
  })

  it("maps taxRelevant no → false, yes → true, none → null", () => {
    expect(toAddAccountInput({ ...base, taxRelevant: "no" }).taxRelevant).toBe(
      false,
    )
    expect(toAddAccountInput({ ...base, taxRelevant: "yes" }).taxRelevant).toBe(
      true,
    )
    expect(
      toAddAccountInput({ ...base, taxRelevant: "none" }).taxRelevant,
    ).toBeNull()
  })

  it("throws on an invalid form (nature missing)", () => {
    expect(() => toAddAccountInput({ ...base, nature: "" })).toThrow(/nature/)
  })
})
