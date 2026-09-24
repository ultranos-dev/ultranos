/**
 * ESLint rule: no-wallclock-hlc
 *
 * Story 60.1 — forbids assigning a wall-clock value into a field named
 * `hlcTimestamp`. Sync ordering across offline devices depends on `hlcTimestamp`
 * being a serialized Hybrid Logical Clock (from `serializeHlc(hlc.now())` /
 * `hlcNow()`), never `Date.now()` or `new Date()...`. A wall-clock stamp here
 * mis-parses at the Hub and can silently reorder or drop a clinical write.
 *
 * Flagged (object property OR assignment where the key/target is `hlcTimestamp`):
 *   { hlcTimestamp: new Date().toISOString() }   ✗
 *   { hlcTimestamp: new Date(...)  }              ✗
 *   { hlcTimestamp: Date.now() }                  ✗
 *   obj.hlcTimestamp = new Date().toISOString()   ✗
 *
 * Allowed:
 *   { hlcTimestamp: hlcNow() }                    ✓
 *   { hlcTimestamp: serializeHlc(hlc.now()) }     ✓
 *   { hlcTimestamp: someHlcVar }                  ✓
 */

const HLC_FIELD = 'hlcTimestamp'

/** Does this expression node produce a wall-clock value (Date.now() / new Date(...))? */
function isWallClockExpression(node) {
  if (!node) return false

  // new Date(...) — with or without a chained method call like .toISOString()
  if (node.type === 'NewExpression') {
    return node.callee.type === 'Identifier' && node.callee.name === 'Date'
  }

  // Date.now() or a call whose ultimate object is `new Date(...)`
  // e.g. new Date().toISOString(), new Date(x).getTime()
  if (node.type === 'CallExpression') {
    const callee = node.callee
    // Date.now()
    if (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      callee.object.name === 'Date' &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'now'
    ) {
      return true
    }
    // new Date(...).<method>()  →  recurse into the member object
    if (callee.type === 'MemberExpression') {
      return isWallClockExpression(callee.object)
    }
  }

  return false
}

/** @type {import('eslint').Rule.RuleModule} */
export const noWallclockHlc = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow assigning a wall-clock value (Date.now() / new Date()) into an hlcTimestamp field — it must be a serialized HLC (hlcNow() / serializeHlc(hlc.now())).',
    },
    messages: {
      wallClockHlc:
        'hlcTimestamp must be a serialized HLC (hlcNow() or serializeHlc(hlc.now())), not a wall-clock value. A Date here mis-parses at the Hub and can reorder or drop the sync write.',
    },
    schema: [],
  },
  create(context) {
    function keyName(keyNode) {
      if (keyNode.type === 'Identifier') return keyNode.name
      if (keyNode.type === 'Literal') return String(keyNode.value)
      return null
    }

    return {
      // { hlcTimestamp: <wall-clock> }
      Property(node) {
        if (node.computed) return
        if (keyName(node.key) !== HLC_FIELD) return
        if (isWallClockExpression(node.value)) {
          context.report({ node: node.value, messageId: 'wallClockHlc' })
        }
      },
      // obj.hlcTimestamp = <wall-clock>
      AssignmentExpression(node) {
        const left = node.left
        if (
          left.type === 'MemberExpression' &&
          !left.computed &&
          left.property.type === 'Identifier' &&
          left.property.name === HLC_FIELD &&
          isWallClockExpression(node.right)
        ) {
          context.report({ node: node.right, messageId: 'wallClockHlc' })
        }
      },
    }
  },
}
