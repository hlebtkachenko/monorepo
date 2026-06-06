import { describe, it, expect } from "vitest"
import { renderMessage, buildKeyboard } from "./format.js"

describe("renderMessage", () => {
  it("plain text passes through", () => {
    expect(renderMessage({ text: "hello" })).toBe("hello")
  })

  it("prefixes a level emoji", () => {
    expect(renderMessage({ text: "down", level: "error" })).toBe("🔴 down")
  })

  it("appends a source tag", () => {
    expect(
      renderMessage({ text: "built", level: "success", source: "ci" }),
    ).toBe("✅ built <i>[ci]</i>")
  })

  it("escapes HTML in user content", () => {
    expect(renderMessage({ text: "<b>x</b> & y" })).toBe(
      "&lt;b&gt;x&lt;/b&gt; &amp; y",
    )
  })
})

describe("buildKeyboard", () => {
  it("undefined when no buttons", () => {
    expect(buildKeyboard()).toBeUndefined()
    expect(buildKeyboard([])).toBeUndefined()
  })

  it("builds inline buttons where label == callback data", () => {
    const kb = buildKeyboard(["Yes", "No"])
    expect(kb?.inline_keyboard[0]).toEqual([
      { text: "Yes", callback_data: "Yes" },
      { text: "No", callback_data: "No" },
    ])
  })
})
