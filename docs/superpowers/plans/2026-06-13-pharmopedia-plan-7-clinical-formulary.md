# Pharmopedia Plan 7 — Clinical Extensions + Formulary Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the three Tier 2 drug data sections missing from ClinicalTab (interactions, pharmacokinetics, pediatric dosing + admin notes) and add a pharmacist-only FormularyTab showing formulary status, dispensing notes, substitutes, and recall alerts.

**Architecture:** ClinicalTab gets a `lang` prop (needed to resolve `administrationNotes: DrugLocalizedText`) and four new data sections. A new `FormularyTab` component reads Tier 3 fields read-only (distinct from the write-focused `EnrichTab`). The drug detail screen adds `isPharmacist`, a `'formulary'` tab entry, and passes `lang` to `ClinicalTab`.

**Tech Stack:** React Native (Expo 52), react-i18next, Vitest + @testing-library/react-native, TypeScript, `@ultranos/shared-types` DrugEntryTier2/Tier3.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/pharmopedia/src/i18n/locales/en.ts` | Modify | New keys: drug.tabs.formulary, drug.clinical.{interactions,pediatricDosing,adminNotes,pharmacokinetics,halfLife,proteinBinding,volumeDistribution,metabolism,excretion,severity.*}, drug.formulary.* |
| `apps/pharmopedia/src/i18n/locales/prs.ts` | Modify | Same keys (English fallback strings — medical translation needed) |
| `apps/pharmopedia/src/i18n/locales/ps.ts` | Modify | Same keys (English fallback strings — medical translation needed) |
| `apps/pharmopedia/src/i18n/locales/ar.ts` | Modify | Same keys (English fallback strings — medical translation needed) |
| `apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx` | Modify | Add `lang` prop, `localText` helper, interactions with severity badges, pediatricDosing, administrationNotes, pharmacokinetics |
| `apps/pharmopedia/src/components/DrugDetail/FormularyTab.tsx` | Create | Pharmacist-only read-only: formularyStatus badge, dispensingNotes, substitutes[], recallAlerts[] |
| `apps/pharmopedia/src/__tests__/clinical-tab-extended.test.tsx` | Create | Tests for the four new ClinicalTab sections |
| `apps/pharmopedia/src/__tests__/formulary-tab.test.tsx` | Create | Tests for FormularyTab (status badge, notes, substitutes, recalls, empty-recalls) |
| `apps/pharmopedia/app/drug/[atcCode].tsx` | Modify | Add `isPharmacist`, extend Tab type with `'formulary'`, add formulary to TABS array, pass `lang` to ClinicalTab, import+render FormularyTab |

---

## Key Types (read before writing any code)

From `packages/shared-types/src/fhir/drug-catalog.ts`:

```typescript
export interface DrugInteraction {
  drugAtcCode: string
  drugName: string
  severity: 'CONTRAINDICATED' | 'MAJOR' | 'MODERATE' | 'MINOR'
  mechanism: string
}

export interface DrugPharmacokinetics {
  halfLifeHours?: number
  proteinBindingPct?: number
  volumeOfDistribution?: string
  metabolism?: string
  excretion?: string
}

export interface RecallAlert {
  recallId: string
  description: string
  initiationDate: string
  status: string
}

// DrugEntryTier2 has: interactions: DrugInteraction[], pharmacokinetics: DrugPharmacokinetics,
//   pediatricDosing: DrugDosing[], administrationNotes: DrugLocalizedText

// DrugEntryTier3 extends DrugEntryTier2 and adds:
//   formularyStatus?: 'on_formulary' | 'off_formulary' | 'restricted'
//   dispensingNotes?: string
//   substitutes: string[]    ← ATC codes of therapeutic equivalents
//   recallAlerts: RecallAlert[]
//   unitCost?: number
```

---

## Task 1: i18n Additions — Interactions, PK, Formulary Keys

**Files:**
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/prs.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ps.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ar.ts`

The `Translations` type from `en.ts` is enforced across all locale files — you MUST add all new keys to all four files or TypeScript will fail at build time.

- [ ] **Step 1: Add new keys to `en.ts`**

In `drug.tabs`, add `formulary: 'Formulary'`.

In `drug.clinical`, add these seven new keys after `renalAdjustment`:

