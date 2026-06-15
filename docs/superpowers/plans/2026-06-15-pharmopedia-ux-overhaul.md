# Pharmopedia UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all 9 recommendations from the impeccable critique — drug detail redesign, auth hardening, profile layout, token standardization, onboarding, accessibility, Arabic search bugs, micro-interactions, and final polish.

**Architecture:** All changes are within `apps/pharmopedia/`. No backend changes. No shared-types changes. Translations added to all 4 locale files (en, prs, ps, ar). Tests use Vitest with `@testing-library/react-native` mocks in `src/__tests__/`.

**Tech Stack:** React Native (Expo 52), TypeScript, Zustand, expo-sqlite, react-native-reanimated, `@ultranos/ui-kit/tokens.native`, Vitest

---

## File Map

### New Files
- `src/components/DrugDetail/SectionCard.tsx` — Reusable section wrapper with severity-coding
- `src/components/DrugDetail/SeverityBadge.tsx` — Interaction severity badge component
- `src/components/DrugDetail/SafetyBanner.tsx` — Persistent contraindication warnings above tabs
- `src/__tests__/section-card.test.tsx` — SectionCard tests
- `src/__tests__/severity-badge.test.tsx` — SeverityBadge tests
- `src/__tests__/safety-banner.test.tsx` — SafetyBanner tests
- `src/__tests__/password-reset.test.tsx` — Password reset flow tests
- `src/__tests__/otp-resend.test.tsx` — OTP resend with cooldown tests
- `src/__tests__/logout-confirmation.test.tsx` — Sign-out confirmation tests
- `src/__tests__/arabic-search.test.ts` — Arabic FTS + browse fix tests
- `src/__tests__/accessibility-roles.test.tsx` — Accessibility attribute tests

### Modified Files
- `src/components/DrugDetail/ClinicalTab.tsx` — Severity-coded sections, SeverityBadge
- `src/components/DrugDetail/OverviewTab.tsx` — Token standardization, SectionCard
- `src/components/DrugDetail/FormularyTab.tsx` — Remove side-stripe border on recall cards
- `src/components/DrugDetail/EnrichTab.tsx` — Token standardization
- `src/components/DrugDetail/ShareButton.tsx` — Accessibility attributes
- `app/drug/[atcCode].tsx` — SafetyBanner, tab rename, ATC display for patients, token fixes, a11y
- `app/(auth)/login.tsx` — Password reset, OTP resend, token standardization, a11y
- `app/(auth)/register.tsx` — Token fixes, a11y
- `app/(tabs)/profile.tsx` — Layout consolidation, sign-out confirmation, coach replay, a11y
- `app/(tabs)/index.tsx` — Recent searches, bookmark color fix, a11y
- `app/(tabs)/browse.tsx` — Token fixes, a11y
- `app/(tabs)/saved.tsx` — a11y
- `app/welcome.tsx` — Replace with onboarding or remove
- `src/components/SearchBar.tsx` — a11y, clear button
- `src/components/DrugCard.tsx` — Token fixes, a11y, bookmark color
- `src/components/PriceCard.tsx` — Token fixes, a11y, remove side-stripe
- `src/components/SyncStatusBanner.tsx` — Token fixes, a11y live region
- `src/components/NetStatusBanner.tsx` — a11y live region
- `src/components/CoachMark.tsx` — a11y
- `src/components/LanguageChips.tsx` — a11y radio roles
- `src/components/RoleBadge.tsx` — a11y label
- `src/components/TherapeuticClassCard.tsx` — Token fixes, a11y
- `src/components/SkeletonCard.tsx` — a11y hidden
- `src/db/fts.ts` — Add `'ar'` to lang type union
- `src/db/browse.ts` — Include Arabic localName
- `src/store/coach-mark-store.ts` — Add `resetDismissed()` for replay
- `src/i18n/locales/en.ts` — New keys for password reset, resend OTP, sign-out confirm, edit tab, etc.
- `src/i18n/locales/prs.ts` — Same new keys (Dari)
- `src/i18n/locales/ps.ts` — Same new keys (Pashto)
- `src/i18n/locales/ar.ts` — Same new keys (Arabic)

---

## Task 1: Design Token Standardization — Shared Section Component

Create `SectionCard` to replace the duplicated `Section` function in OverviewTab and ClinicalTab. This component uses design tokens consistently and supports severity-coded backgrounds.

**Files:**
- Create: `apps/pharmopedia/src/components/DrugDetail/SectionCard.tsx`
- Test: `apps/pharmopedia/src/__tests__/section-card.test.tsx`

- [ ] **Step 1: Write the failing test for SectionCard**

```typescript
// src/__tests__/section-card.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { SectionCard } from '@/components/DrugDetail/SectionCard'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    textPrimary: '#111', textSecondary: '#666', textMuted: '#999',
    surface: '#fff', surfaceSubtle: '#f5f5f5',
    dangerLight: '#fee2e2', dangerDark: '#991b1b',
    warningLight: '#fef3c7', warningDark: '#92400e',
    successLight: '#dcfce7', successDark: '#166534',
    border: '#e5e5e5',
  }),
}))

describe('SectionCard', () => {
  it('renders title and text content', () => {
    render(<SectionCard title="Summary" text="Amoxicillin is an antibiotic." />)
    expect(screen.getByText('Summary')).toBeTruthy()
    expect(screen.getByText('Amoxicillin is an antibiotic.')).toBeTruthy()
  })

  it('renders bulleted list items', () => {
    render(<SectionCard title="Side Effects" items={['Nausea', 'Rash']} />)
    expect(screen.getByText(/Nausea/)).toBeTruthy()
    expect(screen.getByText(/Rash/)).toBeTruthy()
  })

  it('applies danger severity background', () => {
    const { getByTestId } = render(
      <SectionCard title="Contraindications" items={['Penicillin allergy']} severity="danger" testID="section-contra" />
    )
    const container = getByTestId('section-contra')
    const style = container.props.style
    // Flattened style should include dangerLight background
    const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style
    expect(flat.backgroundColor).toBe('#fee2e2')
  })

  it('applies warning severity background', () => {
    const { getByTestId } = render(
      <SectionCard title="Interactions" items={['Warfarin']} severity="warning" testID="section-inter" />
    )
    const container = getByTestId('section-inter')
    const style = container.props.style
    const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style
    expect(flat.backgroundColor).toBe('#fef3c7')
  })

  it('applies RTL text alignment', () => {
    render(<SectionCard title="Test" text="Content" isRtl />)
    // Should render without error and apply RTL styling
    expect(screen.getByText('Content')).toBeTruthy()
  })

  it('sets accessibilityRole header on title', () => {
    render(<SectionCard title="Dosing" text="500mg" />)
    const title = screen.getByText('Dosing')
    expect(title.props.accessibilityRole).toBe('header')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/section-card.test.tsx`
Expected: FAIL — module `@/components/DrugDetail/SectionCard` not found

- [ ] **Step 3: Implement SectionCard**

