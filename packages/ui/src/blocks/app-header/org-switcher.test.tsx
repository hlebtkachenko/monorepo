import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import {
  OrgSwitcher,
  type OrgSwitcherCurrentOrg,
  type OrgSwitcherOrg,
} from "./org-switcher"

const CURRENT: OrgSwitcherCurrentOrg = {
  id: "current",
  name: "Nortinger",
  role: "Owner",
  memberCount: 1,
}

const RECENT: OrgSwitcherOrg[] = [
  { id: "acme", name: "Acme Books", href: "/acme" },
  { id: "northwind", name: "Northwind Trading", href: "/northwind" },
]

const wrap = (recent: OrgSwitcherOrg[] = RECENT) =>
  render(
    <OrgSwitcher
      currentOrg={CURRENT}
      recentOrgs={recent}
      settingsHref="/acme/settings"
      inviteHref="/acme/settings/members"
      createOrgHref="/onboarding"
      workspaceHref="/workspace"
    />,
    { wrapper: IconProvider },
  )

describe("OrgSwitcher", () => {
  it("shows the current org name on the trigger", () => {
    wrap()
    expect(
      screen.getByRole("button", { name: /switch organisation/i }),
    ).toHaveTextContent("Nortinger")
  })

  it("opens the identity block with role · member count + actions", async () => {
    const user = userEvent.setup()
    wrap()
    await user.click(
      screen.getByRole("button", { name: /switch organisation/i }),
    )
    expect(screen.getByText(/Owner · 1 Member/i)).toBeInTheDocument()
    // Settings + Invite are outline Buttons (links), not menu rows.
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute(
      "href",
      "/acme/settings",
    )
    expect(
      screen.getByRole("link", { name: /invite members/i }),
    ).toHaveAttribute("href", "/acme/settings/members")
  })

  it("pluralises the member count", async () => {
    const user = userEvent.setup()
    render(
      <OrgSwitcher
        currentOrg={{ ...CURRENT, memberCount: 4 }}
        recentOrgs={RECENT}
        settingsHref="/acme/settings"
        inviteHref="/acme/settings/members"
        createOrgHref="/onboarding"
        workspaceHref="/workspace"
      />,
      { wrapper: IconProvider },
    )
    await user.click(
      screen.getByRole("button", { name: /switch organisation/i }),
    )
    expect(screen.getByText(/Owner · 4 Members/i)).toBeInTheDocument()
  })

  it("lists recent orgs with quick-switch links + the footer actions", async () => {
    const user = userEvent.setup()
    wrap()
    await user.click(
      screen.getByRole("button", { name: /switch organisation/i }),
    )
    expect(
      screen.getByRole("menuitem", { name: /acme books/i }),
    ).toHaveAttribute("href", "/acme")
    expect(
      screen.getByRole("menuitem", { name: /create new organisation/i }),
    ).toHaveAttribute("href", "/onboarding")
    expect(
      screen.getByRole("menuitem", { name: /manage in workspace/i }),
    ).toHaveAttribute("href", "/workspace")
  })

  it("omits the recent group when there are no recent orgs", async () => {
    const user = userEvent.setup()
    wrap([])
    await user.click(
      screen.getByRole("button", { name: /switch organisation/i }),
    )
    expect(screen.queryByText(/recent organisations/i)).not.toBeInTheDocument()
  })
})
