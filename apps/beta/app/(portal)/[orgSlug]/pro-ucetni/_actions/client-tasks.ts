"use server"

import { revalidatePath } from "next/cache"

import {
  createClientTask,
  createClientTaskTemplate,
  createMonthlyTaskSet,
  deleteClientTask,
  setClientTaskDone,
  updateClientTask,
  updateClientTaskTemplate,
} from "@/lib/data/client-tasks"
import { requireOwner, requireScope } from "@/lib/data/scope"
import { isCheckViolation } from "@/lib/pg-error"

import {
  formClientTaskLinkKind,
  formInteger,
  formOptionalText,
  formString,
  formUuid,
} from "./input"
import type { MonthlySetActionState, ProUcetniActionState } from "./state"

/**
 * Pro účetní › Úkoly klientovi (spec §3.4) — task CRUD, template CRUD, and
 * "Vytvořit měsíční sadu úkolů". Mirrors `zadavani.ts`'s own shape: every
 * action re-derives its own `OwnerScope` as its first statement (a Server
 * Action is a public POST endpoint, reachable without ever rendering the page
 * that holds its form or `pro-ucetni/layout.tsx`'s gate above it), and a
 * database CHECK refusal is turned into an ordinary error state rather than a
 * 500 carrying a constraint name.
 */

async function ownerFor(formData: FormData) {
  const orgSlug = formString(formData, "orgSlug")
  return {
    orgSlug,
    owner: requireOwner(await requireScope(orgSlug)),
  }
}

/** Both surfaces this write can change: the editing hub and the client's own
 * "Co od vás potřebujeme" (spec §2.1). */
function revalidateUkoly(orgSlug: string): void {
  revalidatePath(`/${orgSlug}/pro-ucetni/ukoly`)
  revalidatePath(`/${orgSlug}`)
}

const INVALID: ProUcetniActionState = {
  status: "error",
  error: "ukoly.errorInvalidInput",
}

/** Run a write, turning a database CHECK refusal into an ordinary error state
 * — see `zadavani.ts`'s own header for why this catch exists at all. */
async function guarded(
  write: () => Promise<ProUcetniActionState>,
): Promise<ProUcetniActionState> {
  try {
    return await write()
  } catch (error) {
    if (isCheckViolation(error)) {
      return { status: "error", error: "ukoly.errorRejected" }
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createClientTaskAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const title = formString(formData, "title")
  const dueDate = formString(formData, "dueDate")
  const linkKind = formClientTaskLinkKind(formData, "linkKind") ?? "none"
  if (title.length === 0 || dueDate.length === 0) return INVALID

  return guarded(async () => {
    const result = await createClientTask(owner, {
      title,
      description: formOptionalText(formData, "description"),
      dueDate,
      linkKind,
    })
    if (!result.ok) return refusal(result.reason)

    revalidateUkoly(orgSlug)
    return { status: "ok", message: "ukoly.okCreated" }
  })
}

export async function saveClientTaskAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const taskId = formUuid(formData, "taskId")
  const title = formString(formData, "title")
  const dueDate = formString(formData, "dueDate")
  const linkKind = formClientTaskLinkKind(formData, "linkKind") ?? "none"
  if (taskId === null || title.length === 0 || dueDate.length === 0) {
    return INVALID
  }

  return guarded(async () => {
    const result = await updateClientTask(owner, taskId, {
      title,
      description: formOptionalText(formData, "description"),
      dueDate,
      linkKind,
    })
    if (!result.ok) return refusal(result.reason)

    revalidateUkoly(orgSlug)
    return { status: "ok", message: "ukoly.okSaved" }
  })
}

/** "Dokončit" / "Otevřít znovu" — a two-state field posted explicitly as
 * `done=true` / `done=false`, the same discipline `setFilingPaidAction`
 * documents: absence must never be readable as one direction or the other. */
export async function setClientTaskDoneAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const taskId = formUuid(formData, "taskId")
  const done = formString(formData, "done")
  if (taskId === null || (done !== "true" && done !== "false")) return INVALID

  return guarded(async () => {
    const saved = await setClientTaskDone(owner, taskId, done === "true")
    if (!saved) return { status: "error", error: "ukoly.errorNotFound" }

    revalidateUkoly(orgSlug)
    return {
      status: "ok",
      message: done === "true" ? "ukoly.okMarkedDone" : "ukoly.okMarkedOpen",
    }
  })
}

