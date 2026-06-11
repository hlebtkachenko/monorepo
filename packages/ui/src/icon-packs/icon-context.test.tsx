import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"

import { IconProvider, useIconPack, useIcons } from "./icon-context"

const STORAGE_KEY = "afframe-icon-pack"

function Probe({ renders }: { renders?: { count: number } }) {
  const { Home } = useIcons()
  const { pack, setPack } = useIconPack()
  if (renders) renders.count += 1
  return (
    <div>
      <span data-testid="pack">{pack}</span>
      <Home data-testid="home-icon" />
      <button onClick={() => setPack("fontawesome")}>switch</button>
    </div>
  )
}

afterEach(() => {
  window.localStorage.clear()
})

describe("IconProvider", () => {
  it("renders the default lucide pack synchronously with no extra re-render", async () => {
    const renders = { count: 0 }
    render(
      <IconProvider>
        <Probe renders={renders} />
      </IconProvider>,
    )

    // Icon is there on the very first paint — lucide is static.
    expect(screen.getByTestId("home-icon")).toBeInTheDocument()
    expect(screen.getByTestId("pack")).toHaveTextContent("lucide")

    // Hydration effect must bail out for the default pack: exactly one
    // render, no post-mount flash.
    await waitFor(() => expect(renders.count).toBe(1))
  })

  it("hydrates a stored non-default pack by lazy-loading its chunk", async () => {
    window.localStorage.setItem(STORAGE_KEY, "phosphor")
    render(
      <IconProvider>
        <Probe />
      </IconProvider>,
    )

    // First paint is still lucide (chunk not resolved yet)...
    expect(screen.getByTestId("pack")).toHaveTextContent("lucide")

    // ...then the stored pack swaps in once the dynamic import resolves.
    await waitFor(() =>
      expect(screen.getByTestId("pack")).toHaveTextContent("phosphor"),
    )
    expect(screen.getByTestId("home-icon")).toBeInTheDocument()
  })

  it("setPack loads the pack on demand and persists the choice", async () => {
    const user = userEvent.setup()
    render(
      <IconProvider>
        <Probe />
      </IconProvider>,
    )

    await user.click(screen.getByRole("button", { name: "switch" }))

    await waitFor(() =>
      expect(screen.getByTestId("pack")).toHaveTextContent("fontawesome"),
    )
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("fontawesome")
    expect(screen.getByTestId("home-icon")).toBeInTheDocument()
  })

  it("ignores an unknown stored value and stays on the default pack", () => {
    window.localStorage.setItem(STORAGE_KEY, "comic-sans")
    render(
      <IconProvider>
        <Probe />
      </IconProvider>,
    )
    expect(screen.getByTestId("pack")).toHaveTextContent("lucide")
  })
})
