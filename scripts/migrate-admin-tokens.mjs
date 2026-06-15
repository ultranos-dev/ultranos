// scripts/migrate-admin-tokens.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Order matters: longer/more-specific tokens first to avoid partial-match collisions.
// e.g. bg-surface-raised must be processed before bg-surface.
const RENAMES = [
  // Surface hierarchy
  ['bg-surface-raised',   'bg-popover'],
  ['bg-surface',          'bg-card'],
  ['bg-canvas',           'bg-background'],

  // Text tokens — longest first
  ['text-text-secondary', 'text-muted-foreground'],
  ['text-text-primary',   'text-foreground'],
  ['text-text-on-dark',   'text-primary-foreground'],
  ['text-text-muted',     'text-muted-foreground'],

  // Accent → primary — longer variants first
  ['bg-accent-subtle',    'bg-primary/10'],
  ['bg-accent-hover',     'bg-primary/90'],
  ['bg-accent',           'bg-primary'],
  ['text-accent',         'text-primary'],
  ['border-accent',       'border-primary'],
  ['ring-accent',         'ring-primary'],

  // Danger → destructive — longer variants first
  ['bg-danger-subtle',    'bg-destructive/10'],
  ['border-s-danger',     'border-s-destructive'],
  ['bg-danger',           'bg-destructive'],
  ['text-danger',         'text-destructive'],
  ['border-danger',       'border-destructive'],
  ['ring-danger',         'ring-destructive'],

  // Warning/success subtle variants
  ['bg-warning-subtle',   'bg-warning/10'],
  ['bg-success-subtle',   'bg-success/10'],
]

// Files where codemod must not run (handled manually — see Task 7).
const EXCLUDED = [
  'apps/admin-portal/src/components/Sidebar.tsx',
]

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function migrateContent(content) {
  let result = content
  for (const [from, to] of RENAMES) {
    // Match `from` only when it's not preceded or followed by a word char or hyphen.
    // This handles: plain classes, :variant prefixes (hover:, focus:, lg:), and
    // opacity modifiers (border-accent/20 → border-primary/20).
    const regex = new RegExp(`(?<![\\w-])${escapeRegex(from)}(?![\\w-])`, 'g')
    result = result.replace(regex, to)
  }
  return result
}

function* walkDir(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkDir(fullPath)
    } else if (entry.isFile()) {
      const ext = extname(entry.name)
      if (ext === '.tsx' || ext === '.ts' || ext === '.css') {
        yield fullPath
      }
    }
  }
}

// Main — only runs when script is executed directly, not when imported by tests.
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  const DRY_RUN = process.argv.includes('--dry-run')
  const TARGET_DIR = 'apps/admin-portal/src'

  // Normalise to forward slashes for cross-platform path comparison
  const excluded = EXCLUDED.map(p => p.replace(/\\/g, '/'))

  let changedCount = 0
  for (const file of walkDir(TARGET_DIR)) {
    const normalised = file.replace(/\\/g, '/')
    if (excluded.some(ex => normalised.endsWith(ex.split('/').slice(-3).join('/')))) {
      console.log(`Skipping (manual): ${file}`)
      continue
    }

    const original = readFileSync(file, 'utf-8')
    const migrated = migrateContent(original)
    if (migrated === original) continue

    changedCount++
    if (DRY_RUN) {
      console.log(`\n[DRY RUN] ${file}`)
      const origLines = original.split('\n')
      const migLines  = migrated.split('\n')
      for (let i = 0; i < origLines.length; i++) {
        if (origLines[i] !== migLines[i]) {
          console.log(`  - ${origLines[i].trimEnd()}`)
          console.log(`  + ${migLines[i].trimEnd()}`)
        }
      }
    } else {
      writeFileSync(file, migrated, 'utf-8')
      console.log(`Updated: ${file}`)
    }
  }

  console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'} ${changedCount} file(s).`)
}