```typescript
interactions: 'Drug interactions',
pediatricDosing: 'Pediatric dosing',
adminNotes: 'Administration notes',
pharmacokinetics: 'Pharmacokinetics',
halfLife: 'Half-life',
proteinBinding: 'Protein binding',
volumeDistribution: 'Volume of distribution',
metabolism: 'Metabolism',
excretion: 'Excretion',
severity: {
  CONTRAINDICATED: 'Contraindicated',
  MAJOR: 'Major',
  MODERATE: 'Moderate',
  MINOR: 'Minor',
},
```

After the `drug` block (at the same top level as `pricing`, `enrich`, `browse`, `saved`), add a new `formulary` block:

```typescript
formulary: {
  status: 'Formulary status',
  onFormulary: 'On BPHS formulary',
  offFormulary: 'Off formulary',
  restricted: 'Restricted use',
  dispensingNotes: 'Dispensing notes',
  substitutes: 'Therapeutic substitutes',
  noSubstitutes: 'No substitutes listed',
  recalls: 'Active recall alerts',
  noRecalls: 'No active recall alerts',
},
```

The complete updated `en.ts` `drug` section becomes:

```typescript
drug: {
  notFound: 'Drug not found',
  back: 'Go back',
  tabs: {
    overview: 'Overview',
    clinical: 'Clinical',
    formulary: 'Formulary',
    pricing: 'Pricing',
    enrich: 'Enrich',
  },
  overview: {
    summary: 'Summary',
    usedFor: 'Used for',
    sideEffects: 'Common side effects',
    seekHelp: 'When to seek help',
    storage: 'Storage',
    pregnancy: 'Pregnancy',
    warnings: 'Warnings',
  },
  clinical: {
    mechanism: 'Mechanism of action',
    indications: 'Clinical indications',
    contraindications: 'Contraindications',
    adverseEvents: 'Adverse events',
    adultDosing: 'Adult dosing',
    pregnancyCategory: 'Pregnancy category',
    renalAdjustment: 'Renal adjustment',
    interactions: 'Drug interactions',
    pediatricDosing: 'Pediatric dosing',
    adminNotes: 'Administration notes',
    pharmacokinetics: 'Pharmacokinetics',
    halfLife: 'Half-life',
    proteinBinding: 'Protein binding',
    volumeDistribution: 'Volume of distribution',
    metabolism: 'Metabolism',
    excretion: 'Excretion',
    severity: {
      CONTRAINDICATED: 'Contraindicated',
      MAJOR: 'Major',
      MODERATE: 'Moderate',
      MINOR: 'Minor',
    },
  },
},
```

And add top-level `formulary` block (same level as `pricing`, `enrich`, `browse`, `saved`, `common`):

```typescript
formulary: {
  status: 'Formulary status',
  onFormulary: 'On BPHS formulary',
  offFormulary: 'Off formulary',
  restricted: 'Restricted use',
  dispensingNotes: 'Dispensing notes',
  substitutes: 'Therapeutic substitutes',
  noSubstitutes: 'No substitutes listed',
  recalls: 'Active recall alerts',
  noRecalls: 'No active recall alerts',
},
```

- [ ] **Step 2: Add same keys to `prs.ts`, `ps.ts`, `ar.ts`**

Use English strings for all new keys in non-English locale files. These are functional fallbacks — actual Dari/Pashto/Arabic medical translation is required before production.

In each of `prs.ts`, `ps.ts`, `ar.ts`:

In `drug.tabs`, add: `formulary: 'Formulary'`

In `drug.clinical`, add after `renalAdjustment`:
```typescript
interactions: 'Drug interactions',
pediatricDosing: 'Pediatric dosing',
adminNotes: 'Administration notes',
pharmacokinetics: 'Pharmacokinetics',
halfLife: 'Half-life',
proteinBinding: 'Protein binding',
volumeDistribution: 'Volume of distribution',
metabolism: 'Metabolism',
excretion: 'Excretion',
severity: {
  CONTRAINDICATED: 'Contraindicated',
  MAJOR: 'Major',
  MODERATE: 'Moderate',
  MINOR: 'Minor',
},
```

Add top-level `formulary` block (same English strings as above).

- [ ] **Step 3: Run `pnpm -F pharmopedia test` to confirm TypeScript is happy**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test
```

Expected: all 39 existing tests pass. If TypeScript complains about missing keys, fix them before continuing.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add "apps/pharmopedia/src/i18n/locales/en.ts" "apps/pharmopedia/src/i18n/locales/prs.ts" "apps/pharmopedia/src/i18n/locales/ps.ts" "apps/pharmopedia/src/i18n/locales/ar.ts"
git commit -m "feat(pharmopedia): i18n keys for interactions, PK, and formulary tab"
```

