"use client"

import * as React from "react"
import { BellIcon, HomeIcon, SearchIcon, UserIcon } from "lucide-react"

import {
  BottomNavigation,
  BottomNavigationItem,
  BottomNavigationItemIcon,
  BottomNavigationItemLabel,
  BottomNavigationList,
} from "@workspace/ui/components/bottom-navigation"

export function BottomNavigationDemo() {
  return (
    <div className="relative h-48 w-full overflow-hidden rounded-md border border-border bg-background">
      <div className="p-4 text-sm text-muted-foreground">
        Mobile screen content. The bottom navigation is anchored to the bottom
        of this frame.
      </div>
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
          <BottomNavigationItem value="alerts">
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
    </div>
  )
}
