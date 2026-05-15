import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect } from "vitest"
import { Smile } from "lucide-react"

import { RadioGroup } from "@workspace/ui/components/radio-group"
import { ChoiceCard } from "./choice-card"

function renderInGroup(defaultValue = "") {
  return render(
    <RadioGroup defaultValue={defaultValue}>
      <ChoiceCard
        value="new"
        title="New to accounting"
        description="Plain-language guidance"
        icon={<Smile data-testid="icon-smile" />}
      />
      <ChoiceCard
        value="some"
        title="Some experience"
        description="I know the basics"
      />
    </RadioGroup>,
  )
}

describe("ChoiceCard", () => {
  it("renders inside a radio group and clicking selects it", async () => {
    const user = userEvent.setup()
    renderInGroup()

    const radio = screen.getAllByRole("radio")[0]!
    expect(radio).not.toBeChecked()

    await user.click(screen.getByText("New to accounting"))
    expect(radio).toBeChecked()
  })

  it("shows Check icon container when checked", async () => {
    const user = userEvent.setup()
    renderInGroup()

    await user.click(screen.getByText("New to accounting"))

    // The label wrapping the checked radio should have data-state=checked on its radio child
    const radio = screen.getAllByRole("radio")[0]!
    expect(radio).toHaveAttribute("data-state", "checked")
  })

  it("renders the icon prop", () => {
    renderInGroup()
    expect(screen.getByTestId("icon-smile")).toBeInTheDocument()
  })

  it("renders title and description", () => {
    renderInGroup()
    expect(screen.getByText("New to accounting")).toBeInTheDocument()
    expect(screen.getByText("Plain-language guidance")).toBeInTheDocument()
  })

  it("starts selected when defaultValue matches", () => {
    renderInGroup("new")
    const radio = screen.getAllByRole("radio")[0]!
    expect(radio).toBeChecked()
  })
})