---

## Task 2: ClinicalTab Enhancements — Interactions, PK, Pediatric Dosing, Admin Notes + Tests

**Files:**
- Modify: `apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx`
- Create: `apps/pharmopedia/src/__tests__/clinical-tab-extended.test.tsx`

**Why ClinicalTab needs `lang`:** `administrationNotes: DrugLocalizedText` is `{ en?: string, prs?: string, ps?: string }` — must be resolved to the display language.

- [ ] **Step 1: Write the failing tests**

Create `apps/pharmopedia/src/__tests__/clinical-tab-extended.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { ClinicalTab } from '@/components/DrugDetail/ClinicalTab'
import type { DrugEntryTier2 } from '@ultranos/shared-types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'drug.clinical.mechanism': 'Mechanism of action',
      'drug.clinical.indications': 'Clinical indications',
      'drug.clinical.contraindications': 'Contraindications',
      'drug.clinical.adverseEvents': 'Adverse events',
      'drug.clinical.adultDosing': 'Adult dosing',
      'drug.clinical.pregnancyCategory': 'Pregnancy category',
      'drug.clinical.renalAdjustment': 'Renal adjustment',
      'drug.clinical.interactions': 'Drug interactions',
      'drug.clinical.pediatricDosing': 'Pediatric dosing',
      'drug.clinical.adminNotes': 'Administration notes',
      'drug.clinical.pharmacokinetics': 'Pharmacokinetics',
      'drug.clinical.halfLife': 'Half-life',
      'drug.clinical.proteinBinding': 'Protein binding',
      'drug.clinical.volumeDistribution': 'Volume of distribution',
      'drug.clinical.metabolism': 'Metabolism',
      'drug.clinical.excretion': 'Excretion',
      'drug.clinical.severity.CONTRAINDICATED': 'Contraindicated',
      'drug.clinical.severity.MAJOR': 'Major',
      'drug.clinical.severity.MODERATE': 'Moderate',
      'drug.clinical.severity.MINOR': 'Minor',
    }[key] ?? key),
  }),
}))

vi.mock('@/store/lang-store', () => ({
  isRtlLang: () => false,
}))

// Minimal Tier2 base — all arrays empty, all optionals absent
const BASE: DrugEntryTier2 = {
  atcCode: 'J01CA04',
  innName: 'Amoxicillin',
  brandNames: [],
  doseForms: [],
  therapeuticClass: 'Antibacterials',
  localNames: {},
  summaryPlain: { en: '' },
  usedFor: [],
  commonSideEffects: [],
  whenToSeekHelp: { en: '' },
  storageInstructions: { en: '' },
  pregnancySummaryPlain: { en: '' },
  warningsSummaryPlain: { en: '' },
  version: 1,
  lastUpdated: '2026-06-01T00:00:00Z',
  mechanismOfAction: undefined,
  indicationsClinical: [],
  adultDosing: [],
  pediatricDosing: [],
  renalAdjustment: undefined,
  adverseEvents: [],
  contraindications: [],
  interactions: [],
  pregnancyCategory: undefined,
  administrationNotes: {},
  pharmacokinetics: {},
}

describe('ClinicalTab — interactions section', () => {
  it('renders interaction drug name and severity badge', () => {
    const entry: DrugEntryTier2 = {
      ...BASE,
      interactions: [
        { drugAtcCode: 'J01GB06', drugName: 'Gentamicin', severity: 'MAJOR', mechanism: 'Combined nephrotoxicity' },
      ],
    }
    render(<ClinicalTab entry={entry} lang="en" />)
    expect(screen.getByText('Gentamicin')).toBeTruthy()
    expect(screen.getByText('Major')).toBeTruthy()
    expect(screen.getByText('Combined nephrotoxicity')).toBeTruthy()
  })

  it('renders CONTRAINDICATED severity badge for contraindicated interactions', () => {
    const entry: DrugEntryTier2 = {
      ...BASE,
      interactions: [
        { drugAtcCode: 'B01AC06', drugName: 'Aspirin', severity: 'CONTRAINDICATED', mechanism: 'Increased bleeding risk' },
      ],
    }
    render(<ClinicalTab entry={entry} lang="en" />)
    expect(screen.getByText('Contraindicated')).toBeTruthy()
  })

  it('does not render interactions section when list is empty', () => {
    render(<ClinicalTab entry={{ ...BASE, interactions: [] }} lang="en" />)
    expect(screen.queryByText('Drug interactions')).toBeNull()
  })
})

describe('ClinicalTab — pharmacokinetics section', () => {
  it('renders half-life and protein binding', () => {
    const entry: DrugEntryTier2 = {
      ...BASE,
      pharmacokinetics: { halfLifeHours: 1.3, proteinBindingPct: 17 },
    }
    render(<ClinicalTab entry={entry} lang="en" />)
    expect(screen.getByText('Pharmacokinetics')).toBeTruthy()
    expect(screen.getByText(/1\.3/)).toBeTruthy()
    expect(screen.getByText(/17/)).toBeTruthy()
  })

  it('does not render pharmacokinetics section when all PK fields are absent', () => {
    render(<ClinicalTab entry={{ ...BASE, pharmacokinetics: {} }} lang="en" />)
    expect(screen.queryByText('Pharmacokinetics')).toBeNull()
  })
})

describe('ClinicalTab — pediatric dosing section', () => {
  it('renders pediatric dosing rows', () => {
    const entry: DrugEntryTier2 = {
      ...BASE,
      pediatricDosing: [
        { indication: 'Otitis media', pediatricDose: '40mg/kg/day', frequency: 'divided TID', route: 'oral' },
      ],
    }
    render(<ClinicalTab entry={entry} lang="en" />)
    expect(screen.getByText('Pediatric dosing')).toBeTruthy()
    expect(screen.getByText(/Otitis media/)).toBeTruthy()
    expect(screen.getByText(/40mg\/kg\/day/)).toBeTruthy()
  })
})

describe('ClinicalTab — administration notes section', () => {
  it('renders localized administrationNotes for the selected lang', () => {
    const entry: DrugEntryTier2 = {
      ...BASE,
      administrationNotes: { en: 'Take with food', prs: 'با غذا بخورید' },
    }
    render(<ClinicalTab entry={entry} lang="en" />)
    expect(screen.getByText('Administration notes')).toBeTruthy()
    expect(screen.getByText('Take with food')).toBeTruthy()
  })

  it('does not render administration notes section when empty', () => {
    render(<ClinicalTab entry={{ ...BASE, administrationNotes: {} }} lang="en" />)
    expect(screen.queryByText('Administration notes')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/clinical-tab-extended.test.tsx
```

