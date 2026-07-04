import { SetMetadata } from "@nestjs/common"

/** Reflector metadata key marking a route/controller as human-actor-only. */
export const REQUIRE_HUMAN_ACTOR_KEY = "require_human_actor"

/**
 * [#517] Declares that a route (or an entire controller) may be reached ONLY by
 * a `human`-actor API key. `ApiKeyGuard` enforces it after the key resolves: an
 * `agent`-actor key (an autonomous Brain client) is rejected with 403.
 *
 * This is the durable server-side backstop for the held-write review surface —
 * an agent proposes gated writes but can NEVER list or resolve the human review
 * queue. Applied at the CLASS level on `HeldWritesController`, so every current
 * AND future route on that controller inherits the deny by default (fail-closed
 * on a security boundary), rather than each method re-checking `actorKind`
 * inline and a new endpoint silently shipping open. It runs before, and is
 * independent of, the author≠approver rider.
 */
export const RequireHumanActor = () =>
  SetMetadata(REQUIRE_HUMAN_ACTOR_KEY, true)
