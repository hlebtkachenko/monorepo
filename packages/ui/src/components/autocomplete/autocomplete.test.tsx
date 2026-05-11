import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect } from "vitest"
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "./autocomplete"

const FRAMEWORKS = ["Next.js", "Remix", "Astro"]

function renderAutocomplete() {
  return render(
    <Autocomplete items={FRAMEWORKS} mode="list" openOnInputClick>
      <AutocompleteInput placeholder="Search frameworks..." showClear />
      <AutocompletePopup>
        <AutocompleteList>
          {(fw: string) => (
            <AutocompleteItem key={fw} value={fw}>
              {fw}
            </AutocompleteItem>
          )}
        </AutocompleteList>
        <AutocompleteEmpty>No frameworks found.</AutocompleteEmpty>
      </AutocompletePopup>
    </Autocomplete>,
  )
}

describe("Autocomplete", () => {
  it("renders input with placeholder", () => {
    renderAutocomplete()
    expect(
      screen.getByPlaceholderText("Search frameworks..."),
    ).toBeInTheDocument()
  })

  it("opens popup and filters items on typing", async () => {
    const user = userEvent.setup()
    renderAutocomplete()
    const input = screen.getByPlaceholderText("Search frameworks...")
    await user.click(input)
    await user.type(input, "Rem")
    expect(await screen.findByText("Remix")).toBeInTheDocument()
  })
})
