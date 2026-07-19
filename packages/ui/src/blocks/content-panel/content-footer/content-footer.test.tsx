import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { ContentFooter } from "./content-footer"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

describe("ContentFooter — selection", () => {
  it("renders the actions and a clear-selection control when count > 0", async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    const onMatch = vi.fn()

    wrap(
      <ContentFooter
        selection={{
          count: 2,
          onClear,
          actions: [{ id: "match", label: "Match", onSelect: onMatch }],
        }}
      />,
    )

    expect(screen.getByText("2 selected")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Clear selection" }))
    expect(onClear).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Match" }))
    expect(onMatch).toHaveBeenCalledTimes(1)
  })

  it("renders a segmented action group as inline buttons (no dropdown)", async () => {
    const user = userEvent.setup()
    const onClipboard = vi.fn()
    const onCsv = vi.fn()

    wrap(
      <ContentFooter
        selection={{
          count: 2,
          onClear: () => {},
          actions: [
            {
              id: "export",
              label: "Export",
              group: [
                {
                  id: "clipboard",
                  label: "Copy to clipboard",
                  onSelect: onClipboard,
                },
                { id: "csv", label: "Export as CSV", onSelect: onCsv },
              ],
            },
          ],
        }}
      />,
    )

    // Both buttons are visible inline — no dropdown trigger to open first.
    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }))
    await user.click(screen.getByRole("button", { name: "Export as CSV" }))
    expect(onClipboard).toHaveBeenCalledTimes(1)
    expect(onCsv).toHaveBeenCalledTimes(1)
  })

  it("renders nothing when the selection count is 0", () => {
    const { container } = wrap(
      <ContentFooter
        selection={{
          count: 0,
          onClear: () => {},
          actions: [{ id: "match", label: "Match", onSelect: () => {} }],
        }}
      />,
    )
    expect(container.querySelector('[data-slot="content-footer"]')).toBeNull()
  })
})

describe("ContentFooter — save", () => {
  it("renders Discard + Save when dirty, firing their callbacks", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onDiscard = vi.fn()

    wrap(<ContentFooter save={{ dirty: true, onSave, onDiscard }} />)

    const discard = screen.getByRole("button", { name: "Discard" })
    const save = screen.getByRole("button", { name: "Save changes" })
    expect(discard).toHaveAttribute("type", "button")
    expect(save).toHaveAttribute("type", "button")

    await user.click(discard)
    expect(onDiscard).toHaveBeenCalledTimes(1)

    await user.click(save)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it("shows the saving label and disables both buttons while saving", () => {
    wrap(
      <ContentFooter
        save={{
          dirty: true,
          saving: true,
          onSave: () => {},
          onDiscard: () => {},
        }}
      />,
    )
    expect(screen.getByText("Saving…")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled()
  })

  it("renders nothing when the record is not dirty", () => {
    const { container } = wrap(
      <ContentFooter
        save={{ dirty: false, onSave: () => {}, onDiscard: () => {} }}
      />,
    )
    expect(container.querySelector('[data-slot="content-footer"]')).toBeNull()
  })

  it("keeps a persistent page link visible when the record is clean", () => {
    wrap(
      <ContentFooter
        save={{
          dirty: false,
          onSave: () => {},
          onDiscard: () => {},
          persistentLink: { label: "Profile history", href: "/history" },
        }}
      />,
    )
    expect(
      screen.getByRole("link", { name: "Profile history" }),
    ).toHaveAttribute("href", "/history")
  })

  it("runs a persistent local action when the record is clean", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    wrap(
      <ContentFooter
        save={{
          dirty: false,
          onSave: () => {},
          onDiscard: () => {},
          persistentAction: { label: "Profile history", onSelect },
        }}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Profile history" }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

describe("ContentFooter — mutual exclusion", () => {
  it("throws in dev when both selection and save are passed", () => {
    expect(() =>
      wrap(
        <ContentFooter
          selection={{ count: 1, onClear: () => {}, actions: [] }}
          save={{ dirty: true, onSave: () => {}, onDiscard: () => {} }}
        />,
      ),
    ).toThrow(/either .selection. or .save./)
  })
})
