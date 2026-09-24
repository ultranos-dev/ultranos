import { describe, it } from 'vitest'
import { RuleTester } from 'eslint'
import { noWallclockHlc } from '../no-wallclock-hlc.js'

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

describe('no-wallclock-hlc', () => {
  it('flags wall-clock values assigned into hlcTimestamp; allows real HLCs', () => {
    ruleTester.run('no-wallclock-hlc', noWallclockHlc, {
      valid: [
        // Real HLC helpers
        { code: 'const e = { hlcTimestamp: hlcNow() }' },
        { code: 'const e = { hlcTimestamp: serializeHlc(hlc.now()) }' },
        { code: 'const e = { hlcTimestamp: someHlcVar }' },
        { code: 'const e = { hlcTimestamp: params.hlcTimestamp }' },
        // Wall-clock into an UNrelated field is fine
        { code: 'const e = { createdAt: new Date().toISOString() }' },
        { code: 'const e = { timestamp: Date.now() }' },
        { code: 'obj.createdAt = new Date().toISOString()' },
        // Computed key we cannot statically resolve — not flagged
        { code: 'const e = { [key]: new Date().toISOString() }' },
      ],
      invalid: [
        {
          code: 'const e = { hlcTimestamp: new Date().toISOString() }',
          errors: [{ messageId: 'wallClockHlc' }],
        },
        {
          code: 'const e = { hlcTimestamp: new Date() }',
          errors: [{ messageId: 'wallClockHlc' }],
        },
        {
          code: 'const e = { hlcTimestamp: Date.now() }',
          errors: [{ messageId: 'wallClockHlc' }],
        },
        {
          code: 'const e = { hlcTimestamp: new Date(x).getTime() }',
          errors: [{ messageId: 'wallClockHlc' }],
        },
        {
          code: "const e = { 'hlcTimestamp': new Date().toISOString() }",
          errors: [{ messageId: 'wallClockHlc' }],
        },
        {
          code: 'obj.hlcTimestamp = new Date().toISOString()',
          errors: [{ messageId: 'wallClockHlc' }],
        },
      ],
    })
  })
})
