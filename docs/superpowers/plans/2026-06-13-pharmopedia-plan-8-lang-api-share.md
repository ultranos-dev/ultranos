# Pharmopedia Plan 8 — Lang Param on Drug API + Share Button + Deep Links

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pass the user's language to the drug content API so the Hub returns localized content, and add a share button to the drug detail header that generates a deep link for the current drug.

**Architecture:** `getDrugByAtcCodeApi` gains a `lang: Lang` parameter that is encoded in the tRPC input JSON. The drug detail screen passes the active lang from the lang store to the API call. A new `ShareButton` component encapsulates the `Share.share()` call with the `pharmopedia://drug/:atcCode` deep link. Deep links are already routed by Expo Router 4's file-based routing and the `scheme: 'pharmopedia'` already set in `app.config.ts` — no routing config changes are needed.

**Tech Stack:** React Native `Share` API (built-in), `lucide-react-native` (`Share2` icon), Vitest + `@testing-library/react-native`, TypeScript.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/pharmopedia/src/api/drug-catalog.ts` | Modify | Add `lang: Lang` param to `getDrugByAtcCodeApi` |
| `apps/pharmopedia/app/drug/[atcCode].tsx` | Modify | Pass `lang` to API call; import and render `ShareButton` |
| `apps/pharmopedia/src/components/DrugDetail/ShareButton.tsx` | Create | Share icon that calls `Share.share()` with deep link URL |
| `apps/pharmopedia/src/__mocks__/react-native.js` | Modify | Add `Share` mock so test suite can stub it |
| `apps/pharmopedia/src/__tests__/drug-catalog-api.test.ts` | Create | Verify `lang` is encoded in the tRPC URL |
| `apps/pharmopedia/src/__tests__/share-button.test.tsx` | Create | Verify share button renders and calls `Share.share` with correct URL |

### Deep Link Note (no code change needed)

`app.config.ts` already has `scheme: 'pharmopedia'`. Expo Router 4 automatically maps `pharmopedia://drug/J01CA04` to `app/drug/[atcCode].tsx` with `atcCode = 'J01CA04'`. No additional linking config is required.

---

## Key Types

```typescript
// apps/pharmopedia/src/store/lang-store.ts
export type Lang = 'en' | 'prs' | 'ps' | 'ar'

// Current getDrugByAtcCodeApi signature (to be changed):
export function getDrugByAtcCodeApi(
  atcCode: string,
  token: string,
): Promise<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3>

// Target signature (after Task 1):
export function getDrugByAtcCodeApi(
  atcCode: string,
  lang: Lang,
  token: string,
): Promise<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3>
```

---

## Task 1: Add `lang` Param to `getDrugByAtcCodeApi`

**Files:**
- Modify: `apps/pharmopedia/src/api/drug-catalog.ts`
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx:59`
- Create: `apps/pharmopedia/src/__tests__/drug-catalog-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/drug-catalog-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDrugByAtcCodeApi } from '@/api/drug-catalog'

const mockHubFetch = vi.fn()
vi.mock('@/lib/hub-fetch', () => ({
  hubFetch: (...args: unknown[]) => mockHubFetch(...args),
}))
vi.mock('@/lib/pinned-fetch', () => ({ pinnedFetch: vi.fn() }))
vi.mock('@/stores/device-security-store', () => ({
  useDeviceSecurityStore: { getState: () => ({ checked: true, isCompromised: false }) },
}))

beforeEach(() => {
  mockHubFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ result: { data: { json: { atcCode: 'J01CA04', innName: 'Amoxicillin' } } } }),
  })
})

