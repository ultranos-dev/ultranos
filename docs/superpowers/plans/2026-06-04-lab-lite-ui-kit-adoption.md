# Lab Lite — UI Kit Adoption Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `apps/lab-lite` up to the shared `packages/ui-kit` foundation — adopt the shared Tailwind preset, and resolve the `Tooltip` naming collision by renaming the existing custom help-tip component to `HelpTip` and introducing a thin re-export of the ShadCN `Tooltip` from ui-kit.

**Architecture:** The Tailwind preset (`@ultranos/ui-kit/tailwind.preset`) is deep-merged into lab-lite's config via `presets: [preset]`, so all existing app-specific color scales, pill tokens, and danger token are preserved untouched. The custom `Tooltip` component (a `?`-trigger help widget) is renamed `HelpTip` at both the file level and all two import sites. A new lowercase `tooltip.tsx` thin re-export stands in its place so future lab-lite code can reach the ShadCN Tooltip at `@/components/ui/tooltip` without a naming clash.

**Tech Stack:** Tailwind CSS v3, Next.js 15, TypeScript 5.4, pnpm workspaces, `@ultranos/ui-kit` workspace package.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `apps/lab-lite/tailwind.config.ts` — add `presets: [preset]` import |
| Rename | `apps/lab-lite/src/components/ui/Tooltip.tsx` → `apps/lab-lite/src/components/ui/HelpTip.tsx` |
| Modify | `apps/lab-lite/src/components/MetadataForm.tsx` — update Tooltip → HelpTip import |
| Modify | `apps/lab-lite/src/components/patients/CulturalFlagsEditor.tsx` — update Tooltip → HelpTip import |
| Create | `apps/lab-lite/src/components/ui/tooltip.tsx` — thin ShadCN re-export |

---

### Task 1: Wire up the shared Tailwind preset

**Files:**
- Modify: `apps/lab-lite/tailwind.config.ts`

- [ ] **Step 1: Update `tailwind.config.ts`**

Replace the entire file with:

```typescript
import type { Config } from 'tailwindcss'
import preset from '@ultranos/ui-kit/tailwind.preset'

const config: Config = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-family-sans)', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          400: 'var(--color-primary-400)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
        },
        neutral: {
          50: 'var(--color-neutral-50)',
          100: 'var(--color-neutral-100)',
          200: 'var(--color-neutral-200)',
          300: 'var(--color-neutral-300)',
          400: 'var(--color-neutral-400)',
          500: 'var(--color-neutral-500)',
          600: 'var(--color-neutral-600)',
          700: 'var(--color-neutral-700)',
          800: 'var(--color-neutral-800)',
          900: 'var(--color-neutral-900)',
        },
        'pill-green': '#9fe870',
        'pill-text': '#163300',
        danger: 'var(--color-danger)',
      },
      borderRadius: {
        pill: '9999px',
      },
    },
  },
  plugins: [],
}

export default config
```

> The preset contributes `darkMode: ['selector', '[data-theme="dark"]']` and the ShadCN semantic color mappings (`background`, `foreground`, `card`, `primary.DEFAULT`, `primary.foreground`, etc.). Lab-lite's existing `primary` scale (`50`–`900`) deep-merges cleanly with the preset's `primary.DEFAULT` / `primary.foreground` — Tailwind merges nested color maps rather than overwriting them. All app-specific tokens (`pill-green`, `pill-text`, `danger`, `neutral` scale, `pill` border radius) are preserved exactly as before.

- [ ] **Step 2: Verify the Tailwind build resolves the preset**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 new TypeScript errors. If you see `Cannot find module '@ultranos/ui-kit/tailwind.preset'`, verify that `packages/ui-kit/package.json` has the export `"./tailwind.preset": "./src/tailwind.preset.ts"` (added in the UI Kit Extraction plan, Task 7).

- [ ] **Step 3: Commit**

