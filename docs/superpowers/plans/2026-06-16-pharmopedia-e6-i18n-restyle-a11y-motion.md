# Pharmopedia E6 — Translations + DrugCard/Browse Restyle + a11y + Reduced-Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Pharmopedia overhaul: translate the remaining `prs/ps/ar` stub keys (guarded by a parity test), restyle DrugCard + Browse category rows to Clinical-Calm, close the a11y gaps, and make every autonomous animation honor the OS reduce-motion setting via a shared ui-kit hook.

**Architecture:** One ui-kit task adds the shared `useReducedMotion` hook + an optional `accessibilityLabel` on `ListRow` (single rebuild). App tasks then consume them: i18n parity test + translations; DrugCard on the ui-kit `Card` surface; TherapeuticClassCard on `ListRow`; Browse back-button a11y; and reduced-motion gating of the autonomous animation sites. The scroll-linked `CollapsibleScreen` cross-fade is user-controlled (WCAG-exempt) and is intentionally left unchanged.

**Tech Stack:** Expo / React Native, react-native-reanimated 4.1.7, react-i18next, `@ultranos/ui-kit/native`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-pharmopedia-e6-i18n-restyle-a11y-motion-design.md`

---

## File Structure

**ui-kit (`packages/ui-kit/src/native/`):**
- Create `useReducedMotion.ts`; export from `index.ts`.
- Modify `ListRow.tsx` (optional `accessibilityLabel` prop).
- Tests under `apps/pharmopedia/src/__tests__/ui-native/` (the app hosts ui-kit native tests).

**App (`apps/pharmopedia/`):**
- Modify `src/i18n/locales/{prs,ps,ar}.ts` (translations); create `src/__tests__/locale-parity.test.ts`.
- Modify `src/components/DrugCard.tsx`; create `src/__tests__/drug-card-restyle.test.tsx` (snapshot LTR/RTL).
- Modify `src/components/TherapeuticClassCard.tsx`; modify/extend `src/__tests__/browse-tab.test.tsx` or a new `therapeutic-class-card.test.tsx`.
- Modify `app/(tabs)/browse.tsx` (back-button a11y); extend `src/__tests__/accessibility-roles.test.tsx`.
- Modify motion sites: `app/drug/[atcCode].tsx`, `src/components/SkeletonCard.tsx`, `src/components/SyncStatusBanner.tsx`, `src/components/NetStatusBanner.tsx`, `src/components/PriceCard.tsx`, `src/components/CoachMark.tsx`.
- Maybe extend `src/__mocks__/react-native.js` (AccessibilityInfo methods).

**Test commands:** App — `pnpm --filter @ultranos/pharmopedia exec vitest run <path>`. ui-kit build — `pnpm --filter @ultranos/ui-kit build`.

> **Commit note:** Do NOT commit autonomously. "Commit" steps are staging checkpoints; the controller batches the E6 commit on explicit user instruction.

---

## Task 1: ui-kit — `useReducedMotion` hook + `ListRow` accessibilityLabel

**Files:**
- Create: `packages/ui-kit/src/native/useReducedMotion.ts`
- Modify: `packages/ui-kit/src/native/index.ts`, `packages/ui-kit/src/native/ListRow.tsx`
- Test: `apps/pharmopedia/src/__tests__/ui-native/use-reduced-motion.test.ts`, and extend `apps/pharmopedia/src/__tests__/ui-native/ListRow.test.tsx`

- [ ] **Step 1: Verify the RN mock exposes AccessibilityInfo methods**

Read `apps/pharmopedia/src/__mocks__/react-native.js` around the `AccessibilityInfo` stub (~line 94). Ensure it exports `isReduceMotionEnabled: () => Promise.resolve(false)` and `addEventListener: () => ({ remove: () => {} })`. If either is missing, add it:
```js
const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(false),
  addEventListener: () => ({ remove: () => {} }),
  // ...keep any existing fields
}
```

- [ ] **Step 2: Write the failing hook test**

Create `apps/pharmopedia/src/__tests__/ui-native/use-reduced-motion.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react-native'
const h = vi.hoisted(() => ({ isReduced: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) }))
vi.mock('react-native', () => ({ AccessibilityInfo: { isReduceMotionEnabled: h.isReduced, addEventListener: h.addListener } }))
import { useReducedMotion } from '@ultranos/ui-kit/native'

