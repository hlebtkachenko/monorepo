/**
 * workspace-rls/require-with-organization
 *
 * Forbids raw `db.transaction`, `db.select`, `db.insert`, `db.update`,
 * `db.delete`, `db.execute` calls outside `packages/db/src/`. Consumers must
 * go through `withOrganization`, `withWorkspace`, or `withAdminBypass` which
 * set the RLS GUCs before running any query.
 *
 * Files inside `packages/db/src/` are explicitly excluded — that is where the
 * helpers themselves live.
 *
 * ESM rule (flat config). No CJS wrapper.
 */

const FORBIDDEN_METHODS = new Set(['transaction', 'select', 'insert', 'update', 'delete', 'execute']);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require withOrganization/withWorkspace/withAdminBypass wrappers; forbid raw db.* calls outside packages/db/src/',
      recommended: true,
    },
    schema: [],
    messages: {
      noRawDb:
        'Direct `db.{{ method }}(...)` is forbidden outside packages/db/src/. ' +
        'Use withOrganization(), withWorkspace(), or withAdminBypass() from @workspace/db.',
    },
  },

  create(context) {
    const filename = context.getFilename();

    // Allow inside the db package internals.
    if (filename.includes('/packages/db/src/')) {
      return {};
    }

    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== 'MemberExpression') return;
        if (callee.computed) return;
        if (callee.property.type !== 'Identifier') return;

        const method = callee.property.name;
        if (!FORBIDDEN_METHODS.has(method)) return;

        // Check that the object is named `db` or ends in `Db` (e.g. `adminDb`).
        const obj = callee.object;
        if (obj.type !== 'Identifier') return;
        if (obj.name !== 'db' && !obj.name.endsWith('Db')) return;

        context.report({
          node,
          messageId: 'noRawDb',
          data: { method },
        });
      },
    };
  },
};
