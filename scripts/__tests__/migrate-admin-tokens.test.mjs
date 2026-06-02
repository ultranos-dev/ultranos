// scripts/__tests__/migrate-admin-tokens.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateContent } from '../migrate-admin-tokens.mjs'

test('renames bg-canvas to bg-background', () => {
  assert.equal(
    migrateContent('className="bg-canvas"'),
    'className="bg-background"'
  )
})

test('renames bg-surface-raised before bg-surface (order matters)', () => {
  assert.equal(
    migrateContent('className="bg-surface-raised bg-surface"'),
    'className="bg-popover bg-card"'
  )
})

test('renames text-text-secondary and text-text-primary in one string', () => {
  assert.equal(
    migrateContent('className="text-text-secondary text-text-primary"'),
    'className="text-muted-foreground text-foreground"'
  )
})

test('renames text-text-muted to text-muted-foreground', () => {
  assert.equal(
    migrateContent('placeholder:text-text-muted'),
    'placeholder:text-muted-foreground'
  )
})

test('renames bg-accent-subtle to bg-primary/10', () => {
  assert.equal(
    migrateContent('className="bg-accent-subtle"'),
    'className="bg-primary/10"'
  )
})

test('does not rename bg-accent when bg-accent-subtle appears first', () => {
  assert.equal(
    migrateContent('className="bg-accent-subtle bg-accent"'),
    'className="bg-primary/10 bg-primary"'
  )
})

test('renames danger to destructive including border-s variant', () => {
  assert.equal(
    migrateContent('className="border-s-2 border-s-danger border-danger bg-danger-subtle text-danger"'),
    'className="border-s-2 border-s-destructive border-destructive bg-destructive/10 text-destructive"'
  )
})

test('handles opacity modifiers on renamed tokens', () => {
  assert.equal(
    migrateContent('border-accent/20'),
    'border-primary/20'
  )
})

test('handles responsive and variant prefixes', () => {
  assert.equal(
    migrateContent('hover:bg-surface-raised lg:text-text-primary'),
    'hover:bg-popover lg:text-foreground'
  )
})

test('handles template literal class strings', () => {
  assert.equal(
    migrateContent('`rounded-2xl bg-canvas p-6 ${condition ? "text-danger" : "text-text-secondary"}`'),
    '`rounded-2xl bg-background p-6 ${condition ? "text-destructive" : "text-muted-foreground"}`'
  )
})

test('does not rename partial token matches', () => {
  // mybg-canvas should not be touched
  assert.equal(
    migrateContent('mybg-canvas not-bg-surface'),
    'mybg-canvas not-bg-surface'
  )
})

test('renames ring-accent to ring-primary', () => {
  assert.equal(
    migrateContent('focus:ring-2 focus:ring-accent'),
    'focus:ring-2 focus:ring-primary'
  )
})

test('renames text-text-on-dark including with opacity modifier', () => {
  assert.equal(
    migrateContent('text-text-on-dark text-text-on-dark/40'),
    'text-primary-foreground text-primary-foreground/40'
  )
})