describe('useReducedMotion', () => {
  beforeEach(() => vi.clearAllMocks())
  it('returns false by default', async () => {
    h.isReduced.mockResolvedValue(false)
    const { result } = renderHook(() => useReducedMotion())
    await waitFor(() => expect(result.current).toBe(false))
  })
  it('returns true when the OS reports reduce-motion', async () => {
    h.isReduced.mockResolvedValue(true)
    const { result } = renderHook(() => useReducedMotion())
    await waitFor(() => expect(result.current).toBe(true))
    expect(h.addListener).toHaveBeenCalledWith('reduceMotionChanged', expect.any(Function))
  })
})
```
> The app's vitest aliases `@ultranos/ui-kit/native` to the ui-kit source (per vitest.config.ts), so the test exercises the real hook.

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/use-reduced-motion.test.ts`
Expected: FAIL — `useReducedMotion` not exported.

- [ ] **Step 4: Implement the hook**

Create `packages/ui-kit/src/native/useReducedMotion.ts`:
```ts
import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Tracks the OS "reduce motion" accessibility setting.
 * Use to gate autonomous animations (entry/exit fades, springs, looping
 * shimmers, timed transitions). Scroll-linked, user-controlled motion is
 * WCAG-exempt and need not be gated.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setReduced(v) })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => { mounted = false; sub?.remove?.() }
  }, [])
  return reduced
}
```
Add to `packages/ui-kit/src/native/index.ts`:
```ts
export { useReducedMotion } from './useReducedMotion'
```

- [ ] **Step 5: Add `accessibilityLabel` to ListRow**

In `packages/ui-kit/src/native/ListRow.tsx`: add `accessibilityLabel?: string` to `ListRowProps`, destructure it, and use it as the explicit override:
```ts
// in props: accessibilityLabel?: string
// in the Pressable:
accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
```

- [ ] **Step 6: Extend the ListRow test**

In `apps/pharmopedia/src/__tests__/ui-native/ListRow.test.tsx`, add a case: passing `accessibilityLabel="Custom, 12 drugs"` overrides the auto-derived label. Run:
`pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/ListRow.test.tsx src/__tests__/ui-native/use-reduced-motion.test.ts` → pass.

- [ ] **Step 7: Build ui-kit**

Run: `pnpm --filter @ultranos/ui-kit build`
Expected: build succeeds (the app resolves these from `dist/`; the vitest alias points at source, so tests pass regardless — but the build must be green for runtime).
Then: `pnpm --filter @ultranos/ui-kit typecheck` → no new errors.

- [ ] **Step 8: Commit (staging checkpoint)**

```bash
git add packages/ui-kit/src/native/useReducedMotion.ts packages/ui-kit/src/native/index.ts packages/ui-kit/src/native/ListRow.tsx packages/ui-kit/dist apps/pharmopedia/src/__tests__/ui-native/use-reduced-motion.test.ts apps/pharmopedia/src/__tests__/ui-native/ListRow.test.tsx apps/pharmopedia/src/__mocks__/react-native.js
git commit -m "feat(ui-kit): useReducedMotion hook + ListRow accessibilityLabel"
```

---

## Task 2: i18n — locale-parity test + translate the stubs

**Files:**
- Create: `apps/pharmopedia/src/__tests__/locale-parity.test.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/{prs,ps,ar}.ts`

- [ ] **Step 1: Write the parity test**

Create `apps/pharmopedia/src/__tests__/locale-parity.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import en from '@/i18n/locales/en'
import prs from '@/i18n/locales/prs'
import ps from '@/i18n/locales/ps'
import ar from '@/i18n/locales/ar'

type Dict = Record<string, unknown>
function flatten(obj: Dict, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') Object.assign(out, flatten(v as Dict, key))
    else out[key] = String(v)
  }
  return out
}

// Keys whose value is legitimately identical to English (acronyms / brand tokens).
const ALLOWLIST = new Set<string>([
  // e.g. 'drug.tabs.atc'  — add real cases surfaced below, keep minimal
])

const EN = flatten(en as Dict)
const LOCALES: Record<string, Record<string, string>> = {
  prs: flatten(prs as Dict), ps: flatten(ps as Dict), ar: flatten(ar as Dict),
}

describe('locale parity', () => {
  for (const [name, loc] of Object.entries(LOCALES)) {
    it(`${name} has exactly the same keys as en`, () => {
      expect(Object.keys(loc).sort()).toEqual(Object.keys(EN).sort())
    })
    it(`${name} has no untranslated English stubs`, () => {
      const stubs = Object.keys(EN).filter((k) => !ALLOWLIST.has(k) && loc[k] === EN[k] && EN[k].trim() !== '')
      expect(stubs).toEqual([])
    })
  }
})
```

