# OPD Lite — UI Kit Foundation Adoption Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `apps/opd-lite` to consume the shared `packages/ui-kit` Tailwind preset, so the app's design tokens (oklch semantic colors, border-radius scale, box-shadows, dark mode selector) come from the single shared source established in the Phase 1 extraction. Zero functional changes — no import paths change, no components are replaced.

**Architecture:** The ui-kit preset is added to `apps/opd-lite/tailwind.config.ts` via `presets: [preset]`. Tailwind deep-merges preset `theme.extend` with the app's own `theme.extend`, so the app's existing scale-based `primary.50–900` keys and custom tokens (`pill-green`, `pill-text`, `danger`, `allergy`, `pill` border-radius) are preserved alongside the new ShadCN semantic keys (`primary.DEFAULT`, `primary.foreground`, etc.). The preset's `darkMode` selector replaces the Tailwind default.

**Tech Stack:** Tailwind CSS v3, Next.js 15, TypeScript 5.4, pnpm workspaces.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `apps/opd-lite/tailwind.config.ts` — add `presets: [preset]` import |

---

### Task 1: Wire up the shared Tailwind preset

**Files:**
- Modify: `apps/opd-lite/tailwind.config.ts`

- [ ] **Step 1: Update `tailwind.config.ts`**

Replace the entire content of `apps/opd-lite/tailwind.config.ts` with:

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
      fontWeight: {
        black: '900',
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
        allergy: 'var(--color-allergy)',
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

> **What changed vs. the original:** Added `import preset from '@ultranos/ui-kit/tailwind.preset'` and added `presets: [preset]` as the first key in the config object. Everything else is identical to the original.

> **Deep-merge behaviour:** Tailwind merges preset `theme.extend` with the app's `theme.extend` key-by-key. The preset adds `primary.DEFAULT` and `primary.foreground`; the app keeps `primary.50` through `primary.900`. Both sets of keys are available on the `primary` color object. The same applies to `borderRadius` — the preset's `lg`, `md`, `sm`, `4xl` keys are added; the app's `pill` key is kept.

> **`darkMode`:** The preset declares `darkMode: ['selector', '[data-theme="dark"]']`. This takes effect for opd-lite — dark mode is now toggled via `data-theme="dark"` on an ancestor element, not via the `dark` CSS class. This is consistent with admin-portal.

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/tailwind.config.ts
git commit -m "feat(opd-lite): adopt shared ui-kit tailwind preset"
```

---

### Task 2: Verify — typecheck and tests

**Files:**
- No file changes — verification only.

- [ ] **Step 1: Run typecheck**

```bash
pnpm -F opd-lite typecheck
```

Expected: 0 errors. The preset file is TypeScript and is resolved via the `./tailwind.preset` export in `packages/ui-kit/package.json`.

If you get `Cannot find module '@ultranos/ui-kit/tailwind.preset'`, verify that `packages/ui-kit/package.json` contains the `"./tailwind.preset": "./src/tailwind.preset.ts"` export entry (added in the Phase 1 extraction plan, Task 7).

- [ ] **Step 2: Run tests**

```bash
pnpm -F opd-lite test
```

Expected: all tests pass with zero new failures. The preset change is purely a build-time Tailwind concern and has no runtime effect on component logic, so existing tests should be unaffected.

- [ ] **Step 3: Commit (if any test-fixture snapshots were auto-updated)**

If running the tests regenerated CSS snapshots, commit them:

```bash
git add apps/opd-lite/src/__tests__/
git commit -m "chore(opd-lite): update snapshots after tailwind preset adoption"
```

If no snapshot files changed, skip this step.

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|-------------|------|
| Preset wired via `presets: [preset]` | Task 1 Step 1 |
| All app-specific `theme.extend` keys preserved exactly | Task 1 Step 1 |
| `darkMode` selector inherited from preset | Task 1 Step 1 (implicit via preset) |
| Zero import changes in opd-lite source files | — (no source files modified) |
| `Button.tsx` left untouched | — (not in file map) |
| No ShadCN components added | — (not in file map) |
| typecheck passes | Task 2 Step 1 |
| tests pass | Task 2 Step 2 |

### Known Merge Behaviour

- `primary` color object: preset contributes `DEFAULT` + `foreground` keys; app contributes `50`–`900` numeric scale keys. Final merged object contains all 12 keys. No key conflicts.
- `borderRadius`: preset contributes `lg`, `md`, `sm`, `4xl`; app contributes `pill`. Final merged object contains all 5 keys. No key conflicts.
- `fontFamily`, `fontWeight`, `colors.neutral`, `colors.pill-green`, `colors.pill-text`, `colors.danger`, `colors.allergy`: app-only — no preset overlap.
- `plugins: []` in both preset and app config — no plugin conflicts.