describe('getDrugByAtcCodeApi', () => {
  it('includes lang in the tRPC input when lang is "en"', async () => {
    await getDrugByAtcCodeApi('J01CA04', 'en', 'tok')
    const url = mockHubFetch.mock.calls[0][0] as string
    expect(url).toContain(encodeURIComponent('"lang"'))
    expect(url).toContain(encodeURIComponent('"en"'))
  })

  it('includes lang in the tRPC input when lang is "prs"', async () => {
    await getDrugByAtcCodeApi('J01CA04', 'prs', 'tok')
    const url = mockHubFetch.mock.calls[0][0] as string
    expect(url).toContain(encodeURIComponent('"prs"'))
  })

  it('includes the atcCode in the tRPC input', async () => {
    await getDrugByAtcCodeApi('J01CA04', 'en', 'tok')
    const url = mockHubFetch.mock.calls[0][0] as string
    expect(url).toContain('J01CA04')
  })

  it('sends Authorization header with the bearer token', async () => {
    await getDrugByAtcCodeApi('J01CA04', 'en', 'tok123')
    const init = mockHubFetch.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer tok123')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/drug-catalog-api.test.ts
```

Expected: FAIL — `getDrugByAtcCodeApi` only takes 2 arguments; tests calling it with 3 will get a TypeScript/runtime mismatch, and the URL won't contain `lang`.

- [ ] **Step 3: Modify `getDrugByAtcCodeApi` to accept `lang`**

In `apps/pharmopedia/src/api/drug-catalog.ts`, replace lines 72–77:

```typescript
/** Retrieve a full drug entry by ATC code. Tier returned depends on caller's role.
 *  lang controls which localised text fields the Hub returns in the response.
 */
export function getDrugByAtcCodeApi(
  atcCode: string,
  lang: 'en' | 'prs' | 'ps' | 'ar',
  token: string,
): Promise<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3> {
  return trpcGet('drugCatalog.getByAtcCode', { atcCode, lang }, token)
}
```

- [ ] **Step 4: Update the call site in `[atcCode].tsx`**

In `apps/pharmopedia/app/drug/[atcCode].tsx`, find the line (currently line 59):
```typescript
if (token) { const apiEntry = await getDrugByAtcCodeApi(code, token); setEntry(apiEntry) }
```

Replace with:
```typescript
if (token) { const apiEntry = await getDrugByAtcCodeApi(code, lang, token); setEntry(apiEntry) }
```

`lang` is already in scope — it's read from `useLangStore` on line 26.

- [ ] **Step 5: Run the API tests**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/drug-catalog-api.test.ts
```

Expected: 4/4 PASS.

- [ ] **Step 6: Run full test suite to confirm no regressions**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test
```

Expected: all 56 tests pass + 4 new = 60.

- [ ] **Step 7: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add "apps/pharmopedia/src/api/drug-catalog.ts" "apps/pharmopedia/app/drug/[atcCode].tsx" "apps/pharmopedia/src/__tests__/drug-catalog-api.test.ts"
git commit -m "feat(pharmopedia): pass lang to drug content API for localised Hub responses"
```

---

## Task 2: Share Button + Deep Link

**Files:**
- Modify: `apps/pharmopedia/src/__mocks__/react-native.js`
- Create: `apps/pharmopedia/src/components/DrugDetail/ShareButton.tsx`
- Create: `apps/pharmopedia/src/__tests__/share-button.test.tsx`
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`

The deep link URL format is `pharmopedia://drug/<atcCode>`. The `Share.share()` call puts the drug name and URL in the `message` field (cross-platform compatible — iOS parses URLs embedded in messages, Android shows the full message string).

- [ ] **Step 1: Add `Share` to the react-native mock**

In `apps/pharmopedia/src/__mocks__/react-native.js`, add `Share` to the `module.exports` object. Find the last entry in `module.exports` (the `useWindowDimensions` line) and add after it:

```javascript
Share: {
  share: async (_content, _options) => ({ action: 'sharedAction', activityType: undefined }),
},
```

The full updated `module.exports` block ending should look like:
```javascript
  useColorScheme: () => 'light',
  useWindowDimensions: () => ({ width: 375, height: 812 }),
  Share: {
    share: async (_content, _options) => ({ action: 'sharedAction', activityType: undefined }),
  },
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/pharmopedia/src/__tests__/share-button.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Share } from 'react-native'
import { ShareButton } from '@/components/DrugDetail/ShareButton'

// lucide-react-native icons are not available in vitest — stub them out
vi.mock('lucide-react-native', () => ({
  Share2: () => null,
}))

describe('ShareButton', () => {
  const shareSpy = vi.spyOn(Share, 'share')

  beforeEach(() => {
    shareSpy.mockClear()
    shareSpy.mockResolvedValue({ action: 'sharedAction', activityType: undefined })
  })

  it('renders a pressable with testID="share-button"', () => {
    render(<ShareButton atcCode="J01CA04" drugName="Amoxicillin" />)
    expect(screen.getByTestId('share-button')).toBeTruthy()
  })

  it('calls Share.share with the drug name and pharmopedia deep link on press', async () => {
    render(<ShareButton atcCode="J01CA04" drugName="Amoxicillin" />)
    await fireEvent.press(screen.getByTestId('share-button'))
    expect(shareSpy).toHaveBeenCalledOnce()
    const content = shareSpy.mock.calls[0][0] as { message: string }
    expect(content.message).toContain('Amoxicillin')
    expect(content.message).toContain('pharmopedia://drug/J01CA04')
  })

  it('encodes ATC codes with special characters safely', async () => {
    render(<ShareButton atcCode="N02AA01" drugName="Morphine" />)
    await fireEvent.press(screen.getByTestId('share-button'))
    const content = shareSpy.mock.calls[0][0] as { message: string }
    expect(content.message).toContain('pharmopedia://drug/N02AA01')
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/share-button.test.tsx
```

Expected: FAIL — `ShareButton` module not found.

- [ ] **Step 4: Create `ShareButton.tsx`**

Create `apps/pharmopedia/src/components/DrugDetail/ShareButton.tsx`:

```typescript
import { Pressable, Share, StyleSheet } from 'react-native'
import { Share2 } from 'lucide-react-native'

interface Props {
  atcCode: string
  drugName: string
}

export function ShareButton({ atcCode, drugName }: Props) {
  async function handleShare() {
    await Share.share({
      message: `${drugName}\npharmopedia://drug/${atcCode}`,
    })
  }

  return (
    <Pressable testID="share-button" style={styles.btn} onPress={() => void handleShare()}>
      <Share2 size={22} color="#6b7280" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: { paddingTop: 2, paddingStart: 8 },
})
```

- [ ] **Step 5: Run share button tests**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/share-button.test.tsx
```