Expected: FAIL — ClinicalTab doesn't accept `lang` prop and is missing the new sections.

- [ ] **Step 3: Rewrite `ClinicalTab.tsx`**

Replace the entire file:

```typescript
import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { isRtlLang, type Lang } from '@/store/lang-store'
import type { DrugEntryTier2, DrugInteraction } from '@ultranos/shared-types'

function localText(field: Record<string, string | undefined>, lang: Lang): string {
  return field[lang] ?? field.en ?? ''
}

const SEVERITY_COLORS: Record<DrugInteraction['severity'], { bg: string; text: string }> = {
  CONTRAINDICATED: { bg: '#dc2626', text: '#fff' },
  MAJOR:           { bg: '#ea580c', text: '#fff' },
  MODERATE:        { bg: '#ca8a04', text: '#fff' },
  MINOR:           { bg: '#6b7280', text: '#fff' },
}

export function ClinicalTab({ entry, lang }: { entry: DrugEntryTier2; lang: Lang }) {
  const { t } = useTranslation()
  const isRtl = isRtlLang(lang)

  const hasPk = !!(
    entry.pharmacokinetics.halfLifeHours !== undefined ||
    entry.pharmacokinetics.proteinBindingPct !== undefined ||
    entry.pharmacokinetics.volumeOfDistribution ||
    entry.pharmacokinetics.metabolism ||
    entry.pharmacokinetics.excretion
  )

  const adminNotesText = localText(entry.administrationNotes, lang)

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

      {entry.mechanismOfAction && (
        <Section title={t('drug.clinical.mechanism')} text={entry.mechanismOfAction} isRtl={isRtl} />
      )}

      {entry.indicationsClinical.length > 0 && (
        <Section title={t('drug.clinical.indications')} items={entry.indicationsClinical} isRtl={isRtl} />
      )}

      {entry.contraindications.length > 0 && (
        <Section title={t('drug.clinical.contraindications')} items={entry.contraindications} isRtl={isRtl} />
      )}

      {entry.adverseEvents.length > 0 && (
        <Section
          title={t('drug.clinical.adverseEvents')}
          items={entry.adverseEvents.map((e) => e.effect)}
          isRtl={isRtl}
        />
      )}

      {entry.adultDosing.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('drug.clinical.adultDosing')}</Text>
          {entry.adultDosing.map((d, i) => (
            <Text key={i} style={[styles.dosing, isRtl && styles.rtlText]}>
              {d.indication}: {d.adultDose} {d.frequency}{d.route ? ` (${d.route})` : ''}
            </Text>
          ))}
        </View>
      )}

      {entry.pediatricDosing.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('drug.clinical.pediatricDosing')}</Text>
          {entry.pediatricDosing.map((d, i) => (
            <Text key={i} style={[styles.dosing, isRtl && styles.rtlText]}>
              {d.indication}: {d.pediatricDose} {d.frequency}{d.route ? ` (${d.route})` : ''}
            </Text>
          ))}
        </View>
      )}

      {entry.interactions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('drug.clinical.interactions')}</Text>
          {entry.interactions.map((interaction, i) => {
            const colors = SEVERITY_COLORS[interaction.severity]
            return (
              <View key={i} style={styles.interactionRow}>
                <View style={styles.interactionHeader}>
                  <Text style={styles.interactionDrug}>{interaction.drugName}</Text>
                  <View style={[styles.severityBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.severityText, { color: colors.text }]}>
                      {t(`drug.clinical.severity.${interaction.severity}`)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.interactionMechanism, isRtl && styles.rtlText]}>
                  {interaction.mechanism}
                </Text>
              </View>
            )
          })}
        </View>
      )}

      {entry.pregnancyCategory && (
        <Section title={t('drug.clinical.pregnancyCategory')} text={`Category ${entry.pregnancyCategory}`} isRtl={isRtl} />
      )}

      {entry.renalAdjustment && (
        <Section title={t('drug.clinical.renalAdjustment')} text={entry.renalAdjustment} isRtl={isRtl} />
      )}

      {adminNotesText ? (
        <Section title={t('drug.clinical.adminNotes')} text={adminNotesText} isRtl={isRtl} />
      ) : null}

      {hasPk && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('drug.clinical.pharmacokinetics')}</Text>
          {entry.pharmacokinetics.halfLifeHours !== undefined && (
            <PkRow label={t('drug.clinical.halfLife')} value={`${entry.pharmacokinetics.halfLifeHours} h`} />
          )}
          {entry.pharmacokinetics.proteinBindingPct !== undefined && (
            <PkRow label={t('drug.clinical.proteinBinding')} value={`${entry.pharmacokinetics.proteinBindingPct}%`} />
          )}
          {entry.pharmacokinetics.volumeOfDistribution && (
            <PkRow label={t('drug.clinical.volumeDistribution')} value={entry.pharmacokinetics.volumeOfDistribution} />
          )}
          {entry.pharmacokinetics.metabolism && (
            <PkRow label={t('drug.clinical.metabolism')} value={entry.pharmacokinetics.metabolism} />
          )}
          {entry.pharmacokinetics.excretion && (
            <PkRow label={t('drug.clinical.excretion')} value={entry.pharmacokinetics.excretion} />
          )}
        </View>
      )}

    </ScrollView>
  )
}

function Section({
  title, text, items, isRtl,
}: { title: string; text?: string; items?: string[]; isRtl: boolean }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {text && <Text style={[styles.text, isRtl && styles.rtlText]}>{text}</Text>}
      {items?.map((item, i) => (
        <Text key={i} style={[styles.text, isRtl && styles.rtlText]}>• {item}</Text>
      ))}
    </View>
  )
}

function PkRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.pkRow}>
      <Text style={styles.pkLabel}>{label}</Text>
      <Text style={styles.pkValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  text: { fontSize: 15, color: '#111827', lineHeight: 22 },
  dosing: { fontSize: 15, color: '#111827', lineHeight: 22, marginBottom: 4 },
  rtlText: { fontFamily: 'NotoNaskhArabic', textAlign: 'right' },
  interactionRow: { marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  interactionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  interactionDrug: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1, marginEnd: 8 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  severityText: { fontSize: 12, fontWeight: '700' },
  interactionMechanism: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  pkRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  pkLabel: { fontSize: 14, color: '#6b7280', flex: 1 },
  pkValue: { fontSize: 14, color: '#111827', fontWeight: '500' },
})
```