```bash
git add apps/lab-lite/tailwind.config.ts
git commit -m "chore(lab-lite): adopt shared ui-kit tailwind preset"
```

---

### Task 2: Rename `Tooltip.tsx` → `HelpTip.tsx`

**Files:**
- Rename: `apps/lab-lite/src/components/ui/Tooltip.tsx` → `apps/lab-lite/src/components/ui/HelpTip.tsx`

The existing `Tooltip` component is a self-contained "help tip" widget: a small `?` button that reveals a tooltip bubble on hover/focus. Its interface is `{ content: string, children?: ReactNode }`. This is a fundamentally different pattern from the ShadCN `Tooltip` (a generic Radix-based wrapper around arbitrary triggers). Renaming avoids a silent import collision when the ShadCN Tooltip re-export is introduced in Task 3.

- [ ] **Step 1: Create `HelpTip.tsx` with the renamed export**

Create `apps/lab-lite/src/components/ui/HelpTip.tsx` with this exact content (identical to the original `Tooltip.tsx` except the exported function name changes from `Tooltip` to `HelpTip`):

```tsx
'use client'

import { useState } from 'react'

interface HelpTipProps {
  content: string
  children?: React.ReactNode
}

export function HelpTip({ content, children }: HelpTipProps) {
  const [visible, setVisible] = useState(false)

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-neutral-200 text-xs text-neutral-500 hover:bg-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-300"
        aria-label={content}
      >
        {children ?? '?'}
      </button>
      {visible && (
        <div
          role="tooltip"
          className="absolute bottom-full start-1/2 z-30 mb-1.5 w-56 -translate-x-1/2 rounded-md bg-neutral-800 px-3 py-2 text-xs text-white shadow-lg"
        >
          {content}
          <div className="absolute top-full start-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-800" />
        </div>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Delete the original `Tooltip.tsx`**

```bash
git rm apps/lab-lite/src/components/ui/Tooltip.tsx
```

- [ ] **Step 3: Commit the rename**

```bash
git add apps/lab-lite/src/components/ui/HelpTip.tsx
git commit -m "refactor(lab-lite): rename Tooltip → HelpTip to free the name for ShadCN re-export"
```

---

### Task 3: Update all import sites

**Files:**
- Modify: `apps/lab-lite/src/components/MetadataForm.tsx`
- Modify: `apps/lab-lite/src/components/patients/CulturalFlagsEditor.tsx`

There are exactly two import sites of the old `Tooltip`. Both must be updated before the typecheck in Task 5 can pass.

- [ ] **Step 1: Update `MetadataForm.tsx`**

In `apps/lab-lite/src/components/MetadataForm.tsx`, line 7:

Old:
```typescript
import { Tooltip } from '@/components/ui/Tooltip'
```

New:
```typescript
import { HelpTip } from '@/components/ui/HelpTip'
```

Also update every JSX usage of `<Tooltip` → `<HelpTip` and `</Tooltip>` → `</HelpTip>` within the same file.

- [ ] **Step 2: Update `CulturalFlagsEditor.tsx`**

In `apps/lab-lite/src/components/patients/CulturalFlagsEditor.tsx`, line 16:

Old:
```typescript
import { Tooltip } from '@/components/ui/Tooltip'
```

New:
```typescript
import { HelpTip } from '@/components/ui/HelpTip'
```

Also update every JSX usage of `<Tooltip` → `<HelpTip` and `</Tooltip>` → `</HelpTip>` within the same file.

- [ ] **Step 3: Commit**

```bash
git add apps/lab-lite/src/components/MetadataForm.tsx \
        apps/lab-lite/src/components/patients/CulturalFlagsEditor.tsx