Expected: 3/3 PASS.

- [ ] **Step 6: Wire `ShareButton` into `[atcCode].tsx`**

In `apps/pharmopedia/app/drug/[atcCode].tsx`:

Add the import after the `EnrichTab` import line:
```typescript
import { ShareButton } from '@/components/DrugDetail/ShareButton'
```

In the header `headerRow` View, add `ShareButton` after the `Pressable` bookmark toggle. The current header ends with:
```typescript
          </Pressable>
        </View>
      </View>
```

Change it to:
```typescript
          </Pressable>
          <ShareButton atcCode={entry.atcCode} drugName={primaryName} />
        </View>
      </View>
```

The full updated `headerRow` block becomes:
```typescript
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[styles.primaryName, isRtl && styles.rtlText]}>{primaryName}</Text>
            {secondaryName && <Text style={styles.secondaryName}>{secondaryName}</Text>}
            <Text style={styles.subheader}>{entry.atcCode} · {entry.therapeuticClass}</Text>
          </View>
          <Pressable
            testID="bookmark-toggle"
            style={styles.bookmarkBtn}
            onPress={() =>
              void toggleBookmark(getDatabase(), {
                atcCode: entry.atcCode,
                innName: entry.innName,
                therapeuticClass: entry.therapeuticClass,
              })
            }
          >
            {isBookmarked
              ? <BookmarkCheck size={24} color="#2563eb" />
              : <Bookmark size={24} color="#9ca3af" />
            }
          </Pressable>
          <ShareButton atcCode={entry.atcCode} drugName={primaryName} />
        </View>
      </View>
```

- [ ] **Step 7: Run full test suite**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test
```

Expected: all tests pass (60 existing + 3 new = 63).

- [ ] **Step 8: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add "apps/pharmopedia/src/__mocks__/react-native.js" "apps/pharmopedia/src/components/DrugDetail/ShareButton.tsx" "apps/pharmopedia/src/__tests__/share-button.test.tsx" "apps/pharmopedia/app/drug/[atcCode].tsx"
git commit -m "feat(pharmopedia): share button with pharmopedia:// deep link on drug detail screen"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| `lang` param on `getDrugByAtcCodeApi` | Task 1 — adds `lang` to tRPC input |
| Drug detail screen passes active lang to API | Task 1 — updates call site in `[atcCode].tsx` |
| Deep links `pharmopedia://drug/:atcCode` routed correctly | Pre-existing: `scheme: 'pharmopedia'` + Expo Router file routing — no code change needed |
| Share button on drug detail header | Task 2 — `ShareButton` component in header |
| Share generates a `pharmopedia://` deep link | Task 2 — `pharmopedia://drug/${atcCode}` in message |

### Placeholder Scan

No TBDs, no "handle edge cases", no vague steps. All code blocks are complete.

### Type Consistency

- `Lang = 'en' | 'prs' | 'ps' | 'ar'` — used in both `getDrugByAtcCodeApi` signature (Task 1) and `lang` in scope at call site in `[atcCode].tsx` (already imported via `useLangStore`).
- `ShareButton` prop `atcCode: string` — matches `entry.atcCode: string` from all Tier types.
- `ShareButton` prop `drugName: string` — matches `primaryName: string` derived in the detail screen.
- `Share.share({ message: string })` — standard React Native API, no type issues.

### No-Code-Change Items Confirmed

- `app.config.ts:8` — `scheme: 'pharmopedia'` already present. Expo Router 4 automatically handles `pharmopedia://drug/[atcCode]` via the file at `app/drug/[atcCode].tsx`. No action required.
