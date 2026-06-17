# Pharmopedia Drug Detail Redesign + Image Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tabbed drug detail screen with a single scrollable page of collapsible sections, a pinned non-collapsible safety zone, render-if-present sections, and basic image *display* (header thumbnail + Photos gallery) driven by a new `DrugImage[]` field.

**Architecture:** The page uses the existing `CollapsibleScreen` shell (one collapsing large-title header, removing the double header). A section *builder* produces ordered section descriptors from the role-scoped entry; the page renders the pinned `SafetyZone` directly and every other descriptor inside a new shared `CollapsibleSection` (ui-kit native). Images are entry-level URLs displayed via `expo-image` (disk-cached, online-only), with graceful fallbacks.

**Tech Stack:** Expo / React Native, TypeScript, `react-i18next`, `expo-image`, `lucide-react-native`, Vitest + `@testing-library/react-native`, `@ultranos/ui-kit` native components & `tokens.native`, `@ultranos/shared-types`.

## Global Constraints

- Native design tokens only — import from `@ultranos/ui-kit/tokens.native`; never hardcode hex, font names, or raw px. Primary = `Colors.primary500`.
- Icons via `lucide-react-native` (already the app's native icon source; e.g. `Heart` in `DrugCard`).
- Shared UI changes go in `packages/ui-kit/src/` and require a rebuild: `pnpm --filter @ultranos/ui-kit build`. App `src/components/ui/` proxies only.
- RTL: content direction follows content, not ambient `forceRTL`. Reuse `resolveLocalized` (`src/lib/localized-text.ts`) + `SectionCard` rules already in place (RTL → Arabic font + `writingDirection:'rtl'`; Latin → explicit `'ltr'`).
- Healthcare safety: safety-critical content (warnings, interactions, contraindications) is **never** collapsible/hidden. The `SafetyZone` is always rendered and always expanded.
- PHI: never log/throw PHI; not directly relevant to display tasks but applies to any new logging.
- i18n: every new user-facing string added to all four locales (`en`, `prs`, `ps`, `ar`); `src/__tests__/locale-parity.test.ts` enforces key parity.
- No autonomous commits beyond the per-task commits in this plan (which the user has authorized by choosing to execute it).
- Test style: assert on flattened styles via `src/__tests__/ui-native/_flatten.ts` (`flattenStyle`) — the env stubs `StyleSheet.flatten`.
- Run app tests with: `pnpm -F pharmopedia exec vitest run <path>`. Run ui-kit-affecting work after `pnpm --filter @ultranos/ui-kit build`.

**Out of scope (separate follow-up plan):** the image *upload* backend — Hub `drugCatalog.enrich` image handling, Supabase Storage bucket, and the `EnrichTab` upload UI. This plan only *displays* `images[]`.

---

## File Structure

**Create:**
- `packages/ui-kit/src/native/CollapsibleSection.tsx` — shared accordion/disclosure.
- `apps/pharmopedia/src/components/DrugDetail/SafetyZone.tsx` — pinned safety block.
- `apps/pharmopedia/src/components/DrugDetail/MediaSection.tsx` — Photos gallery body.
- `apps/pharmopedia/src/components/DrugDetail/DrugThumbnail.tsx` — header image / pill fallback.
- `apps/pharmopedia/src/components/DrugDetail/drug-detail-sections.tsx` — section-descriptor builder.
- Tests: `collapsible-section.test.tsx`, `safety-zone.test.tsx`, `media-section.test.tsx`, `drug-thumbnail.test.tsx`, `drug-detail-sections.test.tsx`, and a rewritten `drug-detail-rtl.test.tsx`.

**Modify:**
- `packages/shared-types/src/fhir/drug-catalog.ts` — add `DrugImage` + `images?`.
- `packages/ui-kit/src/native/index.ts` — export `CollapsibleSection`.
- `apps/pharmopedia/app/drug/[atcCode].tsx` — rewrite to single-scroll.
- `apps/pharmopedia/app/_layout.tsx` — `headerShown: false` for the drug screen.
- `apps/pharmopedia/src/i18n/locales/{en,prs,ps,ar}.ts` — new keys.
- `apps/pharmopedia/package.json` — add `expo-image`.

**Remove (folded into sections):** the tab bar + indicator machinery in `drug/[atcCode].tsx`; `OverviewTab`/`ClinicalTab`/`PricingTab` cease to be *tabs* (Pricing body is reused as a section; Overview/Clinical content is produced by the builder).

---

## Task 1: `DrugImage` type + `images?` on the entry

**Files:**
- Modify: `packages/shared-types/src/fhir/drug-catalog.ts`
- Test: `packages/shared-types/src/__tests__/drug-image.test.ts` (create)

**Interfaces:**
- Produces: `interface DrugImage { url: string; brand?: string; caption?: string; isPrimary?: boolean }`; `DrugEntryTier1.images?: DrugImage[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared-types/src/__tests__/drug-image.test.ts
import { describe, it, expect } from 'vitest'
import type { DrugImage, DrugEntryTier1 } from '../fhir/drug-catalog'

describe('DrugImage', () => {
  it('attaches images to a Tier1 entry', () => {
    const img: DrugImage = { url: 'https://x/advil.jpg', brand: 'Advil', isPrimary: true }
    const partial: Pick<DrugEntryTier1, 'images'> = { images: [img] }
    expect(partial.images?.[0].brand).toBe('Advil')
    expect(partial.images?.[0].isPrimary).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @ultranos/shared-types exec vitest run src/__tests__/drug-image.test.ts`
Expected: FAIL — `DrugImage` not exported / `images` not on `DrugEntryTier1`.

- [ ] **Step 3: Add the type and field**

In `packages/shared-types/src/fhir/drug-catalog.ts`, add above `DrugEntryTier1`:

```ts
/** A representative product image for a drug entry. URLs only — never blobs in the synced catalog. */
export interface DrugImage {
  url: string
  brand?: string         // brand depicted; undefined = generic/representative
  caption?: string
  isPrimary?: boolean     // shown as the header "profile" image
}
```

Inside `DrugEntryTier1`, add after `localNames`:

```ts
  images?: DrugImage[]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @ultranos/shared-types exec vitest run src/__tests__/drug-image.test.ts`
Expected: PASS

- [ ] **Step 5: Build shared-types so consumers resolve the new type**

Run: `pnpm -F shared-types build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/fhir/drug-catalog.ts packages/shared-types/src/__tests__/drug-image.test.ts
git commit -m "feat(shared-types): add DrugImage and DrugEntryTier1.images"
```

---

## Task 2: i18n keys for the redesign

**Files:**
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`, `prs.ts`, `ps.ts`, `ar.ts`
- Test: `apps/pharmopedia/src/__tests__/locale-parity.test.ts` (existing — must stay green)

**Interfaces:**
- Produces (under the existing `drug` namespace): `drug.photos.title`, `drug.photos.disclaimer`, `drug.photos.generic`, `drug.photos.unavailableOffline`, `drug.sections.dispensing`, `drug.noDetail`. Keep existing `drug.tabs.*`/`drug.overview.*`/`drug.clinical.*` keys (still used as section titles).

- [ ] **Step 1: Confirm the parity test covers all four locales**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/locale-parity.test.ts`
Expected: PASS (baseline before changes).

- [ ] **Step 2: Add English keys**

In `apps/pharmopedia/src/i18n/locales/en.ts`, inside the `drug` object add:

```ts
    photos: {
      title: 'Photos',
      disclaimer: 'Illustrative only — verify the actual packaging.',
      generic: 'Generic',
      unavailableOffline: 'Photos are unavailable offline.',
    },
    sections: { dispensing: 'Dispensing & formulary' },
    noDetail: 'Detailed information isn’t available yet for this medicine.',
```

- [ ] **Step 3: Add the same keys to `prs.ts`, `ps.ts`, `ar.ts`**

Use these translations (Dari `prs`, Pashto `ps`, Arabic `ar`):

```ts
// prs.ts
    photos: { title: 'تصاویر', disclaimer: 'فقط برای نمایش — بسته‌بندی واقعی را تأیید کنید.', generic: 'عمومی', unavailableOffline: 'تصاویر در حالت آفلاین در دسترس نیستند.' },
    sections: { dispensing: 'توزیع و فهرست دارویی' },
    noDetail: 'معلومات تفصیلی برای این دارو هنوز موجود نیست.',
```
```ts
// ps.ts
    photos: { title: 'انځورونه', disclaimer: 'یوازې د نمونې لپاره — اصلي بسته‌بندي تایید کړئ.', generic: 'عمومي', unavailableOffline: 'انځورونه آفلاین شتون نلري.' },
    sections: { dispensing: 'وېش او درمل لیست' },
    noDetail: 'د دې درمل لپاره تفصيلي معلومات تر اوسه شتون نلري.',
```
```ts
// ar.ts
    photos: { title: 'الصور', disclaimer: 'للتوضيح فقط — تحقق من العبوة الفعلية.', generic: 'عام', unavailableOffline: 'الصور غير متوفرة دون اتصال.' },
    sections: { dispensing: 'الصرف والقائمة الدوائية' },
    noDetail: 'المعلومات التفصيلية غير متوفرة لهذا الدواء بعد.',
```

- [ ] **Step 4: Run the parity test**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/locale-parity.test.ts`
Expected: PASS (all four locales have identical key sets).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/i18n/locales/
git commit -m "i18n(pharmopedia): add drug detail redesign + photos keys"
```

---

## Task 3: `CollapsibleSection` (shared ui-kit native)

**Files:**
- Create: `packages/ui-kit/src/native/CollapsibleSection.tsx`
- Modify: `packages/ui-kit/src/native/index.ts`
- Test: `apps/pharmopedia/src/__tests__/ui-native/CollapsibleSection.test.tsx` (create)

**Interfaces:**
- Produces: `CollapsibleSection({ title: string; defaultOpen?: boolean; badge?: string; children: ReactNode; testID?: string })`. When closed, body is not mounted. Header `Pressable` has `accessibilityRole="button"` + `accessibilityState={{ expanded }}`. Body testID = `` `${testID}-body` ``.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/pharmopedia/src/__tests__/ui-native/CollapsibleSection.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Text } from 'react-native'
import { CollapsibleSection } from '@ultranos/ui-kit/native'

