import { describe, it } from 'vitest'
import { RuleTester } from 'eslint'
import { noHardcodedUiString } from '../no-hardcoded-ui-string.js'

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
})

describe('no-hardcoded-ui-string', () => {
  it('flags hardcoded JSX text + user-facing attrs; allows keyed/dynamic/symbol content', () => {
    ruleTester.run('no-hardcoded-ui-string', noHardcodedUiString, {
      valid: [
        // Keyed text
        { code: "const A = () => <p>{t('fraudWarning')}</p>" },
        // Dynamic expression
        { code: 'const A = () => <p>{value}</p>' },
        // Symbols / arrows / entities only (no letters) — allowed
        { code: 'const A = () => <span>→</span>' },
        { code: 'const A = () => <span>—</span>' },
        { code: 'const A = () => <span>{"…"}</span>' },
        { code: 'const A = () => <span>&larr;</span>' },
        { code: 'const A = () => <span>&#10003;</span>' },
        { code: 'const A = () => <span>+</span>' },
        // Pure number
        { code: 'const A = () => <span>42</span>' },
        // className is not a user-facing attribute
        { code: 'const A = () => <div className="flex gap-2 text-lg" />' },
        // Technical attributes are not user-facing
        { code: 'const A = () => <input name="email" data-testid="x" type="text" />' },
        // Keyed attribute value (expression container)
        { code: "const A = () => <input aria-label={t('search')} />" },
        // Code/technical element content ignored
        { code: 'const A = () => <code>const x = 1</code>' },
        { code: 'const A = () => <pre>SELECT * FROM t</pre>' },
      ],
      invalid: [
        {
          code: 'const A = () => <p>Fraud Warning</p>',
          errors: [{ messageId: 'hardcodedText' }],
        },
        {
          code: 'const A = () => <button>Save</button>',
          errors: [{ messageId: 'hardcodedText' }],
        },
        {
          code: 'const A = () => <input aria-label="Search patients" />',
          errors: [{ messageId: 'hardcodedAttr' }],
        },
        {
          code: 'const A = () => <img alt="Patient chart" src="x" />',
          errors: [{ messageId: 'hardcodedAttr' }],
        },
        {
          code: 'const A = () => <input placeholder="Enter name" />',
          errors: [{ messageId: 'hardcodedAttr' }],
        },
        {
          // Arabic-script hardcoded text is also flagged (must be keyed, not inlined).
          code: 'const A = () => <p>تحذير احتيال</p>',
          errors: [{ messageId: 'hardcodedText' }],
        },
      ],
    })
  })
})
