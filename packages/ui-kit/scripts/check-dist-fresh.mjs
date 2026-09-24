#!/usr/bin/env node
/**
 * dist-staleness guard for @ultranos/ui-kit (Story 63.3, AC1).
 *
 * The package resolves its BARREL (`.`), `./icons`, and `./hooks/*` subpath
 * exports through compiled `dist/` output, while component subpath exports
 * (`./components/ui/*`) resolve directly from `src/*.tsx`. Because the barrel is
 * compiled, a `src` edit that is not followed by `pnpm --filter @ultranos/ui-kit
 * build` leaves barrel importers reading pre-edit code — the exact drift this
 * check catches.
 *
 * Exits non-zero when the newest compiled-input `src` file is newer than the
 * newest `dist` file (i.e. dist is stale, or missing entirely). Intended to be
 * wired into CI (documented follow-up) and runnable locally via
 * `pnpm --filter @ultranos/ui-kit check:dist`.
 *
 * It mirrors tsconfig's compile scope: test files and src-only exports (native,
 * tailwind preset, ConnectedLanguageSelector, useAppLocale) never emit to dist,
 * so counting them as "inputs" would produce false staleness. The exclude list
 * below is kept in sync with packages/ui-kit/tsconfig.json `exclude`.
 */

import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = dirname(here)
const srcDir = join(pkgRoot, 'src')
const distDir = join(pkgRoot, 'dist')

// Paths (relative to src/, using OS separators) that tsconfig excludes from the
// compile and therefore never appear in dist. Keep in sync with tsconfig.json.
const EXCLUDED_SEGMENTS = [
  `__tests__${sep}`,
  `native${sep}`,
]
const EXCLUDED_FILES = new Set(
  [
    'hooks/useAppLocale.ts',
    'tailwind.preset.ts',
    'components/ConnectedLanguageSelector.tsx',
  ].map((p) => p.split('/').join(sep)),
)

/** Recursively collect newest mtime (ms) among files matching `filter`. */
function newestMtime(dir, filter) {
  let newest = 0
  let newestPath = null
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (filter(full)) {
        const m = statSync(full).mtimeMs
        if (m > newest) {
          newest = m
          newestPath = full
        }
      }
    }
  }
  walk(dir)
  return { mtime: newest, path: newestPath }
}

function isCompiledInput(fullPath) {
  const rel = fullPath.slice(srcDir.length + 1)
  if (!/\.(ts|tsx)$/.test(rel)) return false
  if (/\.(test|d)\.(ts|tsx)$/.test(rel)) return false
  if (EXCLUDED_SEGMENTS.some((seg) => rel.includes(seg))) return false
  if (EXCLUDED_FILES.has(rel)) return false
  return true
}

if (!existsSync(distDir)) {
  console.error(
    '[check-dist-fresh] dist/ is missing. Run: pnpm --filter @ultranos/ui-kit build',
  )
  process.exit(1)
}

const src = newestMtime(srcDir, isCompiledInput)
const dist = newestMtime(distDir, () => true)

if (src.mtime > dist.mtime) {
  console.error(
    '[check-dist-fresh] STALE: newest src file is newer than newest dist file.',
  )
  console.error(`  newest src : ${src.path}`)
  console.error(`  newest dist: ${dist.path ?? '(none)'}`)
  console.error('  Fix: pnpm --filter @ultranos/ui-kit build')
  process.exit(1)
}

console.log('[check-dist-fresh] OK: dist is at least as new as src.')
process.exit(0)
