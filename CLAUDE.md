# Ultranos Ecosystem

A decentralized healthcare micro-app platform for low-resource, offline-prone clinical environments in MENA & Central Asia. Hub-and-Spoke architecture: four role-specific Spoke apps sync asynchronously to a FHIR R4-aligned Central Hub.

## Tech Stack

- **Admin Portal:** Next.js 15 PWA, TypeScript, Tailwind CSS v3, ShadCN UI (radix-ui), oklch semantic tokens (`apps/admin-portal/`)
- **OPD Lite (primary):** Next.js 15 PWA, TypeScript, Tailwind CSS, IndexedDB (encrypted via Web Crypto API), Service Worker for offline
- **OPD Lite Mobile:** Expo (React Native), TypeScript, SQLCipher, Android Keystore [SCAFFOLDED — future dev]
- **Patient Lite Mobile:** React Native 0.76+ (iOS + Android), RTL-first, TypeScript, SQLCipher
- **Pharmacy Lite:** Next.js 15 PWA, TypeScript, Tailwind CSS (standalone spoke — `apps/pharmacy-lite/`), ShadCN via ui-kit re-exports
- **Lab Lite:** Next.js 15 PWA, TypeScript, Tailwind CSS (push-only, data-minimized — `apps/lab-lite/`), ShadCN via ui-kit re-exports
- **Central Hub API:** Node.js, Express/Fastify, PostgreSQL 16, Redis, JWT (RS256)
- **AI Integration:** OpenAI-compatible API (Cloud LLM), Edge ONNX models, Cloud Vision OCR
- **Infrastructure:** Terraform, Docker, GitHub Actions CI/CD
- **Testing:** Vitest (unit), Playwright (e2e), Jest (React Native)

## Directory Structure

```
ultranos/
├── apps/
│   ├── hub-api/           # Central Hub backend (Node.js)
│   ├── opd-lite/           # OPD Lite Desktop PWA (Next.js)
│   ├── opd-lite-mobile/   # OPD Lite Mobile (Expo/React Native) [SCAFFOLDED — future dev]
│   ├── patient-lite-mobile/ # Patient app (React Native)
│   ├── pharmacy-lite/     # Pharmacy PWA (Next.js — standalone spoke)
│   └── lab-lite/          # Lab Diagnostics PWA (Next.js — push-only, data-minimized)
├── packages/
│   ├── shared-types/      # FHIR R4 type definitions, enums, interfaces
│   ├── sync-engine/       # Offline queue, HLC timestamps, conflict resolution
│   ├── crypto/            # Encryption helpers (Web Crypto + SQLCipher wrappers)
│   ├── drug-db/           # Drug interaction checker (online + offline subset)
│   ├── ui-kit/            # Shared component library: 14 ShadCN components, oklch tokens, shared Tailwind preset, RTL support
│   └── audit-logger/      # Structured audit event emitter
├── infra/                 # Terraform, Docker configs
├── docs/                  # PRD, architecture decisions, regulatory docs
│   └── prd-v3.md          # Master PRD — read this for full requirements
├── scripts/               # Dev tooling, seed data, migration helpers
└── CLAUDE.md
```

This is a **monorepo** managed with pnpm workspaces. Shared packages are in `packages/`. Each app imports from `@ultranos/<package-name>`.

## Critical Commands

```bash
pnpm install                          # Install all dependencies
pnpm -F hub-api dev                   # Run Hub API locally
pnpm -F opd-lite dev                  # Run OPD Lite Desktop PWA locally
pnpm -F patient-lite-mobile start     # Run Patient Lite Mobile in simulator
pnpm test                             # Run all tests
pnpm -F hub-api test                  # Run tests for a specific app
pnpm -F shared-types build            # Build a shared package
pnpm lint                             # Lint all (ESLint + Prettier)
pnpm typecheck                        # TypeScript check across monorepo
```

## ⛔ HEALTHCARE SAFETY RULES — NEVER VIOLATE

This is a healthcare system handling Protected Health Information (PHI). These rules are non-negotiable.

1. **PHI must never appear in logs, error messages, console output, or comments.** Patient names, IDs, diagnoses, medication names, allergies — none of it goes in `console.log()`, thrown error messages, Sentry breadcrumbs, or inline code comments. Use opaque IDs in logs. If you need to debug PHI-related logic, log the *shape* of data, never the *content*.

