import type { Meta, StoryObj } from "@storybook/react"
import { HomeIcon, SearchIcon, BellIcon, UserIcon } from "lucide-react"

import {
  NavigationBottomMobile,
  NavigationBottomMobileItem,
  NavigationBottomMobileItemIcon,
  NavigationBottomMobileItemLabel,
  NavigationBottomMobileList,
} from "./navigation-bottom-mobile"

const meta: Meta<typeof NavigationBottomMobile> = {
  title: "Components/NavigationBottomMobile",
  component: NavigationBottomMobile,
}
export default meta
type Story = StoryObj<typeof NavigationBottomMobile>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="relative h-40 w-80 overflow-hidden rounded-md border border-border bg-background">
    <div className="p-4 text-sm text-muted-foreground">Screen content</div>
    {children}
  </div>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <NavigationBottomMobile defaultValue="home">
        <NavigationBottomMobileList className="absolute">
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
      </NavigationBottomMobile>
    </Frame>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <Frame>
      <NavigationBottomMobile defaultValue="home">
        <NavigationBottomMobileList className="absolute">
          <NavigationBottomMobileItem value="home">
            <NavigationBottomMobileItemIcon>
              <HomeIcon />
            </NavigationBottomMobileItemIcon>
            <NavigationBottomMobileItemLabel>
              Home
            </NavigationBottomMobileItemLabel>
          </NavigationBottomMobileItem>
          <NavigationBottomMobileItem value="search">
            <NavigationBottomMobileItemIcon>
              <SearchIcon />
            </NavigationBottomMobileItemIcon>
            <NavigationBottomMobileItemLabel>
              Search
            </NavigationBottomMobileItemLabel>
          </NavigationBottomMobileItem>
          <NavigationBottomMobileItem value="notifications">
            <NavigationBottomMobileItemIcon>
              <BellIcon />
            </NavigationBottomMobileItemIcon>
            <NavigationBottomMobileItemLabel>
              Alerts
            </NavigationBottomMobileItemLabel>
          </NavigationBottomMobileItem>
          <NavigationBottomMobileItem value="profile">
            <NavigationBottomMobileItemIcon>
              <UserIcon />
            </NavigationBottomMobileItemIcon>
            <NavigationBottomMobileItemLabel>
              Profile
            </NavigationBottomMobileItemLabel>
          </NavigationBottomMobileItem>
        </NavigationBottomMobileList>
      </NavigationBottomMobile>
    </Frame>
  ),
}

export const ActiveItem: Story = {
  render: () => (
    <Frame>
      <NavigationBottomMobile defaultValue="search">
        <NavigationBottomMobileList className="absolute">
          <NavigationBottomMobileItem value="home">
            <NavigationBottomMobileItemIcon>
              <HomeIcon />
            </NavigationBottomMobileItemIcon>
            <NavigationBottomMobileItemLabel>
              Home
            </NavigationBottomMobileItemLabel>
          </NavigationBottomMobileItem>
          <NavigationBottomMobileItem value="search">
            <NavigationBottomMobileItemIcon>
              <SearchIcon />
            </NavigationBottomMobileItemIcon>
            <NavigationBottomMobileItemLabel>
              Search
            </NavigationBottomMobileItemLabel>
          </NavigationBottomMobileItem>
          <NavigationBottomMobileItem value="profile">
            <NavigationBottomMobileItemIcon>
              <UserIcon />
            </NavigationBottomMobileItemIcon>
            <NavigationBottomMobileItemLabel>
              Profile
            </NavigationBottomMobileItemLabel>
          </NavigationBottomMobileItem>
        </NavigationBottomMobileList>
      </NavigationBottomMobile>
    </Frame>
  ),
}
