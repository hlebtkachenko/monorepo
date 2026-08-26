"use server"

import { revalidatePath } from "next/cache"

import { lookupOrganizationAres } from "@/lib/ares/lookup"
import {
  acceptedPatch,
  aresSuggestions,
  normalizeIco,
  type AresSuggestion,
} from "@/lib/ares/suggestions"
import {
  organizationIdentity,
  stampAresFetched,
  updateOrganizationIdentity,
} from "@/lib/data/organization-identity"
import { requireOwner, requireScope, type OwnerScope } from "@/lib/data/scope"

import { acceptedAresFields, formString, identityPatchFromForm } from "./input"
import type { NastaveniActionState } from "./state"

/**
 * Nastavení › Společnost writes — owner only (spec §2.10: "Společnost (owner
 * edit; others view)"; plan Part 4: "Org settings/identity card edit =
 * owner-only (it is legal/accounting data)").
 *
 * `requireOwner(await requireScope(orgSlug))` IS THE FIRST STATEMENT of every
 * action, the pattern PR 14 established and PR 34 repeated. A Server Action is a
 * public POST endpoint with a generated name, reachable without ever rendering
 * the page that contains its form — the page's gate stops a browser from SEEING
 * the controls, only this stops one from POSTING to them. `requireScope` is
 * re-resolved per action rather than reused from a page's memoized read: a
 * Server Action is its own request.
 *
 * `orgSlug` travels as a hidden form field — the fixed `(previousState,
 * formData) => state` shape `useActionState` requires leaves no other place to
 * carry it — and it is used ONLY to resolve the scope, never to build a query.
 */

export async function updateCompanyAction(
  _previous: NastaveniActionState,
  formData: FormData,
): Promise<NastaveniActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const parsed = identityPatchFromForm(formData)
  if (!parsed.ok) {
    return {
      status: "error",
      error:
        parsed.reason === "ico_invalid"
          ? "nastaveni.errorIcoInvalid"
          : "nastaveni.errorNameRequired",
    }
  }

  const written = await updateOrganizationIdentity(owner, parsed.patch)
  if (!written) return { status: "error", error: "nastaveni.errorNotSaved" }

  revalidatePath(`/${orgSlug}/nastaveni/spolecnost`)
  return { status: "ok", message: "nastaveni.okSaved" }
}

/**
 * "Načíst z ARES" — ask the registry and RETURN what it would change.
 *
 * This action writes exactly one thing: `ares_fetched_at`, the §2.10 cache
 * stamp. It does not touch a single identity column, and the return type makes
 * that structural — its success arm is `status: "suggestions"`, which carries a
 * list to render and no way to express a save.
 *
 * The IČO comes from the FORM rather than from the stored row, so the office can
 * type a corrected number and reconcile against it before saving. It is
 * left-padded first (spec §2.10): ARES keys on 8 digits.
 */
export async function lookupAresAction(
  _previous: NastaveniActionState,
  formData: FormData,
): Promise<NastaveniActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const suggestions = await deriveSuggestions(owner, formData)
  if (!suggestions.ok) return suggestions.state

  await stampAresFetched(owner, suggestions.fetchedAt)
  revalidatePath(`/${orgSlug}/nastaveni/spolecnost`)

  return {
    status: "suggestions",
    suggestions: suggestions.suggestions,
    fetchedAt: suggestions.fetchedAt.toISOString(),
    cached: suggestions.cached,
  }
}