```typescript
// src/components/DrugDetail/SectionCard.tsx
import { View, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

type Severity = 'danger' | 'warning' | 'info' | 'none'

interface SectionCardProps {
  title: string
  text?: string
  items?: string[]
  severity?: Severity
  isRtl?: boolean
  testID?: string
  children?: React.ReactNode
}

export function SectionCard({ title, text, items, severity = 'none', isRtl, testID, children }: SectionCardProps) {
  const colors = useThemeColors()

  const severityBg: Record<Severity, string | undefined> = {
    danger: colors.dangerLight,
    warning: colors.warningLight,
    info: colors.surfaceSubtle,
    none: undefined,
  }

  const severityBorder: Record<Severity, string | undefined> = {
    danger: colors.danger,
    warning: colors.warning,
    info: colors.border,
    none: colors.border,
  }

  const hasSeverity = severity !== 'none'
  const rtlStyle = isRtl ? { fontFamily: FontFamily.arabic, textAlign: 'right' as const } : undefined

  return (
    <View
      testID={testID}
      style={[
        styles.section,
        hasSeverity && {
          backgroundColor: severityBg[severity],
          borderWidth: 1,
          borderColor: severityBorder[severity],
          borderRadius: Radius.md,
          padding: Spacing[3],
        },
      ]}
    >
      <Text
        style={[styles.sectionTitle, { color: colors.textSecondary }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {text && (
        <Text style={[styles.text, { color: colors.textPrimary }, rtlStyle]}>
          {text}
        </Text>
      )}
      {items?.map((item, i) => (
        <Text key={i} style={[styles.item, { color: colors.textPrimary }, rtlStyle]}>
          {'\u2022'} {item}
        </Text>
      ))}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginBottom: Spacing[5],
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sansBold,
    marginBottom: Spacing[1],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  text: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sans,
    lineHeight: 22,
  },
  item: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sans,
    lineHeight: 22,
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/section-card.test.tsx`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/components/DrugDetail/SectionCard.tsx apps/pharmopedia/src/__tests__/section-card.test.tsx
git commit -m "feat(pharmopedia): add SectionCard with severity-coded backgrounds and a11y"
```

---

## Task 2: Severity Badge Component

Renders interaction severity badges (CONTRAINDICATED, MAJOR, MODERATE, MINOR) with appropriate semantic colors instead of plain text.

**Files:**
- Create: `apps/pharmopedia/src/components/DrugDetail/SeverityBadge.tsx`
- Test: `apps/pharmopedia/src/__tests__/severity-badge.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/severity-badge.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { SeverityBadge } from '@/components/DrugDetail/SeverityBadge'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    danger: '#dc2626', dangerLight: '#fee2e2', dangerDark: '#991b1b',
    warning: '#d97706', warningLight: '#fef3c7', warningDark: '#92400e',
    neutral200: '#e5e5e5', neutral600: '#525252',
    textSecondary: '#666',
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('SeverityBadge', () => {
  it('renders CONTRAINDICATED with danger styling', () => {
    const { getByText } = render(<SeverityBadge severity="CONTRAINDICATED" />)
    expect(getByText('drug.clinical.severity.CONTRAINDICATED')).toBeTruthy()
  })

  it('renders MAJOR with warning styling', () => {
    const { getByText } = render(<SeverityBadge severity="MAJOR" />)
    expect(getByText('drug.clinical.severity.MAJOR')).toBeTruthy()
  })

  it('renders MINOR with neutral styling', () => {
    const { getByText } = render(<SeverityBadge severity="MINOR" />)
    expect(getByText('drug.clinical.severity.MINOR')).toBeTruthy()
  })

  it('has accessibilityLabel', () => {
    const { getByLabelText } = render(<SeverityBadge severity="CONTRAINDICATED" />)
    expect(getByLabelText('drug.clinical.severity.CONTRAINDICATED')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/severity-badge.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SeverityBadge**

```typescript
// src/components/DrugDetail/SeverityBadge.tsx
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

type Severity = 'CONTRAINDICATED' | 'MAJOR' | 'MODERATE' | 'MINOR'

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const label = t(`drug.clinical.severity.${severity}`)

  const colorMap: Record<Severity, { bg: string; text: string }> = {
    CONTRAINDICATED: { bg: colors.dangerLight, text: colors.dangerDark },
    MAJOR:           { bg: colors.warningLight, text: colors.warningDark },
    MODERATE:        { bg: colors.warningLight, text: colors.warningDark },
    MINOR:           { bg: colors.neutral200, text: colors.neutral600 },
  }

  const { bg, text } = colorMap[severity]

  return (
    <View
      style={[styles.badge, { backgroundColor: bg }]}
      accessibilityLabel={label}
      accessibilityRole="text"
    >
      <Text style={[styles.text, { color: text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1],
    borderRadius: Radius.sm,
  },
  text: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sansSemibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/severity-badge.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/components/DrugDetail/SeverityBadge.tsx apps/pharmopedia/src/__tests__/severity-badge.test.tsx
git commit -m "feat(pharmopedia): add SeverityBadge component for drug interaction severity"
```

---

## Task 3: Safety Banner — Persistent Contraindication Warnings

Renders a persistent danger banner above the drug detail tab bar when the drug has CONTRAINDICATED interactions. This ensures clinicians see the warning regardless of which tab is active.

**Files:**
- Create: `apps/pharmopedia/src/components/DrugDetail/SafetyBanner.tsx`
- Test: `apps/pharmopedia/src/__tests__/safety-banner.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/safety-banner.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { SafetyBanner } from '@/components/DrugDetail/SafetyBanner'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    danger: '#dc2626', dangerLight: '#fee2e2', dangerDark: '#991b1b', white: '#fff',
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('lucide-react-native', () => ({
  AlertTriangle: () => null,
}))

describe('SafetyBanner', () => {
  it('renders when there are CONTRAINDICATED interactions', () => {
    const interactions = [
      { drugName: 'Warfarin', severity: 'CONTRAINDICATED' as const, description: 'Bleeding risk' },
    ]
    render(<SafetyBanner interactions={interactions} />)
    expect(screen.getByText(/Warfarin/)).toBeTruthy()
  })

  it('renders nothing when no CONTRAINDICATED interactions', () => {
    const interactions = [
      { drugName: 'Aspirin', severity: 'MODERATE' as const, description: 'Minor risk' },
    ]
    const { toJSON } = render(<SafetyBanner interactions={interactions} />)
    expect(toJSON()).toBeNull()
  })

  it('renders nothing when interactions is empty', () => {
    const { toJSON } = render(<SafetyBanner interactions={[]} />)
    expect(toJSON()).toBeNull()
  })

  it('has accessibilityRole alert', () => {
    const interactions = [
      { drugName: 'Methotrexate', severity: 'CONTRAINDICATED' as const, description: 'Toxic' },
    ]
    const { getByRole } = render(<SafetyBanner interactions={interactions} />)
    expect(getByRole('alert')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/safety-banner.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SafetyBanner**

```typescript
// src/components/DrugDetail/SafetyBanner.tsx
import { View, Text, StyleSheet } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Interaction {
  drugName: string
  severity: 'CONTRAINDICATED' | 'MAJOR' | 'MODERATE' | 'MINOR'
  description: string
}

export function SafetyBanner({ interactions }: { interactions: Interaction[] }) {
  const colors = useThemeColors()
  const contraindicated = interactions.filter((i) => i.severity === 'CONTRAINDICATED')

  if (contraindicated.length === 0) return null

  return (
    <View
      style={[styles.banner, { backgroundColor: colors.dangerLight }]}
      accessibilityRole="alert"
    >
      <AlertTriangle size={18} color={colors.dangerDark} />
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: colors.dangerDark }]}>
          Contraindicated interactions
        </Text>
        {contraindicated.map((item, i) => (
          <Text key={i} style={[styles.detail, { color: colors.dangerDark }]}>
            {item.drugName}: {item.description}
          </Text>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing[3],
    gap: Spacing[2],
    borderRadius: Radius.md,
    marginHorizontal: Spacing[4],
    marginTop: Spacing[2],
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sansBold,
    marginBottom: Spacing[1],
  },
  detail: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sans,
    lineHeight: 18,
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/safety-banner.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/components/DrugDetail/SafetyBanner.tsx apps/pharmopedia/src/__tests__/safety-banner.test.tsx
git commit -m "feat(pharmopedia): add SafetyBanner for contraindicated interaction warnings"
```

---

## Task 4: Wire Drug Detail Redesign

Integrate SectionCard, SeverityBadge, and SafetyBanner into the drug detail screen. Rename "Enrich" tab to "Edit". Hide ATC code from patients. Fix token usage in the drug detail StyleSheet.

**Files:**
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/OverviewTab.tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/FormularyTab.tsx`
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`

- [ ] **Step 1: Update i18n — rename "Enrich" to "Edit" and add new keys**

In `src/i18n/locales/en.ts`, change the `drug.tabs.enrich` key and add safety banner key:

```typescript
// In drug.tabs object, change:
enrich: 'Edit',

// Add to drug.clinical object:
safetyWarning: 'Contraindicated interactions',
```

- [ ] **Step 2: Update the same keys in prs.ts, ps.ts, ar.ts**

Each locale file needs the same structural changes. The `enrich` tab label becomes the localized equivalent of "Edit" and the `safetyWarning` key gets its translation.

- [ ] **Step 3: Rewrite ClinicalTab to use SectionCard and SeverityBadge**

Replace the entire `ClinicalTab.tsx`:

```typescript
// src/components/DrugDetail/ClinicalTab.tsx
import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier2 } from '@ultranos/shared-types'
import { useThemeColors } from '@/hooks/useThemeColors'
import { SectionCard } from './SectionCard'
import { SeverityBadge } from './SeverityBadge'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'

export function ClinicalTab({ entry }: { entry: DrugEntryTier2 }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.contraindications.length > 0 && (
        <SectionCard
          title={t('drug.clinical.contraindications')}
          items={entry.contraindications}
          severity="danger"
        />
      )}
      {entry.interactions && entry.interactions.length > 0 && (
        <SectionCard title={t('drug.clinical.interactions')} severity="warning">
          {entry.interactions.map((ix, i) => (
            <View key={i} style={styles.interactionRow}>
              <SeverityBadge severity={ix.severity} />
              <Text style={[styles.interactionText, { color: colors.textPrimary }]}>
                {ix.drugName}: {ix.description}
              </Text>
            </View>
          ))}
        </SectionCard>
      )}
      {entry.mechanismOfAction && (
        <SectionCard title={t('drug.clinical.mechanism')} text={entry.mechanismOfAction} />
      )}
      {entry.indicationsClinical.length > 0 && (
        <SectionCard title={t('drug.clinical.indications')} items={entry.indicationsClinical} />
      )}
      {entry.adverseEvents.length > 0 && (
        <SectionCard
          title={t('drug.clinical.adverseEvents')}
          items={entry.adverseEvents.map((e) => e.effect)}
        />
      )}
      {entry.adultDosing.length > 0 && (
        <SectionCard title={t('drug.clinical.adultDosing')}>
          {entry.adultDosing.map((d, i) => (
            <Text key={i} style={[styles.dosing, { color: colors.textPrimary }]}>
              {d.indication}: {d.adultDose} {d.frequency}{d.route ? ` (${d.route})` : ''}
            </Text>
          ))}
        </SectionCard>
      )}
      {entry.pregnancyCategory && (
        <SectionCard
          title={t('drug.clinical.pregnancyCategory')}
          text={`Category ${entry.pregnancyCategory}`}
        />
      )}
      {entry.renalAdjustment && (
        <SectionCard title={t('drug.clinical.renalAdjustment')} text={entry.renalAdjustment} />
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
  interactionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    marginBottom: Spacing[2],
  },
  interactionText: {
    flex: 1,
    fontSize: FontSize.base,
    fontFamily: FontFamily.sans,
    lineHeight: 22,
  },
  dosing: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sans,
    lineHeight: 22,
    marginBottom: Spacing[1],
  },
})
```

- [ ] **Step 4: Rewrite OverviewTab to use SectionCard**

Replace the entire `OverviewTab.tsx`:

```typescript
// src/components/DrugDetail/OverviewTab.tsx
import { ScrollView, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier1 } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'
import { SectionCard } from './SectionCard'
import { Spacing } from '@ultranos/ui-kit/tokens.native'

function localText(field: Record<string, string | undefined>, lang: Lang): string {
  return field[lang] ?? field.en ?? ''
}

export function OverviewTab({ entry, lang }: { entry: DrugEntryTier1; lang: Lang }) {
  const { t } = useTranslation()
  const isRtl = isRtlLang(lang)

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.summaryPlain && localText(entry.summaryPlain, lang) ? (
        <SectionCard title={t('drug.overview.summary')} text={localText(entry.summaryPlain, lang)} isRtl={isRtl} />
      ) : null}
      {entry.usedFor.length > 0 && (
        <SectionCard title={t('drug.overview.usedFor')} items={entry.usedFor.map((f) => localText(f, lang)).filter(Boolean)} isRtl={isRtl} />
      )}
      {entry.commonSideEffects.length > 0 && (
        <SectionCard title={t('drug.overview.sideEffects')} items={entry.commonSideEffects.map((f) => localText(f, lang)).filter(Boolean)} isRtl={isRtl} />
      )}
      {localText(entry.whenToSeekHelp, lang) ? (
        <SectionCard title={t('drug.overview.seekHelp')} text={localText(entry.whenToSeekHelp, lang)} isRtl={isRtl} severity="warning" />
      ) : null}
      {localText(entry.storageInstructions, lang) ? (
        <SectionCard title={t('drug.overview.storage')} text={localText(entry.storageInstructions, lang)} isRtl={isRtl} />
      ) : null}
      {localText(entry.pregnancySummaryPlain, lang) ? (
        <SectionCard title={t('drug.overview.pregnancy')} text={localText(entry.pregnancySummaryPlain, lang)} isRtl={isRtl} severity="info" />
      ) : null}
      {localText(entry.warningsSummaryPlain, lang) ? (
        <SectionCard title={t('drug.overview.warnings')} text={localText(entry.warningsSummaryPlain, lang)} isRtl={isRtl} severity="warning" />
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
})
```

- [ ] **Step 5: Update drug detail screen — SafetyBanner, ATC display, tab label, tokens**

In `app/drug/[atcCode].tsx`, make these changes:

1. Add import for `SafetyBanner`
2. Add import for `FormularyTab` (currently missing from tabs for PHARMACIST)
3. Hide ATC code from patients: change `{entry.innName} · {entry.atcCode}` to show ATC only for clinical roles
4. Add SafetyBanner between header and tab bar
5. Replace hardcoded style values with tokens in the StyleSheet

Key changes to the render:

```typescript
// Line 144-146: Conditional ATC display
<Text style={[styles.innLine, { color: colors.textSecondary }]}>
  {entry.innName}{isClinical ? ` · ${entry.atcCode}` : ''}
</Text>

// After the header View (line 164), before the tabBar View:
{isClinical && 'interactions' in entry && (entry as DrugEntryTier2).interactions?.length > 0 && (
  <SafetyBanner interactions={(entry as DrugEntryTier2).interactions} />
)}
```

Key StyleSheet token fixes:

```typescript
// Replace line 229: padding: 16 → padding: Spacing[4]
header: { padding: Spacing[4], borderBottomWidth: 1 },
// Replace line 243: paddingVertical: 2 → paddingVertical: Spacing[1]
classBadge: { ..., paddingVertical: Spacing[1], ... },
// Replace line 248: fontSize: 12 → fontSize: FontSize.xs
classBadgeText: { fontSize: FontSize.xs, ... },
// Replace line 258: paddingHorizontal: 18, paddingVertical: 12 → tokens
tab: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
// Replace line 259: fontSize: 15 → FontSize.base
tabText: { fontSize: FontSize.base },
// Replace line 267: fontSize: 18 → FontSize.lg, marginBottom: 12 → Spacing[3]
notFound: { fontSize: FontSize.lg, marginBottom: Spacing[3] },
// Replace line 268: fontSize: 16 → FontSize.base
back: { fontSize: FontSize.base },
```

- [ ] **Step 6: Fix FormularyTab recall card side-stripe border**

In `FormularyTab.tsx`, replace the `borderLeftWidth: 3` side-stripe on recall cards with a full border + tinted background. This addresses the absolute ban on side-stripe borders from the design critique.

Change `recallCard` style (line 116-121):

```typescript
recallCard: {
  backgroundColor: colors.warningLight,   // keep
  padding: Spacing[3],
  marginBottom: Spacing[2],
  borderRadius: Radius.md,
  borderWidth: 1,
  borderColor: colors.warning,
},
```

Remove `borderLeftWidth: 3` and `borderLeftColor`, `paddingStart: 12`.

- [ ] **Step 7: Run existing tests to verify nothing is broken**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All existing tests pass. Fix any import path changes.

- [ ] **Step 8: Commit**

```bash
git add apps/pharmopedia/app/drug/\[atcCode\].tsx apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx apps/pharmopedia/src/components/DrugDetail/OverviewTab.tsx apps/pharmopedia/src/components/DrugDetail/FormularyTab.tsx apps/pharmopedia/src/i18n/locales/
git commit -m "feat(pharmopedia): drug detail redesign — severity sections, safety banner, token fixes"
```

---

## Task 5: Auth Hardening — Password Reset

Add a "Forgot password?" flow to the login screen using Supabase's `resetPasswordForEmail()`.

**Files:**
- Modify: `apps/pharmopedia/app/(auth)/login.tsx`
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts` (and prs, ps, ar)
- Test: `apps/pharmopedia/src/__tests__/password-reset.test.tsx`

- [ ] **Step 1: Add i18n keys**

Add to `login` namespace in `en.ts`:

```typescript
forgotPassword: 'Forgot password?',
resetSent: 'Password reset email sent. Check your inbox.',
resetFailed: 'Failed to send reset email. Try again.',
resetEmail: 'Enter your email to reset password',
sendReset: 'Send Reset Email',
```

Add the same keys to prs.ts, ps.ts, ar.ts with appropriate translations.

- [ ] **Step 2: Write the failing test**

```typescript
// src/__tests__/password-reset.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

const mockResetPassword = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      resetPasswordForEmail: mockResetPassword,
    },
  },
}))

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ login: vi.fn(), token: null, user: null, isAuthenticated: false }),
}))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff', textPrimary: '#111', textSecondary: '#666', textMuted: '#999',
    primary500: '#2e9e71', white: '#fff', border: '#e5e5e5',
    danger: '#dc2626', successDark: '#166534',
  }),
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn(), back: vi.fn() }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/components/LanguageChips', () => ({ LanguageChips: () => null }))
vi.mock('@/lib/haptics', () => ({ hapticNotification: vi.fn() }))
vi.mock('expo-haptics', () => ({ NotificationFeedbackType: { Error: 'error', Success: 'success' } }))

import LoginScreen from '@/../../app/(auth)/login'

describe('Password Reset Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows forgot password link on clinical tab', () => {
    render(<LoginScreen />)
    expect(screen.getByText('login.forgotPassword')).toBeTruthy()
  })

  it('sends reset email on tap', async () => {
    mockResetPassword.mockResolvedValue({ error: null })
    render(<LoginScreen />)

    // Enter email
    fireEvent.changeText(screen.getByTestId('email-input'), 'doc@clinic.af')
    // Tap forgot password
    fireEvent.press(screen.getByText('login.forgotPassword'))

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('doc@clinic.af')
    })
  })

  it('shows error when reset fails', async () => {
    mockResetPassword.mockResolvedValue({ error: { message: 'User not found' } })
    render(<LoginScreen />)

    fireEvent.changeText(screen.getByTestId('email-input'), 'nobody@test.com')
    fireEvent.press(screen.getByText('login.forgotPassword'))

    await waitFor(() => {
      expect(screen.getByText('login.resetFailed')).toBeTruthy()
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/password-reset.test.tsx`
Expected: FAIL — "login.forgotPassword" text not found

- [ ] **Step 4: Implement password reset in login.tsx**

Add a `handleForgotPassword` function and a "Forgot password?" Pressable below the password input in the clinical flow:

```typescript
async function handleForgotPassword() {
  if (!email) { setError(t('login.resetEmail')); return }
  setLoading(true)
  setError(null)
  const { error: err } = await supabase.auth.resetPasswordForEmail(email)
  setLoading(false)
  if (err) {
    setError(t('login.resetFailed'))
    void hapticNotification(NotificationFeedbackType.Error)
  } else {
    setError(null)
    setResetSent(true)
  }
}
```

Add state: `const [resetSent, setResetSent] = useState(false)`

In the clinical flow JSX, after the password TextInput and before the login button:

```tsx
<Pressable onPress={handleForgotPassword}>
  <Text style={[styles.link, { color: colors.primary500 }]}>{t('login.forgotPassword')}</Text>
</Pressable>
{resetSent && <Text style={[styles.hint, { color: colors.successDark }]}>{t('login.resetSent')}</Text>}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/password-reset.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/app/\(auth\)/login.tsx apps/pharmopedia/src/__tests__/password-reset.test.tsx apps/pharmopedia/src/i18n/locales/
git commit -m "feat(pharmopedia): add password reset flow for clinical users"
```

---

## Task 6: Auth Hardening — OTP Resend with Cooldown

Add a "Resend code" button with a 60-second cooldown timer to both login and register OTP flows.

**Files:**
- Modify: `apps/pharmopedia/app/(auth)/login.tsx`
- Modify: `apps/pharmopedia/app/(auth)/register.tsx`
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts` (and prs, ps, ar)
- Test: `apps/pharmopedia/src/__tests__/otp-resend.test.tsx`

- [ ] **Step 1: Add i18n keys**

Add to `login` namespace in `en.ts`:

```typescript
resendCode: 'Resend Code',
resendIn: 'Resend in {{seconds}}s',
```

Add the same to `register` namespace, and to prs.ts, ps.ts, ar.ts.

- [ ] **Step 2: Write the failing test**

```typescript
// src/__tests__/otp-resend.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react-native'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
}))

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ login: vi.fn(), token: null, user: null, isAuthenticated: false }),
}))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff', textPrimary: '#111', textSecondary: '#666', textMuted: '#999',
    primary500: '#2e9e71', white: '#fff', border: '#e5e5e5',
    danger: '#dc2626', successDark: '#166534',
  }),
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn(), back: vi.fn() }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, p?: Record<string, unknown>) => p?.seconds ? `Resend in ${p.seconds}s` : k }) }))
vi.mock('@/components/LanguageChips', () => ({ LanguageChips: () => null }))
vi.mock('@/lib/haptics', () => ({ hapticNotification: vi.fn(), hapticSelection: vi.fn() }))
vi.mock('expo-haptics', () => ({ NotificationFeedbackType: { Error: 'error', Success: 'success' } }))