- [ ] **Step 4: Run clinical-tab tests**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/clinical-tab-extended.test.tsx
```

Expected: 7/7 PASS (3 interactions + 2 PK + 1 pediatric dosing + 2 admin notes = 8 tests).

- [ ] **Step 5: Run full suite to confirm nothing regressed**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test
```

Expected: all tests pass (39 existing + 8 new = 47).

- [ ] **Step 6: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add "apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx" "apps/pharmopedia/src/__tests__/clinical-tab-extended.test.tsx"
git commit -m "feat(pharmopedia): extend ClinicalTab with interactions, PK, pediatric dosing, admin notes"
```

---

## Task 3: FormularyTab Component + Tests

**Files:**
- Create: `apps/pharmopedia/src/components/DrugDetail/FormularyTab.tsx`
- Create: `apps/pharmopedia/src/__tests__/formulary-tab.test.tsx`

FormularyTab is **read-only** — it displays Tier 3 data. It is NOT the edit form (that's `EnrichTab`). It is shown only to pharmacist role. The component receives the full `DrugEntryTier3` entry and renders sections for formulary status, dispensing notes, substitutes, and recall alerts.

- [ ] **Step 1: Write the failing tests**

Create `apps/pharmopedia/src/__tests__/formulary-tab.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { FormularyTab } from '@/components/DrugDetail/FormularyTab'
import type { DrugEntryTier3 } from '@ultranos/shared-types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'formulary.status': 'Formulary status',
      'formulary.onFormulary': 'On BPHS formulary',
      'formulary.offFormulary': 'Off formulary',
      'formulary.restricted': 'Restricted use',
      'formulary.dispensingNotes': 'Dispensing notes',
      'formulary.substitutes': 'Therapeutic substitutes',
      'formulary.noSubstitutes': 'No substitutes listed',
      'formulary.recalls': 'Active recall alerts',
      'formulary.noRecalls': 'No active recall alerts',
    }[key] ?? key),
  }),
}))