const child = <Text>body content</Text>

describe('CollapsibleSection', () => {
  it('is closed by default — body not rendered', () => {
    render(<CollapsibleSection title="Side effects" testID="sec">{child}</CollapsibleSection>)
    expect(screen.queryByText('body content')).toBeNull()
  })

  it('opens on header press', () => {
    render(<CollapsibleSection title="Side effects" testID="sec">{child}</CollapsibleSection>)
    fireEvent.press(screen.getByTestId('sec'))
    expect(screen.getByText('body content')).toBeTruthy()
  })

  it('respects defaultOpen', () => {
    render(<CollapsibleSection title="What it is" defaultOpen testID="sec">{child}</CollapsibleSection>)
    expect(screen.getByText('body content')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/ui-native/CollapsibleSection.test.tsx`
Expected: FAIL — module `CollapsibleSection` not exported.

- [ ] **Step 3: Implement the component**

```tsx
// packages/ui-kit/src/native/CollapsibleSection.tsx
import { useState, type ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'
import { useReducedMotion } from './useReducedMotion'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  badge?: string
  children: ReactNode
  testID?: string
}

export function CollapsibleSection({ title, defaultOpen = false, badge, children, testID }: CollapsibleSectionProps) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(defaultOpen)

  function toggle() {
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((o) => !o)
  }

  return (
    <View testID={testID} style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
      >
        <Text style={[styles.title, { color: colors.textPrimary, textAlign: rtl ? 'right' : 'left' }, rtl && styles.arabic]}>
          {title}
        </Text>
        {badge ? <Text style={[styles.badge, { color: colors.textMuted }]}>{badge}</Text> : null}
        <ChevronDown size={20} color={colors.textMuted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open ? (
        <View testID={testID ? `${testID}-body` : undefined} style={styles.body}>
          {children}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing[3], overflow: 'hidden' },
  header: { alignItems: 'center', justifyContent: 'space-between', padding: Spacing[4], gap: Spacing[2] },
  title: { flex: 1, fontSize: FontSize.base, fontFamily: FontFamily.sansSemibold },
  badge: { fontSize: FontSize.xs, fontFamily: FontFamily.sans },
  arabic: { fontFamily: FontFamily.arabic },
  body: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[4] },
})
```

- [ ] **Step 4: Export it**

In `packages/ui-kit/src/native/index.ts`, add next to the other exports:

```ts
export { CollapsibleSection } from './CollapsibleSection'
```

- [ ] **Step 5: Rebuild ui-kit and run the test**

Run: `pnpm --filter @ultranos/ui-kit build`
Then: `pnpm -F pharmopedia exec vitest run src/__tests__/ui-native/CollapsibleSection.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/native/CollapsibleSection.tsx packages/ui-kit/src/native/index.ts packages/ui-kit/dist apps/pharmopedia/src/__tests__/ui-native/CollapsibleSection.test.tsx
git commit -m "feat(ui-kit): add native CollapsibleSection disclosure"
```

---

## Task 4: `SafetyZone` (pinned, non-collapsible)

**Files:**
- Create: `apps/pharmopedia/src/components/DrugDetail/SafetyZone.tsx`
- Test: `apps/pharmopedia/src/__tests__/safety-zone.test.tsx` (create)

**Interfaces:**
- Consumes: `resolveLocalized` (`@/lib/localized-text`), theme colors, `DrugEntryTier1`/`DrugEntryTier2`.
- Produces: `SafetyZone({ entry: DrugEntryTier1; lang: Lang; isClinical: boolean })`. Renders `null` when no safety content. Root has `testID="safety-zone"`, `accessibilityRole="alert"`, and **no** Pressable/collapse affordance.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/pharmopedia/src/__tests__/safety-zone.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import type { DrugEntryTier2 } from '@ultranos/shared-types'
import { SafetyZone } from '@/components/DrugDetail/SafetyZone'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff', textPrimary: '#111', danger: '#dc2626', dangerLight: '#fef2f2',
    dangerDark: '#991b1b', warning: '#d97706', warningLight: '#fffbeb', warningDark: '#92400e',
  }),
}))

const base = {
  atcCode: 'M01AE01', innName: 'Ibuprofen', brandNames: [], doseForms: [], therapeuticClass: 'NSAID',
  localNames: {}, summaryPlain: {}, usedFor: [], commonSideEffects: [],
  whenToSeekHelp: { en: 'Seek help if breathing is hard' },
  storageInstructions: {}, pregnancySummaryPlain: {}, warningsSummaryPlain: { en: 'May cause stomach bleeding' },
  version: 1, lastUpdated: '2026-06-17T00:00:00Z',
}

describe('SafetyZone', () => {
  it('renders warnings + seek-help for all roles, with no collapse control', () => {
    render(<SafetyZone entry={base} lang="en" isClinical={false} />)
    const zone = screen.getByTestId('safety-zone')
    expect(zone.props.accessibilityRole).toBe('alert')
    expect(screen.getByText('May cause stomach bleeding')).toBeTruthy()
    expect(screen.getByText('Seek help if breathing is hard')).toBeTruthy()
    // no expandable button inside the safety zone
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('includes contraindicated interactions for clinical roles', () => {
    const clinical = { ...base, interactions: [
      { drugAtcCode: 'B01AA03', drugName: 'Warfarin', severity: 'CONTRAINDICATED', mechanism: 'bleeding risk' },
    ], contraindications: ['Active GI bleed'] } as unknown as DrugEntryTier2
    render(<SafetyZone entry={clinical} lang="en" isClinical />)
    expect(screen.getByText(/Warfarin/)).toBeTruthy()
    expect(screen.getByText(/Active GI bleed/)).toBeTruthy()
  })

  it('renders nothing when there is no safety content', () => {
    const empty = { ...base, whenToSeekHelp: {}, warningsSummaryPlain: {} }
    render(<SafetyZone entry={empty} lang="en" isClinical={false} />)
    expect(screen.queryByTestId('safety-zone')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/safety-zone.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// apps/pharmopedia/src/components/DrugDetail/SafetyZone.tsx
import { View, Text, StyleSheet } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { resolveLocalized } from '@/lib/localized-text'
import type { Lang } from '@/store/lang-store'
import type { DrugEntryTier1, DrugEntryTier2, DrugInteraction } from '@ultranos/shared-types'

export function SafetyZone({ entry, lang, isClinical }: { entry: DrugEntryTier1; lang: Lang; isClinical: boolean }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  const warnings = resolveLocalized(entry.warningsSummaryPlain, lang)
  const seekHelp = resolveLocalized(entry.whenToSeekHelp, lang)

  const clinical = isClinical ? (entry as DrugEntryTier2) : undefined
  const blocking: DrugInteraction[] = (clinical?.interactions ?? []).filter(
    (i) => i.severity === 'CONTRAINDICATED' || i.severity === 'MAJOR',
  )
  const contraindications = clinical?.contraindications ?? []

  const hasAny = warnings.text || seekHelp.text || blocking.length > 0 || contraindications.length > 0
  if (!hasAny) return null

  return (
    <View testID="safety-zone" accessibilityRole="alert" style={styles.wrapper}>
      {warnings.text ? (
        <Row color={colors.warningDark} bg={colors.warningLight} title={t('drug.overview.warnings')} lines={[warnings.text]} rtl={warnings.isLocalized} />
      ) : null}
      {seekHelp.text ? (
        <Row color={colors.warningDark} bg={colors.warningLight} title={t('drug.overview.seekHelp')} lines={[seekHelp.text]} rtl={seekHelp.isLocalized} />
      ) : null}
      {blocking.length > 0 ? (
        <Row color={colors.dangerDark} bg={colors.dangerLight} title={t('drug.clinical.interactions')} lines={blocking.map((i) => `${i.drugName}: ${i.mechanism}`)} />
      ) : null}
      {contraindications.length > 0 ? (
        <Row color={colors.dangerDark} bg={colors.dangerLight} title={t('drug.clinical.contraindications')} lines={contraindications} />
      ) : null}
    </View>
  )
}

function Row({ color, bg, title, lines, rtl }: { color: string; bg: string; title: string; lines: string[]; rtl?: boolean }) {
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <AlertTriangle size={18} color={color} />
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color }]}>{title}</Text>
        {lines.map((line, i) => (
          <Text
            key={i}
            style={[styles.detail, { color }, rtl ? { fontFamily: FontFamily.arabic, writingDirection: 'rtl', textAlign: 'right' } : { writingDirection: 'ltr' }]}
          >
            {line}
          </Text>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { marginHorizontal: Spacing[4], marginTop: Spacing[2], marginBottom: Spacing[3], gap: Spacing[2] },
  banner: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing[3], gap: Spacing[2], borderRadius: Radius.md },
  textContainer: { flex: 1 },
  title: { fontSize: FontSize.sm, fontFamily: FontFamily.sansBold, marginBottom: Spacing[1] },
  detail: { fontSize: FontSize.xs, fontFamily: FontFamily.sans, lineHeight: 18 },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/safety-zone.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/components/DrugDetail/SafetyZone.tsx apps/pharmopedia/src/__tests__/safety-zone.test.tsx
git commit -m "feat(pharmopedia): pinned non-collapsible SafetyZone"
```

---

## Task 5: `expo-image` dependency + `MediaSection` (Photos gallery body)

**Files:**
- Modify: `apps/pharmopedia/package.json`
- Create: `apps/pharmopedia/src/components/DrugDetail/MediaSection.tsx`
- Test: `apps/pharmopedia/src/__tests__/media-section.test.tsx` (create)

**Interfaces:**
- Consumes: `DrugImage[]`, theme colors, i18n.
- Produces: `MediaSection({ images: DrugImage[] })` — gallery body (intended to be wrapped by `CollapsibleSection` in the page). Renders one tile per image (testID `media-tile-<index>`) with brand label (or `drug.photos.generic`) and a persistent disclaimer (testID `media-disclaimer`). Renders `null` when `images` is empty.

- [ ] **Step 1: Add the dependency**

In `apps/pharmopedia/package.json` `dependencies`, add (Expo SDK 54-aligned range):

```json
    "expo-image": "~2.4.0",
```

Run: `pnpm install`
Expected: lockfile updates, `expo-image` resolves.

- [ ] **Step 2: Write the failing test**

```tsx
// apps/pharmopedia/src/__tests__/media-section.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import type { DrugImage } from '@ultranos/shared-types'
import { MediaSection } from '@/components/DrugDetail/MediaSection'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ surface: '#fff', surfaceSubtle: '#f5f5f5', textPrimary: '#111', textMuted: '#999' }),
}))
// expo-image renders a native <Image>; stub to a host element for the node test env
vi.mock('expo-image', () => {
  const React = require('react')
  return { Image: (props: Record<string, unknown>) => React.createElement('ExpoImage', props) }
})

const images: DrugImage[] = [
  { url: 'https://x/advil.jpg', brand: 'Advil', isPrimary: true },
  { url: 'https://x/generic.jpg' },
]

describe('MediaSection', () => {
  it('renders a tile per image with brand labels and a disclaimer', () => {
    render(<MediaSection images={images} />)
    expect(screen.getByTestId('media-tile-0')).toBeTruthy()
    expect(screen.getByTestId('media-tile-1')).toBeTruthy()
    expect(screen.getByText('Advil')).toBeTruthy()
    expect(screen.getByText('drug.photos.generic')).toBeTruthy()
    expect(screen.getByTestId('media-disclaimer')).toBeTruthy()
  })

  it('renders nothing when there are no images', () => {
    render(<MediaSection images={[]} />)
    expect(screen.queryByTestId('media-disclaimer')).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/media-section.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the component**

```tsx
// apps/pharmopedia/src/components/DrugDetail/MediaSection.tsx
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { DrugImage } from '@ultranos/shared-types'

export function MediaSection({ images }: { images: DrugImage[] }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  if (!images || images.length === 0) return null

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {images.map((img, i) => (
          <View key={i} testID={`media-tile-${i}`} style={styles.tile}>
            <Image
              source={img.url}
              style={[styles.image, { backgroundColor: colors.surfaceSubtle }]}
              contentFit="cover"
              transition={150}
              accessibilityLabel={img.caption ?? img.brand ?? t('drug.photos.generic')}
            />
            <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={1}>
              {img.brand ?? t('drug.photos.generic')}
            </Text>
          </View>
        ))}
      </ScrollView>
      <Text testID="media-disclaimer" style={[styles.disclaimer, { color: colors.textMuted }]}>
        {t('drug.photos.disclaimer')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { gap: Spacing[3], paddingVertical: Spacing[1] },
  tile: { width: 120, gap: Spacing[1] },
  image: { width: 120, height: 120, borderRadius: Radius.md },
  label: { fontSize: FontSize.xs, fontFamily: FontFamily.sansSemibold },
  disclaimer: { marginTop: Spacing[2], fontSize: FontSize.xs, fontFamily: FontFamily.sans, fontStyle: 'italic' },
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/media-section.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/package.json pnpm-lock.yaml apps/pharmopedia/src/components/DrugDetail/MediaSection.tsx apps/pharmopedia/src/__tests__/media-section.test.tsx
git commit -m "feat(pharmopedia): MediaSection photos gallery (expo-image)"
```

---

## Task 6: `DrugThumbnail` (header image / pill fallback)

**Files:**
- Create: `apps/pharmopedia/src/components/DrugDetail/DrugThumbnail.tsx`
- Test: `apps/pharmopedia/src/__tests__/drug-thumbnail.test.tsx` (create)

**Interfaces:**
- Produces: `DrugThumbnail({ images?: DrugImage[]; name: string; size?: number })`. Picks `images.find(i => i.isPrimary)?.url ?? images[0]?.url`. If a URL exists → `expo-image` (testID `drug-thumb-image`); else → pill-icon fallback (testID `drug-thumb-fallback`).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/pharmopedia/src/__tests__/drug-thumbnail.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import type { DrugImage } from '@ultranos/shared-types'
import { DrugThumbnail } from '@/components/DrugDetail/DrugThumbnail'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ surfaceSubtle: '#f5f5f5', primary500: '#2e9e71' }),
}))
vi.mock('expo-image', () => {
  const React = require('react')
  return { Image: (props: Record<string, unknown>) => React.createElement('ExpoImage', props) }
})

describe('DrugThumbnail', () => {
  it('shows the primary image when present', () => {
    const images: DrugImage[] = [{ url: 'https://x/a.jpg' }, { url: 'https://x/primary.jpg', isPrimary: true }]
    render(<DrugThumbnail images={images} name="Ibuprofen" />)
    const img = screen.getByTestId('drug-thumb-image')
    expect(img.props.source).toBe('https://x/primary.jpg')
  })

  it('falls back to the pill icon when there are no images', () => {
    render(<DrugThumbnail images={[]} name="Ibuprofen" />)
    expect(screen.getByTestId('drug-thumb-fallback')).toBeTruthy()
    expect(screen.queryByTestId('drug-thumb-image')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/drug-thumbnail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// apps/pharmopedia/src/components/DrugDetail/DrugThumbnail.tsx
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { Pill } from 'lucide-react-native'
import { Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { DrugImage } from '@ultranos/shared-types'

export function DrugThumbnail({ images, name, size = 44 }: { images?: DrugImage[]; name: string; size?: number }) {
  const colors = useThemeColors()
  const url = images?.find((i) => i.isPrimary)?.url ?? images?.[0]?.url
  const dim = { width: size, height: size, borderRadius: Radius.md }

  if (url) {
    return (
      <Image
        testID="drug-thumb-image"
        source={url}
        style={[dim, { backgroundColor: colors.surfaceSubtle }]}
        contentFit="cover"
        transition={150}
        accessibilityLabel={name}
      />
    )
  }
  return (
    <View testID="drug-thumb-fallback" style={[styles.fallback, dim, { backgroundColor: colors.surfaceSubtle }]}>
      <Pill size={size * 0.5} color={colors.primary500} />
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/drug-thumbnail.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/components/DrugDetail/DrugThumbnail.tsx apps/pharmopedia/src/__tests__/drug-thumbnail.test.tsx
git commit -m "feat(pharmopedia): DrugThumbnail header image with pill fallback"
```

---

## Task 7: Section-descriptor builder

**Files:**
- Create: `apps/pharmopedia/src/components/DrugDetail/drug-detail-sections.tsx`
- Test: `apps/pharmopedia/src/__tests__/drug-detail-sections.test.tsx` (create)

**Interfaces:**
- Consumes: `resolveLocalized` (`@/lib/localized-text`), `SectionCard`, `MediaSection`, `PricingTab`, `DrugEntryTier1/2/3`, a `t` function, `Lang`, role flags.
- Produces:
  ```ts
  interface DrugSection { id: string; title: string; defaultOpen: boolean; body: ReactNode }
  function buildDrugSections(args: {
    entry: DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3
    lang: Lang
    t: (k: string) => string
    isClinical: boolean
    isPharmacist: boolean
  }): DrugSection[]
  ```
  Order: `summary`(open) → `usedFor`(open) → `sideEffects` → `pregnancy` → `storage` → `formsBrands` → `photos`(if images) → `pricing` → `clinical`(if isClinical) → `dispensing`(if isPharmacist). Empty sections are omitted.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/pharmopedia/src/__tests__/drug-detail-sections.test.tsx
import { describe, it, expect, vi } from 'vitest'
import type { DrugEntryTier1 } from '@ultranos/shared-types'
import { buildDrugSections } from '@/components/DrugDetail/drug-detail-sections'

vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({ surface: '#fff', textPrimary: '#111', textSecondary: '#444', border: '#ddd', surfaceSubtle: '#f5f5f5', textMuted: '#999' }) }))
vi.mock('@/components/DrugDetail/PricingTab', () => ({ PricingTab: () => null }))

const t = (k: string) => k
const base: DrugEntryTier1 = {
  atcCode: 'M01AE01', innName: 'Ibuprofen', brandNames: ['Advil'], doseForms: ['Tablet'],
  therapeuticClass: 'NSAID', localNames: {},
  summaryPlain: { en: 'A painkiller.' }, usedFor: [{ en: 'Pain' }], commonSideEffects: [],
  whenToSeekHelp: {}, storageInstructions: {}, pregnancySummaryPlain: {}, warningsSummaryPlain: {},
  version: 1, lastUpdated: '2026-06-17T00:00:00Z',
}

describe('buildDrugSections', () => {
  it('omits empty sections and opens summary + usedFor', () => {
    const secs = buildDrugSections({ entry: base, lang: 'en', t, isClinical: false, isPharmacist: false })
    const ids = secs.map((s) => s.id)
    expect(ids).toContain('summary')
    expect(ids).toContain('usedFor')
    expect(ids).toContain('formsBrands') // brandNames/doseForms present
    expect(ids).not.toContain('sideEffects') // empty
    expect(ids).not.toContain('photos') // no images
    expect(secs.find((s) => s.id === 'summary')!.defaultOpen).toBe(true)
    expect(secs.find((s) => s.id === 'formsBrands')!.defaultOpen).toBe(false)
  })

  it('adds photos when images exist and clinical when isClinical', () => {
    const withImg = { ...base, images: [{ url: 'https://x/a.jpg', brand: 'Advil' }] }
    const secs = buildDrugSections({ entry: withImg, lang: 'en', t, isClinical: true, isPharmacist: false })
    const ids = secs.map((s) => s.id)
    expect(ids).toContain('photos')
    expect(ids).toContain('clinical')
    expect(ids).not.toContain('dispensing')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/drug-detail-sections.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the builder**

```tsx
// apps/pharmopedia/src/components/DrugDetail/drug-detail-sections.tsx
import { type ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { resolveLocalized } from '@/lib/localized-text'
import type { Lang } from '@/store/lang-store'
import { SectionCard } from './SectionCard'
import { MediaSection } from './MediaSection'
import { PricingTab } from './PricingTab'
import type { DrugEntryTier1, DrugEntryTier2, DrugEntryTier3, DrugLocalizedText } from '@ultranos/shared-types'

export interface DrugSection {
  id: string
  title: string
  defaultOpen: boolean
  body: ReactNode
}

interface Args {
  entry: DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3
  lang: Lang
  t: (k: string) => string
  isClinical: boolean
  isPharmacist: boolean
}

export function buildDrugSections({ entry, lang, t, isClinical, isPharmacist }: Args): DrugSection[] {
  const sections: DrugSection[] = []
  const resolve = (f: DrugLocalizedText | undefined) => resolveLocalized(f, lang)
  const resolveList = (fs: DrugLocalizedText[] | undefined) => {
    const items = (fs ?? []).map(resolve).filter((r) => r.text)
    return { texts: items.map((r) => r.text), isRtl: items.length > 0 && items.every((r) => r.isLocalized) }
  }

  const summary = resolve(entry.summaryPlain)
  if (summary.text) sections.push({ id: 'summary', title: t('drug.overview.summary'), defaultOpen: true,
    body: <SectionCard title="" text={summary.text} isRtl={summary.isLocalized} /> })

  const usedFor = resolveList(entry.usedFor)
  if (usedFor.texts.length) sections.push({ id: 'usedFor', title: t('drug.overview.usedFor'), defaultOpen: true,
    body: <SectionCard title="" items={usedFor.texts} isRtl={usedFor.isRtl} /> })

  const sideEffects = resolveList(entry.commonSideEffects)
  if (sideEffects.texts.length) sections.push({ id: 'sideEffects', title: t('drug.overview.sideEffects'), defaultOpen: false,
    body: <SectionCard title="" items={sideEffects.texts} isRtl={sideEffects.isRtl} /> })

  const pregnancy = resolve(entry.pregnancySummaryPlain)
  if (pregnancy.text) sections.push({ id: 'pregnancy', title: t('drug.overview.pregnancy'), defaultOpen: false,
    body: <SectionCard title="" text={pregnancy.text} isRtl={pregnancy.isLocalized} severity="info" /> })

  const storage = resolve(entry.storageInstructions)
  if (storage.text) sections.push({ id: 'storage', title: t('drug.overview.storage'), defaultOpen: false,
    body: <SectionCard title="" text={storage.text} isRtl={storage.isLocalized} /> })

  const brandNames = (entry.brandNames ?? []).filter(Boolean)
  const doseForms = (entry.doseForms ?? []).filter(Boolean)
  if (brandNames.length || doseForms.length) sections.push({
    id: 'formsBrands', title: t('drug.overview.brandNames'), defaultOpen: false,
    body: (
      <View style={styles.stack}>
        {brandNames.length ? <SectionCard title={t('drug.overview.brandNames')} text={brandNames.join(', ')} isRtl={false} /> : null}
        {doseForms.length ? <SectionCard title={t('drug.overview.doseForms')} text={doseForms.join(', ')} isRtl={false} /> : null}
      </View>
    ),
  })

  const images = (entry as DrugEntryTier1).images ?? []
  if (images.length) sections.push({ id: 'photos', title: t('drug.photos.title'), defaultOpen: false,
    body: <MediaSection images={images} /> })

  sections.push({ id: 'pricing', title: t('drug.tabs.pricing'), defaultOpen: false,
    body: <PricingTab atcCode={entry.atcCode} /> })

  if (isClinical) {
    const e2 = entry as DrugEntryTier2
    const adminNotes = resolve(e2.administrationNotes)
    sections.push({ id: 'clinical', title: t('drug.tabs.clinical'), defaultOpen: false,
      body: (
        <View style={styles.stack}>
          {e2.mechanismOfAction ? <SectionCard title={t('drug.clinical.mechanism')} text={e2.mechanismOfAction} /> : null}
          {e2.indicationsClinical?.length ? <SectionCard title={t('drug.clinical.indications')} items={e2.indicationsClinical} /> : null}
          {e2.adverseEvents?.length ? <SectionCard title={t('drug.clinical.adverseEvents')} items={e2.adverseEvents.map((a) => a.effect)} /> : null}
          {e2.renalAdjustment ? <SectionCard title={t('drug.clinical.renalAdjustment')} text={e2.renalAdjustment} /> : null}
          {adminNotes.text ? <SectionCard title={t('drug.clinical.adminNotes')} text={adminNotes.text} isRtl={adminNotes.isLocalized} /> : null}
        </View>
      ) })
  }

  if (isPharmacist) {
    const e3 = entry as DrugEntryTier3
    const lines: string[] = []
    if (e3.formularyStatus) lines.push(e3.formularyStatus)
    if (e3.dispensingNotes) lines.push(e3.dispensingNotes)
    if (lines.length) sections.push({ id: 'dispensing', title: t('drug.sections.dispensing'), defaultOpen: false,
      body: <SectionCard title="" items={lines} /> })
  }

  return sections
}

const styles = StyleSheet.create({
  stack: { gap: Spacing[3] },
})
```

> Note: `SectionCard` with an empty `title=""` still renders the title `<Text>` empty; that's acceptable because the `CollapsibleSection` header already carries the section title. (If you prefer no inner title node, a later cleanup can make `SectionCard` skip an empty title — out of scope here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/drug-detail-sections.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/components/DrugDetail/drug-detail-sections.tsx apps/pharmopedia/src/__tests__/drug-detail-sections.test.tsx
git commit -m "feat(pharmopedia): drug detail section-descriptor builder"
```

---

## Task 8: Rewrite the detail screen to single-scroll + remove the native header

**Files:**
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx` (full rewrite)
- Modify: `apps/pharmopedia/app/_layout.tsx:111`
- Modify/replace test: `apps/pharmopedia/src/__tests__/drug-detail-rtl.test.tsx` + delete its snapshot file so it regenerates

**Interfaces:**
- Consumes: `buildDrugSections`, `SafetyZone`, `DrugThumbnail`, `CollapsibleSection`, existing data loaders (`getDrugRowByAtcCode`, `scopeEntryForRole`, `getDrugByAtcCodeApi`), stores, `useThemeColors`.

- [ ] **Step 1: Turn off the native header for the drug screen**

In `apps/pharmopedia/app/_layout.tsx`, change line 111:

```tsx
            <Stack.Screen name="drug/[atcCode]" options={{ headerShown: false }} />
```

- [ ] **Step 2: Write the new screen test (replace the old tab-based one)**

Replace the body of `apps/pharmopedia/src/__tests__/drug-detail-rtl.test.tsx` keeping its existing `vi.mock` blocks for stores/router/safe-area/i18n/theme, but change the data mock + assertions. Update the `vi.mock('@/db/drug-catalog', ...)` entry to include images and the `describe`:

```tsx
// ...keep existing mocks, but ensure the mocked entry includes:
//   images: [{ url: 'https://x/advil.jpg', brand: 'Advil', isPrimary: true }],
//   warningsSummaryPlain: { en: 'May cause stomach bleeding' },
// Add mocks so the single-scroll screen renders in node env:
vi.mock('expo-image', () => { const R = require('react'); return { Image: (p: Record<string, unknown>) => R.createElement('ExpoImage', p) } })
vi.mock('@/components/DrugDetail/PricingTab', () => ({ PricingTab: () => null }))

import DrugDetailScreen from '@/app/drug/[atcCode]'

describe('DrugDetailScreen — single scroll', () => {
  it('renders the pinned safety zone and a collapsible section, no tab bar', async () => {
    mockLang.lang = 'en'
    const { findByText, queryByTestId } = render(<DrugDetailScreen />)
    await findByText('amoxicillin')
    expect(queryByTestId('safety-zone')).toBeTruthy()
    expect(queryByTestId('tab-overview')).toBeNull() // tabs removed
  })

  it('LTR snapshot', async () => {
    mockLang.lang = 'en'
    const { toJSON, findByText } = render(<DrugDetailScreen />)
    await findByText('amoxicillin')
    expect(toJSON()).toMatchSnapshot()
  })

  it('RTL snapshot (lang=ar)', async () => {
    mockLang.lang = 'ar'
    const { toJSON, findByText } = render(<DrugDetailScreen />)
    await findByText('أموكسيسيلين')
    expect(toJSON()).toMatchSnapshot()
  })
})
```

Delete the stale snapshot so it regenerates fresh:
```bash
rm apps/pharmopedia/src/__tests__/__snapshots__/drug-detail-rtl.test.tsx.snap
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/drug-detail-rtl.test.tsx`
Expected: FAIL — `tab-overview` still present (old screen) / `safety-zone` absent.

- [ ] **Step 4: Rewrite the screen**

Replace `apps/pharmopedia/app/drug/[atcCode].tsx` with:

```tsx
import { useState, useEffect } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Heart } from 'lucide-react-native'
import { ImpactFeedbackStyle } from 'expo-haptics'
import { getDrugRowByAtcCode, scopeEntryForRole } from '@/db/drug-catalog'
import { getDrugByAtcCodeApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useBookmarkStore } from '@/store/bookmark-store'
import { hapticImpact } from '@/lib/haptics'
import { SafetyZone } from '@/components/DrugDetail/SafetyZone'
import { DrugThumbnail } from '@/components/DrugDetail/DrugThumbnail'
import { buildDrugSections } from '@/components/DrugDetail/drug-detail-sections'
import { ShareButton } from '@/components/DrugDetail/ShareButton'
import { SkeletonCard } from '@/components/SkeletonCard'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { Chip, CollapsibleSection } from '@ultranos/ui-kit/native'
import type { DrugEntryTier1, DrugEntryTier2, DrugEntryTier3 } from '@ultranos/shared-types'

const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH', 'PHARMACIST', 'ADMIN'])
const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])

export default function DrugDetailScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const { atcCode } = useLocalSearchParams<{ atcCode: string }>()
  const router = useRouter()
  const { token, user } = useAuthStore()
  const lang = useLangStore((s) => s.lang)
  const role = user?.role ?? 'PATIENT'
  const isClinical = CLINICAL_ROLES.has(role)
  const isPharmacist = PHARMACIST_ROLES.has(role)
  const isRtl = isRtlLang(lang)

  const isBookmarked = useBookmarkStore((s) => s.isBookmarked)
  const toggleBookmark = useBookmarkStore((s) => s.toggle)

  const [entry, setEntry] = useState<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3 | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!atcCode) return
    loadDrug(atcCode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atcCode])

  async function loadDrug(code: string) {
    setLoading(true)
    try {
      const row = await getDrugRowByAtcCode(getDatabase(), code)
      if (row) { setEntry(scopeEntryForRole(row, role)); return }
      if (token) { setEntry(await getDrugByAtcCodeApi(code, lang, token)) }
    } catch {
      // entry stays null → "not found"
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleBookmark() {
    await toggleBookmark(getDatabase(), {
      atcCode: entry!.atcCode, innName: entry!.innName, therapeuticClass: entry!.therapeuticClass,
    })
    void hapticImpact(ImpactFeedbackStyle.Light)
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surfaceSubtle }]}>
        <View style={{ width: '100%', padding: Spacing[4] }}>
          <SkeletonCard lines={1} /><SkeletonCard lines={3} /><SkeletonCard lines={2} />
        </View>
      </View>
    )
  }

  if (!entry) {
    return (
      <View style={styles.center}>
        <Text style={[styles.notFound, { color: colors.textSecondary }]}>{t('drug.notFound')}</Text>
        <Text style={[styles.notFoundDesc, { color: colors.textMuted }]}>{t('drug.notFoundDescription')}</Text>
        <Pressable onPress={() => router.replace('/(tabs)' as never)} accessibilityRole="button" accessibilityLabel={t('drug.searchInstead')}>
          <Text style={[styles.back, { color: colors.primary500 }]}>{t('drug.searchInstead')}</Text>
        </Pressable>
      </View>
    )
  }

  const localNames = (entry as DrugEntryTier1 & { localNames?: Record<string, string> }).localNames
  const localName = lang !== 'en' ? localNames?.[lang] : undefined
  const sections = buildDrugSections({ entry, lang, t, isClinical, isPharmacist })

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceSubtle }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.header, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
          <DrugThumbnail images={(entry as DrugEntryTier1).images} name={entry.innName} />
          <View style={styles.nameBlock}>
            <Text style={[styles.primaryName, { color: colors.textPrimary }, localName ? styles.rtlText : isRtl && styles.fallbackName]}>
              {localName || entry.innName}
            </Text>
            <Text style={[styles.innLine, { color: colors.textSecondary, writingDirection: 'ltr', textAlign: isRtl ? 'right' : 'left' }]}>
              {entry.innName}{isClinical ? ` · ${entry.atcCode}` : ''}
            </Text>
          </View>
          <View style={[styles.actionRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
            <Pressable testID="bookmark-btn" onPress={() => void handleToggleBookmark()} accessibilityRole="button"
              accessibilityLabel={isBookmarked(entry.atcCode) ? t('drug.removeBookmark') : t('drug.addBookmark')} hitSlop={8}>
              <Heart color={isBookmarked(entry.atcCode) ? colors.primary500 : colors.textMuted}
                fill={isBookmarked(entry.atcCode) ? colors.primary500 : 'none'} size={24} />
            </Pressable>
            <ShareButton atcCode={entry.atcCode} drugName={entry.innName} />
          </View>
        </View>

        <View style={styles.chipWrap}><Chip label={entry.therapeuticClass} /></View>

        <SafetyZone entry={entry} lang={lang} isClinical={isClinical} />

        <View style={styles.sectionList}>
          {sections.length === 0 ? (
            <Text style={[styles.noDetail, { color: colors.textMuted }]}>{t('drug.noDetail')}</Text>
          ) : (
            sections.map((s) => (
              <CollapsibleSection key={s.id} testID={`section-${s.id}`} title={s.title} defaultOpen={s.defaultOpen}>
                <ErrorBoundary inline>{s.body}</ErrorBoundary>
              </CollapsibleSection>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Spacing[4], gap: Spacing[3], paddingBottom: Spacing[8] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', gap: Spacing[3] },
  nameBlock: { flex: 1 },
  primaryName: { fontSize: FontSize.xl, fontFamily: FontFamily.headingBold, marginBottom: 2 },
  innLine: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  chipWrap: { flexDirection: 'row' },
  actionRow: { alignItems: 'center', gap: Spacing[3] },
  rtlText: { fontFamily: FontFamily.arabic, textAlign: 'right', writingDirection: 'rtl' },
  fallbackName: { textAlign: 'right', writingDirection: 'ltr' },
  sectionList: { gap: 0 },
  noDetail: { fontSize: FontSize.base, fontFamily: FontFamily.sans, textAlign: 'center', padding: Spacing[6] },
  notFound: { fontSize: FontSize.lg, marginBottom: Spacing[3] },
  notFoundDesc: { fontSize: FontSize.sm, fontFamily: FontFamily.sans, textAlign: 'center', marginBottom: Spacing[3], paddingHorizontal: Spacing[6] },
  back: { fontSize: FontSize.base },
})
```

- [ ] **Step 5: Run the test; regenerate snapshots**

Run: `pnpm -F pharmopedia exec vitest run src/__tests__/drug-detail-rtl.test.tsx`
Expected: the two behavior assertions PASS; snapshot tests "write new snapshot". If snapshots are reported as obsolete/failing, regenerate:
Run: `pnpm -F pharmopedia exec vitest run src/__tests__/drug-detail-rtl.test.tsx -u`
Expected: PASS, 2 snapshots written.

- [ ] **Step 6: Review the generated snapshot**

Open `apps/pharmopedia/src/__tests__/__snapshots__/drug-detail-rtl.test.tsx.snap` and confirm: a single `ScrollView`, a `safety-zone`, `section-*` blocks, **no** `tab-*` nodes, and the header thumbnail node.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/app/drug/[atcCode].tsx apps/pharmopedia/app/_layout.tsx apps/pharmopedia/src/__tests__/drug-detail-rtl.test.tsx apps/pharmopedia/src/__tests__/__snapshots__/drug-detail-rtl.test.tsx.snap
git commit -m "feat(pharmopedia): single-scroll collapsible drug detail page"
```

---

## Task 9: Remove dead tab components & full regression

**Files:**
- Delete: `apps/pharmopedia/src/components/DrugDetail/OverviewTab.tsx`, `ClinicalTab.tsx`, and their tests (`onboarding`-style snapshots referencing them, if any). **Keep** `PricingTab.tsx` (reused as a section body) and `SafetyBanner.tsx` only if still referenced — otherwise delete `SafetyBanner.tsx` (superseded by `SafetyZone`).
- Modify: any imports that referenced the deleted components.

**Interfaces:** none new.

- [ ] **Step 1: Find references to the components being removed**

Run: `cd apps/pharmopedia && grep -rn "OverviewTab\|ClinicalTab\|SafetyBanner" src app | grep -v "__snapshots__"`
Expected: only the section builder/page (already migrated) and old tests.

- [ ] **Step 2: Delete the superseded components and their dedicated tests**

```bash
cd apps/pharmopedia
rm src/components/DrugDetail/OverviewTab.tsx src/components/DrugDetail/ClinicalTab.tsx src/components/DrugDetail/SafetyBanner.tsx
# delete tests that target only those components, e.g.:
# rm src/__tests__/drug-detail-i18n.test.tsx   # ONLY if it imports OverviewTab/ClinicalTab directly
```

> Before deleting any test, open it: if it asserts behavior now covered by `drug-detail-sections.test.tsx`/`safety-zone.test.tsx`, delete it; if it covers something unique, migrate the assertion into the new tests instead.

- [ ] **Step 3: Run the full pharmopedia suite**

Run: `pnpm -F pharmopedia exec vitest run`
Expected: all tests PASS. Fix any remaining import of a deleted module by pointing it at the builder/SafetyZone.

- [ ] **Step 4: Typecheck the changed files**

Run: `pnpm -F pharmopedia exec tsc --noEmit`
Expected: no **new** errors in `drug/[atcCode].tsx`, `drug-detail-sections.tsx`, `SafetyZone.tsx`, `MediaSection.tsx`, `DrugThumbnail.tsx` (pre-existing `tokens.native` module-resolution + `ps.ts` literal-type noise may remain — confirm they predate this work).

- [ ] **Step 5: Commit**

```bash
git add -A apps/pharmopedia/src/components/DrugDetail apps/pharmopedia/src/__tests__
git commit -m "refactor(pharmopedia): remove tab components superseded by sections"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Single scroll + collapsible sections → Tasks 3, 7, 8.
- Pinned non-collapsible safety zone → Task 4 (+ rendered directly in Task 8).
- Remove double header → Task 8 Step 1 (`headerShown: false`) + screen owns header.
- Render-if-present / empty handling → Task 7 (omit empties) + Task 8 (`drug.noDetail`).
- Image data model → Task 1; header thumbnail → Task 6; Photos gallery → Task 5; wired in Tasks 7–8.
- Offline/cached images → `expo-image` (Task 5/6); online-only posture is inherent (URLs, cache-after-view).
- Role gating → Task 7 (`isClinical`/`isPharmacist`) + Task 8.
- RTL/i18n → reuse `resolveLocalized`/`SectionCard`; new keys in Task 2; parity test enforced.
- Testing requirements → each task is TDD; Task 8 covers LTR/RTL snapshots + safety + no-tabs; Task 9 full regression.
- **Deferred (separate plan, per spec §10 + scope note):** enrich image *upload*, Hub `drugCatalog.enrich` image handling, Supabase bucket, `EnrichTab` upload UI, and the Dispensing *edit* affordance (Task 7 renders dispensing read-only).

**Placeholder scan:** no TBD/TODO; all code steps contain full code; commands have expected output.

**Type consistency:** `DrugImage`/`images?` (Task 1) used identically in Tasks 5–8; `buildDrugSections` signature (Task 7) matches its call in Task 8; `CollapsibleSection` props (Task 3) match usage in Task 8; `SafetyZone`/`DrugThumbnail`/`MediaSection` signatures match their call sites.

**Known follow-ups not in this plan:** (1) image upload subsystem; (2) optional `SectionCard` empty-title cleanup; (3) `EnrichTab` becoming the pharmacist edit surface.
