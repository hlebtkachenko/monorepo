/**
 * Pattern-matches Better Auth signUpEmail() error messages to detect the
 * "email already registered" case. Better Auth does not currently expose
 * a typed error code for this, so we rely on the message string.
 *
 * BA version drift risk: if the message text changes upstream, this
 * regex must be updated. Keep the patterns broad to absorb minor
 * rewordings.
 */
export function isEmailAlreadyRegistered(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return /already.*exist|already.*registered|user.*exist|duplicate/i.test(
    err.message,
  )
}
