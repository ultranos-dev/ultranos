import { describe, it, expect } from 'vitest'
import { RuleTester } from 'eslint'
import { noPhysicalCss } from '../no-physical-css.js'

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

describe('no-physical-css', () => {
  it('flags physical Tailwind classes and suggests logical equivalents', () => {
    ruleTester.run('no-physical-css', noPhysicalCss, {
      valid: [
        { code: '<div className="ms-4 me-2 ps-3 pe-1" />' },
        { code: '<div className="start-0 end-4" />' },
        { code: '<div className="text-start text-end" />' },
        { code: '<div className="border-s-2 border-e-2" />' },
        { code: '<div className="rounded-s-lg rounded-e-lg" />' },
        { code: '<div className="mx-4 my-2 px-3 py-1" />' },
        { code: '<div className="flex gap-4 items-center" />' },
      ],
      invalid: [
        {
          code: '<div className="ml-4" />',
          errors: [{ messageId: 'physicalClass', data: { found: 'ml-4', suggestion: 'ms-4' } }],
        },
        {
          code: '<div className="mr-2" />',
          errors: [{ messageId: 'physicalClass', data: { found: 'mr-2', suggestion: 'me-2' } }],
        },
        {
          code: '<div className="pl-3" />',
          errors: [{ messageId: 'physicalClass', data: { found: 'pl-3', suggestion: 'ps-3' } }],
        },
        {
          code: '<div className="pr-1" />',
          errors: [{ messageId: 'physicalClass', data: { found: 'pr-1', suggestion: 'pe-1' } }],
        },
        {
          code: '<div className="left-0" />',
          errors: [{ messageId: 'physicalClass', data: { found: 'left-0', suggestion: 'start-0' } }],
        },
        {
          code: '<div className="right-4" />',
          errors: [{ messageId: 'physicalClass', data: { found: 'right-4', suggestion: 'end-4' } }],
        },
        {
          code: '<div className="text-left" />',
          errors: [{ messageId: 'physicalClass', data: { found: 'text-left', suggestion: 'text-start' } }],
        },
        {
          code: '<div className="text-right" />',
          errors: [{ messageId: 'physicalClass', data: { found: 'text-right', suggestion: 'text-end' } }],
        },
        {
          code: '<div className="border-l-2" />',
          errors: [{ messageId: 'physicalClass', data: { found: 'border-l-2', suggestion: 'border-s-2' } }],
        },
        {
          code: '<div className="border-r-2" />',
          errors: [{ messageId: 'physicalClass', data: { found: 'border-r-2', suggestion: 'border-e-2' } }],
        },
        {
          code: '<div className="rounded-l-lg" />',
          errors: [{ messageId: 'physicalClass', data: { found: 'rounded-l-lg', suggestion: 'rounded-s-lg' } }],
        },
        {
          code: '<div className="ml-4 pr-2 text-left" />',
          errors: [
            { messageId: 'physicalClass', data: { found: 'ml-4', suggestion: 'ms-4' } },
            { messageId: 'physicalClass', data: { found: 'pr-2', suggestion: 'pe-2' } },
            { messageId: 'physicalClass', data: { found: 'text-left', suggestion: 'text-start' } },
          ],
        },
      ],
    })
  })

  it('flags physical inline style properties and suggests logical equivalents', () => {
    ruleTester.run('no-physical-css-inline', noPhysicalCss, {
      valid: [
        { code: '<div style={{ marginInlineStart: "1rem" }} />' },
        { code: '<div style={{ paddingInlineEnd: "0.5rem" }} />' },
        { code: '<div style={{ insetInlineStart: 0 }} />' },
        { code: '<div style={{ textAlign: "start" }} />' },
        { code: '<div style={{ display: "flex", gap: "1rem" }} />' },
        { code: '<div style={{ borderInlineStart: "1px solid red" }} />' },
      ],
      invalid: [
        {
          code: '<div style={{ marginLeft: "1rem" }} />',
          errors: [{ messageId: 'physicalStyleProp', data: { found: 'marginLeft', suggestion: 'marginInlineStart' } }],
        },
        {
          code: '<div style={{ marginRight: "1rem" }} />',
          errors: [{ messageId: 'physicalStyleProp', data: { found: 'marginRight', suggestion: 'marginInlineEnd' } }],
        },
        {
          code: '<div style={{ paddingLeft: "0.5rem" }} />',
          errors: [{ messageId: 'physicalStyleProp', data: { found: 'paddingLeft', suggestion: 'paddingInlineStart' } }],
        },
        {
          code: '<div style={{ paddingRight: "0.5rem" }} />',
          errors: [{ messageId: 'physicalStyleProp', data: { found: 'paddingRight', suggestion: 'paddingInlineEnd' } }],
        },
        {
          code: '<div style={{ left: 0 }} />',
          errors: [{ messageId: 'physicalStyleProp', data: { found: 'left', suggestion: 'insetInlineStart' } }],
        },
        {
          code: '<div style={{ right: "10px" }} />',
          errors: [{ messageId: 'physicalStyleProp', data: { found: 'right', suggestion: 'insetInlineEnd' } }],
        },
        {
          code: '<div style={{ borderLeft: "1px solid red" }} />',
          errors: [{ messageId: 'physicalStyleProp', data: { found: 'borderLeft', suggestion: 'borderInlineStart' } }],
        },
        {
          code: '<div style={{ textAlign: "left" }} />',
          errors: [{ messageId: 'physicalTextAlign', data: { found: 'left', suggestion: 'start' } }],
        },
        {
          code: '<div style={{ textAlign: "right" }} />',
          errors: [{ messageId: 'physicalTextAlign', data: { found: 'right', suggestion: 'end' } }],
        },
      ],
    })
  })
})
