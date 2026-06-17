# Pharmopedia E6 — Translations + DrugCard/Browse Restyle + a11y + Reduced-Motion (Design Spec)

**Date:** 2026-06-16
**App:** `apps/pharmopedia/` + `packages/ui-kit/`
**Branch:** `ux-v1.5`
**Status:** Approved for planning
**Part of:** the Pharmopedia UX overhaul (E1–E5 ✓, O1–O3 ✓ → **E6**, final epic).

---

## 1. Background

E6 is the final overhaul epic — the polish pass that brings Pharmopedia to enterprise-grade across four dimensions left after E1–E5: translation completeness, the last ad-hoc-styled list surfaces (DrugCard / Browse), accessibility gaps, and motion (reduced-motion respect).

**Findings (from exploration):**
- **i18n:** all 4 locales (`en/prs/ps/ar`) share the same 273-key structure (typed `type Translations = typeof en`), but **~50 keys in `prs/ps/ar` are English stubs** — concentrated in `formulary` (9 keys), `register` (~10 keys), and `drug.clinical` pharmacokinetics + severity (~11 keys: `interactions`, `pediatricDosing`, `adminNotes`, `pharmacokinetics`, `halfLife`, `proteinBinding`, `volumeDistribution`, `metabolism`, `excretion`, severity `CONTRAINDICATED/MAJOR/MODERATE/MINOR`), plus a few scattered (`formulary` label, the login→register CTA). **No locale-parity test** exists.
- **DrugCard** (`src/components/DrugCard.tsx`): ad-hoc `View/Text` + tokens (not ui-kit). Has `accessibilityRole="button"` + label; RTL via manual `FontFamily.arabic`. Rich content: primary name, secondary name, ATC, therapeutic class, dose forms, bookmark heart.
- **Browse** (`app/(tabs)/browse.tsx`): uses ui-kit `CollapsibleList`; renders `DrugCard` (drugs) and `TherapeuticClassCard` (categories). **Back button (line ~112) is a bare `Pressable` — no a11y, no hitSlop.** `TherapeuticClassCard` (`src/components/TherapeuticClassCard.tsx`): custom Pressable, has `accessibilityRole="button"` but **no `accessibilityLabel`**; icon + name + count badge + chevron; `FadeInUp` entry animation.
- **a11y:** most interactive components have roles/labels; gaps are the Browse back button and TherapeuticClassCard label. `accessibility-roles.test.tsx` covers only SearchBar/SyncStatusBanner/RoleBadge/SkeletonCard.
- **Motion:** ~8 sites use animation, **none respect reduced motion**: drug-detail tab indicator + bookmark spring (reanimated `withTiming`/`withSpring`, `app/drug/[atcCode].tsx`), `SkeletonCard` shimmer loop, `SyncStatusBanner` count fade, `TherapeuticClassCard` `FadeInUp`, `NetStatusBanner`/`PriceCard` `FadeIn*`, `CoachMark` `FadeIn`, and the ui-kit `CollapsibleScreen`/`collapsible-parts` scroll-interpolated header (legacy `Animated`). No `useReducedMotion` / `AccessibilityInfo.isReduceMotionEnabled()` anywhere.
- **ui-kit native** exports: `Card, CardSection, ListRow, Chip, Banner, Avatar, Button, EmptyState, Screen, ScreenHeader, CollapsibleList, CollapsibleScreen` + `useThemeColors`/`useRtl`. `ListRow` already has `minHeight: 48`, `hitSlop: 8`, full a11y.

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| E6 scope | **All four** workstreams (i18n, DrugCard/Browse restyle, a11y, reduced-motion) in one epic. |
| DrugCard restyle | **ui-kit `Card` wrapper, keep the rich layout** (primary/secondary name, ATC, class, dose forms, bookmark). Not collapsed into `ListRow`. |
| TherapeuticClassCard | Migrate to ui-kit **`ListRow`** (icon + name + count badge `trailing`). |
| `useReducedMotion` | New hook in **`@ultranos/ui-kit/native`** (single source, reusable across RN apps), AccessibilityInfo-based with a `reduceMotionChanged` subscription. ui-kit rebuild required. |
| Translations | AI-generated (Dari/Pashto/Arabic) matching existing style; **flagged for native-speaker QA** before release. |
| Parity test | New test asserts all locales share the key structure AND flags `prs/ps/ar` values byte-identical to `en`, with a small allowlist. |