- [ ] **Step 2: Run it to see the stub list**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/locale-parity.test.ts`
Expected: the "same keys" tests pass; the "no untranslated stubs" tests FAIL, printing the exact stub key list per locale (the ~50 keys: `formulary.*`, `register.*`, `drug.clinical.*` PK/severity, etc.).

- [ ] **Step 3: Translate the stubs**

For every key the test reported, replace the English value in `prs.ts` (Dari), `ps.ts` (Pashto), `ar.ts` (Arabic) with a real translation, matching the tone/terminology of the already-translated keys in each file. Cover the clinical PK terms (half-life, protein binding, volume of distribution, metabolism, excretion, pharmacokinetics), severity labels (Contraindicated/Major/Moderate/Minor), the `formulary` section, and the `register` section. If a key is legitimately identical across languages (an acronym/brand token), add it to `ALLOWLIST` in the test instead of "translating" it — keep the allowlist minimal and justified.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/locale-parity.test.ts`
Expected: all pass (keys match; no stubs outside the allowlist).

- [ ] **Step 5: Run the existing i18n render tests**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/drug-detail-i18n.test.tsx src/__tests__/search-bar-i18n.test.tsx`
Expected: pass (no regressions).

- [ ] **Step 6: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/src/i18n/locales/prs.ts apps/pharmopedia/src/i18n/locales/ps.ts apps/pharmopedia/src/i18n/locales/ar.ts apps/pharmopedia/src/__tests__/locale-parity.test.ts
git commit -m "i18n(pharmopedia): translate remaining prs/ps/ar stubs + locale-parity test"
```

---

## Task 3: DrugCard — Clinical-Calm Card restyle

**Files:**
- Modify: `apps/pharmopedia/src/components/DrugCard.tsx`
- Test: `apps/pharmopedia/src/__tests__/drug-card-restyle.test.tsx` (create — LTR/RTL snapshot), keep `drug-card-local-name.test.tsx` green

- [ ] **Step 1: Write the snapshot test**

Create `apps/pharmopedia/src/__tests__/drug-card-restyle.test.tsx`: render `DrugCard` with a sample `DrugSearchResult` in LTR (`lang='en'`) and RTL (`lang='ar'`, with a `localName`), snapshot both; assert `testID="drug-card-<atc>"`, `drug-primary-name`, and the bookmark-absent path render. Mock `@/store/bookmark-store` (`isBookmarked → false`) and `@/hooks/useThemeColors`. Run → passes (writes baseline).

- [ ] **Step 2: Restyle DrugCard onto the Card surface**

