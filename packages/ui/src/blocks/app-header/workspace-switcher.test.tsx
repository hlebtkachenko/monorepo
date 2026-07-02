import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import {
  WorkspaceSwitcher,
  type WorkspaceSwitcherCurrentWorkspace,
  type WorkspaceSwitcherWorkspace,
} from "./workspace-switcher"

const CURRENT: WorkspaceSwitcherCurrentWorkspace = {
  id: "current",
  name: "Nortinger Accounting",
  role: "Owner",
  clientCount: 1,
}

const OTHERS: WorkspaceSwitcherWorkspace[] = [
  { id: "ws-2", name: "Second Office" },
  { id: "ws-3", name: "Third Office" },
]

const wrap = (
  others: WorkspaceSwitcherWorkspace[] = OTHERS,
  onSelectWorkspace?: (id: string) => void,
) =>
  render(
    <WorkspaceSwitcher
      currentWorkspace={CURRENT}
      otherWorkspaces={others}
      settingsHref="/workspace/settings"
      createWorkspaceHref="/onboarding/workspace"
      onSelectWorkspace={onSelectWorkspace}
    />,
    { wrapper: IconProvider },
  )

describe("WorkspaceSwitcher", () => {
  it("shows the current workspace name on the trigger", () => {
    wrap()
    expect(
      screen.getByRole("button", { name: /switch workspace/i }),
    ).toHaveTextContent("Nortinger Accounting")
  })

  it("opens the identity block with role · client count + settings", async () => {
    const user = userEvent.setup()
    wrap()
    await user.click(screen.getByRole("button", { name: /switch workspace/i }))
    expect(screen.getByText(/Owner · 1 Client/i)).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /workspace settings/i }),
    ).toHaveAttribute("href", "/workspace/settings")
  })

  it("pluralises the client count", async () => {
    const user = userEvent.setup()
    render(
      <WorkspaceSwitcher
        currentWorkspace={{ ...CURRENT, clientCount: 7 }}
        otherWorkspaces={OTHERS}
        settingsHref="/workspace/settings"
        createWorkspaceHref="/onboarding/workspace"
      />,
      { wrapper: IconProvider },
    )
    await user.click(screen.getByRole("button", { name: /switch workspace/i }))
    expect(screen.getByText(/Owner · 7 Clients/i)).toBeInTheDocument()
  })

  it("lists other workspaces and fires onSelectWorkspace on pick", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    wrap(OTHERS, onSelect)
    await user.click(screen.getByRole("button", { name: /switch workspace/i }))
    await user.click(screen.getByRole("menuitem", { name: /second office/i }))
    expect(onSelect).toHaveBeenCalledWith("ws-2")
  })

  it("has the create-workspace action", async () => {
    const user = userEvent.setup()
    wrap()
    await user.click(screen.getByRole("button", { name: /switch workspace/i }))
    expect(
      screen.getByRole("menuitem", { name: /create new workspace/i }),
    ).toHaveAttribute("href", "/onboarding/workspace")
  })

  it("omits the other-workspaces group when there are none", async () => {
    const user = userEvent.setup()
    wrap([])
    await user.click(screen.getByRole("button", { name: /switch workspace/i }))
    expect(screen.queryByText(/your workspaces/i)).not.toBeInTheDocument()
  })
})