## 3. Scope

### 3.1 Part 1 — Translation completeness (`src/i18n/locales/{prs,ps,ar}.ts` + a test)
- Translate every English-stub value in `prs/ps/ar` to real Dari/Pashto/Arabic, matching the tone/terminology of the already-translated keys. Cover at minimum: the full `drug.clinical` pharmacokinetics subtree + severity labels, the whole `formulary` section, the whole `register` section, and the scattered stubs (`formulary` top-level label, the login `register` CTA, any others the parity test surfaces).
- Add `src/__tests__/locale-parity.test.ts`: (a) assert `Object.keys` (deep, flattened) of `prs/ps/ar` exactly equal `en`'s; (b) assert no `prs/ps/ar` leaf value equals the `en` value except for an explicit `ALLOWLIST` set (e.g. brand/acronym tokens that are legitimately identical). The test fails on any new untranslated stub.

### 3.2 Part 2 — DrugCard / Browse restyle (`src/components/DrugCard.tsx`, `TherapeuticClassCard.tsx`)
- **DrugCard:** wrap content in the ui-kit `Card` surface; keep the existing rich rows (primary name, secondary name, ATC code, therapeutic class, dose forms, bookmark heart) restyled to Clinical-Calm tokens. Preserve `onPress`, the bookmark heart, RTL handling, and the existing `accessibilityRole="button"` + label; add an `accessibilityHint` if useful. Keep the `lang` prop contract from E5.
- **TherapeuticClassCard:** rebuild on ui-kit `ListRow` — category icon (`icon`), name (`label`), the drug-count as a `trailing` badge/`Chip`, chevron. Add `accessibilityLabel` = "{name}, {count} {drugs}".
- Snapshot tests (LTR + RTL) for DrugCard; a render test for the restyled TherapeuticClassCard.
- Keep Browse's `CollapsibleList` usage; only the item components + back button change.

### 3.3 Part 3 — a11y polish (`app/(tabs)/browse.tsx` + tests)
- Browse back button: add `accessibilityRole="button"`, `accessibilityLabel={t('common.back')}`, `hitSlop`. Add a `common.back` key to all 4 locales if absent.
- TherapeuticClassCard label: covered in Part 2.
- Quick audit: scan app `Pressable`s for missing `accessibilityRole`/`accessibilityLabel` and sub-44px targets; fix any found (report the list). Do not over-reach beyond genuine interactive gaps.
- Extend `src/__tests__/accessibility-roles.test.tsx` to assert DrugCard, TherapeuticClassCard, and the Browse back button expose roles + labels.

### 3.4 Part 4 — motion + reduced-motion (`packages/ui-kit/src/native/` + app animation sites)
- **`useReducedMotion` hook** in `packages/ui-kit/src/native/` (exported from `index.ts`): reads `AccessibilityInfo.isReduceMotionEnabled()` on mount and subscribes to `reduceMotionChanged`; returns a boolean. (If the installed `react-native-reanimated` exposes its own `useReducedMotion`, the plan may use that for the reanimated sites and the ui-kit hook for the legacy `Animated` sites — pinned at plan time; the ui-kit hook is the canonical app-facing one.)
- **Gate every animation site** to an instant/static path when reduced motion is on:
  - `app/drug/[atcCode].tsx`: tab indicator (`withTiming` → instant set) and bookmark heart spring (→ no scale bounce; still toggles + haptic).
  - `SkeletonCard`: shimmer loop → static placeholder (no infinite animation).
  - `SyncStatusBanner`: count fade → instant.
  - `TherapeuticClassCard`, `NetStatusBanner`, `PriceCard`, `CoachMark`: entry animations (`FadeIn*`) → render without the entering animation.
  - ui-kit `CollapsibleScreen`/`collapsible-parts`: scroll-interpolated header → keep functional but skip the animated opacity interpolation under reduced motion (render the compact/expanded state directly).