git commit -m "refactor(lab-lite): update HelpTip import sites (was Tooltip)"
```

---

### Task 4: Create the ShadCN `Tooltip` thin re-export

**Files:**
- Create: `apps/lab-lite/src/components/ui/tooltip.tsx`

This gives future lab-lite code a local `@/components/ui/tooltip` path that resolves to the shared ShadCN Tooltip (Radix-based, generic trigger wrapper), matching the pattern used in admin-portal.

- [ ] **Step 1: Create `tooltip.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/tooltip'
```

> Note: filename is lowercase `tooltip.tsx`. The renamed help-tip component lives at uppercase `HelpTip.tsx`. On case-insensitive filesystems (macOS, Windows) these are distinct names — confirm the file is created as lowercase before committing.

- [ ] **Step 2: Commit**

```bash
git add apps/lab-lite/src/components/ui/tooltip.tsx
git commit -m "feat(lab-lite): add ShadCN Tooltip re-export from ui-kit"
```

---

### Task 5: Verify — typecheck + tests

**Files:** none (verification only)

- [ ] **Step 1: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 errors. Common failure modes and fixes:

| Error | Fix |
|-------|-----|
| `Cannot find module '@ultranos/ui-kit/tailwind.preset'` | Verify Task 1 Step 1 was applied and `packages/ui-kit/package.json` has the `./tailwind.preset` export. |
| `Cannot find module '@ultranos/ui-kit/components/ui/tooltip'` | Verify `packages/ui-kit/package.json` has `"./components/ui/tooltip": "./src/components/ui/tooltip.tsx"`. |
| `Module ... has no exported member 'Tooltip'` in MetadataForm or CulturalFlagsEditor | A JSX usage site was missed in Task 3. Search for remaining `<Tooltip` in lab-lite src. |
| `Cannot find name 'Tooltip'` in MetadataForm or CulturalFlagsEditor | The import line was updated but the JSX element name was not. Apply Task 3 Steps 1–2 fully. |

- [ ] **Step 2: Run tests**

```bash
pnpm -F lab-lite test
```

Expected: all tests pass. The rename affects only two files; no test file directly renders `Tooltip` or `HelpTip` (these are leaf UI components). If a snapshot test fails with a `Tooltip` → `HelpTip` name diff, update the snapshot:

```bash
pnpm -F lab-lite test -- --updateSnapshot
```

Then review the diff to confirm only the component name changed, not the rendered structure, and commit the updated snapshots.

- [ ] **Step 3: Commit verification result**

If both checks pass with no changes needed, no additional commit is required. If snapshots were updated:

```bash
git add apps/lab-lite/src/__tests__/
git commit -m "test(lab-lite): update snapshots for HelpTip rename"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|-------------|------|
| Preset wired into lab-lite Tailwind config | Task 1 |
| `darkMode` selector consistent with preset (`[data-theme="dark"]`) | Task 1 (inherited from preset) |
| All existing app-specific theme tokens preserved | Task 1 (all `theme.extend` entries kept verbatim) |
| Custom Button NOT replaced | n/a — `Button.tsx` untouched |
| No ShadCN components added beyond Tooltip re-export | Tasks 1–4 |
| Custom `Tooltip` (HelpTip) still functional under new name | Tasks 2–3 |
| All import sites of old `Tooltip` updated | Task 3 (2 sites: MetadataForm, CulturalFlagsEditor) |
| ShadCN `Tooltip` accessible at `@/components/ui/tooltip` | Task 4 |
| Typecheck passes | Task 5 Step 1 |
| Tests pass | Task 5 Step 2 |

### Known Constraints

- `apps/lab-lite/src/components/ui/Button.tsx` — custom component using lab-lite design tokens. Do not replace with the ShadCN Button from ui-kit.
- Inline SVG components listed in CLAUDE.md (token-icons, ResultColorIndicator, ConfidenceIndicator, QcHistoryView, CulturalFlagsBanner, CulturalFlagsEditor, animate-spin spinners) — intentionally kept as inline SVG; no changes in this plan.
- The `globals.css` already imports `@ultranos/ui-kit/tokens.css` — no changes needed there.
