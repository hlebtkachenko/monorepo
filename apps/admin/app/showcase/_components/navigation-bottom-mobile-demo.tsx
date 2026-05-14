"use client"

import * as React from "react"
import { BellIcon, HomeIcon, SearchIcon, UserIcon } from "lucide-react"

import {
  NavigationBottomMobile,
  NavigationBottomMobileItem,
  NavigationBottomMobileItemIcon,
  NavigationBottomMobileItemLabel,
  NavigationBottomMobileList,
} from "@workspace/ui/components/navigation-bottom-mobile"

export function NavigationBottomMobileDemo() {
  return (
    <div className="relative h-48 w-full overflow-hidden rounded-md border border-border bg-background">
      <div className="p-4 text-sm text-muted-foreground">
        Mobile screen content. The bottom navigation is anchored to the bottom
        of this frame.
      </div>
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
          <NavigationBottomMobileItem value="alerts">
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
    </div>
  )
}