- **Rebuild ui-kit** after the `native/` changes (`pnpm --filter @ultranos/ui-kit build`) so the app resolves the hook + updated CollapsibleScreen from `dist/`.
- Tests: `useReducedMotion` hook test (mock `AccessibilityInfo`); a representative component test asserting the static path under reduced motion (e.g. SkeletonCard renders no animated loop, or TherapeuticClassCard renders without entering animation).

## 4. Testing
- **i18n:** the new `locale-parity.test.ts` passes (all keys present, no stubs outside allowlist). Existing i18n render tests still pass.
- **Restyle:** DrugCard LTR/RTL snapshots; TherapeuticClassCard render test; Browse tab test still green.
- **a11y:** extended `accessibility-roles.test.tsx` asserts roles+labels for DrugCard / TherapeuticClassCard / Browse back.
- **Motion:** `useReducedMotion` hook test; one component static-path test.
- Full vitest suite green; ui-kit native typecheck + ui-kit build succeed; no new typecheck errors; the existing 267-test suite stays green (snapshots updated intentionally where restyled).

## 5. Out of Scope (E6)
- Backend/Hub changes (none).
- New features; this is polish only.
- Migrating the whole local DB to SQLCipher (separate story; O3-2 etc.).
- Native-speaker translation QA (flagged; happens outside this epic).
- Re-theming screens already done in E1–E5 beyond the DrugCard/Browse surfaces named here.

## 6. Success Criteria
- `prs/ps/ar` have zero untranslated English stubs (outside the explicit allowlist); the parity test enforces this going forward.
- DrugCard + Browse category rows match the E4/E5 Clinical-Calm language (ui-kit `Card`/`ListRow`), with information density preserved and RTL correct.
- The Browse back button and TherapeuticClassCard expose proper a11y; touch targets meet the ≥44–48px bar; new a11y tests cover them.
- Every animation site honors the OS "reduce motion" setting via the shared `useReducedMotion` hook; ui-kit is rebuilt; tests cover the hook + a static path.
- Full suite green; typechecks clean; ui-kit builds.

## 7. Risks / Open Questions (pinned at plan time)
- **Reduced-motion mechanism:** confirm the installed `react-native-reanimated` version and whether to use its built-in `useReducedMotion` for reanimated sites vs the ui-kit AccessibilityInfo hook; the legacy `Animated` CollapsibleScreen needs the AccessibilityInfo path regardless. Ensure `AccessibilityInfo` is mockable in vitest (add/extend a `react-native` mock surface if needed).
- **ui-kit rebuild:** the hook + CollapsibleScreen change require `pnpm --filter @ultranos/ui-kit build` and possibly clearing the app `.next`/metro cache; the app imports from `dist/`. Verify the app picks up the new export.
- **DrugCard snapshot churn:** the restyle changes snapshots intentionally; ensure no behavioral assertions (localName logic, bookmark) regress — keep `drug-card-local-name.test.tsx` green.
- **Parity-test allowlist:** some `prs/ps/ar` values may legitimately equal `en` (acronyms, brand tokens); the allowlist must be explicit and minimal so the test stays meaningful.
- **Translation quality:** AI-generated clinical terms (pharmacokinetics, half-life, protein binding) in Dari/Pashto/Arabic — correct in register/style but flagged for native-speaker verification before release.
- **CollapsibleScreen reduced-motion:** it's used app-wide; the static path must not break the sticky-header layout or scroll behavior — only the animated opacity is skipped.
