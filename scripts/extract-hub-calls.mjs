/**
 * extract-hub-calls.mjs — Story 59.2 Task 1 (contract CI guard)
 *
 * Scans the three raw-fetch spokes' source trees for Hub tRPC procedure paths
 * (`router.procedure`) and returns a deterministic per-spoke inventory.
 *
 * The inventory is regenerated at TEST TIME by `apps/hub-api/src/__tests__/
 * spoke-contract.test.ts` — there is no hand-maintained (or committed
 * generated) list to go stale. Run standalone to inspect the inventory:
 *
 *   node scripts/extract-hub-calls.mjs
 *
 * Extraction idioms covered (all verified against real call sites):
 *
 *  A. Template-literal URL:   fetch(`${getHubApiUrl()}/lab.pullOrders?...`)
 *     — `${<hub-ish expr>}/router.procedure` where the interpolated base
 *     expression references the hub (matches /hub|trpc|base/i). Examples:
 *     getHubApiUrl(), hubUrl, HUB_API_URL, trpcUrl, getHubTrpcUrl(), base.
 *
 *  B. Helper with literal arg: makeTrpcProcedure('lab.syncQualityProfile'),
 *     buildUrl('registration.submitKyc') — function name must match
 *     /trpc|procedure|buildurl|hub/i so `where('subject.reference')`,
 *     `t('field.orderId')` etc. are excluded.
 *
 *  C. Pathname concatenation:  url.pathname = url.pathname.replace(/\/$/, '')
 *     + '/patient.checkDuplicates' — a quoted literal that is exactly
 *     "/router.procedure", on a line that also mentions url/pathname/fetch/
 *     hub/trpc. File-extension lookalikes (e.g. '/manifest.webmanifest')
 *     are excluded via EXT_BLACKLIST.
 *
 * Known limitations (documented, acceptable for this guard):
 *  - Fully dynamic paths (`/${path}` built from a variable that never
 *    appears as a matching literal) are not resolved — but every such
 *    helper today (makeTrpcProcedure, buildUrl) receives a string literal
 *    that idiom B catches at the call site.
 *  - Non-tRPC REST paths without a dot (e.g. `/consultation/requests`,
 *    `/restore/patients`) are intentionally out of scope.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join, resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Spokes that call the hub via raw fetch (admin-portal has a typed client). */
export const SPOKES = ['opd-lite', 'lab-lite', 'pharmacy-lite']

const SOURCE_EXTS = new Set(['.ts', '.tsx'])
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__', '__mocks__', 'dist'])

/** Second-segment "procedures" that are actually file extensions. */
const EXT_BLACKLIST = new Set([
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'css', 'scss', 'html',
  'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'txt', 'xml', 'map',
  'wasm', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'webmanifest', 'pdf', 'csv',
  'md', 'mp3', 'mp4', 'wav', 'onnx', 'zip', 'com', 'org', 'net', 'io',
])

// Router segment allows hyphens (real case: `ai-provenance.sync`);
// procedure segment is a plain JS identifier.
const PROC = String.raw`([A-Za-z][A-Za-z0-9-]*\.[A-Za-z_][A-Za-z0-9_]*)`

// Idiom A: `${<expr>}/router.procedure` — expr must look hub-ish. Allows
// intermediate dotless segments (real case: `${config.hubBaseUrl}/api/trpc/sync.push`).
const TEMPLATE_RE = new RegExp(String.raw`\$\{([^{}]+)\}((?:/[A-Za-z0-9_-]+)*)/${PROC}`, 'g')
const HUB_BASE_RE = /hub|trpc|base/i

// Idiom B: helperName('router.procedure') — helper must look hub/trpc-ish.
const HELPER_RE = new RegExp(String.raw`\b([A-Za-z_$][\w$]*)\(\s*['"]${PROC}['"]`, 'g')
const HELPER_NAME_RE = /trpc|procedure|buildurl|hub/i

// Idiom C: a quoted literal that is exactly '/router.procedure'.
const CONCAT_RE = new RegExp(String.raw`['"]/${PROC}['"]`, 'g')
const CONCAT_CONTEXT_RE = /pathname|fetch|url|hub|trpc/i

function isExtensionLookalike(procPath) {
  const second = procPath.split('.')[1]
  return EXT_BLACKLIST.has(second.toLowerCase())
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, files)
    } else {
      const dot = entry.lastIndexOf('.')
      const ext = dot >= 0 ? entry.slice(dot) : ''
      if (!SOURCE_EXTS.has(ext)) continue
      if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue
      if (entry.endsWith('.d.ts')) continue
      files.push(full)
    }
  }
  return files
}

function extractFromLine(line) {
  const found = []
  let m
  TEMPLATE_RE.lastIndex = 0
  while ((m = TEMPLATE_RE.exec(line)) !== null) {
    // m[1] = interpolated base expr, m[2] = intermediate segments, m[3] = procedure path
    if (HUB_BASE_RE.test(m[1]) && !isExtensionLookalike(m[3])) found.push(m[3])
  }
  HELPER_RE.lastIndex = 0
  while ((m = HELPER_RE.exec(line)) !== null) {
    if (HELPER_NAME_RE.test(m[1]) && !isExtensionLookalike(m[2])) found.push(m[2])
  }
  if (CONCAT_CONTEXT_RE.test(line)) {
    CONCAT_RE.lastIndex = 0
    while ((m = CONCAT_RE.exec(line)) !== null) {
      if (!isExtensionLookalike(m[1])) found.push(m[1])
    }
  }
  return found
}

/** Locate the monorepo root by walking up until pnpm-workspace.yaml is found. */
export function findRepoRoot(startDir) {
  let dir = resolve(startDir)
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('extract-hub-calls: could not locate monorepo root (pnpm-workspace.yaml)')
}

/**
 * @param {string} repoRoot absolute path to the monorepo root
 * @returns {{ [spoke: string]: Array<{ path: string, callSites: string[] }> }}
 *   Per-spoke inventories, sorted by procedure path; callSites are
 *   repo-relative `file:line` strings (forward slashes), sorted.
 */
export function extractHubCalls(repoRoot) {
  const inventory = {}
  for (const spoke of SPOKES) {
    const srcDir = join(repoRoot, 'apps', spoke, 'src')
    if (!existsSync(srcDir)) {
      throw new Error(`extract-hub-calls: missing spoke source dir: ${srcDir}`)
    }
    /** @type {Map<string, Set<string>>} */
    const byPath = new Map()
    for (const file of walk(srcDir)) {
      const rel = relative(repoRoot, file).split(sep).join('/')
      const lines = readFileSync(file, 'utf8').split('\n')
      for (let i = 0; i < lines.length; i++) {
        for (const procPath of extractFromLine(lines[i])) {
          if (!byPath.has(procPath)) byPath.set(procPath, new Set())
          byPath.get(procPath).add(`${rel}:${i + 1}`)
        }
      }
    }
    inventory[spoke] = [...byPath.keys()].sort().map((path) => ({
      path,
      callSites: [...byPath.get(path)].sort(),
    }))
  }
  return inventory
}

// Standalone: print the inventory as JSON for inspection.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const root = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
  const inventory = extractHubCalls(root)
  console.log(JSON.stringify(inventory, null, 2))
}
