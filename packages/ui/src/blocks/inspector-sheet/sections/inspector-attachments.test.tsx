"use client"

import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import {
  InspectorAttachments,
  type InspectorAttachmentFile,
} from "./inspector-attachments"

const FILES: InspectorAttachmentFile[] = [
  { id: "1", name: "invoice.pdf", kind: "pdf", meta: "42 KB" },
  { id: "2", name: "receipt.jpg", kind: "image", meta: "128 KB" },
]

function renderAttachments(
  props: Partial<React.ComponentProps<typeof InspectorAttachments>> = {},
) {
  return render(
    <IconProvider>
      <InspectorAttachments title="Attachments" files={FILES} {...props} />
    </IconProvider>,
  )
}

describe("InspectorAttachments", () => {
  it("renders the section title, files, and meta", () => {
    renderAttachments()
    expect(screen.getByText("Attachments")).toBeInTheDocument()
    expect(screen.getByText("invoice.pdf")).toBeInTheDocument()
    expect(screen.getByText("42 KB")).toBeInTheDocument()
    expect(screen.getByText("receipt.jpg")).toBeInTheDocument()
  })

  it("always shows preview + download per row", () => {
    const onPreview = vi.fn()
    const onDownload = vi.fn()
    renderAttachments({ onPreview, onDownload })

    fireEvent.click(
      screen.getByRole("button", { name: "Download invoice.pdf" }),
    )
    expect(onDownload).toHaveBeenCalledWith("1")
  })

  it("shows the library dropzone and the link buttons", () => {
    renderAttachments()
    expect(screen.getByText("Drag and drop files here")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Browse files" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add link" })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Link existing" }),
    ).toBeInTheDocument()
  })

  it("opens a full-frame preview and returns (non-image → download fallback)", () => {
    const onPreview = vi.fn()
    renderAttachments({ onPreview })
    fireEvent.click(screen.getByRole("button", { name: "Preview invoice.pdf" }))
    expect(onPreview).toHaveBeenCalledWith("1")
    // A PDF cannot render inline under the app CSP → a download prompt.
    expect(
      screen.getByText("No inline preview — download to view"),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Back to attachments" }))
    expect(
      screen.queryByText("No inline preview — download to view"),
    ).not.toBeInTheDocument()
    expect(screen.getByText("receipt.jpg")).toBeInTheDocument()
  })

  it("renders an image preview inline from the resolved presigned URL", async () => {
    const onResolvePreview = vi
      .fn()
      .mockResolvedValue("https://s3.example/get?sig=1")
    renderAttachments({ onResolvePreview })
    fireEvent.click(screen.getByRole("button", { name: "Preview receipt.jpg" }))
    const img = await screen.findByRole("img", { name: "receipt.jpg" })
    expect(img).toHaveAttribute("src", "https://s3.example/get?sig=1")
    expect(onResolvePreview).toHaveBeenCalledWith("2")
  })

  it("a link row shows an open-external redirect, not preview/download", () => {
    renderAttachments({
      files: [
        {
          id: "3",
          name: "https://example.com/doc",
          kind: "link",
          url: "https://example.com/doc",
        },
      ],
    })
    const open = screen.getByRole("link", {
      name: "Open https://example.com/doc",
    })
    expect(open).toHaveAttribute("href", "https://example.com/doc")
    expect(
      screen.queryByRole("button", { name: "Preview https://example.com/doc" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "Download https://example.com/doc",
      }),
    ).not.toBeInTheDocument()
  })

  it("disables the open redirect for a link with an unsafe href", () => {
    renderAttachments({
      files: [{ id: "x", name: "javascript:alert(1)", kind: "link" }],
    })
    expect(
      screen.getByRole("button", { name: "Open javascript:alert(1)" }),
    ).toBeDisabled()
    expect(
      screen.queryByRole("link", { name: "Open javascript:alert(1)" }),
    ).not.toBeInTheDocument()
  })

  it("renames an added link in place (component owns added rows)", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Renamed link")
    const user = userEvent.setup()
    renderAttachments()

    await user.click(screen.getByRole("button", { name: "Add link" }))
    const input = await screen.findByPlaceholderText("https://…")
    await user.type(input, "https://example.com/x{Enter}")

    await user.click(
      screen.getByRole("button", {
        name: "More actions for https://example.com/x",
      }),
    )
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }))
    expect(screen.getByText("Renamed link")).toBeInTheDocument()
  })

  it("validates the URL before adding a link", async () => {
    const onAddLink = vi.fn()
    const user = userEvent.setup()
    renderAttachments({ onAddLink })

    await user.click(screen.getByRole("button", { name: "Add link" }))
    const input = await screen.findByPlaceholderText("https://…")
    await user.type(input, "not a url{Enter}")
    expect(onAddLink).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, "https://example.com{Enter}")
    expect(onAddLink).toHaveBeenCalledWith("https://example.com")
  })

  it("soft-deletes a row via the menu (strike + Undo) and restores", async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    renderAttachments({ onRemove })
    await user.click(
      screen.getByRole("button", { name: "More actions for invoice.pdf" }),
    )
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }))
    expect(onRemove).toHaveBeenCalledWith("1")
    const undo = screen.getByRole("button", { name: "Undo" })
    expect(undo).toBeInTheDocument()
    expect(screen.getByText("invoice.pdf")).toHaveClass("line-through")
    fireEvent.click(undo)
    expect(
      screen.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument()
  })
})