2. **All AI-generated clinical content requires a physician confirmation gate.** Never write code that auto-commits an AI-generated SOAP note, drug suggestion, or clinical translation to the patient record. There must always be an explicit user action (button tap, keyboard shortcut) between AI output and record commitment. Both the AI version and confirmed version must be stored.

3. **Drug interaction checks must never be skipped silently.** If the drug interaction check fails (network error, DB unavailable, timeout), the UI must show an explicit warning: "Interaction check unavailable." Never default to "no interactions found" on failure — that's a false negative that could kill someone.

4. **Allergy data gets the highest display prominence.** In any patient-facing view for clinicians, allergies render first, in red, never collapsed, never behind a tab. Allergy-related code paths get dedicated test coverage.

5. **Conflict resolution: Tier 1 fields are append-only.** Allergies, active medications, and critical diagnoses use append-only merge in the sync engine. Never write LWW (Last-Write-Wins) logic for these fields. See `packages/sync-engine/src/conflict-resolver.ts` for the tiered resolution logic.

6. **Audit every PHI access.** Every read, write, or access to patient data must emit a structured audit event via `@ultranos/audit-logger`. No exceptions. The audit log is append-only with SHA-256 hash chaining — never update or delete audit records.

7. **The Lab Portal can only see patient name + age.** The Lab Portal API endpoints must return ONLY first name and age for patient verification. If you're writing or modifying a Lab Portal endpoint and it returns any other patient data, that's a data minimization violation. This is enforced at the API layer, not the UI.

## Architecture Decisions

### Offline-First
Every clinical workflow must complete without a network connection. When writing a new feature, ask: "Does this work if I pull the ethernet cable right now?" If not, redesign it.
- Sync queue: `packages/sync-engine/` — durable, survives app restart
- Events stamped with Hybrid Logical Clocks (HLC), not `Date.now()`
- Priority sync order: allergies/consent → prescriptions → lab notifications → notes → vitals → metadata

### Encryption
- **Hub DB:** AES-256-GCM field-level encryption on PHI columns (diagnosis, prescription content, notes). See `packages/crypto/src/field-encrypt.ts`
- **Android local store:** SQLCipher. Key from Android Keystore. Never store the key in SharedPreferences or plaintext.
- **Desktop PWA:** Web Crypto API AES-GCM wrapping IndexedDB. Encryption key lives in memory only — cleared on tab/browser close. Never use `localStorage` or `sessionStorage` for PHI.
- **QR codes — Identity (Health Passport):** Contain `{ pid, iat, exp, v, sig? }` (JWT-standard short names for QR compactness: `pid` = patient_id, `iat` = issued_at, `exp` = expiry, `sig` = ECDSA-P256 signature) — never raw PHI.
- **QR codes — Prescription:** Contain `{ payload, sig, pub, issued_at, expiry }` where payload is a minified prescription bundle (medication codes, dosage, references — no demographics or clinical notes). Signed with Ed25519. Never raw PHI.

### FHIR R4 Alignment
All clinical data types in `packages/shared-types/` map to FHIR R4 resources. When creating a new clinical entity:
- Check if a FHIR R4 resource exists for it at https://hl7.org/fhir/R4/resourcelist.html
- Use the FHIR field names as the canonical source; add Ultranos extensions in a separate namespace
- Types live in `packages/shared-types/src/fhir/`
- **Meta fields:** Use FHIR R4 canonical `Meta` field names: `lastUpdated` (ISO 8601 instant), `versionId` (string). The `createdAt` field is an Ultranos extension and MUST live inside the `_ultranos` namespace, never in `meta`. Do NOT use `createdAt`/`updatedAt` in the `meta` object.

### UI Component System (ShadCN)

All Next.js apps use **ShadCN** components from `packages/ui-kit/src/components/ui/`. The 15 canonical components are: `badge`, `breadcrumb`, `button`, `dialog`, `dropdown-menu`, `empty-state`, `input`, `label`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `textarea`, `tooltip`.

