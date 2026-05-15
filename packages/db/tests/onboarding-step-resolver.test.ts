/**
 * Pure-function tests for the onboarding step resolver.
 *
 * Lives in @workspace/db tests because that's where the vitest runner
 * is configured. The function under test is pure TypeScript with no DB
 * dependency — the testcontainer setup is irrelevant to these cases.
 */

import { describe, expect, it } from "vitest"
import {
  decideNextStep,
  stepIndex,
  stepPath,
  STEP_ORDER,
  TOTAL_STEPS,
  type ResolverSnapshot,
} from "@workspace/shared/auth"

function emptySnapshot(): ResolverSnapshot {
  return {
    hasSession: false,
    cookieHasProfile: false,
    cookieHasExperience: false,
    profileCompletedAt: null,
    experience: null,
    workspaceExists: false,
    step1CompletedAt: null,
    step2CompletedAt: null,
    step3CompletedAt: null,
    step4CompletedAt: null,
  }
}

describe("step-resolver decideNextStep", () => {
  describe("pre-account (no session)", () => {
    it("starts at profile with an empty cookie", () => {
      expect(decideNextStep(emptySnapshot())).toBe("profile")
    })

    it("moves to experience once profile is in the cookie", () => {
      expect(
        decideNextStep({
          ...emptySnapshot(),
          cookieHasProfile: true,
        }),
      ).toBe("experience")
    })

    it("moves to password once profile + experience are in the cookie", () => {
      expect(
        decideNextStep({
          ...emptySnapshot(),
          cookieHasProfile: true,
          cookieHasExperience: true,
        }),
      ).toBe("password")
    })

    it("ignores DB state when no session is present (cookie state is the source of truth pre-account)", () => {
      // A stray app_user row should not advance a session-less visitor
      // past step 3. The user must complete signUpEmail first.
      expect(
        decideNextStep({
          ...emptySnapshot(),
          profileCompletedAt: new Date(),
          experience: "accountant",
          workspaceExists: true,
          step1CompletedAt: new Date(),
        }),
      ).toBe("profile")
    })
  })

  describe("post-account (session present)", () => {
    const sessioned = (
      overrides: Partial<ResolverSnapshot> = {},
    ): ResolverSnapshot => ({
      ...emptySnapshot(),
      hasSession: true,
      ...overrides,
    })

    it("returns profile when app_user.profile_completed_at is null", () => {
      expect(decideNextStep(sessioned())).toBe("profile")
    })

    it("returns experience when profile is done but experience is null", () => {
      expect(
        decideNextStep(sessioned({ profileCompletedAt: new Date() })),
      ).toBe("experience")
    })

    it("returns workspace when profile + experience are set but workspace row is missing", () => {
      expect(
        decideNextStep(
          sessioned({
            profileCompletedAt: new Date(),
            experience: "new",
          }),
        ),
      ).toBe("workspace")
    })

    it("returns workspace when workspace row exists but step_1 not yet set (partial commit)", () => {
      expect(
        decideNextStep(
          sessioned({
            profileCompletedAt: new Date(),
            experience: "new",
            workspaceExists: true,
          }),
        ),
      ).toBe("workspace")
    })

    it("returns plan after step 4", () => {
      expect(
        decideNextStep(
          sessioned({
            profileCompletedAt: new Date(),
            experience: "new",
            workspaceExists: true,
            step1CompletedAt: new Date(),
          }),
        ),
      ).toBe("plan")
    })

    it("returns team after step 5", () => {
      expect(
        decideNextStep(
          sessioned({
            profileCompletedAt: new Date(),
            experience: "new",
            workspaceExists: true,
            step1CompletedAt: new Date(),
            step2CompletedAt: new Date(),
          }),
        ),
      ).toBe("team")
    })

    it("returns done after step 6", () => {
      expect(
        decideNextStep(
          sessioned({
            profileCompletedAt: new Date(),
            experience: "new",
            workspaceExists: true,
            step1CompletedAt: new Date(),
            step2CompletedAt: new Date(),
            step3CompletedAt: new Date(),
          }),
        ),
      ).toBe("done")
    })

    it("returns done after step 7 (fully complete)", () => {
      expect(
        decideNextStep(
          sessioned({
            profileCompletedAt: new Date(),
            experience: "new",
            workspaceExists: true,
            step1CompletedAt: new Date(),
            step2CompletedAt: new Date(),
            step3CompletedAt: new Date(),
            step4CompletedAt: new Date(),
          }),
        ),
      ).toBe("done")
    })
  })
})

describe("step-resolver helpers", () => {
  it("STEP_ORDER is exactly 7 steps", () => {
    expect(TOTAL_STEPS).toBe(7)
    expect(STEP_ORDER).toEqual([
      "profile",
      "experience",
      "password",
      "workspace",
      "plan",
      "team",
      "done",
    ])
  })

  it("stepIndex is 1-based and matches STEP_ORDER", () => {
    expect(stepIndex("profile")).toBe(1)
    expect(stepIndex("password")).toBe(3)
    expect(stepIndex("done")).toBe(7)
  })

  it("stepPath maps to /onboarding/<step>", () => {
    expect(stepPath("profile")).toBe("/onboarding/profile")
    expect(stepPath("done")).toBe("/onboarding/done")
  })
})