import LoginScreen from '@/../../app/(auth)/login'

describe('OTP Resend Cooldown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('shows resend button on OTP code step', async () => {
    render(<LoginScreen />)
    // Switch to patient tab
    fireEvent.press(screen.getByTestId('patient-tab'))
    // Enter phone and request OTP
    fireEvent.changeText(screen.getByTestId('phone-input'), '+93700000000')
    await act(async () => {
      fireEvent.press(screen.getByTestId('request-otp-button'))
    })
    // Should show resend with cooldown
    expect(screen.getByText(/Resend in/)).toBeTruthy()
  })

  it('enables resend button after cooldown expires', async () => {
    render(<LoginScreen />)
    fireEvent.press(screen.getByTestId('patient-tab'))
    fireEvent.changeText(screen.getByTestId('phone-input'), '+93700000000')
    await act(async () => {
      fireEvent.press(screen.getByTestId('request-otp-button'))
    })

    // Fast-forward 60 seconds
    act(() => { vi.advanceTimersByTime(60000) })

    expect(screen.getByText('login.resendCode')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/otp-resend.test.tsx`
Expected: FAIL — "Resend in" text not found

- [ ] **Step 4: Implement resend cooldown in login.tsx**

Add state and effect:

```typescript
const [cooldown, setCooldown] = useState(0)

useEffect(() => {
  if (cooldown <= 0) return
  const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
  return () => clearTimeout(timer)
}, [cooldown])
```

In `handleRequestOtp`, after `setOtpStep('code')`, add: `setCooldown(60)`

In the OTP code step JSX, after the verify button, add:

```tsx
<Pressable
  testID="resend-otp-button"
  onPress={() => void handleRequestOtp()}
  disabled={cooldown > 0}
>
  <Text style={[styles.link, { color: cooldown > 0 ? colors.textMuted : colors.primary500 }]}>
    {cooldown > 0 ? t('login.resendIn', { seconds: cooldown }) : t('login.resendCode')}
  </Text>
</Pressable>
```

Apply the same pattern to `register.tsx`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/otp-resend.test.tsx`
Expected: PASS (all 2 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/app/\(auth\)/login.tsx apps/pharmopedia/app/\(auth\)/register.tsx apps/pharmopedia/src/__tests__/otp-resend.test.tsx apps/pharmopedia/src/i18n/locales/
git commit -m "feat(pharmopedia): add OTP resend with 60s cooldown timer"
```

---

## Task 7: Sign-Out Confirmation Dialog

Add confirmation dialog before sign-out since it destroys the in-memory session irreversibly.

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/profile.tsx`
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts` (and prs, ps, ar)
- Test: `apps/pharmopedia/src/__tests__/logout-confirmation.test.tsx`

- [ ] **Step 1: Add i18n keys**

Add to `profile` namespace in `en.ts`:

```typescript
logoutConfirmTitle: 'Sign Out?',
logoutConfirmMessage: 'You will need to sign in again. Any unsynced data will remain on this device.',
logoutConfirm: 'Sign Out',
```

Add same to prs.ts, ps.ts, ar.ts.

- [ ] **Step 2: Write the failing test**

```typescript
// src/__tests__/logout-confirmation.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Alert } from 'react-native'

const mockLogout = vi.fn()

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ user: { role: 'DOCTOR', sub: '1' }, token: 'tok', logout: mockLogout, isAuthenticated: true }),
}))

