"use client"

import * as React from "react"

/**
 * QA sweep regression: submitting a manual-entry form to a business-rule
 * refusal ("Neplatný vstup.", a named field error, …) silently WIPED every
 * field the office had just typed — most visibly on a "Nová smlouva" create
 * sheet, where every field's `defaultValue` is `""` to begin with.
 *
 * THE ROOT CAUSE IS REACT ITSELF, NOT A BUG IN ANY ONE FORM. A `<form
 * action={fn}>` bound through `useActionState` resets every UNCONTROLLED
 * field to its `defaultValue` once the action call completes —
 * react.dev/reference/react-dom/components/form: "Upon successful execution
 * of the action, all uncontrolled form fields are automatically reset."
 * React can only tell "the promise resolved" from "it threw"; a returned
 * `{status: "error", ...}` is a RESOLVED promise, so a validation refusal
 * resets the form exactly like a save would. Confirmed against React's own
 * `ReactDOMForm-test.js`: the reset target is whatever `defaultValue` is
 * present at the moment the reset runs, and `onSubmit` + `startTransition`
 * (instead of the `action` prop) is the only documented opt-out — not
 * available here, since these forms are deliberately usable with JavaScript
 * disabled (`LoanActionForm`, `AssetActionForm`'s own doc comments).
 *
 * THE FIX STAYS ENTIRELY CLIENT-SIDE AND TOUCHES NO FIELD COMPONENT.
 * `LoanFields` / the Majetek inline fields stay plain Server-rendered,
 * uncontrolled inputs — reworking them into Client Components to make them
 * controlled would also break `t` (a plain function) crossing the
 * server-to-client boundary as a prop. Instead, this wraps the action handed
 * to `useActionState`: the instant a submission's `FormData` is known
 * (synchronously, before the action's promise ever resolves), every field
 * still present in `formRef.current` is re-stamped with what was just
 * typed — `defaultValue` for a text/date/number input or a textarea,
 * `defaultChecked` for a checkbox or radio, the matching `<option>`'s
 * `defaultSelected` for a `<select>`. That stamping happens strictly BEFORE
 * React's own post-completion reset can run, so the reset becomes a no-op:
 * it restores each field to the value already sitting there.
 */
export function usePreserveFormValues<S>(
  formRef: React.RefObject<HTMLFormElement | null>,
  action: (previous: S, formData: FormData) => S | Promise<S>,
): (previous: S, formData: FormData) => S | Promise<S> {
  return React.useCallback(
    (previous: S, formData: FormData) => {
      const form = formRef.current
      if (form) restoreDefaultsFrom(form, formData)
      return action(previous, formData)
    },
    [formRef, action],
  )
}

/**
 * Exported for `preserve-form-values.test.ts`, which drives it against plain
 * mock elements rather than real DOM classes — apps/beta's suite renders
 * Server Components to a string (`react-dom/server`) and has no jsdom, so
 * `instanceof HTMLInputElement` would be untestable here. `tagName` is the
 * same check a real `<input>` / `<textarea>` / `<select>` satisfies in a
 * browser, so nothing about the runtime behavior differs.
 */
export function restoreDefaultsFrom(
  form: HTMLFormElement,
  formData: FormData,
): void {
  for (const element of form.elements) {
    const name = (element as { name?: string }).name
    if (!name) continue

    const tag = (element as { tagName?: string }).tagName
    if (tag === "INPUT") {
      const input = element as HTMLInputElement
      if (input.type === "checkbox" || input.type === "radio") {
        input.defaultChecked = formData.getAll(name).includes(input.value)
      } else {
        input.defaultValue = formData.get(name)?.toString() ?? ""
      }
    } else if (tag === "TEXTAREA") {
      const textarea = element as HTMLTextAreaElement
      textarea.defaultValue = formData.get(name)?.toString() ?? ""
    } else if (tag === "SELECT") {
      const value = formData.get(name)?.toString() ?? ""
      for (const option of (element as HTMLSelectElement).options) {
        option.defaultSelected = option.value === value
      }
    }
  }
}
