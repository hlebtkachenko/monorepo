"use client"

import { createContext, useContext, type ReactNode } from "react"

import type { OnboardingRole } from "../_lib/role-types"

const OnboardingRoleCtx = createContext<OnboardingRole>("owner")

/**
 * Client-side accessor for the current onboarding role (owner vs
 * member). The layout reads role from cookies on the server and seeds
 * this provider so step forms can branch on it without re-reading the
 * cookie themselves.
 */
export function OnboardingRoleProvider({
  role,
  children,
}: {
  role: OnboardingRole
  children: ReactNode
}) {
  return (
    <OnboardingRoleCtx.Provider value={role}>
      {children}
    </OnboardingRoleCtx.Provider>
  )
}

export function useOnboardingRole(): OnboardingRole {
  return useContext(OnboardingRoleCtx)
}