Edit `DrugCard.tsx`: wrap the content in the ui-kit `Card` (import `{ Card } from '@ultranos/ui-kit/native'`) so each result sits on a rounded, bordered, shadowed surface consistent with E4/E5; keep the `Pressable` (for press + a11y) inside or around per what reads cleanly (Card is a `View`; put the `Pressable` as the Card's child, or keep the Pressable outer and apply card styling via tokens — prefer: `<Pressable ...><Card>...</Card></Pressable>` is wrong since Card has its own surface; instead render `<Card><Pressable>...</Pressable></Card>` OR keep a single Pressable styled with the Card tokens). Use this structure:
```tsx
return (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`${result.innName}, ${result.therapeuticClass}`}
    accessibilityHint={t('drug.openHint') /* add key or omit */}
    testID={`drug-card-${result.atcCode}`}
    style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.85 }]}
  >
    <Card>
      <View style={styles.body}>
        {/* existing topRow (primaryName + bookmark heart), secondaryName, meta — unchanged content, restyled spacing */}
      </View>
    </Card>
  </Pressable>
)
```
Keep `useLocal`/`primaryName`/`secondaryName`/`isRtl` logic, the bookmark heart, RTL `styles.rtlText`, all `testID`s. Add `gap`/padding via tokens inside the Card body (Card is unpadded by default — add `padded` or an inner padded View). Remove the old hairline `borderBottom` card style (the Card surface replaces it). If you add an `accessibilityHint`, add a `drug.openHint` key in all 4 locales; otherwise omit the hint.

- [ ] **Step 3: Update snapshots + verify**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/drug-card-restyle.test.tsx -u` then without `-u`.
Expected: pass.

- [ ] **Step 4: Regression — local-name logic**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/drug-card-local-name.test.tsx`
Expected: pass (primaryName/secondaryName logic unchanged).

- [ ] **Step 5: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/src/components/DrugCard.tsx apps/pharmopedia/src/__tests__/drug-card-restyle.test.tsx
git commit -m "style(pharmopedia): DrugCard on Clinical-Calm Card surface"
```

---

## Task 4: TherapeuticClassCard — migrate to ListRow (+ gated entry animation)

**Files:**
- Modify: `apps/pharmopedia/src/components/TherapeuticClassCard.tsx`
- Test: `apps/pharmopedia/src/__tests__/therapeutic-class-card.test.tsx` (create)

- [ ] **Step 1: Write the test**

Create `apps/pharmopedia/src/__tests__/therapeutic-class-card.test.tsx`: render `TherapeuticClassCard name="Cardiovascular" count={12} onPress={fn}`; assert the row exposes `accessibilityLabel` containing the name and count (e.g. "Cardiovascular, 12 ..."), renders the count `12`, and calls `onPress`. Mock `@ultranos/ui-kit/native` is aliased to source (renders real ListRow). Mock `@/hooks/useThemeColors` if needed. Run → fail.

- [ ] **Step 2: Rebuild on ListRow with a gated entry wrapper**

Rewrite `TherapeuticClassCard.tsx`:
```tsx
import { View, Text, StyleSheet } from 'react-native'
import Animated, { FadeInUp } from 'react-native-reanimated'
import { ChevronRight, Heart, Pill, Shield, Brain, Bone, Eye, Baby, Droplets, Flame, Activity } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { ListRow, useReducedMotion } from '@ultranos/ui-kit/native'
import { useThemeColors } from '@/hooks/useThemeColors'

const CLASS_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  cardiovascular: Heart, analgesic: Pill, 'anti-infective': Shield, neurological: Brain,
  musculoskeletal: Bone, ophthalmic: Eye, pediatric: Baby, renal: Droplets, 'anti-inflammatory': Flame,
}
function getClassIcon(name: string) {
  const key = name.toLowerCase()
  for (const [k, Icon] of Object.entries(CLASS_ICONS)) if (key.includes(k)) return Icon
  return Activity
}

interface Props { name: string; count: number; onPress: () => void; index?: number }

export function TherapeuticClassCard({ name, count, onPress, index }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const reduced = useReducedMotion()
  const Icon = getClassIcon(name)
  const enterDelay = Math.min((index ?? 0) * 50, 500)

  const row = (
    <ListRow
      testID={`class-card-${name}`}
      icon={Icon}
      label={name}
      accessibilityLabel={`${name}, ${count} ${t('browse.drugsCountLabel')}`}
      onPress={onPress}
      trailing={
        <View style={styles.trailing}>
          <View style={[styles.countBadge, { backgroundColor: colors.primary50 }]}>
            <Text style={[styles.countText, { color: colors.primary600 }]}>{count}</Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </View>
      }
    />
  )
  if (reduced) return row
  return <Animated.View entering={FadeInUp.delay(enterDelay).duration(300)}>{row}</Animated.View>
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  countBadge: { paddingHorizontal: Spacing[2], paddingVertical: Spacing[1], borderRadius: Radius.full, minWidth: 28, alignItems: 'center' },
  countText: { fontSize: FontSize.sm, fontFamily: FontFamily.sansSemibold },
})
```
Add a `browse.drugsCountLabel` key (e.g. en `'drugs'`) to all 4 locales (the parity test from Task 2 will enforce translation).

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/therapeutic-class-card.test.tsx`
Expected: pass.

- [ ] **Step 4: Regression — Browse tab**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/browse-tab.test.tsx`
Expected: pass (if it queried the old `class-card-*` Pressable structure, update the query minimally — the `testID` is preserved).

- [ ] **Step 5: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/src/components/TherapeuticClassCard.tsx apps/pharmopedia/src/__tests__/therapeutic-class-card.test.tsx apps/pharmopedia/src/i18n/locales/*.ts
git commit -m "style(pharmopedia): TherapeuticClassCard on ListRow + a11y label + gated entry"
```

