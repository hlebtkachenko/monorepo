import orgBoundaryConfig from "@workspace/eslint-config/org-boundary"

/**
 * Warning-immune org-tree deletion-safety gate. Run via `lint:org-orphan`
 * (`eslint app lib e2e -c eslint.org-boundary.config.js`) so a forbidden import
 * into the frozen old tree fails independent of the base config's `only-warn`
 * downgrade. See `@workspace/eslint-config/org-boundary`.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default orgBoundaryConfig