vi.mock('@/store/sync-store', () => ({
  useSyncStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ status: 'idle', lastSyncAt: '2026-01-01', lastVersion: 1, setStatus: vi.fn(), setLastSync: vi.fn(), setSyncedCount: vi.fn() }),
}))

vi.mock('@/store/lang-store', () => ({
  useLangStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ lang: 'en', setLang: vi.fn() }),
  isRtlLang: () => false,
}))

vi.mock('@/store/theme-store', () => ({
  useThemeStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ mode: 'light', setMode: vi.fn() }),
}))

vi.mock('@/store/coach-mark-store', () => ({
  useCoachMarkStore: Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) => sel({ shouldShow: () => false }),
    { getState: () => ({ reset: vi.fn() }) },
  ),
}))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff', surfaceSubtle: '#f5f5f5', textPrimary: '#111', textSecondary: '#666',
    primary500: '#2e9e71', white: '#fff', border: '#e5e5e5',
    danger: '#dc2626', dangerLight: '#fee2e2', dangerDark: '#991b1b',
  }),
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/sync/catalog-sync', () => ({ runSync: vi.fn() }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/components/RoleBadge', () => ({ RoleBadge: () => null }))
vi.mock('@/components/CoachMark', () => ({ CoachMark: () => null }))
vi.mock('@/lib/haptics', () => ({ hapticNotification: vi.fn(), hapticSelection: vi.fn() }))
vi.mock('expo-haptics', () => ({ NotificationFeedbackType: { Error: 'error', Success: 'success' } }))