---

## Task 5: a11y — Browse back button + coverage

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/browse.tsx`
- Test: `apps/pharmopedia/src/__tests__/accessibility-roles.test.tsx` (extend)

- [ ] **Step 1: Extend the a11y test**

In `accessibility-roles.test.tsx`, add assertions: the Browse back button (`testID="browse-back-btn"`) has `accessibilityRole==='button'` and a non-empty `accessibilityLabel`; DrugCard exposes `accessibilityRole==='button'` + label; TherapeuticClassCard's row exposes a label containing the count. (Render each component with minimal mocks mirroring the existing tests in this file.) Run → the back-button assertion fails.

- [ ] **Step 2: Fix the Browse back button**

In `app/(tabs)/browse.tsx` (~line 112):
```tsx
<Pressable
  testID="browse-back-btn"
  onPress={handleBack}
  accessibilityRole="button"
  accessibilityLabel={t('common.back')}
  hitSlop={8}
  style={styles.backBtn}
>
  <Text style={[styles.backText, { color: colors.primary500 }]}>{t('common.back')}</Text>
</Pressable>
```

- [ ] **Step 3: Quick Pressable audit**

Grep `apps/pharmopedia/app` + `apps/pharmopedia/src/components` for `<Pressable` and list any without `accessibilityRole`/`accessibilityLabel` that are genuine controls (ignore ones that wrap an already-labeled child or are decorative). Fix any real gaps with role+label+hitSlop. Report the list of what was found/fixed. Do not over-reach.

- [ ] **Step 4: Run the a11y tests**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/accessibility-roles.test.tsx`
Expected: pass.

- [ ] **Step 5: Commit (staging checkpoint)**

```bash
git add "apps/pharmopedia/app/(tabs)/browse.tsx" apps/pharmopedia/src/__tests__/accessibility-roles.test.tsx
git commit -m "a11y(pharmopedia): Browse back button role/label/hitSlop + coverage"
```

---

## Task 6: Reduced-motion gating of autonomous animations

**Files:**
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`, `src/components/SkeletonCard.tsx`, `src/components/SyncStatusBanner.tsx`, `src/components/NetStatusBanner.tsx`, `src/components/PriceCard.tsx`, `src/components/CoachMark.tsx`
- Test: `apps/pharmopedia/src/__tests__/reduced-motion.test.tsx` (create)

Pattern: call `const reduced = useReducedMotion()` from `@ultranos/ui-kit/native`; for reanimated **entry** animations branch `entering={reduced ? undefined : FadeInUp...}`; for **`withTiming`/`withSpring`** set the shared value directly when `reduced` (e.g. `x.value = reduced ? target : withTiming(target)`); for the **shimmer loop** render a static fill (skip the loop) when `reduced`.

- [ ] **Step 1: Write a representative test**

Create `apps/pharmopedia/src/__tests__/reduced-motion.test.tsx`: mock `@ultranos/ui-kit/native`'s `useReducedMotion` to return `true`, render `TherapeuticClassCard` (or `CoachMark`) and assert it renders its content WITHOUT the `Animated.View entering` wrapper (e.g. query that the row/content is present and, if feasible, that no `entering` prop is set). Also render with `useReducedMotion → false` and assert the animated wrapper is used. Keep the assertion robust to the RN mock (assert content presence + a marker testID rather than internal reanimated props if props aren't introspectable). Run → fail or pass depending; ensure it meaningfully checks the gate.

> If introspecting the `entering` prop isn't possible through the mock, assert behavior instead: with `reduced=true` the component tree has no `Animated.View` wrapper testID. Add a `testID` to distinguish (e.g. wrap the animated branch so the test can tell). Keep it simple.

- [ ] **Step 2: Gate the drug-detail animations**

In `app/drug/[atcCode].tsx`: add `const reduced = useReducedMotion()`. In `onTabPress`, when `reduced`, set `indicatorX.value = tabLayouts[index].x` and `indicatorW.value = tabLayouts[index].width` directly (no `withTiming`). In `handleToggleBookmark`, when `reduced`, skip the `withSpring` bounce (keep the toggle + haptic). Guard the initial indicator set similarly.

- [ ] **Step 3: Gate the shimmer + banner fades**

- `SkeletonCard.tsx`: when `reduced`, render the placeholder bars at a static opacity (skip the `withTiming` loop / don't start the animation).
- `SyncStatusBanner.tsx`: when `reduced`, set `countOpacity` to 1 directly (no fade).
- `NetStatusBanner.tsx`, `PriceCard.tsx`, `CoachMark.tsx`: branch `entering={reduced ? undefined : FadeIn.../FadeInDown.../FadeInUp...}` (and `exiting` similarly if present).

- [ ] **Step 4: Run the motion test + affected component tests**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/reduced-motion.test.tsx src/__tests__/skeleton-card.test.tsx`
Expected: pass. (Add `skeleton-card` only if it exists; otherwise drop it.)

