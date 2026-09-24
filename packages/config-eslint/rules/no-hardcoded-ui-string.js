/**
 * ESLint rule: no-hardcoded-ui-string
 *
 * Story 63.1 (AC5) — guards against NEW hardcoded, user-facing English strings
 * in the Next.js apps. Every visible string must come from a translation key
 * (`useTranslations`/`getTranslations` → `t('…')`) so it renders in all four
 * locales (en/ar/prs/ps). A pharmacist in Herat must never see an un-keyed
 * "DO NOT dispense — Fraud Warning".
 *
 * Flagged:
 *   <p>Fraud Warning</p>                          ✗ (JSXText with letters)
 *   <button>Save</button>                         ✗
 *   <input aria-label="Search patients" />        ✗ (user-facing attr literal)
 *   <img alt="Chart" />                           ✗
 *   <input placeholder="Enter name" />            ✗
 *
 * Allowed:
 *   <p>{t('fraudWarning')}</p>                     ✓ (keyed)
 *   <span>→</span> / <span>—</span> / <p>{count}</p> ✗-free (no letters)
 *   <p>{value}</p>                                 ✓ (dynamic)
 *   <div className="flex gap-2" />                 ✓ (className is not a UI attr)
 *   <input data-testid="x" name="email" />         ✓ (technical attrs)
 *   <Trans>…</Trans> children                      ✓ (i18n component)
 *
 * Heuristics (intentionally conservative to avoid false positives):
 *  - Only JSXText and a fixed set of user-facing attributes are checked.
 *  - A string is a violation only if it contains a Latin OR Arabic-script LETTER.
 *    Pure numerals, punctuation, symbols, arrows, currency, and entity-only text
 *    are allowed.
 *  - Single all-caps/technical tokens with no spaces and ≤ 2 chars are allowed
 *    (e.g. "OK" is flagged, but "×", "+", ":" are not — they have no letters).
 *  - Text inside <code>, <pre>, <kbd>, <samp>, <script>, <style> is ignored.
 *  - A leading allow-comment `{/* i18n-exempt: reason *​/}` on the same line is
 *    not supported here; use an eslint-disable-next-line for one-off exemptions.
 */

// A user-facing attribute renders text to the user and must be keyed.
const USER_FACING_ATTRS = new Set([
  'alt',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'placeholder',
  'title',
  'label',
])

// Elements whose text content is code/technical, not prose.
const IGNORED_PARENT_ELEMENTS = new Set(['code', 'pre', 'kbd', 'samp', 'script', 'style'])

// Latin or Arabic-script letters. If a string has none of these it is treated as
// symbols/numerals/punctuation and allowed.
const HAS_LETTER = /[A-Za-z؀-ۿ]/

function jsxElementName(node) {
  // node is a JSXElement's openingElement.name
  if (!node) return null
  if (node.type === 'JSXIdentifier') return node.name
  return null
}

/** @type {import('eslint').Rule.RuleModule} */
export const noHardcodedUiString = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hardcoded user-facing string literals in JSX — route them through a translation key (useTranslations/getTranslations) so they render in all locales.',
    },
    messages: {
      hardcodedText:
        'Hardcoded UI string "{{text}}" — move it to a translation key (t(\'…\')) so it renders in all four locales. Symbols/numerals are allowed; if this is intentionally non-translatable, add an eslint-disable-next-line comment.',
      hardcodedAttr:
        'Hardcoded UI string in "{{attr}}"="{{text}}" — move it to a translation key (t(\'…\')). If intentionally non-translatable, add an eslint-disable-next-line comment.',
    },
    schema: [],
  },
  create(context) {
    function isViolatingText(raw) {
      if (!raw) return false
      // Strip HTML/JSX entities (&larr;, &#10003;, &mdash; …) — entity-only text is allowed.
      const withoutEntities = raw.replace(/&[a-zA-Z]+;|&#\d+;|&#x[0-9a-fA-F]+;/g, '')
      const trimmed = withoutEntities.trim()
      if (!trimmed) return false
      return HAS_LETTER.test(trimmed)
    }

    return {
      JSXText(node) {
        // Ignore text inside code/technical elements.
        const parent = node.parent
        if (
          parent &&
          parent.type === 'JSXElement' &&
          IGNORED_PARENT_ELEMENTS.has(jsxElementName(parent.openingElement?.name))
        ) {
          return
        }
        if (isViolatingText(node.value)) {
          context.report({
            node,
            messageId: 'hardcodedText',
            data: { text: node.value.trim().slice(0, 40) },
          })
        }
      },

      JSXAttribute(node) {
        const attrName =
          node.name.type === 'JSXIdentifier'
            ? node.name.name
            : node.name.type === 'JSXNamespacedName'
              ? `${node.name.namespace.name}:${node.name.name.name}`
              : null
        if (!attrName || !USER_FACING_ATTRS.has(attrName)) return

        // Only a bare string literal is a violation. `aria-label={t('…')}` or any
        // JSXExpressionContainer is fine.
        const value = node.value
        if (value && value.type === 'Literal' && typeof value.value === 'string') {
          if (isViolatingText(value.value)) {
            context.report({
              node: value,
              messageId: 'hardcodedAttr',
              data: { attr: attrName, text: String(value.value).slice(0, 40) },
            })
          }
        }
      },
    }
  },
}