**⛔ Source-level changes only — no app-level duplication:**
All changes to shared UI components (ShadCN components, tokens, language selector, sidebar layout, etc.) **MUST be made in `packages/ui-kit/src/`**, not duplicated or overridden at the app level. App-level overrides are only permitted when there is an explicit app-specific requirement that cannot be generalized. After any change to `packages/ui-kit/src/`, you MUST rebuild the package before apps can pick up the change:
```bash
pnpm --filter @ultranos/ui-kit build
# Then clear app .next caches if needed
rm -rf apps/<app-name>/.next
```
The compiled output lives in `packages/ui-kit/dist/`. Apps resolve imports through `dist/`, not source `.tsx` files — a source edit without a rebuild will have no effect. App-level `src/components/ui/` files are **thin re-export proxies only** — never put component logic or styling in them.

**Import rule — always import from `@ultranos/ui-kit/components/ui/<name>`:**
```typescript
// ✅ Correct — from shared ui-kit
import { Button, buttonVariants } from '@ultranos/ui-kit/components/ui/button'
import { Badge } from '@ultranos/ui-kit/components/ui/badge'
import { Dialog, DialogContent, DialogHeader } from '@ultranos/ui-kit/components/ui/dialog'

// ✅ Also correct — admin-portal re-exports proxy to ui-kit (zero import changes needed)
import { Button } from '@/components/ui/button'   // admin-portal only

// ❌ Wrong — never copy ShadCN source into app-local files
```

**Color tokens — oklch semantic system:**
All apps share the oklch L C H channel variables defined in `packages/ui-kit/src/tokens.css`. Use semantic Tailwind classes, never hardcoded hex or raw oklch values in component code:
```typescript
// ✅ Correct — semantic tokens
className="bg-primary text-primary-foreground hover:bg-primary/80"
className="bg-destructive/10 text-destructive"
className="bg-card border border-border rounded-2xl"

// ❌ Wrong — hardcoded values
className="bg-[#9fe870] text-[#163300]"
style={{ backgroundColor: 'oklch(0.527 0.154 150.069)' }}
```

**Fonts — Manrope (sans) + Public Sans (heading), all apps:**
Every Next.js app loads Manrope and Public Sans as local fonts with CSS variables  and . The  maps them as  and . Arabic/RTL overrides are handled via  (Noto Sans Arabic / Noto Naskh Arabic).

**Shared Tailwind preset — `@ultranos/ui-kit/tailwind.preset`:**
Every Next.js app's `tailwind.config.ts` MUST use the shared preset and MUST scan the ui-kit source:
```typescript
import preset from '@ultranos/ui-kit/tailwind.preset'

const config: Config = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui-kit/src/**/*.{ts,tsx}',  // ← REQUIRED: classes live in ui-kit source
  ],
  // ...app-specific font overrides only
}
```
**Omitting `../../packages/ui-kit/src/**/*.{ts,tsx}` from `content` causes missing CSS** (sidebar collapsing broken, icon sizes wrong, animations missing) because component class strings live in ui-kit, not the app's own src.

**Sidebar layout — ShadCN sidebar-07:**
All admin and spoke apps use the ShadCN sidebar-07 layout: `SidebarProvider` → `AppSidebar` + `SidebarInset`. `TooltipProvider` must wrap `SidebarProvider` because `SidebarMenuButton` uses `Tooltip` internally. See `apps/admin-portal/src/components/AuthGuard.tsx`.

**EmptyState component — `@ultranos/ui-kit/components/ui/empty-state`:**
Use `EmptyState` for all empty list, no-results, and zero-data states. Never build ad-hoc empty state markup inline.
```typescript
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { FileSearch } from '@ultranos/ui-kit/icons'

// Default (md) — vertical centered, use inside card bodies and full-page content areas
<EmptyState
  icon={FileSearch}
  title="No results found"
  description="Try adjusting your filters."
  action={{ label: 'Clear filters', onClick: handleClear }}
/>

// Compact (sm) — horizontal inline, use inside table rows and tight UI sections
<EmptyState size="sm" icon={FileSearch} title="No results" />
```
Props: `title` (required), `description`, `icon` (defaults to `Inbox`), `action` (`{ label, onClick }`), `size` (`'md'` | `'sm'`, default `'md'`), plus any `div` HTML attribute.

### Content Area Layout

**Shell structure (identical across all 4 apps):**
```
BreadcrumbHeader / PageHeader  →  h-14, sticky, border-b
<main id="main-content"        →  flex flex-1 flex-col gap-4 p-4
  <page root div>              →  flex flex-col gap-4  (or mx-auto max-w-* flex flex-col gap-4)
    section / card / grid      →  no mt-*, no mb-* on direct children — gap-4 handles spacing
```

