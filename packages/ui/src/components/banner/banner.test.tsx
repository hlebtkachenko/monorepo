import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  Banner,
  BannerActions,
  BannerClose,
  BannerContent,
  BannerTitle,
} from "./banner"

describe("Banner (standalone)", () => {
  it("renders with role=status", () => {
    render(
      <Banner>
        <BannerContent>
          <BannerTitle>Hello</BannerTitle>
        </BannerContent>
      </Banner>,
    )
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.getByText("Hello")).toBeInTheDocument()
  })

  it("applies variant classes", () => {
    render(
      <Banner variant="success">
        <BannerContent>Done</BannerContent>
      </Banner>,
    )
    expect(screen.getByRole("status").className).toContain("text-success")
  })

  it("closes when BannerClose is clicked", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <Banner defaultOpen onOpenChange={onOpenChange}>
        <BannerContent>Hello</BannerContent>
        <BannerActions>
          <BannerClose />
        </BannerActions>
      </Banner>,
    )
    await user.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("respects controlled open=false", () => {
    render(
      <Banner open={false}>
        <BannerContent>Hidden</BannerContent>
      </Banner>,
    )
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })
})