// Minimal Tier3 base
const BASE_TIER3: DrugEntryTier3 = {
  atcCode: 'J01CA04',
  innName: 'Amoxicillin',
  brandNames: [],
  doseForms: [],
  therapeuticClass: 'Antibacterials',
  localNames: {},
  summaryPlain: { en: '' },
  usedFor: [],
  commonSideEffects: [],
  whenToSeekHelp: { en: '' },
  storageInstructions: { en: '' },
  pregnancySummaryPlain: { en: '' },
  warningsSummaryPlain: { en: '' },
  version: 1,
  lastUpdated: '2026-06-01T00:00:00Z',
  mechanismOfAction: undefined,
  indicationsClinical: [],
  adultDosing: [],
  pediatricDosing: [],
  renalAdjustment: undefined,
  adverseEvents: [],
  contraindications: [],
  interactions: [],
  pregnancyCategory: undefined,
  administrationNotes: {},
  pharmacokinetics: {},
  formularyStatus: undefined,
  dispensingNotes: undefined,
  substitutes: [],
  recallAlerts: [],
  unitCost: undefined,
}

describe('FormularyTab', () => {
  it('renders "On BPHS formulary" badge when formularyStatus is on_formulary', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, formularyStatus: 'on_formulary' }} />)
    expect(screen.getByText('On BPHS formulary')).toBeTruthy()
  })

  it('renders "Off formulary" badge when formularyStatus is off_formulary', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, formularyStatus: 'off_formulary' }} />)
    expect(screen.getByText('Off formulary')).toBeTruthy()
  })

  it('renders "Restricted use" badge when formularyStatus is restricted', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, formularyStatus: 'restricted' }} />)
    expect(screen.getByText('Restricted use')).toBeTruthy()
  })

  it('renders dispensing notes when present', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, dispensingNotes: 'Shake well before use' }} />)
    expect(screen.getByText('Dispensing notes')).toBeTruthy()
    expect(screen.getByText('Shake well before use')).toBeTruthy()
  })

  it('does not render dispensing notes section when absent', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, dispensingNotes: undefined }} />)
    expect(screen.queryByText('Dispensing notes')).toBeNull()
  })

  it('renders substitute ATC codes list', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, substitutes: ['J01CA01', 'J01CA08'] }} />)
    expect(screen.getByText('Therapeutic substitutes')).toBeTruthy()
    expect(screen.getByText('J01CA01')).toBeTruthy()
    expect(screen.getByText('J01CA08')).toBeTruthy()
  })

  it('renders "No substitutes listed" when substitutes is empty', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, substitutes: [] }} />)
    expect(screen.getByText('No substitutes listed')).toBeTruthy()
  })

  it('renders recall alert description when recalls present', () => {
    render(
      <FormularyTab
        entry={{
          ...BASE_TIER3,
          recallAlerts: [{ recallId: 'RC001', description: 'Contamination risk', initiationDate: '2026-05-01', status: 'Ongoing' }],
        }}
      />
    )
    expect(screen.getByText('Active recall alerts')).toBeTruthy()
    expect(screen.getByText('Contamination risk')).toBeTruthy()
  })

  it('renders "No active recall alerts" when recallAlerts is empty', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, recallAlerts: [] }} />)
    expect(screen.getByText('No active recall alerts')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/formulary-tab.test.tsx
```

Expected: FAIL — `FormularyTab` module not found.

- [ ] **Step 3: Create `FormularyTab.tsx`**

Create `apps/pharmopedia/src/components/DrugDetail/FormularyTab.tsx`:

```typescript
import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier3 } from '@ultranos/shared-types'

