/**
 * ESLint rule: no-physical-css
 *
 * Flags physical directional Tailwind classes and inline CSS properties.
 * Physical properties break RTL layout; logical properties adapt automatically.
 *
 * Flagged Tailwind classes → Logical replacements:
 *   ml-*  → ms-*     mr-*  → me-*
 *   pl-*  → ps-*     pr-*  → pe-*
 *   left-* → start-* right-* → end-*
 *   text-left → text-start   text-right → text-end
 *   border-l-* → border-s-*  border-r-* → border-e-*
 *   rounded-l-* → rounded-s-* rounded-r-* → rounded-e-*
 *   scroll-ml-* → scroll-ms-* scroll-mr-* → scroll-me-*
 *   scroll-pl-* → scroll-ps-* scroll-pr-* → scroll-pe-*
 *
 * Flagged inline style properties → Logical replacements:
 *   marginLeft → marginInlineStart   marginRight → marginInlineEnd
 *   paddingLeft → paddingInlineStart paddingRight → paddingInlineEnd
 *   left → insetInlineStart          right → insetInlineEnd
 *   borderLeft → borderInlineStart   borderRight → borderInlineEnd
 */

const PHYSICAL_CLASS_PATTERN =
  /\b(ml-|mr-|pl-|pr-|left-|right-|text-left|text-right|border-l-|border-r-|rounded-l-|rounded-r-|float-left|float-right|scroll-ml-|scroll-mr-|scroll-pl-|scroll-pr-)\S*/g

const REPLACEMENTS = {
  'ml-': 'ms-',
  'mr-': 'me-',
  'pl-': 'ps-',
  'pr-': 'pe-',
  'left-': 'start-',
  'right-': 'end-',
  'text-left': 'text-start',
  'text-right': 'text-end',
  'border-l-': 'border-s-',
  'border-r-': 'border-e-',
  'rounded-l-': 'rounded-s-',
  'rounded-r-': 'rounded-e-',
  'float-left': 'float-start',
  'float-right': 'float-end',
  'scroll-ml-': 'scroll-ms-',
  'scroll-mr-': 'scroll-me-',
  'scroll-pl-': 'scroll-ps-',
  'scroll-pr-': 'scroll-pe-',
}

/**
 * Inline style property names (camelCase) that are physical directional.
 * Maps to their logical equivalents.
 */
const PHYSICAL_STYLE_PROPS = {
  marginLeft: 'marginInlineStart',
  marginRight: 'marginInlineEnd',
  paddingLeft: 'paddingInlineStart',
  paddingRight: 'paddingInlineEnd',
  left: 'insetInlineStart',
  right: 'insetInlineEnd',
  borderLeft: 'borderInlineStart',
  borderRight: 'borderInlineEnd',
  borderLeftWidth: 'borderInlineStartWidth',
  borderRightWidth: 'borderInlineEndWidth',
  borderLeftColor: 'borderInlineStartColor',
  borderRightColor: 'borderInlineEndColor',
  borderLeftStyle: 'borderInlineStartStyle',
  borderRightStyle: 'borderInlineEndStyle',
}

/**
 * textAlign values that are physical directional.
 */
const PHYSICAL_TEXT_ALIGN = {
  left: 'start',
  right: 'end',
}

function getSuggestion(match) {
  for (const [physical, logical] of Object.entries(REPLACEMENTS)) {
    if (match === physical.replace(/-$/, '') || match.startsWith(physical)) {
      return match.replace(physical, logical)
    }
  }
  return null
}

/** @type {import('eslint').Rule.RuleModule} */
export const noPhysicalCss = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow physical directional CSS/Tailwind classes and inline style properties — use logical equivalents for RTL support',
    },
    messages: {
      physicalClass:
        'Use logical property "{{suggestion}}" instead of physical "{{found}}" for RTL compatibility.',
      physicalStyleProp:
        'Use logical style property "{{suggestion}}" instead of physical "{{found}}" for RTL compatibility.',
      physicalTextAlign:
        'Use textAlign: "{{suggestion}}" instead of "{{found}}" for RTL compatibility.',
    },
    schema: [],
  },
  create(context) {
    function checkString(node, value) {
      let match
      PHYSICAL_CLASS_PATTERN.lastIndex = 0
      while ((match = PHYSICAL_CLASS_PATTERN.exec(value)) !== null) {
        const found = match[0]
        const suggestion = getSuggestion(found)
        if (suggestion) {
          context.report({
            node,
            messageId: 'physicalClass',
            data: { found, suggestion },
          })
        }
      }
    }

    function checkStyleObject(node) {
      if (!node || node.type !== 'ObjectExpression') return

      for (const prop of node.properties) {
        if (prop.type !== 'Property' || prop.computed) continue

        const keyName =
          prop.key.type === 'Identifier' ? prop.key.name :
          prop.key.type === 'Literal' ? String(prop.key.value) : null

        if (!keyName) continue

        // Check for physical directional property names
        if (PHYSICAL_STYLE_PROPS[keyName]) {
          context.report({
            node: prop.key,
            messageId: 'physicalStyleProp',
            data: {
              found: keyName,
              suggestion: PHYSICAL_STYLE_PROPS[keyName],
            },
          })
        }

        // Check textAlign: 'left' | 'right'
        if (
          keyName === 'textAlign' &&
          prop.value.type === 'Literal' &&
          typeof prop.value.value === 'string' &&
          PHYSICAL_TEXT_ALIGN[prop.value.value]
        ) {
          context.report({
            node: prop.value,
            messageId: 'physicalTextAlign',
            data: {
              found: prop.value.value,
              suggestion: PHYSICAL_TEXT_ALIGN[prop.value.value],
            },
          })
        }
      }
    }

    return {
      JSXAttribute(node) {
        // Check className string literals for Tailwind classes
        if (
          node.name.name === 'className' &&
          node.value &&
          node.value.type === 'Literal' &&
          typeof node.value.value === 'string'
        ) {
          checkString(node.value, node.value.value)
        }

        // Check style={{ ... }} for physical properties
        if (
          node.name.name === 'style' &&
          node.value &&
          node.value.type === 'JSXExpressionContainer'
        ) {
          checkStyleObject(node.value.expression)
        }
      },
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          checkString(quasi, quasi.value.raw)
        }
      },
    }
  },
}