**Governing rules — apply to every page file AND delegate component:**

| Rule | Standard |
|------|----------|
| Header height | `h-14` on all `BreadcrumbHeader` / `PageHeader` |
| Shell `<main>` | `flex flex-1 flex-col gap-4 p-4` + `id="main-content"` — never change |
| Page root div | `flex flex-col gap-4` — no `mt-*`, no extra `px-*`/`py-*`/`p-*` |
| `max-w-*` constraints | On the page root div: `mx-auto max-w-3xl flex flex-col gap-4` |
| Inner gap values | `gap-4` only (never `gap-5`, `gap-6`, `gap-8`) |
| Vertical stacking | `space-y-4` (never `space-y-6`) |
| Direct child margins | No `mb-6`, `mb-8`, `mt-4`, `mt-6` on direct children of the root — flex `gap-4` handles spacing |
| Custom page headers | Not allowed — `BreadcrumbHeader` / `PageHeader` is the only header per page |
| Nested `<main>` tags | Never — the shell already provides `<main>` |

**Delegate component rule:** Many page.tsx files render a single component with no wrapper (`return <Dashboard />`). The rendered component is effectively the page root and must follow the same layout rules as a page file. If the component has `mb-8` on its section children or wraps in a padded div, those are violations.

**What NOT to add on top of the shell's `p-4`:**
- ❌ `px-6 pb-6` wrapper divs inside the page
- ❌ `p-6` or `p-4` on the component root (creates double-padding)
- ❌ `mt-6`/`mt-4` on section divs
- ❌ `mb-8`/`mb-6` on flex-column children

### Icons

All icons across every app and the admin-portal are standardized on **lucide-react** via the shared `@ultranos/ui-kit` package.

**Import rule — always use the subpath for tree-shaking:**
```typescript
// ✅ Correct — tree-shakeable, only used icons bundled
import { Bell, ChevronRight, Microscope } from '@ultranos/ui-kit/icons'

// ❌ Wrong — pulls everything through the barrel export
import { Bell } from '@ultranos/ui-kit'

// ❌ Wrong — bypasses the shared catalog, causes version drift
import { Bell } from 'lucide-react'
```

**RTL mirroring — use `DirectionalIcon` from `@ultranos/ui-kit`:**
```typescript
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ChevronRight } from '@ultranos/ui-kit/icons'

// Navigation icons (arrows, chevrons, back buttons) → mirror in RTL
<DirectionalIcon category="navigation"><ChevronRight size={20} /></DirectionalIcon>

// Medical icons (pill, stethoscope, flask, microscope) → never mirror
<DirectionalIcon category="medical"><Microscope size={20} /></DirectionalIcon>
```

**Adding new icons:** Add to `packages/ui-kit/src/icons.ts` in the appropriate domain group. Never add lucide-react directly to an app's `package.json`.

