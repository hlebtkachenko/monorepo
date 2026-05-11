import type { Meta, StoryObj } from "@storybook/react"
import { HomeIcon, SearchIcon, BellIcon, UserIcon } from "lucide-react"

import {
  BottomNavigation,
  BottomNavigationItem,
  BottomNavigationItemIcon,
  BottomNavigationItemLabel,
  BottomNavigationList,
} from "./bottom-navigation"

const meta: Meta<typeof BottomNavigation> = {
  title: "Components/BottomNavigation",
  component: BottomNavigation,
}
export default meta
type Story = StoryObj<typeof BottomNavigation>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="relative h-40 w-80 overflow-hidden rounded-md border border-border bg-background">
    <div className="p-4 text-sm text-muted-foreground">Screen content</div>
    {children}
  </div>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <BottomNavigation defaultValue="home">
        <BottomNavigationList className="absolute">
          <BottomNavigationItem value="home">
            <BottomNavigationItemLabel>Home</BottomNavigationItemLabel>
          </BottomNavigationItem>
          <BottomNavigationItem value="search">
            <BottomNavigationItemLabel>Search</BottomNavigationItemLabel>
          </BottomNavigationItem>
          <BottomNavigationItem value="profile">
            <BottomNavigationItemLabel>Profile</BottomNavigationItemLabel>
          </BottomNavigationItem>
        </BottomNavigationList>
      </BottomNavigation>
    </Frame>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <Frame>
      <BottomNavigation defaultValue="home">
        <BottomNavigationList className="absolute">
          <BottomNavigationItem value="home">
            <BottomNavigationItemIcon>
              <HomeIcon />
            </BottomNavigationItemIcon>
            <BottomNavigationItemLabel>Home</BottomNavigationItemLabel>
          </BottomNavigationItem>
          <BottomNavigationItem value="search">
            <BottomNavigationItemIcon>
              <SearchIcon />
            </BottomNavigationItemIcon>
            <BottomNavigationItemLabel>Search</BottomNavigationItemLabel>
          </BottomNavigationItem>
          <BottomNavigationItem value="notifications">
            <BottomNavigationItemIcon>
              <BellIcon />
            </BottomNavigationItemIcon>
            <BottomNavigationItemLabel>Alerts</BottomNavigationItemLabel>
          </BottomNavigationItem>
          <BottomNavigationItem value="profile">
            <BottomNavigationItemIcon>
              <UserIcon />
            </BottomNavigationItemIcon>
            <BottomNavigationItemLabel>Profile</BottomNavigationItemLabel>
          </BottomNavigationItem>
        </BottomNavigationList>
      </BottomNavigation>
    </Frame>
  ),
}

export const ActiveItem: Story = {
  render: () => (
    <Frame>
      <BottomNavigation defaultValue="search">
        <BottomNavigationList className="absolute">
          <BottomNavigationItem value="home">
            <BottomNavigationItemIcon>
              <HomeIcon />
            </BottomNavigationItemIcon>
            <BottomNavigationItemLabel>Home</BottomNavigationItemLabel>
          </BottomNavigationItem>
          <BottomNavigationItem value="search">
            <BottomNavigationItemIcon>
              <SearchIcon />
            </BottomNavigationItemIcon>
            <BottomNavigationItemLabel>Search</BottomNavigationItemLabel>
          </BottomNavigationItem>
          <BottomNavigationItem value="profile">
            <BottomNavigationItemIcon>
              <UserIcon />
            </BottomNavigationItemIcon>
            <BottomNavigationItemLabel>Profile</BottomNavigationItemLabel>
          </BottomNavigationItem>
        </BottomNavigationList>
      </BottomNavigation>
    </Frame>
  ),
}
