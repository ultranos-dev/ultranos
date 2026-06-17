# Pharmopedia E5 — Drug-Detail Rework + Inline Home Search + P0 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete + polish the drug-detail screen (fixing the 4 failing ClinicalTab tests and the `lang`-plumbing bugs, bringing it to Clinical-Calm parity) and make the Home dashboard the single, inline search surface with the standalone `/search` screen removed.

**Architecture:** Part A fixes ClinicalTab (lang prop + `ix.mechanism` + 3 missing sections) and the `getDrugByAtcCodeApi` 3-arg / type-error cluster. Part C extracts a shared `useDrugSearch` hook and wires it into Home for inline, offline-first search, then deletes `app/search.tsx`. Part B is a consistency pass: the drug-detail screen is already token-based, so it restyles `SectionCard` + the header/tab bar to ui-kit Clinical-Calm visuals while preserving `SectionCard`'s safety-critical severity affordance and the existing `SafetyBanner`.

**Tech Stack:** Expo / React Native, expo-sqlite (FTS5), Zustand, react-i18next, `@ultranos/ui-kit/native`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-pharmopedia-e5-drug-detail-inline-search-design.md`

---

## File Structure

**Part A — fixes:**
- Modify `src/components/DrugDetail/ClinicalTab.tsx` (lang prop, mechanism, 3 sections).
- Modify `app/drug/[atcCode].tsx` (`getDrugByAtcCodeApi` 3-arg, pass `lang` to ClinicalTab, type fixes).
- Modify `src/__tests__/api/drug-catalog.test.ts` (3-arg call), `src/__tests__/components/DrugCard.test.tsx`, `src/__tests__/components/SearchBar.test.tsx` (prop realignment).

**Part C — inline search:**
- Create `src/hooks/useDrugSearch.ts` (shared search logic).
- Modify `app/(tabs)/index.tsx` (inline SearchBar + results + chips set query).
- Delete `app/search.tsx`; modify `app/_layout.tsx` (remove the `search` Stack.Screen).
- Delete `src/components/HomeSearchField.tsx`.
- Modify `src/__tests__/home-screen.test.tsx` (rewrite); delete `src/__tests__/search-screen.test.tsx`.
- Create `src/__tests__/use-drug-search.test.ts`.

**Part B — visual consistency:**
- Modify `src/components/DrugDetail/SectionCard.tsx` (Clinical-Calm card surface, keep severity).
- Modify `app/drug/[atcCode].tsx` (header → Chip class badge, tab-bar/typography polish; keep animated indicator + SafetyBanner).
- Modify `src/components/DrugDetail/PricingTab.tsx`, `FormularyTab.tsx`, `EnrichTab.tsx` (token alignment only).

**Test commands:** `pnpm --filter @ultranos/pharmopedia exec vitest run <path>`. Full: `pnpm --filter @ultranos/pharmopedia exec vitest run`.

> **Commit note:** Per project rule, do NOT commit autonomously. "Commit" steps are staging checkpoints; the controller batches the E5 commit on explicit user instruction.

---

## Task 1: Complete ClinicalTab (fixes the 4 failing tests)

**Files:**
- Modify: `apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx`
- Test: `apps/pharmopedia/src/__tests__/clinical-tab-extended.test.tsx` (already exists — currently 4 failing)

Context: the 4 failing tests render `<ClinicalTab entry={entry} lang="en" />` and expect (via substring `getByText`): interaction `mechanism` text ("Combined nephrotoxicity"); a "Pharmacokinetics" section with half-life `1.3` and protein binding `17`; a "Pediatric dosing" section with `pediatricDosing` rows; an "Administration notes" section with localized text ("Take with food"). All `drug.clinical.*` i18n keys exist (`pharmacokinetics`, `pediatricDosing`, `adminNotes`, `halfLife`, `proteinBinding`, `volumeDistribution`, `metabolism`, `excretion`).

- [ ] **Step 1: Run the existing tests to confirm the 4 failures**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/clinical-tab-extended.test.tsx`
Expected: 4 fail ("Unable to find an element with text: Combined nephrotoxicity / Pharmacokinetics / Pediatric dosing / Administration notes").