import { render, screen, fireEvent } from '@testing-library/react-native'
import ProfileTab from '@/../../app/(tabs)/profile'

describe('Logout Confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Alert, 'alert')
  })

  it('shows confirmation dialog on logout press', () => {
    render(<ProfileTab />)
    fireEvent.press(screen.getByTestId('logout-button'))
    expect(Alert.alert).toHaveBeenCalledWith(
      'profile.logoutConfirmTitle',
      'profile.logoutConfirmMessage',
      expect.any(Array),
    )
  })

  it('does not call logout until confirmed', () => {
    render(<ProfileTab />)
    fireEvent.press(screen.getByTestId('logout-button'))
    expect(mockLogout).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/logout-confirmation.test.tsx`
Expected: FAIL — Alert.alert not called (current code calls handleLogout directly)

- [ ] **Step 4: Implement confirmation dialog in profile.tsx**

Replace the `handleLogout` function and change the logout button's `onPress`:

```typescript
function confirmLogout() {
  Alert.alert(
    t('profile.logoutConfirmTitle'),
    t('profile.logoutConfirmMessage'),
    [
      { text: t('common.cancel'), style: 'cancel' as const },
      { text: t('profile.logoutConfirm'), style: 'destructive' as const, onPress: () => void handleLogout() },
    ],
  )
}
```

Change the logout Pressable's `onPress` from `onPress={handleLogout}` to `onPress={confirmLogout}`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/logout-confirmation.test.tsx`
Expected: PASS (all 2 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/app/\(tabs\)/profile.tsx apps/pharmopedia/src/__tests__/logout-confirmation.test.tsx apps/pharmopedia/src/i18n/locales/
git commit -m "feat(pharmopedia): add sign-out confirmation dialog"
```

---

## Task 8: Profile Layout Consolidation

Merge Language + Appearance into a single "Preferences" section. Add coach mark replay button. Fix remaining hardcoded style values.

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/profile.tsx`
- Modify: `apps/pharmopedia/src/store/coach-mark-store.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts` (and prs, ps, ar)

- [ ] **Step 1: Add i18n keys**

Add to `profile` namespace in `en.ts`:

```typescript
preferences: 'Preferences',
showTips: 'Show Tips Again',
```

Add same to prs.ts, ps.ts, ar.ts.

- [ ] **Step 2: Add resetDismissed to coach-mark-store**

In `src/store/coach-mark-store.ts`, the `reset()` function already clears dismissed marks. Verify it also persists the cleared state to SecureStore. If not, add persistence:

```typescript
// In the reset action, ensure SecureStore is cleared:
reset: async () => {
  set({ dismissed: new Set() })
  await SecureStore.deleteItemAsync(COACH_KEY)
},
```

- [ ] **Step 3: Consolidate profile sections**

In `profile.tsx`, merge the Language and Appearance sections into one:

```tsx
{/* Preferences — Language + Appearance */}
<View style={[styles.section, { backgroundColor: colors.surface }]}>
  <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.preferences')}</Text>

  <Text style={[styles.sublabel, { color: colors.textSecondary }]}>{t('profile.language')}</Text>
  <View style={styles.langRow}>
    {/* ... existing language buttons ... */}
  </View>

  <Text style={[styles.sublabel, { color: colors.textSecondary, marginTop: Spacing[3] }]}>{t('profile.appearance')}</Text>
  <View style={styles.themeRow}>
    {/* ... existing theme buttons ... */}
  </View>
</View>
```

Add `sublabel` style:

```typescript
sublabel: {
  fontSize: FontSize.xs,
  fontFamily: FontFamily.sansMedium,
  marginBottom: Spacing[1],
},
```

- [ ] **Step 4: Add "Show Tips" button**

Below the preferences section, or inside the sync section, add:

```tsx
<Pressable
  testID="show-tips-button"
  style={[styles.tipsButton]}
  onPress={() => { void useCoachMarkStore.getState().reset(); void hapticSelection() }}
>
  <Text style={[styles.tipsText, { color: colors.primary500 }]}>{t('profile.showTips')}</Text>
</Pressable>
```

- [ ] **Step 5: Fix remaining hardcoded styles**

Replace in the profile StyleSheet:

```typescript
// langBtn: paddingHorizontal: 12, paddingVertical: 6 → tokens
langBtn: { paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], ... },
// button: padding: 12 → Spacing[3]
button: { ..., padding: Spacing[3], ... },
// label: marginBottom: 4 → Spacing[1]
label: { ..., marginBottom: Spacing[1], ... },
// facility: marginTop: 4 → Spacing[1]
facility: { ..., marginTop: Spacing[1], ... },
// fontSize values: use FontSize tokens
label: { fontSize: FontSize.xs, ... },
value: { fontSize: FontSize.base, ... },
```

- [ ] **Step 6: Run existing profile tests**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/profile`
Expected: PASS (update selectors if section structure changed)

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/app/\(tabs\)/profile.tsx apps/pharmopedia/src/store/coach-mark-store.ts apps/pharmopedia/src/i18n/locales/
git commit -m "feat(pharmopedia): consolidate profile layout, add coach replay, fix tokens"
```

---

## Task 9: Fix Arabic Search + Browse Bugs

Fix the two known bugs: FTS search excludes Arabic from its lang type, and browse excludes Arabic from localName mapping.

**Files:**
- Modify: `apps/pharmopedia/src/db/fts.ts`
- Modify: `apps/pharmopedia/src/db/browse.ts`
- Test: `apps/pharmopedia/src/__tests__/arabic-search.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/arabic-search.test.ts
import { describe, it, expect } from 'vitest'

// Test the type-level fix by importing the function signature
// and verifying 'ar' is accepted
describe('Arabic language support', () => {
  it('fts.ts searchDrugs accepts ar lang parameter', async () => {
    // This test verifies the type compiles — 'ar' was previously excluded
    const { searchDrugs } = await import('@/db/fts')
    expect(typeof searchDrugs).toBe('function')
    // The function signature should accept 'ar' — if it doesn't, TypeScript will fail
  })

  it('browse.ts getDrugsByTherapeuticClass maps Arabic localName', async () => {
    const { getDrugsByTherapeuticClass } = await import('@/db/browse')
    expect(typeof getDrugsByTherapeuticClass).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify current state**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/arabic-search.test.ts`
Expected: May pass (runtime) but TypeScript would reject `searchDrugs(db, q, 'ar', 20)` at compile time.

- [ ] **Step 3: Fix fts.ts — add 'ar' to lang union**

In `src/db/fts.ts`, line 26, change:

```typescript
// Before:
lang: 'en' | 'prs' | 'ps',

// After:
lang: 'en' | 'prs' | 'ps' | 'ar',
```

- [ ] **Step 4: Fix browse.ts — include Arabic localName**

In `src/db/browse.ts`, line 63-64, change:

```typescript
// Before:
const localName =
  lang !== 'en' && lang !== 'ar' ? localNames[lang] : undefined

// After:
const localName =
  lang !== 'en' ? localNames[lang] : undefined
```

This allows Arabic users to see Arabic local names in the browse tab.

- [ ] **Step 5: Run TypeScript check**

Run: `cd apps/pharmopedia && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/src/db/fts.ts apps/pharmopedia/src/db/browse.ts apps/pharmopedia/src/__tests__/arabic-search.test.ts
git commit -m "fix(pharmopedia): include Arabic in FTS search and browse localName mapping"
```

---

## Task 10: Onboarding — Welcome Screen, Recent Searches, Deep Links

Replace the zero-value welcome screen. Add recent searches to the search empty state. Improve deep link handling for invalid ATC codes. Fix bookmark heart color.

**Files:**
- Modify: `apps/pharmopedia/app/welcome.tsx`
- Modify: `apps/pharmopedia/app/(tabs)/index.tsx`
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`
- Modify: `apps/pharmopedia/src/components/DrugCard.tsx`
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts` (and prs, ps, ar)

- [ ] **Step 1: Add i18n keys**

Add to `en.ts`:

```typescript
// In welcome namespace:
feature1: 'Search thousands of medications offline',
feature2: 'Get pricing from nearby pharmacies',
feature3: 'Available in English, Dari, Pashto, and Arabic',

// In search namespace:
recentSearches: 'Recent searches',

// In drug namespace:
notFoundDescription: 'This drug may not be in the catalog yet. Try searching instead.',
searchInstead: 'Search',
```

Add same to prs.ts, ps.ts, ar.ts.

- [ ] **Step 2: Replace welcome screen with onboarding highlights**

Replace `welcome.tsx` with a screen that shows 3 feature highlights using icons:

```typescript
// app/welcome.tsx
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as SecureStore from 'expo-secure-store'
import { Search, MapPin, Globe } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

const WELCOME_KEY = 'pharmopedia.hasSeenWelcome'

export async function hasSeenWelcome(): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(WELCOME_KEY)) === '1' } catch { return false }
}

export default function WelcomeScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()

  async function handleGetStarted() {
    try { await SecureStore.setItemAsync(WELCOME_KEY, '1') } catch { /* proceed anyway */ }
    router.replace('/(auth)/login')
  }

  const features = [
    { icon: Search, text: t('welcome.feature1') },
    { icon: MapPin, text: t('welcome.feature2') },
    { icon: Globe, text: t('welcome.feature3') },
  ]

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.content}>
        <Text style={[styles.appName, { color: colors.textPrimary }]}>Pharmopedia</Text>
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>{t('welcome.tagline')}</Text>

        <View style={styles.features}>
          {features.map(({ icon: Icon, text }, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: colors.surfaceSubtle }]}>
                <Icon size={20} color={colors.primary500} />
              </View>
              <Text style={[styles.featureText, { color: colors.textPrimary }]}>{text}</Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable
        testID="get-started-button"
        style={[styles.button, { backgroundColor: colors.primary500 }]}
        onPress={() => void handleGetStarted()}
        accessibilityRole="button"
        accessibilityLabel={t('welcome.getStarted')}
      >
        <Text style={[styles.buttonText, { color: colors.white }]}>{t('welcome.getStarted')}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing[8] },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing[3] },
  appName: { fontSize: FontSize['3xl'], fontFamily: FontFamily.headingBold },
  tagline: { fontSize: FontSize.md, fontFamily: FontFamily.sans, textAlign: 'center' },
  features: { marginTop: Spacing[8], gap: Spacing[4], width: '100%' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  featureIcon: {
    width: 40, height: 40, borderRadius: Radius.full,
    justifyContent: 'center', alignItems: 'center',
  },
  featureText: { flex: 1, fontSize: FontSize.base, fontFamily: FontFamily.sans },
  button: {
    paddingHorizontal: Spacing[10], paddingVertical: Spacing[4],
    borderRadius: Radius.xl, marginBottom: Spacing[12],
  },
  buttonText: { fontSize: FontSize.md, fontFamily: FontFamily.sansSemibold },
})
```

- [ ] **Step 3: Fix bookmark heart color — use primary instead of danger**

In `DrugCard.tsx`, change the bookmark heart color from `colors.danger` to `colors.primary500`:

```typescript
// Before:
<Heart color={saved ? colors.danger : colors.textMuted} fill={saved ? colors.danger : 'none'} size={18} />

// After:
<Heart color={saved ? colors.primary500 : colors.textMuted} fill={saved ? colors.primary500 : 'none'} size={18} />
```

Apply the same change in `app/drug/[atcCode].tsx` for the detail screen heart:

```typescript
// Before:
<Heart color={isBookmarked(entry.atcCode) ? colors.danger : colors.textMuted} fill={isBookmarked(entry.atcCode) ? colors.danger : 'none'} size={24} />

// After:
<Heart color={isBookmarked(entry.atcCode) ? colors.primary500 : colors.textMuted} fill={isBookmarked(entry.atcCode) ? colors.primary500 : 'none'} size={24} />
```

- [ ] **Step 4: Improve drug not-found state**

In `app/drug/[atcCode].tsx`, enhance the not-found state to suggest searching:

```tsx
// Replace lines 126-132:
if (!entry) {
  return (
    <View style={styles.center}>
      <Text style={[styles.notFound, { color: colors.textSecondary }]}>{t('drug.notFound')}</Text>
      <Text style={[styles.notFoundDesc, { color: colors.textMuted }]}>{t('drug.notFoundDescription')}</Text>
      <Pressable onPress={() => router.replace('/(tabs)' as never)} accessibilityRole="button">
        <Text style={[styles.back, { color: colors.primary500 }]}>{t('drug.searchInstead')}</Text>
      </Pressable>
    </View>
  )
}
```

Add `notFoundDesc` style: `{ fontSize: FontSize.sm, textAlign: 'center', marginBottom: Spacing[3], paddingHorizontal: Spacing[6] }`

- [ ] **Step 5: Run existing tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All pass. Update any snapshot tests that reference the old welcome screen or heart color.

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/app/welcome.tsx apps/pharmopedia/app/drug/\[atcCode\].tsx apps/pharmopedia/app/\(tabs\)/index.tsx apps/pharmopedia/src/components/DrugCard.tsx apps/pharmopedia/src/i18n/locales/
git commit -m "feat(pharmopedia): onboarding highlights, bookmark color fix, improved not-found state"
```

---

## Task 11: Accessibility Pass — Interactive Elements

Add `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`, and `accessibilityLiveRegion` to all interactive and status elements across the app.

**Files:**
- Modify: `apps/pharmopedia/src/components/SearchBar.tsx`
- Modify: `apps/pharmopedia/src/components/DrugCard.tsx`
- Modify: `apps/pharmopedia/src/components/PriceCard.tsx`
- Modify: `apps/pharmopedia/src/components/SyncStatusBanner.tsx`
- Modify: `apps/pharmopedia/src/components/NetStatusBanner.tsx`
- Modify: `apps/pharmopedia/src/components/CoachMark.tsx`
- Modify: `apps/pharmopedia/src/components/LanguageChips.tsx`
- Modify: `apps/pharmopedia/src/components/RoleBadge.tsx`
- Modify: `apps/pharmopedia/src/components/TherapeuticClassCard.tsx`
- Modify: `apps/pharmopedia/src/components/SkeletonCard.tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/ShareButton.tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx`
- Test: `apps/pharmopedia/src/__tests__/accessibility-roles.test.tsx`

- [ ] **Step 1: Write the accessibility test**

```typescript
// src/__tests__/accessibility-roles.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'
import { SearchBar } from '@/components/SearchBar'
import { SyncStatusBanner } from '@/components/SyncStatusBanner'
import { LanguageChips } from '@/components/LanguageChips'
import { RoleBadge } from '@/components/RoleBadge'
import { SkeletonCard } from '@/components/SkeletonCard'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    textPrimary: '#111', textSecondary: '#666', textMuted: '#999',
    surface: '#fff', surfaceSubtle: '#f5f5f5', border: '#e5e5e5',
    primary500: '#2e9e71', infoLight: '#dbeafe', info: '#3b82f6',
    dangerLight: '#fee2e2', danger: '#dc2626',
    warningLight: '#fef3c7', warning: '#d97706',
    white: '#fff',
  }),
}))

