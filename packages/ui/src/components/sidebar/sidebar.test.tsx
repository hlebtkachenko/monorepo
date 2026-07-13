import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect } from "vitest"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./sidebar"

function TestSidebar() {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>Dashboard</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  )
}

describe("Sidebar", () => {
  it("renders sidebar content", () => {
    render(<TestSidebar />)
    expect(screen.getByText("Dashboard")).toBeInTheDocument()
  })

  it("renders group label", () => {
    render(<TestSidebar />)
    expect(screen.getByText("Menu")).toBeInTheDocument()
  })

  it("uses sidebar color tokens directly for outline shadows", () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton variant="outline">Outlined</SidebarMenuButton>
      </SidebarProvider>,
    )
    const button = screen.getByRole("button", { name: "Outlined" })
    expect(button.className).toContain("var(--sidebar-border)")
    expect(button.className).not.toContain("hsl(var(--sidebar-border))")
  })

  it("renders sidebar trigger and toggles sidebar", async () => {
    const user = userEvent.setup()
    render(
      <SidebarProvider>
        <SidebarTrigger />
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton>Item</SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>,
    )
    const trigger = screen.getByRole("button", { name: /toggle sidebar/i })
    expect(trigger).toBeInTheDocument()
    await user.click(trigger)
  })

  it("throws when useSidebar used outside provider", () => {
    const originalError = console.error
    console.error = () => {}
    function BadComponent() {
      useSidebar()
      return null
    }
    expect(() => render(<BadComponent />)).toThrow(
      "useSidebar must be used within a SidebarProvider.",
    )
    console.error = originalError
  })
})
