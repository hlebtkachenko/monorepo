import { describe, it, expect } from "vitest"
import {
  renderMessage,
  buildKeyboard,
  buildAskKeyboard,
  buildEnvPicker,
  buildButtons,
} from "./format.js"

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

describe("buildAskKeyboard", () => {
  it("options only by default", () => {
    const kb = buildAskKeyboard("id1", ["Yes", "No"])
    const flat = kb.inline_keyboard
      .flat()
      .map((b) => (b as { text: string }).text)
    expect(flat).toEqual(["Yes", "No"])
  })
  it("appends a ✍️ Other button when allowCustom", () => {
    const kb = buildAskKeyboard("id1", ["Yes", "No"], true)
    const last = kb.inline_keyboard.flat().at(-1) as {
      text: string
      callback_data: string
    }
    expect(last.text).toMatch(/Other/)
    expect(last.callback_data).toBe("txt:id1")
  })
})

describe("buildEnvPicker", () => {
  it("emits staging + production with the given prefix", () => {
    const kb = buildEnvPicker("dep")
    expect(kb.inline_keyboard[0]).toEqual([
      { text: "🟡 staging", callback_data: "dep:staging" },
      { text: "🔴 production", callback_data: "dep:production" },
    ])
  })
})

describe("buildButtons", () => {
  it("renders callback + url buttons across rows", () => {
    const kb = buildButtons([
      [{ text: "Open", url: "https://x" }],
      [{ text: "Go", data: "log:1" }],
    ])
    expect(kb.inline_keyboard[0]).toEqual([{ text: "Open", url: "https://x" }])
    expect(kb.inline_keyboard[1]).toEqual([
      { text: "Go", callback_data: "log:1" },
    ])
  })
})