- [ ] **Step 5: Commit (staging checkpoint)**

```bash
git add "apps/pharmopedia/app/drug/[atcCode].tsx" apps/pharmopedia/src/components/SkeletonCard.tsx apps/pharmopedia/src/components/SyncStatusBanner.tsx apps/pharmopedia/src/components/NetStatusBanner.tsx apps/pharmopedia/src/components/PriceCard.tsx apps/pharmopedia/src/components/CoachMark.tsx apps/pharmopedia/src/__tests__/reduced-motion.test.tsx
git commit -m "a11y(pharmopedia): honor reduce-motion across autonomous animations"
```

---

## Task 7: Finalize — full verification + reviews

**Files:** none (verification + review only).

- [ ] **Step 1: Build ui-kit + full app suite**

Run: `pnpm --filter @ultranos/ui-kit build` then `pnpm --filter @ultranos/pharmopedia exec vitest run`
Expected: ui-kit builds; full vitest suite green (the new locale-parity, drug-card-restyle, therapeutic-class-card, use-reduced-motion, reduced-motion tests pass; existing suite intact).

- [ ] **Step 2: Typechecks**

Run: `pnpm --filter @ultranos/ui-kit typecheck` and `pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -E "useReducedMotion|ListRow|DrugCard|TherapeuticClassCard|browse|locale-parity"`
Expected: no new logic errors (only the pre-existing `tokens.native`/locale-literal baseline noise).

- [ ] **Step 3: Two-stage review (controller)**

Spec-compliance review (all 4 parts; parity test guards stubs; DrugCard/ListRow restyle; a11y labels; reduced-motion gating at every autonomous site; ui-kit rebuilt) + code-quality + a11y/safety review (the reduce-motion gate doesn't break functionality — bookmark still toggles, tabs still switch, skeletons still indicate loading; no severity/safety regressions; translations are structurally sound). Address findings, re-verify.

- [ ] **Step 4: Commit (controller, on explicit user go-ahead)**

Batch the E6 commit with the standard trailer.

---

## Self-Review (plan vs spec)

**Spec coverage:** §3.1 i18n + parity test → Task 2; §3.2 DrugCard restyle → Task 3, TherapeuticClassCard → Task 4; §3.3 a11y (back button, labels, coverage) → Tasks 4–5 (+ ListRow label in Task 1); §3.4 reduced-motion hook → Task 1, gating → Tasks 4 & 6; ui-kit rebuild → Tasks 1 & 7; §4 testing → each task + Task 7. Success criteria §6 all map. ✅

**Placeholder scan:** No "TBD"/"handle edge cases" placeholders; each motion site names the exact gating change; the i18n task drives translation off the test's printed stub list rather than hand-listing 50 keys (concrete + self-checking). ✅

**Type consistency:** `useReducedMotion(): boolean` consistent (Task 1 def; Tasks 4 & 6 usage). `ListRow` `accessibilityLabel?: string` added in Task 1, consumed in Task 4. `TherapeuticClassCard` props unchanged (`name/count/onPress/index`). `browse.drugsCountLabel` + (optional) `drug.openHint` keys added with the locale work and enforced by the parity test. ✅

**Deviations from spec (flagged):** Spec §3.4 listed the ui-kit `CollapsibleScreen` scroll cross-fade among the gated sites; the plan **intentionally leaves it ungated** because it is scroll-linked / user-controlled motion (WCAG 2.3.3 targets non-essential *autonomous* animation, not direct-manipulation/scroll-driven UI), and gating it risks breaking the sticky-header layout for no accessibility benefit. All autonomous animations (entries, spring, shimmer loop, timed transitions) ARE gated. The shared hook still lives in ui-kit per spec. Flag to the user at review.