- [ ] **Step 2: Rewrite `ClinicalTab.tsx`**

Replace the file with:

```tsx
import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier2, DrugLocalizedText } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import { SectionCard } from './SectionCard'
import { SeverityBadge } from './SeverityBadge'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'

function localText(field: DrugLocalizedText | undefined, lang: Lang): string {
  if (!field) return ''
  return (field as Record<string, string | undefined>)[lang] ?? field.en ?? ''
}

export function ClinicalTab({ entry, lang }: { entry: DrugEntryTier2; lang: Lang }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const isRtl = isRtlLang(lang)
  const pk = entry.pharmacokinetics
  const adminNotes = localText(entry.administrationNotes, lang)
  const hasPk = !!pk && (pk.halfLifeHours != null || pk.proteinBindingPct != null || !!pk.volumeOfDistribution || !!pk.metabolism || !!pk.excretion)

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.contraindications.length > 0 && (
        <SectionCard title={t('drug.clinical.contraindications')} items={entry.contraindications} severity="danger" isRtl={isRtl} />
      )}
      {entry.interactions && entry.interactions.length > 0 && (
        <SectionCard title={t('drug.clinical.interactions')} severity="warning">
          {entry.interactions.map((ix, i) => (
            <View key={i} style={styles.interactionRow}>
              <SeverityBadge severity={ix.severity} />
              <Text style={[styles.interactionText, { color: colors.textPrimary }]}>
                {ix.drugName}: {ix.mechanism}
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
        <SectionCard title={t('drug.clinical.adverseEvents')} items={entry.adverseEvents.map((e) => e.effect)} />
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
      {entry.pediatricDosing.length > 0 && (
        <SectionCard title={t('drug.clinical.pediatricDosing')}>
          {entry.pediatricDosing.map((d, i) => (
            <Text key={i} style={[styles.dosing, { color: colors.textPrimary }]}>
              {d.indication}: {d.pediatricDose} {d.frequency}{d.route ? ` (${d.route})` : ''}
            </Text>
          ))}
        </SectionCard>
      )}
      {hasPk && (
        <SectionCard title={t('drug.clinical.pharmacokinetics')}>
          {pk.halfLifeHours != null && <Text style={[styles.dosing, { color: colors.textPrimary }]}>{t('drug.clinical.halfLife')}: {pk.halfLifeHours} h</Text>}
          {pk.proteinBindingPct != null && <Text style={[styles.dosing, { color: colors.textPrimary }]}>{t('drug.clinical.proteinBinding')}: {pk.proteinBindingPct}%</Text>}
          {pk.volumeOfDistribution && <Text style={[styles.dosing, { color: colors.textPrimary }]}>{t('drug.clinical.volumeDistribution')}: {pk.volumeOfDistribution}</Text>}
          {pk.metabolism && <Text style={[styles.dosing, { color: colors.textPrimary }]}>{t('drug.clinical.metabolism')}: {pk.metabolism}</Text>}
          {pk.excretion && <Text style={[styles.dosing, { color: colors.textPrimary }]}>{t('drug.clinical.excretion')}: {pk.excretion}</Text>}
        </SectionCard>
      )}
      {adminNotes ? (
        <SectionCard title={t('drug.clinical.adminNotes')} text={adminNotes} isRtl={isRtl} />
      ) : null}
      {entry.pregnancyCategory && (
        <SectionCard title={t('drug.clinical.pregnancyCategory')} text={`Category ${entry.pregnancyCategory}`} />
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
  interactionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginBottom: Spacing[1] },
  interactionText: { flex: 1, fontSize: FontSize.base, fontFamily: FontFamily.sans },
  dosing: { fontSize: FontSize.base, fontFamily: FontFamily.sans, lineHeight: 22 },
})
```

