# Pharmacy Lite — UI Kit Preset Adoption Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `apps/pharmacy-lite` to the shared `@ultranos/ui-kit` Tailwind preset so all ShadCN oklch semantic tokens and `darkMode` config are inherited from a single shared source — with zero changes to any existing import statement or component in pharmacy-lite.

**Architecture:** The preset (`packages/ui-kit/src/tailwind.preset.ts`) is added to pharmacy-lite's Tailwind config via `presets: [preset]`. All app-specific `theme.extend` overrides (pill-green, pill-text, neutral scale, primary scale, danger, rounded-pill, etc.) are preserved exactly as-is and deep-merge safely on top of the preset via Tailwind's native preset mechanism. The local `Button.tsx` component and all existing imports are left completely untouched.

**Tech Stack:** Tailwind CSS v3, Next.js 15, TypeScript 5.4, pnpm workspaces. `@ultranos/ui-kit` is already in `apps/pharmacy-lite/package.json` as `workspace:*`.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `apps/pharmacy-lite/tailwind.config.ts` — add `presets: [preset]` import |

---

### Task 1: Wire up the shared Tailwind preset

**Files:**
- Modify: `apps/pharmacy-lite/tailwind.config.ts`

- [ ] **Step 1: Update `tailwind.config.ts`**

Replace the full content of `apps/pharmacy-lite/tailwind.config.ts` with the following. The only changes from the current file are:
1. A new import line for the preset.
2. A new `presets: [preset]` entry at the top of the config object.
Everything else — `content`, all `theme.extend` entries — is preserved verbatim.

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

> **Deep-merge note:** The preset defines `colors.primary` as `{ DEFAULT, foreground }` (ShadCN semantic slots). The app defines `colors.primary` as `{ 50...900 }` (numeric scale). Tailwind's preset mechanism deep-merges `theme.extend` from both — the result is a `primary` map that contains all numeric scale keys AND the `DEFAULT`/`foreground` keys. No conflicts, no overrides.

> **darkMode note:** The preset sets `darkMode: ['selector', '[data-theme="dark"]']`. This is inherited by the app config automatically — no explicit `darkMode` key is needed in the app config.

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/tailwind.config.ts
git commit -m "chore(pharmacy-lite): adopt shared ui-kit tailwind preset"
```

---

### Task 2: Verify — typecheck and tests

**Files:** (none modified — verification only)

- [ ] **Step 1: Run typecheck**

```bash
pnpm -F pharmacy-lite typecheck
```

Expected: 0 errors. If you see `Cannot find module '@ultranos/ui-kit/tailwind.preset'`, verify that `packages/ui-kit/package.json` contains `"./tailwind.preset": "./src/tailwind.preset.ts"` in its `"exports"` block. This export was added in the ui-kit extraction plan (Task 7).

- [ ] **Step 2: Run tests**

```bash
pnpm -F pharmacy-lite test
```

Expected: all tests pass. No test suite should be affected by a Tailwind config change, as Tailwind does not execute at test time.

- [ ] **Step 3: Commit if clean**

If both commands exit 0 with no new failures, no additional commit is needed. If either reveals a pre-existing issue unrelated to this change, note it in the PR description but do not fix it in this branch — this plan is scoped to the preset wiring only.

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|-------------|------|
| Preset wired via `presets: [preset]` | Task 1 |
| All app-specific `theme.extend` overrides preserved | Task 1 |
| `darkMode` inherited from preset (no app-level override needed) | Task 1 |
| Zero changes to any existing import statement | — (not applicable: no imports changed) |
| `Button.tsx` left untouched | — (not applicable: file not modified) |
| No ShadCN components added | — (out of scope for this plan) |
| typecheck passes | Task 2 Step 1 |
| tests pass | Task 2 Step 2 |

### Color Deep-Merge Behavior

Tailwind CSS v3 preset merging applies `theme.extend` from the preset first, then `theme.extend` from the app config on top. For the `primary` color key:

| Source | Keys added |
|--------|------------|
| Preset `theme.extend.colors.primary` | `DEFAULT`, `foreground` |
| App `theme.extend.colors.primary` | `50`, `100`, `200`, `300`, `400`, `500`, `600`, `700`, `800`, `900` |
| Final merged result | All of the above — no conflicts |

The same safe-merge applies to `borderRadius` (preset adds `lg`, `md`, `sm`, `4xl`; app adds `pill`) and `boxShadow` (preset adds `card`; app adds nothing).
