import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"

import {
  NavigationBottomMobile,
  NavigationBottomMobileItem,
  NavigationBottomMobileItemLabel,
  NavigationBottomMobileList,
} from "./navigation-bottom-mobile"

function renderNav(props?: {
  defaultValue?: string
  onValueChange?: (details: { value: string }) => void
}) {
  return render(
    <NavigationBottomMobile
      defaultValue={props?.defaultValue ?? "home"}
      onValueChange={props?.onValueChange}
    >
      <NavigationBottomMobileList>
        <NavigationBottomMobileItem value="home">
          <NavigationBottomMobileItemLabel>
            Home
          </NavigationBottomMobileItemLabel>
        </NavigationBottomMobileItem>
        <NavigationBottomMobileItem value="search">
          <NavigationBottomMobileItemLabel>
            Search
          </NavigationBottomMobileItemLabel>
        </NavigationBottomMobileItem>
        <NavigationBottomMobileItem value="profile">
          <NavigationBottomMobileItemLabel>
            Profile
          </NavigationBottomMobileItemLabel>
        </NavigationBottomMobileItem>
      </NavigationBottomMobileList>
    </NavigationBottomMobile>,
  )
}

describe("NavigationBottomMobile", () => {
  it("renders root, list, and items with data-slot attributes", () => {
    const { container } = renderNav()
    expect(
      container.querySelector("[data-slot='navigation-bottom-mobile']"),
    ).toBeInTheDocument()
    expect(
      container.querySelector("[data-slot='navigation-bottom-mobile-list']"),
    ).toBeInTheDocument()
    expect(
      container.querySelectorAll("[data-slot='navigation-bottom-mobile-item']"),
    ).toHaveLength(3)
  })

  it("calls onValueChange when an item is clicked", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderNav({ onValueChange })

    await user.click(screen.getByText("Search"))

    expect(onValueChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: "search" }),
    )
  })

  it("marks the active item via aria-selected", () => {
    renderNav({ defaultValue: "profile" })
    const profileTrigger = screen
      .getByText("Profile")
      .closest("[data-slot='navigation-bottom-mobile-item']")
    expect(profileTrigger).toHaveAttribute("aria-selected", "true")
  })
})