> Keep the existing styles for `interactionRow`/`interactionText`/`dosing` if the current file already defines them; the block above is the complete replacement.

- [ ] **Step 3: Run the tests to verify they pass**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/clinical-tab-extended.test.tsx`
Expected: all pass. If `getByText('Gentamicin')` fails because the mock does exact (not substring) matching, split the interaction into two `<Text>` nodes (drugName, then mechanism) and re-run.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep "ClinicalTab"`
Expected: no new errors (the `{ entry; lang }` signature now matches the call site fixed in Task 2).

- [ ] **Step 5: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx
git commit -m "fix(pharmopedia): complete ClinicalTab (lang + PK/pediatric/admin sections, ix.mechanism)"
```

---

## Task 2: `lang` plumbing + drug-detail type errors + test realignment

**Files:**
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`
- Modify: `apps/pharmopedia/src/__tests__/api/drug-catalog.test.ts`
- Modify: `apps/pharmopedia/src/__tests__/components/DrugCard.test.tsx`
- Modify: `apps/pharmopedia/src/__tests__/components/SearchBar.test.tsx`

- [ ] **Step 1: Fix `[atcCode].tsx` call sites**

In `app/drug/[atcCode].tsx`:
- Line ~84: change `const apiEntry = await getDrugByAtcCodeApi(code, token)` to `const apiEntry = await getDrugByAtcCodeApi(code, lang, token)`.
- Line ~206: change `<ClinicalTab entry={entry as DrugEntryTier2} />` to `<ClinicalTab entry={entry as DrugEntryTier2} lang={lang} />`.

- [ ] **Step 2: Resolve the remaining `[atcCode].tsx` type errors**

Run `pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep "drug/\[atcCode\]"` to list them, then fix each minimally:
- `ShareButton entry={entry}` (line ~166): inspect `src/components/DrugDetail/ShareButton.tsx` props; if it expects a narrower type, pass the correct shape (e.g. `entry as DrugEntryTier1`) or widen ShareButton's prop type to `DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3` — choose whichever matches ShareButton's actual usage.
- `SafetyBanner interactions={(entry as DrugEntryTier2).interactions}` (line ~171): inspect `src/components/DrugDetail/SafetyBanner.tsx`'s `interactions` prop type; align it to `DrugInteraction[]` from `@ultranos/shared-types` (the canonical type) rather than a local `Interaction[]`.
- `scopeEntryForRole(row, role)` / `Tab` typing (lines ~83/93): ensure `role` is `string` as `scopeEntryForRole` expects; no behavior change.

> Make the SafetyBanner/ShareButton prop types reference the shared-types `DrugInteraction`/`DrugEntryTier*` so the assertions type-check without `any`.

- [ ] **Step 3: Fix `drug-catalog.test.ts` 3-arg call**

In `src/__tests__/api/drug-catalog.test.ts` (line ~76), update the `getDrugByAtcCodeApi` call to pass 3 args `(atcCode, lang, token)` and assert the URL/input includes `lang`. Run:
`pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/api/drug-catalog.test.ts` → pass.

- [ ] **Step 4: Realign DrugCard + SearchBar tests**