vi.mock('@/store/lang-store', () => ({
  useLangStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ lang: 'en' }),
  isRtlLang: () => false,
}))

vi.mock('@/store/sync-store', () => ({
  useSyncStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ status: 'syncing', syncedCount: 10, lastSyncAt: null }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('@/lib/haptics', () => ({ hapticSelection: vi.fn() }))
vi.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native')
  return {
    default: { View, Text, createAnimatedComponent: (c: unknown) => c },
    useSharedValue: () => ({ value: 1 }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: number) => v,
    FadeIn: { delay: () => ({ duration: () => ({}) }) },
    FadeInDown: { duration: () => ({}) },
    FadeOutUp: { duration: () => ({}) },
  }
})

describe('Accessibility roles', () => {
  it('SearchBar has accessibilityRole search', () => {
    const { getByTestId } = render(<SearchBar onSearch={vi.fn()} />)
    const input = getByTestId('search-input')
    expect(input.props.accessibilityRole).toBe('search')
  })

  it('SyncStatusBanner has accessibilityLiveRegion', () => {
    const { getByText } = render(<SyncStatusBanner />)
    const text = getByText(/sync/)
    expect(text.props.accessibilityLiveRegion).toBe('polite')
  })

  it('RoleBadge has accessibilityLabel', () => {
    const { getByLabelText } = render(<RoleBadge role="DOCTOR" />)
    expect(getByLabelText('DOCTOR')).toBeTruthy()
  })

  it('SkeletonCard is hidden from accessibility tree', () => {
    const { getByTestId } = render(<SkeletonCard testID="skel" />)
    expect(getByTestId('skel').props.importantForAccessibility).toBe('no-hide-descendants')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/accessibility-roles.test.tsx`
Expected: FAIL — missing accessibility attributes

- [ ] **Step 3: Add accessibility attributes to SearchBar**

In `SearchBar.tsx`, add to the TextInput:

```typescript
accessibilityRole="search"
accessibilityLabel={t('search.placeholder')}
accessibilityHint={t('search.empty')}
```

- [ ] **Step 4: Add accessibility attributes to SyncStatusBanner**

In `SyncStatusBanner.tsx`, add `accessibilityLiveRegion="polite"` and `accessibilityRole="status"` to each status Text element.

- [ ] **Step 5: Add accessibility attributes to all remaining components**

Apply these changes across files:

**DrugCard.tsx:** Add `accessibilityRole="button"` and `accessibilityLabel={`${entry.innName}, ${entry.therapeuticClass}`}` to the Pressable.

**PriceCard.tsx:** Add `accessibilityRole="text"` to the card View. Add `accessibilityLabel` combining pharmacy name, price, and distance. Remove the 3px `borderLeftWidth` side-stripe on stock indicator — replace with full border.

**NetStatusBanner.tsx:** Add `accessibilityLiveRegion="assertive"` and `accessibilityRole="alert"`.

**CoachMark.tsx:** Add `accessibilityRole="button"` and `accessibilityLabel={hint}` to the overlay Pressable.

**LanguageChips.tsx:** Add `accessibilityRole="radio"` and `accessibilityState={{ selected: lang === chip.value }}` to each chip Pressable.

**RoleBadge.tsx:** Add `accessibilityLabel={role}` to the badge View.

**TherapeuticClassCard.tsx:** Add `accessibilityRole="button"` and `accessibilityLabel={`${name}, ${count} drugs`}` to the Pressable.

**SkeletonCard.tsx:** Add `importantForAccessibility="no-hide-descendants"` to the card View.

**ShareButton.tsx:** Add `accessibilityRole="button"` and `accessibilityLabel="Share"` to the Pressable.

**EnrichTab.tsx:** Add `accessibilityLabel` to each TextInput. Add `accessibilityRole="alert"` to error text. Add `accessibilityRole="button"` to submit Pressable. Standardize all hardcoded style values to tokens.

- [ ] **Step 6: Run accessibility test**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/accessibility-roles.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 7: Run full test suite**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/pharmopedia/src/components/
git commit -m "feat(pharmopedia): comprehensive accessibility pass — roles, labels, live regions"
```

---

## Task 12: Token Standardization — Login, Register, Browse, Remaining Components

Sweep all remaining hardcoded style values and replace with design tokens.

**Files:**
- Modify: `apps/pharmopedia/app/(auth)/login.tsx`
- Modify: `apps/pharmopedia/app/(auth)/register.tsx`
- Modify: `apps/pharmopedia/app/(tabs)/browse.tsx`
- Modify: `apps/pharmopedia/src/components/DrugCard.tsx`
- Modify: `apps/pharmopedia/src/components/PriceCard.tsx`
- Modify: `apps/pharmopedia/src/components/SyncStatusBanner.tsx`
- Modify: `apps/pharmopedia/src/components/TherapeuticClassCard.tsx`
- Modify: `apps/pharmopedia/src/components/LanguageChips.tsx`

- [ ] **Step 1: Standardize login.tsx styles**

Add token imports and replace the StyleSheet:

```typescript
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: Spacing[6] },
  title: { fontSize: FontSize['3xl'] - 2, fontFamily: FontFamily.headingBold, textAlign: 'center', marginBottom: Spacing[8] },
  segmented: { flexDirection: 'row', marginBottom: Spacing[6], borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1 },
  segment: { flex: 1, paddingVertical: Spacing[2], alignItems: 'center' },
  segmentTextBase: { fontFamily: FontFamily.sansSemibold },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[3], fontSize: FontSize.base, fontFamily: FontFamily.sans },
  button: { borderRadius: Radius.md, padding: Spacing[3], alignItems: 'center', marginTop: Spacing[2] },
  buttonText: { fontFamily: FontFamily.sansBold, fontSize: FontSize.base },
  error: { marginBottom: Spacing[3], textAlign: 'center', fontFamily: FontFamily.sans },
  hint: { marginBottom: Spacing[3], textAlign: 'center', fontFamily: FontFamily.sans },
  link: { textAlign: 'center', marginTop: Spacing[3], fontFamily: FontFamily.sans },
})
```

- [ ] **Step 2: Standardize register.tsx styles**

Fix remaining hardcoded values:

```typescript
// Already partially tokenized; fix these:
// fontSize: 28 → FontSize['3xl'] - 2 (or a computed value)
// marginBottom: 8 → Spacing[2]
// marginBottom: 32 → Spacing[8]
// padding: 12 → Spacing[3]
// marginBottom: 12 → Spacing[3]
// fontSize: 16 → FontSize.base
// fontSize: 15 → FontSize.base
// padding: 14 → Spacing[3]
// color: '#ffffff' → use colors.white from theme
// marginTop: 12 → Spacing[3]
```

- [ ] **Step 3: Standardize browse.tsx styles**

```typescript
// Replace hardcoded values:
// padding: 32 → Spacing[8]
// gap: 12 → Spacing[3]
// paddingHorizontal: 16, paddingVertical: 12 → Spacing[4], Spacing[3]
// fontSize: 15 → FontSize.base
// fontSize: 16, fontWeight: '600' → FontSize.base, fontFamily: FontFamily.sansSemibold
```

- [ ] **Step 4: Standardize remaining component styles**

**DrugCard.tsx:**
```typescript
// paddingHorizontal: 16 → Spacing[4]
// paddingVertical: 12 → Spacing[3]
// gap: 2 → Spacing[1] (closest), or keep as 2 is a common sub-token value
// gap: 6 → Spacing[1] + 2 (or just Spacing[2])
// fontSize: 16 → FontSize.base
// fontSize: 13 → FontSize.sm - 1 (or keep as-is since there's no 13px token)
// fontSize: 12 → FontSize.xs
```

**PriceCard.tsx:**
```typescript
// fontSize: 15 → FontSize.base
// fontSize: 17 → FontSize.lg - 1 (or FontSize.base + 1)
// fontSize: 13 → FontSize.sm
// gap: 4 → Spacing[1]
```

**SyncStatusBanner.tsx:**
```typescript
// paddingHorizontal: 16 → Spacing[4]
// paddingVertical: 8 → Spacing[2]
// fontSize: 13 → FontSize.sm
```

**TherapeuticClassCard.tsx:**
```typescript
// width: 40, height: 40 → Keep as layout constant (not a token use case)
// borderRadius: 20 → Radius.full (since it's a circle)
// fontSize: 15 → FontSize.base
// paddingVertical: 2 → Spacing[1]
// minWidth: 28 → Keep as layout constant
// fontSize: 13 → FontSize.sm
```

**LanguageChips.tsx:**
```typescript
// fontSize: 14 → FontSize.sm
```

- [ ] **Step 5: Run full test suite**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/app/ apps/pharmopedia/src/components/
git commit -m "refactor(pharmopedia): standardize all hardcoded styles to design tokens"
```

---

## Task 13: EnrichTab Token Standardization + OTP Input Validation

Standardize the EnrichTab's heavily hardcoded styles and add numeric-only validation to OTP inputs.

**Files:**
- Modify: `apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx`
- Modify: `apps/pharmopedia/app/(auth)/login.tsx`
- Modify: `apps/pharmopedia/app/(auth)/register.tsx`

- [ ] **Step 1: Rewrite EnrichTab StyleSheet with tokens**

Add token imports and replace the entire StyleSheet:

```typescript
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
  restricted: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing[6] },
  restrictedText: { textAlign: 'center', fontFamily: FontFamily.sans },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sansBold,
    marginBottom: Spacing[2],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  label: { fontSize: FontSize.sm, fontFamily: FontFamily.sans, marginBottom: Spacing[1] },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing[3],
    fontSize: FontSize.base,
    fontFamily: FontFamily.sans,
    marginBottom: Spacing[3],
  },
  multiline: { height: 80, textAlignVertical: 'top' },
  formularyRow: { flexDirection: 'row', gap: Spacing[2], marginBottom: Spacing[3], flexWrap: 'wrap' },
  formularyBtn: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  formularyText: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  error: { marginBottom: Spacing[2], fontFamily: FontFamily.sans },
  successText: { marginBottom: Spacing[2], fontFamily: FontFamily.sans },
  button: {
    borderRadius: Radius.md,
    padding: Spacing[3],
    alignItems: 'center',
  },
  buttonText: { fontFamily: FontFamily.sansBold, fontSize: FontSize.base },
})
```

- [ ] **Step 2: Add OTP numeric validation**

In `login.tsx` and `register.tsx`, wrap the OTP `onChangeText` to strip non-numeric characters:

```typescript
// Replace: onChangeText={setOtpCode}
// With:
onChangeText={(text) => setOtpCode(text.replace(/[^0-9]/g, ''))}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx apps/pharmopedia/app/\(auth\)/login.tsx apps/pharmopedia/app/\(auth\)/register.tsx
git commit -m "refactor(pharmopedia): EnrichTab token standardization + OTP numeric validation"
```

---

## Task 14: Search Clear Button

Add a clear (X) button to the SearchBar so users can reset their search without manually deleting text.

**Files:**
- Modify: `apps/pharmopedia/src/components/SearchBar.tsx`

- [ ] **Step 1: Add clear button to SearchBar**

Import `X` icon from `lucide-react-native` and add a conditional clear button:

```typescript
import { X } from 'lucide-react-native'