**Intentionally kept as inline SVG** (do not migrate these):
- `apps/lab-lite/src/components/queue/token-icons.tsx` — custom filled geometric shapes; Lucide versions are outlined
- `apps/lab-lite/src/components/results/ResultColorIndicator.tsx` — `strokeWidth="2.5"` chosen deliberately for healthcare readability
- `apps/lab-lite/src/components/ai/ConfidenceIndicator.tsx` — custom hardcoded fill colors (#fee2e2, #dc2626 etc.)
- `apps/lab-lite/src/components/qc/QcHistoryView.tsx` — Levey-Jennings chart (data visualization, dynamic viewBox)
- `apps/lab-lite/src/components/patients/CulturalFlagsBanner.tsx` / `CulturalFlagsEditor.tsx` — data-driven flag path registry
- All `animate-spin` loading spinners — CSS animation SVGs, no Lucide equivalent

### Native Design Tokens (React Native / Expo apps)

The web token system (`tokens.css`, Tailwind, ShadCN) does not work in React Native. All Expo/React Native apps — currently `apps/pharmopedia/`, and future `apps/opd-lite-mobile/` and `apps/patient-lite-mobile/` — must use the shared JS token file instead.

**File:** `packages/ui-kit/src/tokens.native.ts`
**Import path:** `@ultranos/ui-kit/tokens.native`
**Package export:** declared in `packages/ui-kit/package.json` as `"./tokens.native": "./src/tokens.native.ts"`

```typescript
import { Colors, FontFamily, FontSize, Spacing, Radius, Shadow } from '@ultranos/ui-kit/tokens.native'

// ✅ Correct — use token values in StyleSheet.create()
const styles = StyleSheet.create({
  button: { backgroundColor: Colors.primary500, borderRadius: Radius.md },
  label:  { fontFamily: FontFamily.sansBold, color: Colors.neutral900 },
  card:   { padding: Spacing[4], marginBottom: Spacing[3] },
})

// ❌ Wrong — never hardcode hex, font names as string literals, or raw px values
const styles = StyleSheet.create({
  button: { backgroundColor: '#2563eb' },
  label:  { fontFamily: 'Manrope-Bold' },
})
```

**Primary color:** `Colors.primary500 = '#2e9e71'` (Ultranos Wise Green, derived from `hsl(156, 55%, 40%)` in `tokens.css`). Never use generic blue (`#2563eb`) as a primary in RN apps.

**Fonts in Expo apps:** Load Manrope and Public Sans via `@expo-google-fonts/manrope` and `@expo-google-fonts/public-sans` in the root `_layout.tsx` `useFonts()` call. The registered names must match the `FontFamily.*` constants exactly:
- `'Manrope'`, `'Manrope-Medium'`, `'Manrope-SemiBold'`, `'Manrope-Bold'`
- `'PublicSans'`, `'PublicSans-Bold'`
- `'NotoKufiArabic'` — for Arabic/RTL content, i.e. Arabic, Pashto, and Dari (`FontFamily.arabic`); loaded as a local TTF in `assets/fonts/`

**Metro config:** Expo apps using `expo-sqlite` require a `metro.config.js` that adds `.mjs` to `sourceExts` and `.wasm` to `assetExts`:
```javascript
const { getDefaultConfig } = require('expo/metro-config')
const config = getDefaultConfig(__dirname)
config.resolver.sourceExts.push('mjs')
config.resolver.assetExts.push('wasm')
module.exports = config
```

### RTL Support
Arabic and Dari are RTL languages. Every UI component must work in both LTR and RTL.
- Use logical CSS properties: `margin-inline-start` not `margin-left`, `padding-inline-end` not `padding-right`
- Navigation icons (arrows, chevrons) must mirror. Medical icons (pill, stethoscope) must NOT mirror.
- Test both directions. The CI pipeline runs RTL layout snapshots — don't skip them.

### Auth & Sessions
- Access tokens: JWT RS256, 15-min expiry, stored in memory only (never localStorage)
- Refresh tokens: opaque, server-side Redis, single-use rotation
- MFA: TOTP required for all clinical staff roles. Patient auth is OTP-only (no password).
- Desktop PWA: 30-min inactivity → re-auth required on clinical views. Tab close → encrypted cache cleared.

## Sync Engine — Conflict Resolution Tiers

When writing sync logic, use the correct tier:

| Tier | Fields | Strategy |
|------|--------|----------|
| **Tier 1 — Safety-Critical** | Allergies, active meds, critical diagnoses | Append-only merge. Both versions kept. Conflict flag for physician review. Prescription generation blocked until resolved. |
| **Tier 2 — Clinical** | Notes, lab results, vitals, historical prescriptions | Timestamp-based merge. Newer wins. Both versions kept as addenda. |
| **Tier 3 — Operational** | Demographics, preferences | Last-Write-Wins. |
| **Consent — High-Priority Sync** | Consent grants/withdrawals | Append-only ledger. Syncs at priority 1 (same as allergies) because consent changes affect data access enforcement at the Hub API layer. |
| **Tier 4 — Queue Events** | Multi-device offline events for same patient | Chronological replay by HLC. Events within 60s conflict window → flagged regardless of tier. |

## Testing Requirements

- Every drug interaction code path needs dedicated test cases including: CONTRAINDICATED blocking, ALLERGY_MATCH blocking, override-with-reason logging, and the "check unavailable" fallback warning
- Allergy display: snapshot tests confirming allergy section renders first, in red, uncollapsed
- Sync engine: test Tier 1 append-only behavior with simulated conflicting offline events
- RTL: snapshot tests for every patient-facing component in both LTR and RTL
- Audit: every API endpoint that touches PHI must have a test asserting an audit event was emitted
- Offline: integration tests that simulate network disconnection mid-operation and verify queue persistence

## ⛔ Git — No Autonomous Commits

**Agents must never stage files or create commits without an explicit user instruction to do so.** This applies in all contexts: after completing a task, at the end of a workflow, or when a skill or tool suggests it. The user controls all git operations.

- Do NOT run `git add`, `git commit`, or any variant automatically.
- Do NOT stage files as a "convenience" step after edits.
- Only commit when the user explicitly says "commit" or equivalent.

## ⛔ Parallel Agents — Worktree Isolation

**When dispatching two or more agents that will MODIFY files, run each in its own isolated git worktree** (the Agent tool's `isolation: "worktree"`). Agents sharing the main working tree can corrupt each other's and your uncommitted work.

- **Never let agents run `git stash`, `git checkout -- <path>`, `git reset`, or `git restore` in the shared working tree.** Concurrent stashes/pops in one tree silently revert everyone's uncommitted changes into a dangling stash (recoverable only via `git fsck`/reflog). This has already caused a full-tree revert incident — do not repeat it.
- If an agent needs a clean-tree comparison or a baseline, it must do it inside its own worktree, not by stashing the shared tree.
- Read-only / research agents (Explore, search, review) may share the tree — the rule is about *file-mutating* agents run in parallel.
- After parallel agents finish, verify integrity before trusting results: check `git status`, confirm expected changes are on disk (`grep` for hallmark edits), and watch for a staged/unstaged split (agents that ran `git add` leave changes in the index — `git diff` alone will not show them; use `git status --short` and `git diff --cached`).

## Decision Points

When you encounter a decision point (ambiguous design choice, multiple valid approaches, or a tradeoff that requires human judgment), always:

1. **Outline all viable options** with a short label (A, B, C...).
2. **Highlight your recommendation** for each decision with clear reasoning — consider effort, risk, alignment with project constraints, and pragmatism.
3. **Present to the user** before proceeding. Do not silently pick an option.

## When Compacting

When compacting, always preserve: the full list of modified files, any failing test names and their error messages, which sync tier is relevant to the current work, and the current module being worked on (hub-api, opd-lite, etc.).

## Database Operations — Supabase MCP Required

**All database operations MUST use the installed Supabase MCP tools.** Never write raw SQL in migration files manually, run `psql` commands, or use any other database client directly. Instead:

- **Executing SQL:** Use `mcp__plugin_supabase_supabase__execute_sql` for all queries (SELECT, INSERT, UPDATE, DELETE, DDL).
- **Migrations:** Use `mcp__plugin_supabase_supabase__apply_migration` to create and apply database migrations.
- **Listing tables:** Use `mcp__plugin_supabase_supabase__list_tables` to inspect the current schema.
- **Listing migrations:** Use `mcp__plugin_supabase_supabase__list_migrations` to review applied migrations.
- **Extensions:** Use `mcp__plugin_supabase_supabase__list_extensions` to check available/enabled Postgres extensions.
- **TypeScript types:** Use `mcp__plugin_supabase_supabase__generate_typescript_types` to regenerate types after schema changes.
- **Edge Functions:** Use `mcp__plugin_supabase_supabase__deploy_edge_function` and related tools for serverless function management.
- **Logs & debugging:** Use `mcp__plugin_supabase_supabase__get_logs` for production log inspection.
- **Advisors:** Use `mcp__plugin_supabase_supabase__get_advisors` for performance and security recommendations.
- **Branching:** Use Supabase branch tools (`create_branch`, `list_branches`, `merge_branch`, etc.) for database branching workflows.

This ensures all schema changes are tracked, reversible, and consistent with the Supabase project state.

## Key Reference Files

- Full PRD with all requirements: `ultranos_master_prd_v3.md`
- FHIR type definitions: `packages/shared-types/src/fhir/`
- Sync engine conflict resolver: `packages/sync-engine/src/conflict-resolver.ts`
- Audit event schema: `packages/audit-logger/src/schema.ts`
- Drug interaction severity levels: `packages/drug-db/src/severity.ts`
- Encryption helpers: `packages/crypto/src/`
- Consent data model: `packages/shared-types/src/fhir/consent.ts`