- `DrugCard.test.tsx`: pass the required `lang` prop (`<DrugCard result={...} lang="en" onPress={...} />`) wherever it renders DrugCard.
- `SearchBar.test.tsx`: SearchBar's props are exactly `{ value, onSearch }` — remove any extra props (`lang`, `onLangChange`) the test passes.

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/components/DrugCard.test.tsx src/__tests__/components/SearchBar.test.tsx` → pass.

- [ ] **Step 5: Typecheck the drug-detail screen**

Run: `pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep "drug/\[atcCode\]"`
Expected: the previously-flagged errors (lines ~84/93/166/171) are gone; only the baseline `tokens.native` module-resolution noise (if any) remains.

- [ ] **Step 6: Commit (staging checkpoint)**

```bash
git add "apps/pharmopedia/app/drug/[atcCode].tsx" apps/pharmopedia/src/__tests__/api/drug-catalog.test.ts apps/pharmopedia/src/__tests__/components/DrugCard.test.tsx apps/pharmopedia/src/__tests__/components/SearchBar.test.tsx apps/pharmopedia/src/components/DrugDetail/ShareButton.tsx apps/pharmopedia/src/components/DrugDetail/SafetyBanner.tsx
git commit -m "fix(pharmopedia): thread lang to getDrugByAtcCodeApi/ClinicalTab; resolve drug-detail type errors"
```

---

## Task 3: `useDrugSearch` hook (shared offline-first search)

**Files:**
- Create: `apps/pharmopedia/src/hooks/useDrugSearch.ts`
- Test: `apps/pharmopedia/src/__tests__/use-drug-search.test.ts`

Behavior (lifted from `app/search.tsx`): `useDrugSearch() → { query, results, loading, search }`. `search(q)` sets `query`, clears results on empty, else runs local FTS (`searchDrugs(getDatabase(), q, lang, 50)`) when `lastVersion > 0`, else `searchDrugsApi(q, lang, 20, token)` when `token`; failures clear results. Reads `lang`/`token`/`lastVersion` from the stores internally. The `SearchBar` component already owns the 300ms debounce (it calls `onSearch` on change + debounced), so the hook does no debouncing.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/use-drug-search.test.ts`. Mock `@/db/fts`, `@/api/drug-catalog`, `@/db/migrations` (`getDatabase`), and the stores. Use `renderHook` + `act` (the existing `@testing-library/react-native` mock supports them — see `use-profile.test.ts`).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react-native'
const h = vi.hoisted(() => ({ fts: vi.fn(), api: vi.fn() }))
vi.mock('@/db/fts', () => ({ searchDrugs: h.fts }))
vi.mock('@/api/drug-catalog', () => ({ searchDrugsApi: h.api }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { token: string | null }) => unknown) => s({ token: 'tok' }) }))
vi.mock('@/store/sync-store', () => ({ useSyncStore: (s: (x: { lastVersion: number }) => unknown) => s({ lastVersion: 1 }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
import { useDrugSearch } from '@/hooks/useDrugSearch'

const ROW = { atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: 'X', localName: undefined }

describe('useDrugSearch', () => {
  beforeEach(() => vi.clearAllMocks())
  it('runs local FTS when catalog is synced', async () => {
    h.fts.mockResolvedValue([ROW])
    const { result } = renderHook(() => useDrugSearch())
    await act(async () => { await result.current.search('amox') })
    await waitFor(() => expect(result.current.results).toEqual([ROW]))
    expect(h.fts).toHaveBeenCalledWith(expect.anything(), 'amox', 'en', 50)
    expect(h.api).not.toHaveBeenCalled()
    expect(result.current.query).toBe('amox')
  })
  it('clears results on empty query', async () => {
    h.fts.mockResolvedValue([ROW])
    const { result } = renderHook(() => useDrugSearch())
    await act(async () => { await result.current.search('amox') })
    await act(async () => { await result.current.search('') })
    expect(result.current.results).toEqual([])
  })
  it('clears results on search failure', async () => {
    h.fts.mockRejectedValue(new Error('db'))
    const { result } = renderHook(() => useDrugSearch())
    await act(async () => { await result.current.search('amox') })
    expect(result.current.results).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/use-drug-search.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useDrugSearch.ts`**

```ts
import { useState, useCallback } from 'react'
import { searchDrugs } from '@/db/fts'
import { searchDrugsApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore } from '@/store/lang-store'
import type { DrugSearchResult } from '@ultranos/shared-types'

export function useDrugSearch(): {
  query: string
  results: DrugSearchResult[]
  loading: boolean
  search: (q: string) => Promise<void>
} {
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const lang = useLangStore((s) => s.lang)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DrugSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      if (lastVersion > 0) {
        try { setResults(await searchDrugs(getDatabase(), q, lang, 50)) } catch { setResults([]) }
      } else if (token) {
        try { setResults(await searchDrugsApi(q, lang, 20, token)) } catch { setResults([]) }
      }
    } finally { setLoading(false) }
  }, [lastVersion, lang, token])

  return { query, results, loading, search }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/use-drug-search.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/src/hooks/useDrugSearch.ts apps/pharmopedia/src/__tests__/use-drug-search.test.ts
git commit -m "feat(pharmopedia): useDrugSearch hook (shared offline-first search)"
```

---

## Task 4: Inline search on the Home dashboard

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/index.tsx`
- Test: `apps/pharmopedia/src/__tests__/home-screen.test.tsx` (rewrite)

- [ ] **Step 1: Rewrite the home test**

Replace `home-screen.test.tsx`'s navigation assertions with inline-search behavior. Mock `@/hooks/useDrugSearch`, `@/components/SearchBar`, `@/components/DrugCard`, the stores, `@/db/recalls`, `@/db/migrations`, `expo-router`. Cases:

```ts
// typing renders DrugCard results inline (no navigation)
it('renders search results inline as the query changes', async () => {
  mockUseDrugSearch.mockReturnValue({ query: 'amox', results: [ROW], loading: false, search: vi.fn() })
  const { getByText } = render(<HomeTab />)
  expect(getByText('Amoxicillin')).toBeTruthy()
  expect(push).not.toHaveBeenCalled()
})
// tapping a result adds recent + pushes /drug/<atc>, no /search
it('opens a result and records the recent query', async () => {
  const search = vi.fn()
  mockUseDrugSearch.mockReturnValue({ query: 'amox', results: [ROW], loading: false, search })
  const { getByText } = render(<HomeTab />)
  fireEvent.press(getByText('Amoxicillin'))
  expect(addRecent).toHaveBeenCalledWith('amox')
  expect(push).toHaveBeenCalledWith('/drug/J01CA04')
})
// empty query shows dashboard sections (saved/recent), not results
it('shows dashboard sections when the query is empty', () => {
  mockUseDrugSearch.mockReturnValue({ query: '', results: [], loading: false, search: vi.fn() })
  const { getByText, queryByText } = render(<HomeTab />)
  expect(getByText('metformin')).toBeTruthy() // a recent chip
  expect(queryByText('Amoxicillin')).toBeNull()
})
// a recent chip sets the inline query (does not navigate to /search)
it('sets the query from a recent chip', () => {
  const search = vi.fn()
  mockUseDrugSearch.mockReturnValue({ query: '', results: [], loading: false, search })
  const { getByText } = render(<HomeTab />)
  fireEvent.press(getByText('metformin'))
  expect(search).toHaveBeenCalledWith('metformin')
  expect(push).not.toHaveBeenCalledWith({ pathname: '/search', params: { q: 'metformin' } })
})
```

Mock `DrugCard` to render its `result.innName` as pressable text; mock `SearchBar` as a no-op (the hook is mocked, so SearchBar isn't exercised here). Keep the recalls/bookmarks store mocks from the prior test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/home-screen.test.tsx`
Expected: FAIL — inline results not rendered; old behavior gone.

- [ ] **Step 3: Rewrite the Home screen**

Edit `app/(tabs)/index.tsx`:
- Replace the `HomeSearchField` import + usage with the real `SearchBar` and `DrugCard`, and `useDrugSearch`.
- Add: `const { query, results, loading, search } = useDrugSearch()`; `const addRecent = useRecentSearchStore((s) => s.add)`.
- Render `<SearchBar value={query} onSearch={search} />` at the top (replacing `<HomeSearchField ... />`).
- When `query.trim().length > 0`: render the results block (map `results` to `<DrugCard result={item} lang={lang} onPress={() => { void addRecent(query); router.push(\`/drug/\${item.atcCode}\`) }} />`), a `loading` indicator, and an `EmptyState` (icon `SearchX`) when `!loading && results.length === 0`. Do NOT render the dashboard sections in this mode.
- When the query is empty: render the existing safety-alerts / recent / saved sections.
- Recent chips: change `onPress` from `router.push({ pathname: '/search', ... })` to `() => void search(q)`.
- Add `lang` from `useLangStore` for DrugCard.

Concrete results block (inside `CollapsibleScreen`, replacing the sections when searching):
```tsx
{query.trim().length > 0 ? (
  <View style={styles.section}>
    {results.map((item) => (
      <DrugCard
        key={item.atcCode}
        result={item}
        lang={lang}
        onPress={() => { void addRecent(query); router.push(`/drug/${item.atcCode}`) }}
      />
    ))}
    {!loading && results.length === 0 && (
      <EmptyState icon={SearchX} title={t('search.noResultsTitle')} description={t('search.noResultsDescription')} />
    )}
  </View>
) : (
  <>
    {/* existing safety alerts + recent + saved sections */}
  </>
)}
```
Import `SearchX` from `lucide-react-native`, `SearchBar` from `@/components/SearchBar`, `DrugCard` from `@/components/DrugCard`, `useDrugSearch` from `@/hooks/useDrugSearch`, `useLangStore` from `@/store/lang-store`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/home-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit (staging checkpoint)**

```bash
git add "apps/pharmopedia/app/(tabs)/index.tsx" apps/pharmopedia/src/__tests__/home-screen.test.tsx
git commit -m "feat(pharmopedia): inline search on the Home dashboard"
```

---

## Task 5: Remove the standalone `/search` screen + route

**Files:**
- Delete: `apps/pharmopedia/app/search.tsx`
- Delete: `apps/pharmopedia/src/components/HomeSearchField.tsx`
- Delete: `apps/pharmopedia/src/__tests__/search-screen.test.tsx`
- Modify: `apps/pharmopedia/app/_layout.tsx`

- [ ] **Step 1: Find every `/search` reference**

Run: `grep -rn "'/search'\|\"/search\"\|pathname: '/search'\|name=\"search\"\|HomeSearchField" apps/pharmopedia` (use the Grep tool). Expected hits: `_layout.tsx` (Stack.Screen), and any leftover in `index.tsx` (should already be gone after Task 4). Confirm no other screen routes to `/search`.

- [ ] **Step 2: Remove the route registration**

In `app/_layout.tsx`, delete the line: `<Stack.Screen name="search" options={{ headerShown: true, title: '', animation: 'slide_from_bottom', animationDuration: 300 }} />`.

- [ ] **Step 3: Delete the files**

```bash
git rm apps/pharmopedia/app/search.tsx apps/pharmopedia/src/components/HomeSearchField.tsx apps/pharmopedia/src/__tests__/search-screen.test.tsx
```
(If `HomeSearchField` is still imported anywhere, the typecheck in Step 5 will catch it — remove the import.)

- [ ] **Step 4: Run the full suite to confirm nothing references the removed screen**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run`
Expected: no test imports `app/search` or `HomeSearchField`; suite green except any unrelated pre-existing failures (the `clinical-tab-extended` ones are fixed by Task 1).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -E "search.tsx|HomeSearchField"`
Expected: no references (no "cannot find module" for a still-imported deleted file).

- [ ] **Step 6: Commit (staging checkpoint)**

```bash
git add -A
git commit -m "refactor(pharmopedia): remove standalone /search screen — Home is the single search surface"
```

---

## Task 6: Clinical-Calm restyle of SectionCard (keep severity)

**Files:**
- Modify: `apps/pharmopedia/src/components/DrugDetail/SectionCard.tsx`
- Test: `apps/pharmopedia/src/__tests__/section-card.test.tsx` (create — snapshot + severity)

SectionCard is shared by Overview + Clinical tabs, so restyling it propagates Clinical-Calm polish to both. Keep the `severity` (danger/warning/info/none) coloring — it carries safety meaning ui-kit `CardSection` lacks — but give the `none` case a proper card surface (rounded, subtle border/background, consistent padding) matching ui-kit `Card`, instead of the current borderless block.

- [ ] **Step 1: Write the test**

Create `apps/pharmopedia/src/__tests__/section-card.test.tsx`: render SectionCard with `severity="danger"` (assert it still renders title + items), with default severity (assert title + text render), and snapshot both. Mirror an existing component test's setup (mock `@/hooks/useThemeColors`).

- [ ] **Step 2: Run it to confirm baseline**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/section-card.test.tsx`
Expected: PASS (writes snapshots) — this is a characterization test before the restyle.

- [ ] **Step 3: Restyle**

Give every SectionCard a card surface: apply `backgroundColor: colors.surface`, `borderRadius: Radius.md`, `borderWidth: 1`, `borderColor: colors.border`, `padding: Spacing[4]` in the base `section` style; for `hasSeverity`, override `backgroundColor`/`borderColor` with the severity tokens (as today). Keep the title/text/item typography. Keep the `testID`, `isRtl`, `children` API unchanged.

- [ ] **Step 4: Update snapshot + verify**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/section-card.test.tsx -u` then re-run without `-u`.
Expected: PASS; the OverviewTab/ClinicalTab tests still pass (Step 5).

- [ ] **Step 5: Regression check**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/clinical-tab-extended.test.tsx src/__tests__/drug-detail-i18n.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/src/components/DrugDetail/SectionCard.tsx apps/pharmopedia/src/__tests__/section-card.test.tsx
git commit -m "style(pharmopedia): Clinical-Calm card surface for SectionCard (severity preserved)"
```

---

## Task 7: Clinical-Calm polish of the drug-detail shell

**Files:**
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/PricingTab.tsx`, `FormularyTab.tsx`, `EnrichTab.tsx`
- Test: `apps/pharmopedia/src/__tests__/drug-detail-rtl.test.tsx` (create — LTR + RTL snapshot)

The screen is already token-based; this is a consistency pass, not a rewrite. Preserve all testIDs (`tab-*`, `bookmark-btn`), the animated tab indicator, `SafetyBanner` (it already elevates interactions above the tabs — keep it), and the role-gated tabs.

- [ ] **Step 1: Header + tab-bar polish**

In `[atcCode].tsx`: replace the ad-hoc `classBadge` View/Text with the ui-kit `Chip` (`import { Chip } from '@ultranos/ui-kit/native'`, `<Chip label={entry.therapeuticClass} />`). Align header spacing/typography to the E4 Clinical-Calm scale (use `FontFamily.headingBold` for the name — already used; ensure `Spacing`/`Radius` tokens; no raw values). Keep the animated indicator + tab `Pressable`s and their `onLayout`/testIDs unchanged.

- [ ] **Step 2: Verify SafetyBanner elevates contraindicated/major**

Read `src/components/DrugDetail/SafetyBanner.tsx`. Confirm it surfaces `CONTRAINDICATED`/`MAJOR` interactions prominently (destructive styling) at the top. If it renders all severities equally, adjust it to sort/emphasize `CONTRAINDICATED` + `MAJOR` first with destructive tokens. Keep its existing testIDs/props (now typed to `DrugInteraction[]` from Task 2).

- [ ] **Step 3: Token-align Pricing/Formulary/Enrich tabs**

In `PricingTab.tsx`, `FormularyTab.tsx`, `EnrichTab.tsx`: replace any raw hex/px with tokens (`FontFamily`/`FontSize`/`Spacing`/`Radius`/`useThemeColors`); wrap list/section content in ui-kit `Card`/`CardSection` where it visually matches the other tabs. No behavior/logic changes. (Enrich = spacing/typography only, no form redesign.)

- [ ] **Step 4: RTL snapshot test**

Create `src/__tests__/drug-detail-rtl.test.tsx`: render `DrugDetailScreen` for a clinical role in LTR (`lang='en'`) and RTL (`lang='ar'`) with a stubbed entry (mock `@/db/drug-catalog` `getDrugRowByAtcCode`/`scopeEntryForRole` to return a Tier2 entry, the bookmark/auth/lang stores, `expo-router` params). Snapshot both. Assert `tab-clinical` exists for a clinical role.

- [ ] **Step 5: Run drug-detail tests**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/drug-detail-rtl.test.tsx "apps/pharmopedia/__tests__/screens/drug-detail.test.tsx"`
Expected: PASS (role-gating test still green; RTL snapshots written).

- [ ] **Step 6: Commit (staging checkpoint)**

```bash
git add "apps/pharmopedia/app/drug/[atcCode].tsx" apps/pharmopedia/src/components/DrugDetail/PricingTab.tsx apps/pharmopedia/src/components/DrugDetail/FormularyTab.tsx apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx apps/pharmopedia/src/components/DrugDetail/SafetyBanner.tsx apps/pharmopedia/src/__tests__/drug-detail-rtl.test.tsx
git commit -m "style(pharmopedia): Clinical-Calm polish for drug-detail shell + tabs"
```

---

## Task 8: Finalize — full verification + reviews

**Files:** none (verification + review only).

- [ ] **Step 1: Full pharmopedia suite**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run`
Expected: all green — the 4 `clinical-tab-extended` failures are gone and no new failures (the suite should be fully passing now that E5 fixes the last reds).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -E "ClinicalTab|useDrugSearch|drug/\[atcCode\]|\(tabs\)/index|SectionCard"`
Expected: no new logic errors (only the pre-existing `tokens.native`/locale-literal baseline noise).

- [ ] **Step 3: Two-stage review (controller)**

Dispatch a spec-compliance review (every spec §3 requirement; `/search` fully gone; inline search offline-first; ClinicalTab complete) and a code-quality + safety review (CONTRAINDICATED/MAJOR elevation intact; no PHI concerns here but confirm interaction-severity prominence is not weakened; offline-first preserved; no dead code from the `/search` removal). Address findings, re-verify.

- [ ] **Step 4: Commit (controller, on explicit user go-ahead)**

Batch the E5 commit with the standard trailer.

---

## Self-Review (plan vs spec)

**Spec coverage:** §3.1 Part A (ClinicalTab + lang plumbing + test realign) → Tasks 1–2; §3.2 Part B (Clinical-Calm rework, safety elevation) → Tasks 6–7; §3.3 Part C (useDrugSearch + inline Home + remove /search) → Tasks 3–5; §3.4 i18n → keys already exist (no new task needed; Task 4 reuses `search.*`/`home.*` keys); §4 testing → each task's tests + Task 8. Success criteria §6 all map. ✅

**Placeholder scan:** No "TBD"/"add error handling" placeholders; the `> Verify` notes name the exact file + fallback. Visual-polish steps (Tasks 6–7) describe concrete token/primitive changes rather than vague "make it nicer." ✅

**Type consistency:** `useDrugSearch() → { query, results, loading, search }` consistent between hook (Task 3), test, and Home usage (Task 4). `getDrugByAtcCodeApi(atcCode, lang, token)` 3-arg consistent across `[atcCode].tsx`, the test, and the existing client. `ClinicalTab({ entry, lang })` consistent between component (Task 1) and call site (Task 2). `DrugInteraction` (shared-types) used for SafetyBanner/ShareButton typing (Task 2) and the ClinicalTab interaction render. ✅

**Deviation from spec (flagged):** spec §3.2 framed Part B as a "full rework"; the plan scopes it as a consistency/polish pass because the screen is already token-based and `SafetyBanner` already elevates interactions — a rewrite would risk regressions for marginal gain. `SectionCard`'s severity affordance is preserved rather than replaced by ui-kit `CardSection` (per spec §7 risk). Ordering puts Part C (user-priority inline search) before Part B (visual).