export async function deleteClientTaskAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const taskId = formUuid(formData, "taskId")
  if (taskId === null) return INVALID

  return guarded(async () => {
    const deleted = await deleteClientTask(owner, taskId)
    if (!deleted) return { status: "error", error: "ukoly.errorNotFound" }

    revalidateUkoly(orgSlug)
    return { status: "ok", message: "ukoly.okDeleted" }
  })
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function createClientTaskTemplateAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const title = formString(formData, "title")
  const templateDueDay = formInteger(formData, "templateDueDay", {
    min: 1,
    max: 31,
  })
  const linkKind = formClientTaskLinkKind(formData, "linkKind") ?? "none"
  if (title.length === 0 || templateDueDay === null) {
    return { status: "error", error: "ukoly.errorInvalidDueDay" }
  }

  return guarded(async () => {
    const result = await createClientTaskTemplate(owner, {
      title,
      description: formOptionalText(formData, "description"),
      templateDueDay,
      linkKind,
    })
    if (!result.ok) return refusal(result.reason)

    revalidateUkoly(orgSlug)
    return { status: "ok", message: "ukoly.okCreated" }
  })
}

export async function saveClientTaskTemplateAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const templateId = formUuid(formData, "templateId")
  const title = formString(formData, "title")
  const templateDueDay = formInteger(formData, "templateDueDay", {
    min: 1,
    max: 31,
  })
  const linkKind = formClientTaskLinkKind(formData, "linkKind") ?? "none"
  if (templateId === null || title.length === 0 || templateDueDay === null) {
    return { status: "error", error: "ukoly.errorInvalidDueDay" }
  }

  return guarded(async () => {
    const result = await updateClientTaskTemplate(owner, templateId, {
      title,
      description: formOptionalText(formData, "description"),
      templateDueDay,
      linkKind,
    })
    if (!result.ok) return refusal(result.reason)

    revalidateUkoly(orgSlug)
    return { status: "ok", message: "ukoly.okSaved" }
  })
}

export async function deleteClientTaskTemplateAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const templateId = formUuid(formData, "templateId")
  if (templateId === null) return INVALID

  return guarded(async () => {
    const deleted = await deleteClientTask(owner, templateId)
    if (!deleted) return { status: "error", error: "ukoly.errorNotFound" }

    revalidateUkoly(orgSlug)
    return { status: "ok", message: "ukoly.okDeleted" }
  })
}

/** Both task and template writes hit the same three refusal reasons — one
 * mapping for both rather than two copies. */
function refusal(
  reason: "invalid_title" | "invalid_date" | "not_found" | "invalid_due_day",
): ProUcetniActionState {
  switch (reason) {
    case "invalid_title":
      return { status: "error", error: "ukoly.errorTitleRequired" }
    case "invalid_date":
      return { status: "error", error: "ukoly.errorInvalidDate" }
    case "invalid_due_day":
      return { status: "error", error: "ukoly.errorInvalidDueDay" }
    case "not_found":
      return { status: "error", error: "ukoly.errorNotFound" }
  }
}

// ---------------------------------------------------------------------------
// "Vytvořit měsíční sadu úkolů"
// ---------------------------------------------------------------------------

export async function createMonthlySetAction(
  _previous: MonthlySetActionState,
  formData: FormData,
): Promise<MonthlySetActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const year = formInteger(formData, "year", { min: 2000, max: 2100 })
  const month = formInteger(formData, "month", { min: 1, max: 12 })
  if (year === null || month === null) {
    return { status: "error", error: "ukoly.errorInvalidPeriod" }
  }

  const outcome = await createMonthlyTaskSet(owner, { year, month })
  if (!outcome.ok) {
    return { status: "error", error: "ukoly.errorInvalidPeriod" }
  }

  revalidateUkoly(orgSlug)
  return {
    status: "ok",
    created: outcome.result.created,
    alreadyExisted: outcome.result.alreadyExisted,
  }
}
