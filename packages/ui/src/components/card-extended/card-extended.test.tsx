import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { CardExtended } from "./card-extended"
import { CardContent } from "@workspace/ui/components/card"

describe("CardExtended", () => {
  it("renders content via wrapper for any variant", () => {
    render(
      <CardExtended variant="shadow">
        <CardContent>Body</CardContent>
      </CardExtended>,
    )
    expect(screen.getByText("Body")).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="card-extended-wrapper"]'),
    ).toBeInTheDocument()
  })

  it("sets data-variant on inner card", () => {
    render(
      <CardExtended variant="aurora">
        <CardContent>Body</CardContent>
      </CardExtended>,
    )
    expect(
      document.querySelector('[data-slot="card-extended"]'),
    ).toHaveAttribute("data-variant", "aurora")
  })

  it("wraps non-shadow variants with decoration", () => {
    render(
      <CardExtended variant="stacked">
        <CardContent>Body</CardContent>
      </CardExtended>,
    )
    const wrapper = document.querySelector(
      '[data-slot="card-extended-wrapper"]',
    )
    expect(wrapper).toBeInTheDocument()
    expect(wrapper?.querySelector("[aria-hidden]")).toBeInTheDocument()
  })

  it("uses fixed-height frame for uniform grid sizing", () => {
    render(
      <CardExtended variant="hatched">
        <CardContent>Body</CardContent>
      </CardExtended>,
    )
    const wrapper = document.querySelector(
      '[data-slot="card-extended-wrapper"]',
    )
    expect(wrapper?.className).toContain("h-44")
  })
})
