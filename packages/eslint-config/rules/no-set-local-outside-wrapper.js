/**
 * workspace-rls/no-set-local-outside-wrapper
 *
 * Forbids:
 *   1. String literals containing 'SET LOCAL app.' (bare SET in SQL template)
 *   2. Calls to set_config('app.', ...) as string literals outside packages/db/src/
 *
 * These patterns bypass the GUC contract. All GUC mutations must happen inside
 * the tenancy helpers (withOrganization / withWorkspace / withAdminBypass) in
 * packages/db/src/tenancy.ts which use parameterized set_config(..., true).
 *
 * ESM rule (flat config).
 */

const SET_LOCAL_RE = /SET\s+LOCAL\s+app\./i;
const SET_CONFIG_APP_RE = /set_config\s*\(\s*['"`]app\./i;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid SET LOCAL app.* and set_config(\'app.\', ...) strings outside packages/db/src/',
      recommended: true,
    },
    schema: [],
    messages: {
      noSetLocal:
        'Direct GUC mutation (SET LOCAL app.* or set_config(\'app.*\')) is forbidden outside ' +
        'packages/db/src/. Use withOrganization(), withWorkspace(), or withAdminBypass().',
    },
  },

  create(context) {
    const filename = context.getFilename();

    // Allow inside the db package internals.
    if (filename.includes('/packages/db/src/')) {
      return {};
    }

    function checkStringValue(node, value) {
      if (typeof value !== 'string') return;
      if (SET_LOCAL_RE.test(value) || SET_CONFIG_APP_RE.test(value)) {
        context.report({ node, messageId: 'noSetLocal' });
      }
    }

    return {
      Literal(node) {
        checkStringValue(node, node.value);
      },
      TemplateLiteral(node) {
        // Check the static quasis of template literals.
        for (const quasi of node.quasis) {
          checkStringValue(node, quasi.value.raw);
        }
      },
    };
  },
};