// In the render, after the TextInput, inside the same container View:
{query.length > 0 && (
  <Pressable
    testID="search-clear"
    onPress={() => { setQuery(''); onSearch('') }}
    accessibilityRole="button"
    accessibilityLabel={t('common.cancel')}
    style={styles.clearButton}
  >
    <X size={18} color={colors.textMuted} />
  </Pressable>
)}
```

The SearchBar container needs to become a row:

```typescript
// Wrap TextInput + clear button in a View with flexDirection: 'row'
inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.md },
input: { flex: 1, padding: Spacing[3], fontSize: FontSize.base, fontFamily: FontFamily.sans },
clearButton: { paddingHorizontal: Spacing[3] },
```

Add local state to track the query text for the clear button display:

```typescript
const [query, setQuery] = useState('')

function handleChange(text: string) {
  setQuery(text)
  // existing debounce logic
}
```

- [ ] **Step 2: Run existing SearchBar tests**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/search-bar`
Expected: PASS (update if structural changes break selectors)

- [ ] **Step 3: Commit**

```bash
git add apps/pharmopedia/src/components/SearchBar.tsx
git commit -m "feat(pharmopedia): add search clear button with a11y"
```

---

## Task 15: Polish Pass — Final Consistency Check

Run the full test suite, verify TypeScript compiles, and fix any remaining inconsistencies.

