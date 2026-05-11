import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { CardExtended } from "./card-extended"
import { CardContent } from "@workspace/ui/components/card"

describe("CardExtended", () => {
  it("renders shadow variant without wrapper", () => {
    render(
      <CardExtended variant="shadow">
        <CardContent>Body</CardContent>
      </CardExtended>,
    )
    expect(screen.getByText("Body")).toBeInTheDocument()
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

  it("wraps non-shadow variants with decoration wrapper", () => {
    render(
      <CardExtended variant="stacked">
        <CardContent>Body</CardContent>
      </CardExtended>,
    )
    expect(
      document.querySelector('[data-slot="card-extended-wrapper"]'),
    ).toBeInTheDocument()
  })

  it("does not wrap shadow variant", () => {
    render(
      <CardExtended variant="shadow">
        <CardContent>Body</CardContent>
      </CardExtended>,
    )
    expect(
      document.querySelector('[data-slot="card-extended-wrapper"]'),
    ).not.toBeInTheDocument()
  })
})
