import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect } from "vitest"

import { RadioGroup } from "@workspace/ui/components/radio-group"
import { PlanCard } from "./plan-card"

function renderPlans(defaultValue = "starter") {
  return render(
    <RadioGroup defaultValue={defaultValue}>
      <PlanCard
        value="starter"
        name="Starter"
        description="Get one workspace running."
        features={["1 company", "Up to 3 seats"]}
        price={{ amount: "$0", period: "/mo" }}
      />
      <PlanCard
        value="growth"
        name="Growth"
        description="For growing teams."
        features={["5 companies", "Up to 15 seats"]}
        price={{ amount: "$24", period: "/mo" }}
        badge="Most popular"
      />
    </RadioGroup>,
  )
}

describe("PlanCard", () => {
  it("renders name, description, features, and price", () => {
    renderPlans()
    expect(screen.getByText("Starter")).toBeInTheDocument()
    expect(screen.getByText("Get one workspace running.")).toBeInTheDocument()
    expect(screen.getByText("1 company")).toBeInTheDocument()
    expect(screen.getByText("Up to 3 seats")).toBeInTheDocument()
    expect(screen.getByText("$0")).toBeInTheDocument()
    expect(screen.getAllByText("/mo")[0]).toBeInTheDocument()
  })

  it("renders badge when provided", () => {
    renderPlans()
    expect(screen.getByText("Most popular")).toBeInTheDocument()
  })

  it("does not render badge when omitted", () => {
    renderPlans()
    const badges = screen.queryAllByText("Most popular")
    // only growth has badge
    expect(badges).toHaveLength(1)
  })

  it("selects via radio group", async () => {
    const user = userEvent.setup()
    renderPlans("starter")

    const radios = screen.getAllByRole("radio")
    const starterRadio = radios[0]!
    const growthRadio = radios[1]!

    expect(starterRadio).toBeChecked()
    expect(growthRadio).not.toBeChecked()

    await user.click(screen.getByText("Growth"))
    expect(growthRadio).toBeChecked()
    expect(starterRadio).not.toBeChecked()
  })

  it("renders all features as list items", () => {
    renderPlans()
    expect(screen.getByText("5 companies")).toBeInTheDocument()
    expect(screen.getByText("Up to 15 seats")).toBeInTheDocument()
  })
})
