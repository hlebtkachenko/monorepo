/**
 * Karta společnosti's two composite fields (spec §2.1 item 5).
 *
 * Both are joins over optional parts, and the cases worth asserting are the
 * PARTIAL ones: a book part-way through its ARES prefill is the normal state of
 * a new client, and "printing a lone comma" or "/0800" is the failure mode.
 */
import { describe, expect, it } from "vitest"

import { formatBetaAddress, formatBetaBankAccount } from "./identity"

const address = (overrides: Partial<Parameters<typeof formatBetaAddress>[0]>) =>
  ({
    registeredStreet: null,
    registeredHouseNumber: null,
    registeredOrientationNumber: null,
    registeredCity: null,
    registeredPostalCode: null,
    ...overrides,
  }) as Parameters<typeof formatBetaAddress>[0]

const account = (
  overrides: Partial<Parameters<typeof formatBetaBankAccount>[0]>,
) =>
  ({
    bankAccountPrefix: null,
    bankAccountNumber: null,
    bankCode: null,
    iban: null,
    ...overrides,
  }) as Parameters<typeof formatBetaBankAccount>[0]

describe("formatBetaAddress", () => {
  it("renders a full sídlo in the Czech postal order", () => {
    expect(
      formatBetaAddress(
        address({
          registeredStreet: "Dlouhá",
          registeredHouseNumber: "123",
          registeredOrientationNumber: "45",
          registeredCity: "Praha 1",
          registeredPostalCode: "110 00",
        }),
      ),
    ).toBe("Dlouhá 123/45, 110 00 Praha 1")
  })

  it("drops the slash when there is no číslo orientační", () => {
    expect(
      formatBetaAddress(
        address({
          registeredStreet: "Dlouhá",
          registeredHouseNumber: "123",
          registeredCity: "Praha 1",
        }),
      ),
    ).toBe("Dlouhá 123, Praha 1")
  })

  it("renders the half it knows rather than nothing", () => {
    expect(formatBetaAddress(address({ registeredCity: "Brno" }))).toBe("Brno")
  })

  it("is null when nothing is known — never a lone comma", () => {
    expect(formatBetaAddress(address({}))).toBeNull()
  })
})

describe("formatBetaBankAccount", () => {
  it("renders prefix, number and bank code in the domestic form", () => {
    expect(
      formatBetaBankAccount(
        account({
          bankAccountPrefix: "19",
          bankAccountNumber: "2000145399",
          bankCode: "0800",
        }),
      ),
    ).toBe("19-2000145399/0800")
  })

  it("omits an absent prefix rather than printing a leading dash", () => {
    expect(
      formatBetaBankAccount(
        account({ bankAccountNumber: "2000145399", bankCode: "0800" }),
      ),
    ).toBe("2000145399/0800")
  })

  it("never prints a bare /bankcode when the number is missing", () => {
    // ARES fills the bank code before anyone types the account number.
    expect(formatBetaBankAccount(account({ bankCode: "0800" }))).toBeNull()
  })

  it("falls back to the IBAN, and only when there is no domestic account", () => {
    expect(
      formatBetaBankAccount(account({ iban: "CZ6508000000192000145399" })),
    ).toBe("CZ6508000000192000145399")

    expect(
      formatBetaBankAccount(
        account({
          bankAccountNumber: "2000145399",
          bankCode: "0800",
          iban: "CZ6508000000192000145399",
        }),
      ),
    ).toBe("2000145399/0800")
  })

  it("is null when neither form is known", () => {
    expect(formatBetaBankAccount(account({}))).toBeNull()
  })
})