type FormularyStatus = 'on_formulary' | 'off_formulary' | 'restricted'

const STATUS_STYLE: Record<FormularyStatus, { bg: string; text: string; labelKey: string }> = {
  on_formulary:  { bg: '#dcfce7', text: '#15803d', labelKey: 'formulary.onFormulary' },
  off_formulary: { bg: '#fee2e2', text: '#dc2626', labelKey: 'formulary.offFormulary' },
  restricted:    { bg: '#fef9c3', text: '#854d0e', labelKey: 'formulary.restricted' },
}

export function FormularyTab({ entry }: { entry: DrugEntryTier3 }) {
  const { t } = useTranslation()

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

      {/* Formulary status badge */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('formulary.status')}</Text>
        {entry.formularyStatus ? (
          <View style={[styles.statusBadge, { backgroundColor: STATUS_STYLE[entry.formularyStatus].bg }]}>
            <Text style={[styles.statusText, { color: STATUS_STYLE[entry.formularyStatus].text }]}>
              {t(STATUS_STYLE[entry.formularyStatus].labelKey)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Dispensing notes (read-only) */}
      {entry.dispensingNotes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('formulary.dispensingNotes')}</Text>
          <Text style={styles.text}>{entry.dispensingNotes}</Text>
        </View>
      ) : null}

      {/* Therapeutic substitutes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('formulary.substitutes')}</Text>
        {entry.substitutes.length === 0 ? (
          <Text style={styles.muted}>{t('formulary.noSubstitutes')}</Text>
        ) : (
          entry.substitutes.map((atcCode) => (
            <Text key={atcCode} style={styles.substituteCode}>{atcCode}</Text>
          ))
        )}
      </View>

      {/* Recall alerts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('formulary.recalls')}</Text>
        {entry.recallAlerts.length === 0 ? (
          <Text style={styles.muted}>{t('formulary.noRecalls')}</Text>
        ) : (
          entry.recallAlerts.map((alert) => (
            <View key={alert.recallId} style={styles.recallCard}>
              <Text style={styles.recallDescription}>{alert.description}</Text>
              <Text style={styles.recallMeta}>{alert.status} · {alert.initiationDate}</Text>
            </View>
          ))
        )}
      </View>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  text: { fontSize: 15, color: '#111827', lineHeight: 22 },
  muted: { fontSize: 14, color: '#9ca3af' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  statusText: { fontSize: 14, fontWeight: '700' },
  substituteCode: { fontSize: 14, color: '#2563eb', fontFamily: 'monospace', marginBottom: 4 },
  recallCard: { backgroundColor: '#fff7ed', borderLeftWidth: 3, borderLeftColor: '#ea580c', paddingStart: 12, paddingVertical: 8, marginBottom: 8, borderRadius: 4 },
  recallDescription: { fontSize: 14, color: '#111827', fontWeight: '600', marginBottom: 2 },
  recallMeta: { fontSize: 12, color: '#6b7280' },
})
```

- [ ] **Step 4: Run formulary-tab tests**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/formulary-tab.test.tsx
```

Expected: 9/9 PASS.

- [ ] **Step 5: Run full suite**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test
```

Expected: all tests pass (47 existing + 9 new = 56).

- [ ] **Step 6: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add "apps/pharmopedia/src/components/DrugDetail/FormularyTab.tsx" "apps/pharmopedia/src/__tests__/formulary-tab.test.tsx"
git commit -m "feat(pharmopedia): FormularyTab — pharmacist-only formulary status, substitutes, recall alerts"
```

---

## Task 4: Wire FormularyTab into Drug Detail Screen

**Files:**
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`

No new tests — the drug detail screen wiring is covered by the existing drug-detail-i18n tests and the component tests above.

The current `[atcCode].tsx` has:
- `type Tab = 'overview' | 'clinical' | 'pricing' | 'enrich'`
- `TABS` built with `isClinical` but no `isPharmacist`
- `<ClinicalTab entry={entry as DrugEntryTier2} />` (missing `lang` prop)
- No import or render of `FormularyTab`

- [ ] **Step 1: Read the current file before editing**

Read `apps/pharmopedia/app/drug/[atcCode].tsx` in full. The relevant sections to change are at the top of the component function.

- [ ] **Step 2: Update the file**

In the imports, add `FormularyTab`:
```typescript
import { FormularyTab } from '@/components/DrugDetail/FormularyTab'
```

Change the Tab type:
```typescript
type Tab = 'overview' | 'clinical' | 'formulary' | 'pricing' | 'enrich'
```

After `const isClinical = CLINICAL_ROLES.has(role)`, add:
```typescript
const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])
const isPharmacist = PHARMACIST_ROLES.has(role)
```

Replace the TABS array:
```typescript
const TABS: Tab[] = [
  'overview',
  ...(isClinical ? ['clinical' as Tab] : []),
  ...(isPharmacist ? ['formulary' as Tab] : []),
  'pricing',
  ...(isClinical ? ['enrich' as Tab] : []),
]
```

Replace the TAB_LABELS object (add formulary key):
```typescript
const TAB_LABELS: Record<Tab, string> = {
  overview: t('drug.tabs.overview'),
  clinical: t('drug.tabs.clinical'),
  formulary: t('drug.tabs.formulary'),
  pricing: t('drug.tabs.pricing'),
  enrich: t('drug.tabs.enrich'),
}
```

In the content render block, add `lang` to `ClinicalTab` and add `FormularyTab` render:

```typescript
{activeTab === 'overview' && <OverviewTab entry={entry} lang={lang} />}
{activeTab === 'clinical' && isClinical && <ClinicalTab entry={entry as DrugEntryTier2} lang={lang} />}
{activeTab === 'formulary' && isPharmacist && <FormularyTab entry={entry as DrugEntryTier3} />}
{activeTab === 'pricing' && <PricingTab atcCode={entry.atcCode} />}
{activeTab === 'enrich' && isClinical && <EnrichTab atcCode={entry.atcCode} />}
```

- [ ] **Step 3: Run full test suite**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test
```

Expected: all tests pass (56 tests).

- [ ] **Step 4: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add "apps/pharmopedia/app/drug/[atcCode].tsx"
git commit -m "feat(pharmopedia): add Formulary tab (pharmacist-only) and pass lang to ClinicalTab"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Drug interactions (severity CONTRAINDICATED/MAJOR/MODERATE/MINOR) | Task 2 — ClinicalTab interactions section |
| Pharmacokinetics (half-life, protein binding, Vd, metabolism, excretion) | Task 2 — ClinicalTab PK section |
| Pediatric dosing (weight-based) | Task 2 — ClinicalTab pediatric dosing section |
| Administration notes (localized) | Task 2 — ClinicalTab admin notes, uses `lang` prop |
| Formulary & Availability tab (pharmacist-only) | Task 3 — FormularyTab |
| formularyStatus badge | Task 3 — FormularyTab status section |
| dispensingNotes (read-only display) | Task 3 — FormularyTab dispensing notes |
| Therapeutic substitutes | Task 3 — FormularyTab substitutes section |
| Recall alerts | Task 3 — FormularyTab recall alerts section |
| Formulary tab visible only to pharmacists | Task 4 — `isPharmacist` gate in TABS array |
| `lang` prop passed to ClinicalTab | Task 4 — `[atcCode].tsx` wiring |

**Not in this plan (future plans):**
- `lang` parameter on API content fetch (drug content returns in requested language from Hub — Plan 8)
- Deep links + share button (Plan 8)
- Public user registration (Plan 9)
- `facilityAvailability[]` (not in DrugEntryTier3 shared type — Hub API work out of scope for app plans)
