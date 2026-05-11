/**
 * workspace-rls/single-audit-writer
 *
 * Forbids direct `.insert(tool_call_log)` or `.update(tool_call_log)` calls
 * outside `packages/db/src/audit/`. All audit writes must go through the
 * `writeToolCallLog` / `updateToolCallLogOutput` helpers in the audit module,
 * which apply the two-pass redaction contract.
 *
 * Matches call chains like:
 *   tx.insert(tool_call_log)
 *   db.insert(tool_call_log).values(...)
 *   tx.update(tool_call_log).set(...)
 *
 * ESM rule (flat config).
 */

const WRITE_METHODS = new Set(['insert', 'update']);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid direct insert/update on tool_call_log outside packages/db/src/audit/',
      recommended: true,
    },
    schema: [],
    messages: {
      noDirectAuditWrite:
        'Direct `.{{ method }}(tool_call_log)` is forbidden outside packages/db/src/audit/. ' +
        'Use writeToolCallLog() or updateToolCallLogOutput() from @workspace/db/audit.',
    },
  },

  create(context) {
    const filename = context.getFilename();

    // Allow inside the audit module itself.
    if (filename.includes('/packages/db/src/audit/')) {
      return {};
    }

    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== 'MemberExpression') return;
        if (callee.computed) return;
        if (callee.property.type !== 'Identifier') return;

        const method = callee.property.name;
        if (!WRITE_METHODS.has(method)) return;

        // Check the argument: must be an identifier named `tool_call_log`.
        const args = node.arguments;
        if (args.length === 0) return;
        const firstArg = args[0];
        if (!firstArg) return;
        if (firstArg.type !== 'Identifier') return;
        if (firstArg.name !== 'tool_call_log') return;

        context.report({
          node,
          messageId: 'noDirectAuditWrite',
          data: { method },
        });
      },
    };
  },
};