/**
 * Write the suggestions the office ticked, and only those (spec §2.10: "never
 * silently overwrite — 'ARES navrhuje' per-field accept + 'přijmout vše'").
 *
 * The suggestions are RE-DERIVED here rather than trusted from the form. Within
 * 24h that is a cache read and costs nothing; either way the value written is
 * the one the server itself computed from a registry answer, so the request can
 * only ever say WHICH field to accept, never WHAT to put in it.
 *
 * `vat_regime` cannot be reached from here at any input: it is absent from
 * `ARES_FIELDS`, absent from `IDENTITY_FIELDS`, and absent from
 * `updateOrganizationIdentity`'s column map. A `dic: null` from ARES produces no
 * suggestion at all, so the "null DIČ means neplátce" mistake has no code path
 * to travel down.
 *
 * "PŘIJMOUT VŠE" IS THIS ACTION TOO, via `intent=acceptAll` on the second submit
 * button. One accept path on the server means "accept all" cannot come to mean
 * something subtly different from "accept each" — and it keeps the panel a
 * plain form that works without JavaScript, since ticking every checkbox
 * programmatically would need client state.
 *
 * ON SUCCESS IT RETURNS THE SAME `suggestions` ARM the lookup does, minus the
 * fields it just wrote. That is what lets the panel hold ONE `useActionState`
 * and no effect mirroring a second one into it: the list the office sees after
 * accepting is simply what is still different.
 */
export async function acceptAresAction(
  _previous: NastaveniActionState,
  formData: FormData,
): Promise<NastaveniActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const derived = await deriveSuggestions(owner, formData)
  if (!derived.ok) return derived.state

  const acceptAll = formString(formData, "intent") === "acceptAll"
  const accepted = acceptAll
    ? derived.suggestions.map((suggestion) => suggestion.field)
    : acceptedAresFields(formData)

  if (accepted.length === 0) {
    return { status: "error", error: "nastaveni.errorNothingAccepted" }
  }

  const patch = acceptedPatch(derived.suggestions, accepted)

  // An empty patch is not a failure: every ticked field has since stopped
  // differing, because the office typed the same value by hand between the
  // lookup and the accept.
  if (Object.keys(patch).length > 0) {
    const written = await updateOrganizationIdentity(owner, patch)
    if (!written) return { status: "error", error: "nastaveni.errorNotSaved" }
  }

  await stampAresFetched(owner, derived.fetchedAt)
  revalidatePath(`/${orgSlug}/nastaveni/spolecnost`)

  const applied = new Set(Object.keys(patch))
  return {
    status: "suggestions",
    // Computed rather than re-fetched: an accepted field now equals what ARES
    // said, so it cannot still be a suggestion. A second round trip to learn
    // that would be a second chance to disagree with what was just written.
    suggestions: derived.suggestions.filter((s) => !applied.has(s.field)),
    fetchedAt: derived.fetchedAt.toISOString(),
    cached: derived.cached,
    message:
      applied.size > 0 ? "nastaveni.okAresApplied" : "nastaveni.okAresNoChange",
  }
}

type DerivedSuggestions =
  | {
      ok: true
      suggestions: AresSuggestion[]
      fetchedAt: Date
      cached: boolean
    }
  | { ok: false; state: NastaveniActionState }

/**
 * The half `lookupAresAction` and `acceptAresAction` share: normalize the IČO,
 * ask the registry (or the cache), diff against the stored card.
 *
 * Every failure keeps the form editable (spec §2.10) — the action returns an
 * error STATE, never throws, so the page re-renders with the user's typing
 * intact and a Czech sentence above it.
 */
async function deriveSuggestions(
  owner: OwnerScope,
  formData: FormData,
): Promise<DerivedSuggestions> {
  const ico = normalizeIco(formString(formData, "ico"))
  if (!ico.ok) {
    return {
      ok: false,
      state: { status: "error", error: "nastaveni.errorIcoInvalid" },
    }
  }
  if (ico.ico === null) {
    return {
      ok: false,
      state: { status: "error", error: "nastaveni.errorIcoRequired" },
    }
  }

  const identity = await organizationIdentity(owner)
  if (!identity) {
    return {
      ok: false,
      state: { status: "error", error: "nastaveni.errorNotSaved" },
    }
  }

  const result = await lookupOrganizationAres(ico.ico)
  if (!result.ok) {
    return {
      ok: false,
      state: {
        status: "error",
        error:
          result.reason === "not_found"
            ? "nastaveni.errorAresNotFound"
            : "nastaveni.errorAresUnavailable",
      },
    }
  }

  return {
    ok: true,
    suggestions: aresSuggestions(identity, result.profile),
    fetchedAt: new Date(),
    cached: result.cached,
  }
}