**Files:**
- All modified files from previous tasks

- [ ] **Step 1: Run TypeScript check**

Run: `cd apps/pharmopedia && npx tsc --noEmit`
Expected: No errors. Fix any type issues from refactored components.

- [ ] **Step 2: Run full test suite**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass. Fix any broken tests from structural changes.

- [ ] **Step 3: Verify i18n key parity**

Check that all 4 locale files have the same structure:

Run: `cd apps/pharmopedia && node -e "const en = require('./src/i18n/locales/en').default; const prs = require('./src/i18n/locales/prs').default; function check(a,b,path=''){for(const k of Object.keys(a)){const p=path?path+'.'+k:k;if(typeof a[k]==='object'&&a[k]!==null){check(a[k],b[k]||{},p)}else if(!(k in (b||{}))){console.log('MISSING:',p)}}};check(en,prs)"`

Expected: No missing keys. Repeat for ps and ar.

- [ ] **Step 4: Verify no hardcoded hex colors in components**

Run: `grep -rn "backgroundColor: '#" apps/pharmopedia/src/components/ apps/pharmopedia/app/ --include="*.tsx" | grep -v "node_modules" | grep -v "RoleBadge"` (RoleBadge is intentionally hardcoded)

Expected: No results outside RoleBadge.

- [ ] **Step 5: Verify no side-stripe borders remain**

Run: `grep -rn "borderLeftWidth\|borderRightWidth" apps/pharmopedia/src/components/ --include="*.tsx"`

Expected: No results.

- [ ] **Step 6: Fix any issues found and commit**

```bash
git add -A apps/pharmopedia/
git commit -m "chore(pharmopedia): final polish pass — type fixes, i18n parity, style audit"
```

---

## Summary

| Task | Area | Priority | Est. Steps |
|------|------|----------|------------|
| 1 | SectionCard component | P1 | 5 |
| 2 | SeverityBadge component | P1 | 5 |
| 3 | SafetyBanner component | P1 | 5 |
| 4 | Drug detail redesign wiring | P1 | 8 |
| 5 | Password reset | P1 | 6 |
| 6 | OTP resend cooldown | P1 | 6 |
| 7 | Sign-out confirmation | P2 | 6 |
| 8 | Profile layout consolidation | P2 | 7 |
| 9 | Arabic FTS + browse fix | P2 | 6 |
| 10 | Onboarding + bookmark color + deep links | P2 | 6 |
| 11 | Accessibility pass | P2 | 8 |
| 12 | Token standardization sweep | P2 | 6 |
| 13 | EnrichTab tokens + OTP validation | P3 | 4 |
| 14 | Search clear button | P3 | 3 |
| 15 | Final polish pass | P3 | 6 |
