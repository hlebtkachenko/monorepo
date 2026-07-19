import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"

import {
  OAuthConsentForm,
  type OAuthConsentFormMessages,
} from "./oauth-consent-form"
import {
  OAuthSelectOrganizationForm,
  type OAuthSelectOrganizationMessages,
} from "./oauth-select-organization-form"

const CONSENT_MESSAGES: OAuthConsentFormMessages = {
  title: "Authorize access",
  description: "Cursor wants to access your Afframe account.",
  scopesLabel: "This will let it:",
  scopeLabel: (scope) =>
    scope === "accounting:read"
      ? "Read your accounting data"
      : `Access: ${scope}`,
  authorize: "Authorize",
  authorizing: "Authorizing…",
  deny: "Deny",
  denying: "Denying…",
  failed: "Something went wrong. Please try again.",
}

const SELECT_ORG_MESSAGES: OAuthSelectOrganizationMessages = {
  title: "Select organization",
  description: "Choose the organization this authorization applies to.",
  continuing: "Continuing…",
  empty: "This account has no active organization to authorize.",
  failed: "Something went wrong. Please try again.",
}

// --- OAuthConsentForm ---

describe("OAuthConsentForm", () => {
  it("renders human-readable scopes, not raw tokens", () => {
    render(
      <OAuthConsentForm
        scopes={["accounting:read"]}
        onDecide={async () => false}
        messages={CONSENT_MESSAGES}
      />,
    )
    expect(screen.getByText("Read your accounting data")).toBeInTheDocument()
    expect(screen.queryByText("accounting:read")).not.toBeInTheDocument()
  })

  it("calls onDecide(true) when Authorize is clicked", async () => {
    const onDecide = vi.fn().mockResolvedValue(true)
    render(
      <OAuthConsentForm
        scopes={["openid"]}
        onDecide={onDecide}
        messages={CONSENT_MESSAGES}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Authorize" }))
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(true))
  })

  it("calls onDecide(false) when Deny is clicked", async () => {
    const onDecide = vi.fn().mockResolvedValue(true)
    render(
      <OAuthConsentForm
        scopes={["openid"]}
        onDecide={onDecide}
        messages={CONSENT_MESSAGES}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Deny" }))
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(false))
  })

  it("surfaces the failure message when onDecide resolves false", async () => {
    render(
      <OAuthConsentForm
        scopes={["openid"]}
        onDecide={async () => false}
        messages={CONSENT_MESSAGES}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Authorize" }))
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Something went wrong. Please try again.",
      )
    })
  })
})

// --- OAuthSelectOrganizationForm ---

describe("OAuthSelectOrganizationForm", () => {
  const orgs = [
    { id: "org-1", legalName: "Acme Trading s.r.o.", slug: "acme" },
    { id: "org-2", legalName: "Northwind Holding a.s.", slug: "northwind" },
  ]

  it("renders one button per organization", () => {
    render(
      <OAuthSelectOrganizationForm
        organizations={orgs}
        onSelect={async () => false}
        messages={SELECT_ORG_MESSAGES}
      />,
    )
    expect(screen.getByText("Acme Trading s.r.o.")).toBeInTheDocument()
    expect(screen.getByText("Northwind Holding a.s.")).toBeInTheDocument()
  })

  it("calls onSelect with the chosen organization id", async () => {
    const onSelect = vi.fn().mockResolvedValue(true)
    render(
      <OAuthSelectOrganizationForm
        organizations={orgs}
        onSelect={onSelect}
        messages={SELECT_ORG_MESSAGES}
      />,
    )
    await userEvent.click(screen.getByText("Northwind Holding a.s."))
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("org-2"))
  })

  it("shows the empty state when there is no active organization", () => {
    render(
      <OAuthSelectOrganizationForm
        organizations={[]}
        onSelect={async () => false}
        messages={SELECT_ORG_MESSAGES}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This account has no active organization to authorize.",
    )
  })
})
