import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  AuthTokenContinueCard,
  AuthTokenInvalidCard,
} from "./token-landing-cards"

describe("AuthTokenContinueCard", () => {
  it("renders a POST form carrying the token to the consume action", () => {
    const { container } = render(
      <AuthTokenContinueCard
        title="Almost there"
        description="Continue to set up your account."
        continueLabel="Continue"
        action="/auth/signup/consume"
        token="raw-token"
        footnote="Afframe"
      />,
    )
    const form = container.querySelector("form")
    expect(form).toHaveAttribute("method", "POST")
    expect(form).toHaveAttribute("action", "/auth/signup/consume")
    const tokenInput = container.querySelector('input[name="token"]')
    expect(tokenInput).toHaveValue("raw-token")
    expect(screen.getByRole("button", { name: /Continue/ })).toBeInTheDocument()
    expect(screen.getByText("Afframe")).toBeInTheDocument()
  })

  it("omits the footnote when not provided", () => {
    render(
      <AuthTokenContinueCard
        title="Almost there"
        description="Continue."
        continueLabel="Continue"
        action="/auth/invite/consume"
        token="raw-token"
      />,
    )
    expect(screen.queryByText("Afframe")).not.toBeInTheDocument()
  })
})

describe("AuthTokenInvalidCard", () => {
  it("renders the error copy and the support link", () => {
    render(
      <AuthTokenInvalidCard
        title="This link is no longer valid"
        description="The link may have expired."
        contactLabel="Contact support"
        contactHref="#"
      />,
    )
    expect(screen.getByText("This link is no longer valid")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /Contact support/ }),
    ).toHaveAttribute("href", "#")
  })
})
