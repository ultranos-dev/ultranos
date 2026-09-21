// Regenerates the self-contained AppRouter type bundle consumed by other apps
// (admin-portal's tRPC client). Runs `tsc -p tsconfig.types.json` to emit inlined
// declarations to dist/types, then copies the fully self-contained _app.d.ts (no `@/`
// imports — the `typeof appRouter` type is inlined) to the committed types/app-router.d.ts.
//
// Run via: pnpm -F hub-api build:types
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

execSync('tsc -p tsconfig.types.json', { cwd: root, stdio: 'inherit' })

const emitted = resolve(root, 'dist/types/trpc/routers/_app.d.ts')
const dest = resolve(root, 'types/app-router.d.ts')

const header = [
  '// ⚠️ GENERATED — do not edit by hand.',
  '// Self-contained AppRouter type bundle for cross-app consumption (admin-portal tRPC',
  '// client) without deep-typechecking hub-api source. Regenerate after changing the',
  '// router API:  pnpm -F hub-api build:types',
  '',
  '',
].join('\n')

mkdirSync(dirname(dest), { recursive: true })
writeFileSync(dest, header + readFileSync(emitted, 'utf8'))
console.log(`[build:types] wrote ${dest}`)
