/**
 * workspace-rls/no-bare-role-identifier
 *
 * Forbids standalone `role` object property shorthand and standalone `role`
 * identifiers in contexts where `workspaceRole` or `organizationRole` should
 * be used instead. Low-priority fence; primarily catches accidental use of a
 * bare `role` string/identifier as a DB column reference instead of the typed
 * enum column.
 *
 * Targets patterns like:
 *   { role: someValue }   where the key is a plain string 'role'
 *   db.select({ role })   shorthand object property
 *
 * NOT flagged: function parameter names, local variable names, non-DB contexts.
 * The rule is advisory (registered under onlyWarn in base.js).
 *
 * ESM rule (flat config).
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer workspaceRole or organizationRole over bare `role` identifier in DB schema contexts',
      recommended: false,
    },
    schema: [],
    messages: {
      noBareRole:
        'Avoid bare `role` identifier in DB expressions. ' +
        'Use workspaceRole or organizationRole enum columns from @workspace/db.',
    },
  },

  create(context) {
    const filename = context.getFilename();

    // Only apply inside the monorepo source (skip node_modules, dist).
    if (filename.includes('node_modules') || filename.includes('/dist/')) {
      return {};
    }

    // Shorthand property: `{ role }` inside a select/values call.
    return {
      Property(node) {
        if (!node.shorthand) return;
        if (node.key.type !== 'Identifier') return;
        if (node.key.name !== 'role') return;

        // Only flag if the parent is an ObjectExpression that is an argument
        // to a CallExpression (db.select({ role }), etc.).
        const parent = node.parent;
        if (!parent || parent.type !== 'ObjectExpression') return;
        const grandParent = parent.parent;
        if (!grandParent || grandParent.type !== 'CallExpression') return;

        context.report({ node, messageId: 'noBareRole' });
      },
    };
  },
};
