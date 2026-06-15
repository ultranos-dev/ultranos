# Pharmopedia Plan 5 — RTL & i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full i18n support for English, Dari (دری), Pashto (پښتو), and Arabic (العربية) to the Pharmopedia React Native app, including RTL layout flipping for the three RTL languages and Noto Naskh Arabic font rendering.

**Architecture:** Install a global Zustand lang store (persisted via expo-secure-store) that drives both i18next language selection and `I18nManager.forceRTL()` at startup. Switching to/from an RTL language triggers `Updates.reloadAsync()` so I18nManager takes effect. All hardcoded UI strings are replaced with `t()` calls; `localName` is promoted to primary title in DrugCard and DrugDetail when the selected lang has a local name available.

**Tech Stack:** i18next ^26, react-i18next ^17 (already installed), expo-font (new install), expo-updates (already in Expo SDK), expo-secure-store (already installed), NotoNaskhArabic-Regular.ttf bundled in assets/fonts/

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Create | `src/store/lang-store.ts` | Global lang state, RTL toggle, SecureStore persistence |
| Create | `src/i18n/index.ts` | i18next init with 4 in-memory locale resources |
| Create | `src/i18n/locales/en.ts` | English strings (source of truth) |
| Create | `src/i18n/locales/prs.ts` | Dari strings |
| Create | `src/i18n/locales/ps.ts` | Pashto strings |
| Create | `src/i18n/locales/ar.ts` | Arabic strings |
| Add    | `assets/fonts/NotoNaskhArabic-Regular.ttf` | Bundled Arabic font |
| Modify | `app/_layout.tsx` | Init lang store + i18n + load font before first render |
| Modify | `src/components/SearchBar.tsx` | Global lang, Arabic button, `t()` strings |
| Modify | `app/(tabs)/index.tsx` | Remove local lang state, pass lang to DrugCard |
| Modify | `src/components/SyncStatusBanner.tsx` | `t()` strings |
| Modify | `src/components/DrugCard.tsx` | Local-name-as-primary-title |
| Modify | `app/drug/[atcCode].tsx` | Lang from store, localName header, i18n tab labels |
| Modify | `src/components/DrugDetail/OverviewTab.tsx` | i18n section titles, `ar` in lang type |
| Modify | `src/components/DrugDetail/ClinicalTab.tsx` | i18n section titles |
| Modify | `src/components/DrugDetail/PricingTab.tsx` | `t()` strings |
| Modify | `src/components/PriceCard.tsx` | `t()` strings |
| Modify | `src/components/DrugDetail/EnrichTab.tsx` | `t()` strings |
| Modify | `app/(tabs)/profile.tsx` | Language selector + `t()` strings |
| Modify | `app/(tabs)/_layout.tsx` | `t()` tab titles |
| Modify | `app/(auth)/login.tsx` | `t()` strings |
| Create | `src/__tests__/lang-store.test.ts` | Store logic, RTL detection |
| Create | `src/__tests__/drug-card-local-name.test.tsx` | Local-name-as-primary |
| Create | `src/__tests__/profile-lang-selector.test.tsx` | Language picker UI |

---

## Task 1: Lang Store + i18n Config + Locale Files

**Files:**
- Create: `src/store/lang-store.ts`
- Create: `src/i18n/index.ts`
- Create: `src/i18n/locales/en.ts`
- Create: `src/i18n/locales/prs.ts`
- Create: `src/i18n/locales/ps.ts`
- Create: `src/i18n/locales/ar.ts`
- Create: `src/__tests__/lang-store.test.ts`

- [ ] **Step 1: Install expo-font**

```bash
cd apps/pharmopedia
npx expo install expo-font
```

Expected: `expo-font` added to `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `apps/pharmopedia/src/__tests__/lang-store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('react-native', () => ({
  I18nManager: {
    allowRTL: vi.fn(),
    forceRTL: vi.fn(),
  },
}))

vi.mock('expo-updates', () => ({
  reloadAsync: vi.fn().mockResolvedValue(undefined),
}))

const { isRtlLang, useLangStore } = await import('@/store/lang-store')

describe('isRtlLang', () => {
  it('returns false for en', () => expect(isRtlLang('en')).toBe(false))
  it('returns true for prs', () => expect(isRtlLang('prs')).toBe(true))
  it('returns true for ps', () => expect(isRtlLang('ps')).toBe(true))
  it('returns true for ar', () => expect(isRtlLang('ar')).toBe(true))
})

describe('useLangStore.init', () => {
  beforeEach(() => {
    const { getItemAsync } = await import('expo-secure-store') as { getItemAsync: ReturnType<typeof vi.fn> }
    getItemAsync.mockResolvedValue(null)
  })

  it('defaults to en when no stored value', async () => {
    await useLangStore.getState().init()
    expect(useLangStore.getState().lang).toBe('en')
    expect(useLangStore.getState().initialized).toBe(true)
  })

  it('restores persisted lang', async () => {
    const { getItemAsync } = await import('expo-secure-store') as { getItemAsync: ReturnType<typeof vi.fn> }
    getItemAsync.mockResolvedValueOnce('ar')
    await useLangStore.getState().init()
    expect(useLangStore.getState().lang).toBe('ar')
  })
})

describe('useLangStore.setLang', () => {
  it('persists lang to SecureStore', async () => {
    const { setItemAsync } = await import('expo-secure-store') as { setItemAsync: ReturnType<typeof vi.fn> }
    await useLangStore.getState().setLang('prs')
    expect(setItemAsync).toHaveBeenCalledWith('@pharmopedia/lang', 'prs')
  })

  it('calls reloadAsync when RTL direction changes', async () => {
    await useLangStore.getState().setLang('en')
    const { reloadAsync } = await import('expo-updates') as { reloadAsync: ReturnType<typeof vi.fn> }
    reloadAsync.mockClear()
    await useLangStore.getState().setLang('ar')
    expect(reloadAsync).toHaveBeenCalledOnce()
  })

  it('does NOT call reloadAsync when RTL direction stays the same', async () => {
    await useLangStore.getState().setLang('prs')
    const { reloadAsync } = await import('expo-updates') as { reloadAsync: ReturnType<typeof vi.fn> }
    reloadAsync.mockClear()
    await useLangStore.getState().setLang('ar') // prs→ar: both RTL, no change
    expect(reloadAsync).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to confirm failure**

```bash
pnpm -F pharmopedia test src/__tests__/lang-store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create the lang store**

Create `apps/pharmopedia/src/store/lang-store.ts`:

```typescript
import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { I18nManager } from 'react-native'
import * as Updates from 'expo-updates'

export type Lang = 'en' | 'prs' | 'ps' | 'ar'

const RTL_LANGS: ReadonlySet<Lang> = new Set(['prs', 'ps', 'ar'])
const LANG_KEY = '@pharmopedia/lang'

export function isRtlLang(lang: Lang): boolean {
  return RTL_LANGS.has(lang)
}

interface LangState {
  lang: Lang
  initialized: boolean
  init: () => Promise<void>
  setLang: (lang: Lang) => Promise<void>
}

export const useLangStore = create<LangState>((set, get) => ({
  lang: 'en',
  initialized: false,

  async init() {
    const saved = await SecureStore.getItemAsync(LANG_KEY)
    const lang = (saved as Lang | null) ?? 'en'
    I18nManager.allowRTL(true)
    I18nManager.forceRTL(isRtlLang(lang))
    set({ lang, initialized: true })
  },

  async setLang(lang: Lang) {
    const prev = get().lang
    await SecureStore.setItemAsync(LANG_KEY, lang)
    set({ lang })
    if (isRtlLang(prev) !== isRtlLang(lang)) {
      I18nManager.forceRTL(isRtlLang(lang))
      try {
        await Updates.reloadAsync()
      } catch {
        // Expo Go dev mode: Updates.reloadAsync() is unavailable.
        // User must close and reopen the app manually.
      }
    }
  },
}))
```

- [ ] **Step 5: Create i18n initializer**

Create `apps/pharmopedia/src/i18n/index.ts`:

```typescript
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import prs from './locales/prs'
import ps from './locales/ps'
import ar from './locales/ar'
import type { Lang } from '@/store/lang-store'

export function initI18n(lang: Lang): void {
  if (i18n.isInitialized) {
    void i18n.changeLanguage(lang)
    return
  }
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      prs: { translation: prs },
      ps: { translation: ps },
      ar: { translation: ar },
    },
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
}

export { i18n }
```

- [ ] **Step 6: Create English locale**

Create `apps/pharmopedia/src/i18n/locales/en.ts`:

```typescript
const en = {
  tabs: {
    search: 'Search',
    profile: 'Profile',
  },
  search: {
    placeholder: 'Search drugs\u2026',
    empty: 'Search by drug name, brand name, or ATC code',
    lang: { en: 'EN', prs: '\u062f\u0631\u06cc', ps: '\u067e\u069a\u062a\u0648', ar: '\u0639\u0631\u0628\u064a' },
  },
  sync: {
    syncing: 'Syncing catalog\u2026',
    failed: 'Sync failed \u2014 showing cached data',
    notSynced: 'Catalog not yet synced \u2014 connect to network',
  },
  drug: {
    notFound: 'Drug not found',
    back: 'Go back',
    tabs: {
      overview: 'Overview',
      clinical: 'Clinical',
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
    },
  },
  pricing: {
    byDistance: 'By distance',
    byPrice: 'By price',
    locationRequired: 'Location permission required to find nearby pharmacies',
    unavailable: 'Pricing unavailable \u2014 check your connection and try again',
    noResults: 'No pharmacy prices found nearby',
    retry: 'Retry',
    inStock: 'In stock',
    lowStock: 'Low stock',
    outOfStock: 'Out of stock',
    distance: '{{km}} km away',
    price: '{{price}} AFN',
  },
  enrich: {
    restricted: 'Enrichment requires clinical or pharmacist role',
    localNames: 'Local Names',
    englishName: 'English name override',
    dariName: 'Dari name (\u062f\u0631\u06cc)',
    pharmacistFields: 'Pharmacist Fields',
    dispensingNotes: 'Dispensing notes (max 500 chars)',
    formularyStatus: 'Formulary status',
    onFormulary: 'on formulary',
    offFormulary: 'off formulary',
    restrictedStatus: 'restricted',
    unitCost: 'Unit cost (AFN)',
    saveError: 'Failed to save enrichment. Please try again.',
    saveSuccess: 'Saved successfully',
    save: 'Save',
  },
  profile: {
    role: 'Role',
    catalogSync: 'Catalog sync',
    neverSynced: 'Never synced',
    lastSynced: 'Last synced: {{date}} {{time}}',
    version: 'Version: {{number}}',
    syncing: 'Syncing\u2026',
    syncFailed: 'Sync failed',
    syncNow: 'Sync Now',
    logout: 'Log Out',
    facility: 'Facility: {{id}}',
    language: 'Language',
    languageRestartTitle: 'Restart Required',
    languageRestartMessage: 'Switching to an RTL language requires the app to reload. Continue?',
  },
  login: {
    title: 'Pharmopedia',
    clinicalStaff: 'Clinical Staff',
    patient: 'Patient',
    email: 'Email',
    password: 'Password',
    logIn: 'Log In',
    phone: '+93 70 000 0000',
    sendCode: 'Send Code',
    enterCode: 'Enter the code sent to {{phone}}',
    sixDigitCode: '6-digit code',
    verify: 'Verify',
    back: 'Back',
    loginFailed: 'Login failed',
    otpFailed: 'OTP verification failed',
  },
} as const

export default en
export type Translations = typeof en
```

- [ ] **Step 7: Create Dari locale**

Create `apps/pharmopedia/src/i18n/locales/prs.ts`:

> **Note:** These translations are machine-approximate. Have a native Dari speaker review before shipping.

```typescript
import type { Translations } from './en'

const prs: Translations = {
  tabs: { search: 'جستجو', profile: 'پروفایل' },
  search: {
    placeholder: 'دارو جستجو کنید\u2026',
    empty: 'به نام دارو، نام تجاری یا کد ATC جستجو کنید',
    lang: { en: 'EN', prs: 'دری', ps: 'پښتو', ar: 'عربي' },
  },
  sync: {
    syncing: 'کاتالوگ همگام‌سازی می‌شود\u2026',
    failed: 'همگام‌سازی ناموفق \u2014 داده‌های ذخیره‌شده نشان داده می‌شود',
    notSynced: 'کاتالوگ هنوز همگام نشده \u2014 به شبکه وصل شوید',
  },
  drug: {
    notFound: 'دارو یافت نشد',
    back: 'برگشت',
    tabs: { overview: 'مرور', clinical: 'بالینی', pricing: 'قیمت', enrich: 'تکمیل' },
    overview: {
      summary: 'خلاصه',
      usedFor: 'موارد استفاده',
      sideEffects: 'عوارض جانبی رایج',
      seekHelp: 'زمان مراجعه به پزشک',
      storage: 'نگهداری',
      pregnancy: 'بارداری',
      warnings: 'هشدارها',
    },
    clinical: {
      mechanism: 'مکانیسم اثر',
      indications: 'اندیکاسیون‌های بالینی',
      contraindications: 'موارد منع مصرف',
      adverseEvents: 'حوادث ناخواسته',
      adultDosing: 'دوز بزرگسالان',
      pregnancyCategory: 'رده بارداری',
      renalAdjustment: 'تعدیل کلیوی',
    },
  },
  pricing: {
    byDistance: 'بر اساس فاصله',
    byPrice: 'بر اساس قیمت',
    locationRequired: 'برای یافتن داروخانه‌های نزدیک اجازه دسترسی به موقعیت لازم است',
    unavailable: 'قیمت‌گذاری در دسترس نیست \u2014 اتصال را بررسی کنید',
    noResults: 'هیچ قیمت داروخانه‌ای در نزدیکی یافت نشد',
    retry: 'تلاش مجدد',
    inStock: 'موجود',
    lowStock: 'کم موجود',
    outOfStock: 'ناموجود',
    distance: '{{km}} کیلومتر دورتر',
    price: '{{price}} افغانی',
  },
  enrich: {
    restricted: 'تکمیل نیاز به نقش بالینی یا داروساز دارد',
    localNames: 'نام‌های محلی',
    englishName: 'نام انگلیسی جایگزین',
    dariName: 'نام دری (دری)',
    pharmacistFields: 'فیلدهای داروساز',
    dispensingNotes: 'یادداشت‌های توزیع (حداکثر ۵۰۰ کاراکتر)',
    formularyStatus: 'وضعیت فرمولاری',
    onFormulary: 'در فرمولاری',
    offFormulary: 'خارج از فرمولاری',
    restrictedStatus: 'محدود',
    unitCost: 'هزینه واحد (افغانی)',
    saveError: 'ذخیره‌سازی ناموفق. لطفاً دوباره امتحان کنید.',
    saveSuccess: 'با موفقیت ذخیره شد',
    save: 'ذخیره',
  },
  profile: {
    role: 'نقش',
    catalogSync: 'همگام‌سازی کاتالوگ',
    neverSynced: 'هرگز همگام نشده',
    lastSynced: 'آخرین همگام‌سازی: {{date}} {{time}}',
    version: 'نسخه: {{number}}',
    syncing: 'در حال همگام‌سازی\u2026',
    syncFailed: 'همگام‌سازی ناموفق',
    syncNow: 'همگام‌سازی',
    logout: 'خروج',
    facility: 'مرکز: {{id}}',
    language: 'زبان',
    languageRestartTitle: 'راه‌اندازی مجدد لازم است',
    languageRestartMessage: 'تغییر به زبان راست‌به‌چپ نیاز به بارگذاری مجدد برنامه دارد. ادامه می‌دهید؟',
  },
  login: {
    title: 'فارماپدیا',
    clinicalStaff: 'کارکنان بالینی',
    patient: 'بیمار',
    email: 'ایمیل',
    password: 'رمز عبور',
    logIn: 'ورود',
    phone: '\u200f+93 70 000 0000',
    sendCode: 'ارسال کد',
    enterCode: 'کد ارسال‌شده به {{phone}} را وارد کنید',
    sixDigitCode: 'کد ۶ رقمی',
    verify: 'تأیید',
    back: 'برگشت',
    loginFailed: 'ورود ناموفق',
    otpFailed: 'تأیید OTP ناموفق',
  },
}

export default prs
```

- [ ] **Step 8: Create Pashto locale**

Create `apps/pharmopedia/src/i18n/locales/ps.ts`:

> **Note:** These translations are machine-approximate. Have a native Pashto speaker review before shipping.

```typescript
import type { Translations } from './en'

const ps: Translations = {
  tabs: { search: 'لټون', profile: 'پروفایل' },
  search: {
    placeholder: 'دوا وپلټئ\u2026',
    empty: 'د دوا نوم، د تجارت نوم، یا د ATC کوډ له مخې وپلټئ',
    lang: { en: 'EN', prs: 'دری', ps: 'پښتو', ar: 'عربي' },
  },
  sync: {
    syncing: 'کاتالوګ سنک کیږي\u2026',
    failed: 'سنک ناکام شو \u2014 خوندي شوي معلومات ښودل کیږي',
    notSynced: 'کاتالوګ لا نه دی سنک شوی \u2014 شبکې سره وصل شئ',
  },
  drug: {
    notFound: 'دوا ونه موندل شوه',
    back: 'شاته',
    tabs: { overview: 'لنډیز', clinical: 'کلیني', pricing: 'نرخ', enrich: 'بشپړول' },
    overview: {
      summary: 'لنډیز',
      usedFor: 'د کارولو ځایونه',
      sideEffects: 'عمومي اغیزمن اثرات',
      seekHelp: 'د ډاکتر سره د مشورې وخت',
      storage: 'ساتل',
      pregnancy: 'د حمل دوره',
      warnings: 'خبرداری',
    },
    clinical: {
      mechanism: 'د کار میکانیزم',
      indications: 'کلیني اندیکیشنونه',
      contraindications: 'د کارولو منع',
      adverseEvents: 'ناغوښتل پیښې',
      adultDosing: 'د لویانو ډوز',
      pregnancyCategory: 'د حمل کټګوري',
      renalAdjustment: 'د پښتورګو تنظیم',
    },
  },
  pricing: {
    byDistance: 'د فاصلې له مخې',
    byPrice: 'د نرخ له مخې',
    locationRequired: 'د نږدې درمل پلورنځیو موندلو لپاره د موقعیت اجازه ورکړئ',
    unavailable: 'نرخ ونه موندل شو \u2014 خپله اتصال وګورئ',
    noResults: 'نږدې درمل پلورنځیو کې هیڅ نرخ ونه موندل شو',
    retry: 'بیا هڅه وکړئ',
    inStock: 'موجود',
    lowStock: 'لږ موجود',
    outOfStock: 'ناموجود',
    distance: '{{km}} کیلومتر لیرې',
    price: '{{price}} افغانۍ',
  },
  enrich: {
    restricted: 'بشپړولو لپاره کلیني یا داروساز رول ته اړتیا ده',
    localNames: 'سیمه‌ییز نومونه',
    englishName: 'انګلیسي نوم',
    dariName: 'دري نوم (دری)',
    pharmacistFields: 'د داروساز ډګرونه',
    dispensingNotes: 'د توزیع یادداشتونه (تر ۵۰۰ حرفو)',
    formularyStatus: 'د فارمولري حالت',
    onFormulary: 'فارمولري کې',
    offFormulary: 'فارمولري بهر',
    restrictedStatus: 'محدود',
    unitCost: 'د واحد لګښت (افغانۍ)',
    saveError: 'ذخیره ناموفقه وه. مهرباني وکړئ بیا هڅه وکړئ.',
    saveSuccess: 'بریالیتوب سره خوندي شو',
    save: 'خوندي کړئ',
  },
  profile: {
    role: 'رول',
    catalogSync: 'د کاتالوګ سنک',
    neverSynced: 'هیڅکله سنک نه دی شوی',
    lastSynced: 'وروستی سنک: {{date}} {{time}}',
    version: 'نسخه: {{number}}',
    syncing: 'سنک کیږي\u2026',
    syncFailed: 'سنک ناکام شو',
    syncNow: 'اوس سنک کړئ',
    logout: 'وتل',
    facility: 'مرکز: {{id}}',
    language: 'ژبه',
    languageRestartTitle: 'بیا پیل ته اړتیا ده',
    languageRestartMessage: 'د RTL ژبې ته بدلول د برنامې بیا لوډولو ته اړتیا لري. ادامه ورکوئ؟',
  },
  login: {
    title: 'فارماپیدیا',
    clinicalStaff: 'کلیني کارمندان',
    patient: 'ناروغ',
    email: 'برېښنالیک',
    password: 'پټنوم',
    logIn: 'ننوتل',
    phone: '\u200f+93 70 000 0000',
    sendCode: 'کوډ واستوئ',
    enterCode: '{{phone}} ته لیږل شوی کوډ دننه کړئ',
    sixDigitCode: '۶ رقمي کوډ',
    verify: 'تصدیق',
    back: 'شاته',
    loginFailed: 'ننوتل ناموفقه',
    otpFailed: 'د OTP تصدیق ناموفقه',
  },
}

export default ps
```

- [ ] **Step 9: Create Arabic locale**

Create `apps/pharmopedia/src/i18n/locales/ar.ts`:

> **Note:** These translations are machine-approximate. Have a native Arabic speaker review before shipping.

```typescript
import type { Translations } from './en'

const ar: Translations = {
  tabs: { search: 'بحث', profile: 'الملف الشخصي' },
  search: {
    placeholder: 'ابحث عن الدواء\u2026',
    empty: 'ابحث باسم الدواء أو الاسم التجاري أو رمز ATC',
    lang: { en: 'EN', prs: 'دری', ps: 'پښتو', ar: 'عربي' },
  },
  sync: {
    syncing: 'جارٍ مزامنة الكتالوج\u2026',
    failed: 'فشل المزامنة \u2014 يتم عرض البيانات المخزّنة',
    notSynced: 'لم تتم مزامنة الكتالوج بعد \u2014 اتصل بالشبكة',
  },
  drug: {
    notFound: 'الدواء غير موجود',
    back: 'رجوع',
    tabs: { overview: 'نظرة عامة', clinical: 'سريري', pricing: 'التسعير', enrich: 'إثراء' },
    overview: {
      summary: 'ملخص',
      usedFor: 'يُستخدم لـ',
      sideEffects: 'الآثار الجانبية الشائعة',
      seekHelp: 'متى تطلب المساعدة',
      storage: 'التخزين',
      pregnancy: 'الحمل',
      warnings: 'تحذيرات',
    },
    clinical: {
      mechanism: 'آلية العمل',
      indications: 'الدواعي السريرية',
      contraindications: 'موانع الاستعمال',
      adverseEvents: 'الأحداث الضارة',
      adultDosing: 'جرعات البالغين',
      pregnancyCategory: 'فئة الحمل',
      renalAdjustment: 'تعديل الكلى',
    },
  },
  pricing: {
    byDistance: 'حسب المسافة',
    byPrice: 'حسب السعر',
    locationRequired: 'إذن الموقع مطلوب للعثور على الصيدليات القريبة',
    unavailable: 'التسعير غير متاح \u2014 تحقق من اتصالك وأعد المحاولة',
    noResults: 'لم يتم العثور على أسعار صيدليات قريبة',
    retry: 'إعادة المحاولة',
    inStock: 'متوفر',
    lowStock: 'مخزون منخفض',
    outOfStock: 'غير متوفر',
    distance: '{{km}} كم بعيد',
    price: '{{price}} أفغاني',
  },
  enrich: {
    restricted: 'الإثراء يتطلب دور سريري أو صيدلاني',
    localNames: 'الأسماء المحلية',
    englishName: 'تجاوز الاسم الإنجليزي',
    dariName: 'الاسم الداري (دری)',
    pharmacistFields: 'حقول الصيدلاني',
    dispensingNotes: 'ملاحظات الصرف (حد أقصى 500 حرف)',
    formularyStatus: 'حالة القائمة الدوائية',
    onFormulary: 'في القائمة',
    offFormulary: 'خارج القائمة',
    restrictedStatus: 'مقيّد',
    unitCost: 'تكلفة الوحدة (أفغاني)',
    saveError: 'فشل الحفظ. يرجى المحاولة مجدداً.',
    saveSuccess: 'تم الحفظ بنجاح',
    save: 'حفظ',
  },
  profile: {
    role: 'الدور',
    catalogSync: 'مزامنة الكتالوج',
    neverSynced: 'لم تتم المزامنة قط',
    lastSynced: 'آخر مزامنة: {{date}} {{time}}',
    version: 'الإصدار: {{number}}',
    syncing: 'جارٍ المزامنة\u2026',
    syncFailed: 'فشل المزامنة',
    syncNow: 'مزامنة الآن',
    logout: 'تسجيل الخروج',
    facility: 'المنشأة: {{id}}',
    language: 'اللغة',
    languageRestartTitle: 'إعادة التشغيل مطلوبة',
    languageRestartMessage: 'يتطلب التبديل إلى لغة RTL إعادة تحميل التطبيق. هل تريد الاستمرار؟',
  },
  login: {
    title: 'فارموبيديا',
    clinicalStaff: 'الكوادر السريرية',
    patient: 'المريض',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    logIn: 'تسجيل الدخول',
    phone: '\u200f+93 70 000 0000',
    sendCode: 'إرسال الرمز',
    enterCode: 'أدخل الرمز المُرسَل إلى {{phone}}',
    sixDigitCode: 'رمز مكوّن من 6 أرقام',
    verify: 'تحقق',
    back: 'رجوع',
    loginFailed: 'فشل تسجيل الدخول',
    otpFailed: 'فشل التحقق من OTP',
  },
}

export default ar
```

- [ ] **Step 10: Run tests**

```bash
pnpm -F pharmopedia test src/__tests__/lang-store.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/pharmopedia/src/store/lang-store.ts apps/pharmopedia/src/i18n/ apps/pharmopedia/src/__tests__/lang-store.test.ts
git commit -m "feat(pharmopedia): lang store + i18n config + 4 locale files (en/prs/ps/ar)"
```

---

## Task 2: Root Layout — Font, RTL + i18n Init

**Files:**
- Add: `assets/fonts/NotoNaskhArabic-Regular.ttf`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Download NotoNaskhArabic font**

Download `NotoNaskhArabic-Regular.ttf` from Google Fonts:
https://fonts.google.com/noto/specimen/Noto+Naskh+Arabic

Place the file at:
```
apps/pharmopedia/assets/fonts/NotoNaskhArabic-Regular.ttf
```

Confirm with:
```bash
ls apps/pharmopedia/assets/fonts/
```

Expected output includes: `NotoNaskhArabic-Regular.ttf`

- [ ] **Step 2: Update root layout**

Replace `apps/pharmopedia/app/_layout.tsx` with:

```typescript
import { useEffect } from 'react'
import { Stack, Redirect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import { openDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useDeviceSecurityStore } from '@/stores/device-security-store'
import { useLangStore } from '@/store/lang-store'
import { initI18n } from '@/i18n'

export default function RootLayout() {
  const { isAuthenticated, initialized, initialize } = useAuthStore()
  const setSecurityResult = useDeviceSecurityStore((s) => s.setResult)
  const langInit = useLangStore((s) => s.init)
  const langInitialized = useLangStore((s) => s.initialized)

  const [fontsLoaded] = useFonts({
    NotoNaskhArabic: require('../assets/fonts/NotoNaskhArabic-Regular.ttf'),
  })

  useEffect(() => {
    async function init() {
      setSecurityResult({ isCompromised: false, reasons: [] })
      await openDatabase()
      await langInit()
      initI18n(useLangStore.getState().lang)
      initialize()
    }
    init()
  }, [])

  if (!initialized || !langInitialized || !fontsLoaded) return null

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="drug/[atcCode]" options={{ headerShown: true, title: '' }} />
      </Stack>
      {!isAuthenticated && <Redirect href="/(auth)/login" />}
    </>
  )
}
```

- [ ] **Step 3: Verify app starts without error**

```bash
pnpm -F pharmopedia start
```

Expected: Metro bundler starts, no TypeScript errors on the modified file.

- [ ] **Step 4: Commit**

```bash
git add apps/pharmopedia/app/_layout.tsx apps/pharmopedia/assets/fonts/
git commit -m "feat(pharmopedia): wire lang store + i18n + Noto font into root layout"
```

---

## Task 3: SearchBar + SearchTab + SyncStatusBanner

**Files:**
- Modify: `src/components/SearchBar.tsx`
- Modify: `app/(tabs)/index.tsx`
- Modify: `src/components/SyncStatusBanner.tsx`
- Create: `src/__tests__/search-bar-i18n.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/search-bar-i18n.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { SearchBar } from '@/components/SearchBar'

vi.mock('@/store/lang-store', () => {
  const store = { lang: 'en' as const, setLang: vi.fn() }
  return {
    useLangStore: (selector: (s: typeof store) => unknown) => selector(store),
    isRtlLang: (lang: string) => ['prs', 'ps', 'ar'].includes(lang),
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'search.placeholder': 'Search drugs\u2026',
      'search.lang.en': 'EN',
      'search.lang.prs': 'دری',
      'search.lang.ps': 'پښتو',
      'search.lang.ar': 'عربي',
    }[key] ?? key),
  }),
}))

describe('SearchBar', () => {
  it('renders all four language buttons', () => {
    render(<SearchBar value="" onSearch={vi.fn()} />)
    expect(screen.getByTestId('lang-en')).toBeTruthy()
    expect(screen.getByTestId('lang-prs')).toBeTruthy()
    expect(screen.getByTestId('lang-ps')).toBeTruthy()
    expect(screen.getByTestId('lang-ar')).toBeTruthy()
  })

  it('shows Arabic label عربي for ar button', () => {
    render(<SearchBar value="" onSearch={vi.fn()} />)
    expect(screen.getByText('عربي')).toBeTruthy()
  })

  it('uses translated placeholder', () => {
    render(<SearchBar value="" onSearch={vi.fn()} />)
    expect(screen.getByPlaceholderText('Search drugs\u2026')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm -F pharmopedia test src/__tests__/search-bar-i18n.test.tsx
```

Expected: FAIL — `lang-ar` not found, SearchBar still uses props not store.

- [ ] **Step 3: Rewrite SearchBar**

Replace `apps/pharmopedia/src/components/SearchBar.tsx`:

```typescript
import { useEffect, useRef } from 'react'
import { View, TextInput, Pressable, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useLangStore, isRtlLang, type Lang } from '@/store/lang-store'

const LANGS: Lang[] = ['en', 'prs', 'ps', 'ar']

interface Props {
  value: string
  onSearch: (q: string) => void
}

export function SearchBar({ value, onSearch }: Props) {
  const { t } = useTranslation()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRtl = isRtlLang(lang)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onSearch(value), 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value, onSearch])

  return (
    <View style={styles.container}>
      <TextInput
        testID="search-input"
        style={[styles.input, isRtl && styles.inputRtl]}
        placeholder={t('search.placeholder')}
        value={value}
        onChangeText={(text) => onSearch(text)}
        autoCorrect={false}
        autoCapitalize="none"
        textAlign={isRtl ? 'right' : 'left'}
      />
      <View style={styles.langs}>
        {LANGS.map((l) => (
          <Pressable
            key={l}
            testID={`lang-${l}`}
            style={[styles.langBtn, lang === l && styles.langBtnActive]}
            onPress={() => void setLang(l)}
          >
            <Text style={[styles.langText, lang === l && styles.langTextActive]}>
              {t(`search.lang.${l}`)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 8 },
  inputRtl: { fontFamily: 'NotoNaskhArabic' },
  langs: { flexDirection: 'row', gap: 8 },
  langBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' },
  langBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  langText: { fontSize: 13, color: '#374151' },
  langTextActive: { color: '#fff' },
})
```

- [ ] **Step 4: Update SearchTab to remove local lang state**

Replace `apps/pharmopedia/app/(tabs)/index.tsx`:

```typescript
import { useState, useCallback } from 'react'
import { View, FlatList, Text, StyleSheet, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SearchBar } from '@/components/SearchBar'
import { SyncStatusBanner } from '@/components/SyncStatusBanner'
import { DrugCard } from '@/components/DrugCard'
import { searchDrugs } from '@/db/fts'
import { searchDrugsApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore } from '@/store/lang-store'
import type { DrugSearchResult } from '@ultranos/shared-types'

export default function SearchTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const lang = useLangStore((s) => s.lang)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DrugSearchResult[]>([])

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }

    if (lastVersion > 0) {
      try {
        const db = getDatabase()
        const rows = await searchDrugs(db, q, lang, 50)
        setResults(rows)
      } catch {
        setResults([])
      }
    } else if (token) {
      try {
        const rows = await searchDrugsApi(q, lang, 20, token)
        setResults(rows)
      } catch {
        setResults([])
      }
    }
  }, [lastVersion, lang, token])

  return (
    <SafeAreaView style={styles.container}>
      <SearchBar value={query} onSearch={handleSearch} />
      <SyncStatusBanner />
      {results.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('search.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item, index) => `${item.atcCode}-${index}`}
          renderItem={({ item }) => (
            <DrugCard
              result={item}
              lang={lang}
              onPress={() => router.push(`/drug/${item.atcCode}`)}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#6b7280', textAlign: 'center', fontSize: 15 },
})
```

- [ ] **Step 5: Update SyncStatusBanner**

Replace `apps/pharmopedia/src/components/SyncStatusBanner.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSyncStore } from '@/store/sync-store'

export function SyncStatusBanner() {
  const { t } = useTranslation()
  const { status, lastSyncAt } = useSyncStore()

  if (status === 'syncing') {
    return (
      <View style={[styles.banner, styles.syncing]}>
        <Text style={styles.text}>{t('sync.syncing')}</Text>
      </View>
    )
  }

  if (status === 'error') {
    return (
      <View style={[styles.banner, styles.error]}>
        <Text style={styles.text}>{t('sync.failed')}</Text>
      </View>
    )
  }

  if (!lastSyncAt) {
    return (
      <View style={[styles.banner, styles.warning]}>
        <Text style={styles.text}>{t('sync.notSynced')}</Text>
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 16, paddingVertical: 8 },
  syncing: { backgroundColor: '#dbeafe' },
  error: { backgroundColor: '#fee2e2' },
  warning: { backgroundColor: '#fef9c3' },
  text: { fontSize: 13, textAlign: 'center' },
})
```

- [ ] **Step 6: Run tests**

```bash
pnpm -F pharmopedia test src/__tests__/search-bar-i18n.test.tsx
```

Expected: All 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/src/components/SearchBar.tsx apps/pharmopedia/app/\(tabs\)/index.tsx apps/pharmopedia/src/components/SyncStatusBanner.tsx apps/pharmopedia/src/__tests__/search-bar-i18n.test.tsx
git commit -m "feat(pharmopedia): SearchBar reads global lang store, adds Arabic button, i18n strings"
```

---

## Task 4: DrugCard — Local-Name-as-Primary-Title

**Files:**
- Modify: `src/components/DrugCard.tsx`
- Create: `src/__tests__/drug-card-local-name.test.tsx`

When `lang !== 'en'` and `result.localName` is set, the local name is displayed as the primary title and the INN name is demoted to a smaller subtitle. For RTL languages, Arabic font is applied.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/drug-card-local-name.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { DrugCard } from '@/components/DrugCard'
import type { DrugSearchResult } from '@ultranos/shared-types'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

const BASE: DrugSearchResult = {
  atcCode: 'J01CA04',
  innName: 'Amoxicillin',
  brandNames: [],
  therapeuticClass: 'Antibacterials',
  doseForms: ['Capsule 500mg'],
  localName: undefined,
}

describe('DrugCard — local-name-as-primary-title', () => {
  it('shows INN as primary when no localName', () => {
    render(<DrugCard result={BASE} lang="en" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-primary-name').props.children).toBe('Amoxicillin')
    expect(screen.queryByTestId('drug-secondary-name')).toBeNull()
  })

  it('shows INN as primary when lang is en even with localName', () => {
    render(<DrugCard result={{ ...BASE, localName: 'Amox Local' }} lang="en" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-primary-name').props.children).toBe('Amoxicillin')
  })

  it('promotes localName to primary and INN to subtitle when lang is prs', () => {
    render(<DrugCard result={{ ...BASE, localName: 'آموکسیسیلین' }} lang="prs" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-primary-name').props.children).toBe('آموکسیسیلین')
    expect(screen.getByTestId('drug-secondary-name').props.children).toBe('Amoxicillin')
  })

  it('promotes localName when lang is ar', () => {
    render(<DrugCard result={{ ...BASE, localName: 'أموكسيسيلين' }} lang="ar" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-primary-name').props.children).toBe('أموكسيسيلين')
  })

  it('falls back to INN as primary when lang is prs but localName is absent', () => {
    render(<DrugCard result={BASE} lang="prs" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-primary-name').props.children).toBe('Amoxicillin')
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm -F pharmopedia test src/__tests__/drug-card-local-name.test.tsx
```

Expected: FAIL — `drug-primary-name` testID not found.

- [ ] **Step 3: Rewrite DrugCard**

Replace `apps/pharmopedia/src/components/DrugCard.tsx`:

```typescript
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { DrugSearchResult } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'

interface Props {
  result: DrugSearchResult
  lang: Lang
  onPress: () => void
}

export function DrugCard({ result, lang, onPress }: Props) {
  const useLocal = lang !== 'en' && !!result.localName
  const primaryName = useLocal ? result.localName! : result.innName
  const secondaryName = useLocal ? result.innName : undefined
  const isRtl = isRtlLang(lang)

  return (
    <Pressable style={styles.card} onPress={onPress} testID={`drug-card-${result.atcCode}`}>
      <View style={styles.row}>
        <Text
          testID="drug-primary-name"
          style={[styles.primaryName, isRtl && styles.rtlText]}
          numberOfLines={1}
        >
          {primaryName}
        </Text>
        <Text style={styles.atcCode}>{result.atcCode}</Text>
      </View>
      {secondaryName && (
        <Text testID="drug-secondary-name" style={styles.secondaryName}>{secondaryName}</Text>
      )}
      <Text style={styles.meta}>
        {result.therapeuticClass}{result.doseForms.length > 0 ? ` • ${result.doseForms.join(', ')}` : ''}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  primaryName: { fontSize: 16, fontWeight: '600', color: '#111827', flex: 1 },
  secondaryName: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  atcCode: { fontSize: 13, color: '#6b7280', marginStart: 8 },
  rtlText: { fontFamily: 'NotoNaskhArabic', textAlign: 'right' },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 4 },
})
```

- [ ] **Step 4: Run tests**

```bash
pnpm -F pharmopedia test src/__tests__/drug-card-local-name.test.tsx
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/components/DrugCard.tsx apps/pharmopedia/src/__tests__/drug-card-local-name.test.tsx
git commit -m "feat(pharmopedia): DrugCard promotes localName to primary title in non-English langs"
```

---

## Task 5: DrugDetail Screen + OverviewTab + ClinicalTab

**Files:**
- Modify: `app/drug/[atcCode].tsx`
- Modify: `src/components/DrugDetail/OverviewTab.tsx`
- Modify: `src/components/DrugDetail/ClinicalTab.tsx`
- Create: `src/__tests__/drug-detail-i18n.test.tsx`

`DrugDetailScreen` currently hardcodes `lang = 'en'`. This task connects it to the global store, translates tab labels, and updates `OverviewTab`/`ClinicalTab` section titles to use `t()`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/drug-detail-i18n.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { OverviewTab } from '@/components/DrugDetail/OverviewTab'
import type { DrugEntryTier1 } from '@ultranos/shared-types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'drug.overview.summary': 'Summary',
      'drug.overview.usedFor': 'Used for',
      'drug.overview.sideEffects': 'Common side effects',
      'drug.overview.seekHelp': 'When to seek help',
      'drug.overview.storage': 'Storage',
      'drug.overview.pregnancy': 'Pregnancy',
      'drug.overview.warnings': 'Warnings',
    }[key] ?? key),
  }),
}))

vi.mock('@/store/lang-store', () => ({
  isRtlLang: () => false,
}))

const ENTRY: DrugEntryTier1 = {
  atcCode: 'J01CA04',
  innName: 'Amoxicillin',
  therapeuticClass: 'Antibacterials',
  doseForms: ['Capsule 500mg'],
  brandNames: [],
  summaryPlain: { en: 'A broad-spectrum antibiotic.' },
  usedFor: [{ en: 'Bacterial infections' }],
  commonSideEffects: [{ en: 'Nausea' }],
  whenToSeekHelp: { en: 'Severe rash' },
  storageInstructions: { en: 'Room temperature' },
  pregnancySummaryPlain: { en: 'Category B' },
  warningsSummaryPlain: { en: 'Allergy risk' },
}

describe('OverviewTab — i18n section titles', () => {
  it('renders Summary section title from t()', () => {
    render(<OverviewTab entry={ENTRY} lang="en" />)
    expect(screen.getByText('Summary')).toBeTruthy()
  })

  it('renders Used for section', () => {
    render(<OverviewTab entry={ENTRY} lang="en" />)
    expect(screen.getByText('Used for')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm -F pharmopedia test src/__tests__/drug-detail-i18n.test.tsx
```

Expected: FAIL — OverviewTab does not use `t()` yet.

- [ ] **Step 3: Update OverviewTab**

Replace `apps/pharmopedia/src/components/DrugDetail/OverviewTab.tsx`:

```typescript
import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier1 } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'

function localText(field: Record<string, string | undefined>, lang: Lang): string {
  return field[lang] ?? field.en ?? ''
}

export function OverviewTab({ entry, lang }: { entry: DrugEntryTier1; lang: Lang }) {
  const { t } = useTranslation()
  const isRtl = isRtlLang(lang)
  const textStyle = isRtl ? styles.rtlText : undefined

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.summaryPlain && localText(entry.summaryPlain, lang) ? (
        <Section title={t('drug.overview.summary')} text={localText(entry.summaryPlain, lang)} isRtl={isRtl} />
      ) : null}
      {entry.usedFor.length > 0 && (
        <Section title={t('drug.overview.usedFor')} items={entry.usedFor.map(f => localText(f, lang)).filter(Boolean)} isRtl={isRtl} />
      )}
      {entry.commonSideEffects.length > 0 && (
        <Section title={t('drug.overview.sideEffects')} items={entry.commonSideEffects.map(f => localText(f, lang)).filter(Boolean)} isRtl={isRtl} />
      )}
      {localText(entry.whenToSeekHelp, lang) ? (
        <Section title={t('drug.overview.seekHelp')} text={localText(entry.whenToSeekHelp, lang)} isRtl={isRtl} />
      ) : null}
      {localText(entry.storageInstructions, lang) ? (
        <Section title={t('drug.overview.storage')} text={localText(entry.storageInstructions, lang)} isRtl={isRtl} />
      ) : null}
      {localText(entry.pregnancySummaryPlain, lang) ? (
        <Section title={t('drug.overview.pregnancy')} text={localText(entry.pregnancySummaryPlain, lang)} isRtl={isRtl} />
      ) : null}
      {localText(entry.warningsSummaryPlain, lang) ? (
        <Section title={t('drug.overview.warnings')} text={localText(entry.warningsSummaryPlain, lang)} isRtl={isRtl} />
      ) : null}
    </ScrollView>
  )
}

function Section({ title, text, items, isRtl }: { title: string; text?: string; items?: string[]; isRtl: boolean }) {
  const contentStyle = isRtl ? styles.rtlText : undefined
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {text && <Text style={[styles.sectionText, contentStyle]}>{text}</Text>}
      {items?.map((item, i) => <Text key={i} style={[styles.item, contentStyle]}>• {item}</Text>)}
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionText: { fontSize: 15, color: '#111827', lineHeight: 22 },
  item: { fontSize: 15, color: '#111827', lineHeight: 22 },
  rtlText: { fontFamily: 'NotoNaskhArabic', textAlign: 'right' },
})
```

- [ ] **Step 4: Update ClinicalTab**

Replace `apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx`:

```typescript
import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier2 } from '@ultranos/shared-types'

export function ClinicalTab({ entry }: { entry: DrugEntryTier2 }) {
  const { t } = useTranslation()

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.mechanismOfAction && (
        <Section title={t('drug.clinical.mechanism')} text={entry.mechanismOfAction} />
      )}
      {entry.indicationsClinical.length > 0 && (
        <Section title={t('drug.clinical.indications')} items={entry.indicationsClinical} />
      )}
      {entry.contraindications.length > 0 && (
        <Section title={t('drug.clinical.contraindications')} items={entry.contraindications} />
      )}
      {entry.adverseEvents.length > 0 && (
        <Section title={t('drug.clinical.adverseEvents')} items={entry.adverseEvents.map(e => e.effect)} />
      )}
      {entry.adultDosing.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('drug.clinical.adultDosing')}</Text>
          {entry.adultDosing.map((d, i) => (
            <Text key={i} style={styles.dosing}>
              {d.indication}: {d.adultDose} {d.frequency}{d.route ? ` (${d.route})` : ''}
            </Text>
          ))}
        </View>
      )}
      {entry.pregnancyCategory && (
        <Section title={t('drug.clinical.pregnancyCategory')} text={`Category ${entry.pregnancyCategory}`} />
      )}
      {entry.renalAdjustment && (
        <Section title={t('drug.clinical.renalAdjustment')} text={entry.renalAdjustment} />
      )}
    </ScrollView>
  )
}

function Section({ title, text, items }: { title: string; text?: string; items?: string[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {text && <Text style={styles.text}>{text}</Text>}
      {items?.map((item, i) => <Text key={i} style={styles.text}>• {item}</Text>)}
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
})
```

- [ ] **Step 5: Update DrugDetailScreen**

Replace `apps/pharmopedia/app/drug/[atcCode].tsx`:

```typescript
import { useState, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, SafeAreaView } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getDrugRowByAtcCode, scopeEntryForRole } from '@/db/drug-catalog'
import { getDrugByAtcCodeApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { OverviewTab } from '@/components/DrugDetail/OverviewTab'
import { ClinicalTab } from '@/components/DrugDetail/ClinicalTab'
import { PricingTab } from '@/components/DrugDetail/PricingTab'
import { EnrichTab } from '@/components/DrugDetail/EnrichTab'
import type { DrugEntryTier1, DrugEntryTier2, DrugEntryTier3 } from '@ultranos/shared-types'

const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH', 'PHARMACIST', 'ADMIN'])
type Tab = 'overview' | 'clinical' | 'pricing' | 'enrich'

export default function DrugDetailScreen() {
  const { t } = useTranslation()
  const { atcCode } = useLocalSearchParams<{ atcCode: string }>()
  const router = useRouter()
  const { token, user } = useAuthStore()
  const lang = useLangStore((s) => s.lang)
  const role = user?.role ?? 'PATIENT'
  const isClinical = CLINICAL_ROLES.has(role)
  const isRtl = isRtlLang(lang)

  const [entry, setEntry] = useState<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3 | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const TABS: Tab[] = ['overview', ...(isClinical ? ['clinical' as Tab] : []), 'pricing', ...(isClinical ? ['enrich' as Tab] : [])]

  const TAB_LABELS: Record<Tab, string> = {
    overview: t('drug.tabs.overview'),
    clinical: t('drug.tabs.clinical'),
    pricing: t('drug.tabs.pricing'),
    enrich: t('drug.tabs.enrich'),
  }

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
      if (token) { const apiEntry = await getDrugByAtcCodeApi(code, token); setEntry(apiEntry) }
    } catch {
      // entry stays null → renders "Drug not found"
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>
  }

  if (!entry) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>{t('drug.notFound')}</Text>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>{t('drug.back')}</Text></Pressable>
      </View>
    )
  }

  // Resolve primary display name: localNames record takes precedence in non-English langs
  const localNames = (entry as DrugEntryTier1 & { localNames?: Record<string, string> }).localNames
  const useLocal = lang !== 'en' && !!localNames?.[lang]
  const primaryName = useLocal ? localNames![lang] : entry.innName
  const secondaryName = useLocal ? entry.innName : undefined

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.primaryName, isRtl && styles.rtlText]}>{primaryName}</Text>
        {secondaryName && <Text style={styles.secondaryName}>{secondaryName}</Text>}
        <Text style={styles.subheader}>{entry.atcCode} · {entry.therapeuticClass}</Text>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            testID={`tab-${tab}`}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {TAB_LABELS[tab]}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.content}>
        {activeTab === 'overview' && <OverviewTab entry={entry} lang={lang} />}
        {activeTab === 'clinical' && isClinical && <ClinicalTab entry={entry as DrugEntryTier2} />}
        {activeTab === 'pricing' && <PricingTab atcCode={entry.atcCode} />}
        {activeTab === 'enrich' && isClinical && <EnrichTab atcCode={entry.atcCode} />}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  primaryName: { fontSize: 22, fontWeight: '700', color: '#111827', textTransform: 'capitalize' },
  secondaryName: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  subheader: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  rtlText: { fontFamily: 'NotoNaskhArabic', textAlign: 'right' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { paddingHorizontal: 18, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#2563eb' },
  tabText: { fontSize: 15, color: '#6b7280' },
  tabTextActive: { color: '#2563eb', fontWeight: '600' },
  content: { flex: 1 },
  notFound: { fontSize: 18, color: '#374151', marginBottom: 12 },
  back: { color: '#2563eb', fontSize: 16 },
})
```

Note: The tab bar is changed from `ScrollView horizontal` to `View flexDirection:row` — the 4 tabs fit without scroll. Revert to `ScrollView` if more tabs are added in future.

- [ ] **Step 6: Run tests**

```bash
pnpm -F pharmopedia test src/__tests__/drug-detail-i18n.test.tsx
```

Expected: All 2 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/app/drug/ apps/pharmopedia/src/components/DrugDetail/OverviewTab.tsx apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx apps/pharmopedia/src/__tests__/drug-detail-i18n.test.tsx
git commit -m "feat(pharmopedia): DrugDetail reads global lang, localName header, i18n section titles"
```

---

## Task 6: PricingTab + PriceCard + EnrichTab

**Files:**
- Modify: `src/components/DrugDetail/PricingTab.tsx`
- Modify: `src/components/PriceCard.tsx`
- Modify: `src/components/DrugDetail/EnrichTab.tsx`

No new tests for this task — these components are pure string substitutions with no new behaviour. Existing integration smoke tests catch regressions.

- [ ] **Step 1: Update PricingTab**

Replace `apps/pharmopedia/src/components/DrugDetail/PricingTab.tsx`:

```typescript
import { useState, useEffect, useRef } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import * as Location from 'expo-location'
import { useTranslation } from 'react-i18next'
import { getDrugPricesApi } from '@/api/drug-catalog'
import { useAuthStore } from '@/store/auth-store'
import { PriceCard } from '@/components/PriceCard'
import type { PharmacyPrice } from '@ultranos/shared-types'

type Sort = 'distance' | 'price'

export function PricingTab({ atcCode }: { atcCode: string }) {
  const { t } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const [prices, setPrices] = useState<PharmacyPrice[]>([])
  const [sort, setSort] = useState<Sort>('distance')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null)

  useEffect(() => {
    loadPrices()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, atcCode])

  async function loadPrices() {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      if (!coordsRef.current) {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          setError(t('pricing.locationRequired'))
          setLoading(false)
          return
        }
        const loc = await Location.getCurrentPositionAsync({})
        coordsRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
      }
      const { latitude, longitude } = coordsRef.current
      const results = await getDrugPricesApi(atcCode, latitude, longitude, sort, 10, token)
      setPrices(results)
    } catch {
      setError(t('pricing.unavailable'))
    }
    setLoading(false)
  }

  return (
    <View style={styles.container}>
      <View style={styles.sortRow}>
        <Pressable
          style={[styles.sortBtn, sort === 'distance' && styles.sortBtnActive]}
          onPress={() => setSort('distance')}
        >
          <Text style={[styles.sortText, sort === 'distance' && styles.sortTextActive]}>
            {t('pricing.byDistance')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.sortBtn, sort === 'price' && styles.sortBtnActive]}
          onPress={() => setSort('price')}
        >
          <Text style={[styles.sortText, sort === 'price' && styles.sortTextActive]}>
            {t('pricing.byPrice')}
          </Text>
        </Pressable>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 32 }} />}

      {!loading && error && (
        <View style={styles.errorBox} testID="pricing-error">
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => { coordsRef.current = null; loadPrices() }} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('pricing.retry')}</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && prices.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('pricing.noResults')}</Text>
        </View>
      )}

      {!loading && !error && prices.length > 0 && (
        <FlatList
          data={prices}
          keyExtractor={(item) => item.facilityId}
          renderItem={({ item }) => <PriceCard price={item} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sortRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' },
  sortBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  sortText: { fontSize: 14, color: '#374151' },
  sortTextActive: { color: '#fff' },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#dc2626', textAlign: 'center', marginBottom: 12 },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#2563eb', borderRadius: 6 },
  retryText: { color: '#fff', fontWeight: '600' },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#6b7280' },
})
```

- [ ] **Step 2: Update PriceCard**

Replace `apps/pharmopedia/src/components/PriceCard.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { PharmacyPrice } from '@ultranos/shared-types'

export function PriceCard({ price }: { price: PharmacyPrice }) {
  const { t } = useTranslation()

  const stockKey = {
    in_stock: 'pricing.inStock',
    low_stock: 'pricing.lowStock',
    out_of_stock: 'pricing.outOfStock',
  }[price.stockSignal]

  const stockColor = {
    in_stock: '#15803d',
    low_stock: '#92400e',
    out_of_stock: '#b91c1c',
  }[price.stockSignal]

  return (
    <View style={styles.card} testID={`price-card-${price.facilityId}`}>
      <View style={styles.row}>
        <Text style={styles.pharmacy}>{price.pharmacyName}</Text>
        <Text style={styles.priceText}>{t('pricing.price', { price: price.retailPrice.toFixed(2) })}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.distance}>{t('pricing.distance', { km: price.distanceKm.toFixed(1) })}</Text>
        <Text style={[styles.stock, { color: stockColor }]}>{t(stockKey)}</Text>
      </View>
      {price.doseForm && (
        <Text style={styles.meta}>{price.doseForm}{price.quantity ? ` × ${price.quantity}` : ''}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pharmacy: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  priceText: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  distance: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  stock: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 4 },
})
```

- [ ] **Step 3: Update EnrichTab**

Replace `apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx`:

```typescript
import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import { enrichDrugApi, type EnrichFields } from '@/api/drug-catalog'
import { upsertDrugBatch } from '@/db/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'

const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])
const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH'])

type FormularyStatus = 'on_formulary' | 'off_formulary' | 'restricted'

export function EnrichTab({ atcCode }: { atcCode: string }) {
  const { t } = useTranslation()
  const { token, user } = useAuthStore()
  const role = user?.role ?? ''
  const isClinical = CLINICAL_ROLES.has(role) || PHARMACIST_ROLES.has(role)
  const isPharmacist = PHARMACIST_ROLES.has(role)

  const [localNameEn, setLocalNameEn] = useState('')
  const [localNamePrs, setLocalNamePrs] = useState('')
  const [dispensingNotes, setDispensingNotes] = useState('')
  const [formularyStatus, setFormularyStatus] = useState<FormularyStatus | ''>('')
  const [unitCost, setUnitCost] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isClinical) {
    return (
      <View style={styles.restricted}>
        <Text style={styles.restrictedText}>{t('enrich.restricted')}</Text>
      </View>
    )
  }

  async function handleSubmit() {
    if (!token) return
    setLoading(true)
    setError(null)
    setSuccess(false)
    try {
      const fields: EnrichFields = {}
      const localNames: Record<string, string> = {}
      if (localNameEn) localNames.en = localNameEn
      if (localNamePrs) localNames.prs = localNamePrs
      if (Object.keys(localNames).length > 0) fields.localNames = localNames
      if (isPharmacist) {
        if (dispensingNotes) fields.dispensingNotes = dispensingNotes
        if (formularyStatus) fields.formularyStatus = formularyStatus as FormularyStatus
        if (unitCost) fields.unitCost = parseFloat(unitCost)
      }
      const updated = await enrichDrugApi(atcCode, fields, token)
      await upsertDrugBatch(getDatabase(), [updated])
      setSuccess(true)
    } catch {
      setError(t('enrich.saveError'))
    }
    setLoading(false)
  }

  const formularyOptions: { value: FormularyStatus; labelKey: string }[] = [
    { value: 'on_formulary', labelKey: 'enrich.onFormulary' },
    { value: 'off_formulary', labelKey: 'enrich.offFormulary' },
    { value: 'restricted', labelKey: 'enrich.restrictedStatus' },
  ]

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>{t('enrich.localNames')}</Text>
      <TextInput testID="local-name-en" style={styles.input} placeholder={t('enrich.englishName')} value={localNameEn} onChangeText={setLocalNameEn} />
      <TextInput testID="local-name-prs" style={styles.input} placeholder={t('enrich.dariName')} value={localNamePrs} onChangeText={setLocalNamePrs} />

      {isPharmacist && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{t('enrich.pharmacistFields')}</Text>
          <TextInput testID="dispensing-notes" style={[styles.input, styles.multiline]} placeholder={t('enrich.dispensingNotes')} value={dispensingNotes} onChangeText={setDispensingNotes} multiline maxLength={500} />

          <Text style={styles.label}>{t('enrich.formularyStatus')}</Text>
          <View style={styles.formularyRow}>
            {formularyOptions.map(({ value, labelKey }) => (
              <Pressable
                key={value}
                testID={`formulary-${value}`}
                style={[styles.formularyBtn, formularyStatus === value && styles.formularyBtnActive]}
                onPress={() => setFormularyStatus(value)}
              >
                <Text style={[styles.formularyText, formularyStatus === value && styles.formularyTextActive]}>
                  {t(labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput testID="unit-cost" style={styles.input} placeholder={t('enrich.unitCost')} value={unitCost} onChangeText={setUnitCost} keyboardType="decimal-pad" />
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {success && <Text style={styles.successText}>{t('enrich.saveSuccess')}</Text>}

      <Pressable testID="enrich-submit" style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('enrich.save')}</Text>}
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  restricted: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  restrictedText: { color: '#6b7280', textAlign: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  label: { fontSize: 14, color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 12 },
  multiline: { height: 80, textAlignVertical: 'top' },
  formularyRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  formularyBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' },
  formularyBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  formularyText: { fontSize: 13, color: '#374151' },
  formularyTextActive: { color: '#fff' },
  error: { color: '#dc2626', marginBottom: 8 },
  successText: { color: '#15803d', marginBottom: 8 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
```

- [ ] **Step 4: Run all tests**

```bash
pnpm -F pharmopedia test
```

Expected: All tests PASS (new tests from Tasks 1–4 included).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/components/DrugDetail/PricingTab.tsx apps/pharmopedia/src/components/PriceCard.tsx apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx
git commit -m "feat(pharmopedia): i18n PricingTab, PriceCard, EnrichTab strings"
```

---

## Task 7: Profile Language Selector + Login + Tabs Layout

**Files:**
- Modify: `app/(tabs)/profile.tsx`
- Modify: `app/(tabs)/_layout.tsx`
- Modify: `app/(auth)/login.tsx`
- Create: `src/__tests__/profile-lang-selector.test.tsx`

The Profile tab gains a new "Language" section with four buttons (EN / دری / پښتو / عربي). Selecting a non-RTL language updates immediately; switching RTL direction shows an Alert and then calls `setLang` (which triggers `Updates.reloadAsync`).

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/profile-lang-selector.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import ProfileTab from '@/app/(tabs)/profile'

const mockSetLang = vi.fn().mockResolvedValue(undefined)
vi.mock('@/store/lang-store', () => ({
  useLangStore: (selector: (s: { lang: string; setLang: typeof mockSetLang }) => unknown) =>
    selector({ lang: 'en', setLang: mockSetLang }),
  isRtlLang: (lang: string) => ['prs', 'ps', 'ar'].includes(lang),
}))

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector: (s: { user: null; token: null; logout: () => Promise<void> }) => unknown) =>
    selector({ user: null, token: null, logout: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('@/store/sync-store', () => ({
  useSyncStore: (selector: (s: { status: string; lastSyncAt: null; lastVersion: number; setStatus: () => void; setLastSync: () => void }) => unknown) =>
    selector({ status: 'idle', lastSyncAt: null, lastVersion: 0, setStatus: vi.fn(), setLastSync: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'profile.language': 'Language',
        'profile.syncNow': 'Sync Now',
        'profile.logout': 'Log Out',
        'profile.neverSynced': 'Never synced',
        'profile.languageRestartTitle': 'Restart Required',
        'profile.languageRestartMessage': 'Switching to an RTL language requires the app to reload. Continue?',
      }
      let str = map[key] ?? key
      if (opts) Object.entries(opts).forEach(([k, v]) => { str = str.replace(`{{${k}}}`, String(v)) })
      return str
    },
  }),
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/sync/catalog-sync', () => ({ runSync: vi.fn() }))
vi.mock('@/db/migrations', () => ({ getDatabase: vi.fn() }))
vi.mock('@/components/RoleBadge', () => ({ RoleBadge: () => null }))

describe('Profile — language selector', () => {
  beforeEach(() => { mockSetLang.mockClear() })

  it('renders a Language section with 4 buttons', () => {
    render(<ProfileTab />)
    expect(screen.getByText('Language')).toBeTruthy()
    expect(screen.getByTestId('lang-btn-en')).toBeTruthy()
    expect(screen.getByTestId('lang-btn-prs')).toBeTruthy()
    expect(screen.getByTestId('lang-btn-ps')).toBeTruthy()
    expect(screen.getByTestId('lang-btn-ar')).toBeTruthy()
  })

  it('calls setLang immediately for same-script change (en→ps is RTL, shows alert)', async () => {
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'OK' || b.style !== 'cancel')?.onPress?.()
    })
    render(<ProfileTab />)
    fireEvent.press(screen.getByTestId('lang-btn-ps'))
    await waitFor(() => expect(mockSetLang).toHaveBeenCalledWith('ps'))
    alertSpy.mockRestore()
  })

  it('calls setLang directly for en→en (no-op, same RTL direction)', async () => {
    render(<ProfileTab />)
    // Pressing the already-selected lang still calls setLang
    fireEvent.press(screen.getByTestId('lang-btn-en'))
    await waitFor(() => expect(mockSetLang).toHaveBeenCalledWith('en'))
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm -F pharmopedia test src/__tests__/profile-lang-selector.test.tsx
```

Expected: FAIL — `lang-btn-en` testID not found.

- [ ] **Step 3: Update Profile tab**

Replace `apps/pharmopedia/app/(tabs)/profile.tsx`:

```typescript
import { View, Text, Pressable, StyleSheet, SafeAreaView, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore, isRtlLang, type Lang } from '@/store/lang-store'
import { runSync } from '@/sync/catalog-sync'
import { getDatabase } from '@/db/migrations'
import { RoleBadge } from '@/components/RoleBadge'

const LANG_OPTIONS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'prs', label: 'دری' },
  { value: 'ps', label: 'پښتو' },
  { value: 'ar', label: 'عربي' },
]

export default function ProfileTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user, token, logout } = useAuthStore()
  const { status, lastSyncAt, lastVersion, setStatus, setLastSync } = useSyncStore()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)

  async function handleSyncNow() {
    if (!token || status === 'syncing') return
    setStatus('syncing')
    try {
      const { version } = await runSync(getDatabase(), token)
      setLastSync(version, new Date().toISOString())
    } catch {
      setStatus('error')
    }
  }

  async function handleLogout() {
    try {
      await logout(getDatabase())
    } catch {
      // clearCatalog failed — session already cleared from memory
    }
    router.replace('/(auth)/login')
  }

  function handleLangPress(selected: Lang) {
    const rtlChanges = isRtlLang(lang) !== isRtlLang(selected)
    if (rtlChanges) {
      Alert.alert(
        t('profile.languageRestartTitle'),
        t('profile.languageRestartMessage'),
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'OK', onPress: () => void setLang(selected) },
        ],
      )
    } else {
      void setLang(selected)
    }
  }

  function formatSyncTime(iso: string | null): string {
    if (!iso) return t('profile.neverSynced')
    const d = new Date(iso)
    return t('profile.lastSynced', { date: d.toLocaleDateString(), time: d.toLocaleTimeString() })
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>{t('profile.role')}</Text>
        {user?.role && <RoleBadge role={user.role} />}
        {user?.facilityId && (
          <Text style={styles.facility}>{t('profile.facility', { id: user.facilityId })}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t('profile.language')}</Text>
        <View style={styles.langRow}>
          {LANG_OPTIONS.map(({ value, label }) => (
            <Pressable
              key={value}
              testID={`lang-btn-${value}`}
              style={[styles.langBtn, lang === value && styles.langBtnActive]}
              onPress={() => handleLangPress(value)}
            >
              <Text style={[styles.langText, lang === value && styles.langTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t('profile.catalogSync')}</Text>
        <Text testID="last-synced-text" style={styles.value}>{formatSyncTime(lastSyncAt)}</Text>
        <Text style={styles.value}>{t('profile.version', { number: lastVersion })}</Text>
        {status === 'syncing' && <Text style={styles.syncing}>{t('profile.syncing')}</Text>}
        {status === 'error' && <Text style={styles.error}>{t('profile.syncFailed')}</Text>}
        <Pressable
          testID="sync-now-button"
          style={[styles.button, status === 'syncing' && styles.buttonDisabled]}
          onPress={handleSyncNow}
          disabled={status === 'syncing'}
        >
          <Text style={styles.buttonText}>
            {status === 'syncing' ? t('profile.syncing') : t('profile.syncNow')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable
          testID="logout-button"
          style={[styles.button, styles.logoutButton]}
          onPress={handleLogout}
        >
          <Text style={[styles.buttonText, styles.logoutText]}>{t('profile.logout')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 20 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  value: { fontSize: 15, color: '#374151' },
  facility: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  syncing: { fontSize: 14, color: '#2563eb' },
  error: { fontSize: 14, color: '#dc2626' },
  langRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  langBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' },
  langBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  langText: { fontSize: 14, color: '#374151' },
  langTextActive: { color: '#fff', fontWeight: '600' },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  logoutButton: { backgroundColor: '#fee2e2' },
  logoutText: { color: '#b91c1c' },
})
```

- [ ] **Step 4: Update Tabs layout**

Replace `apps/pharmopedia/app/(tabs)/_layout.tsx`:

```typescript
import { Tabs } from 'expo-router'
import { Search, User } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

export default function TabsLayout() {
  const { t } = useTranslation()

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#2563eb' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
```

- [ ] **Step 5: Update Login screen**

Replace `apps/pharmopedia/app/(auth)/login.tsx`:

```typescript
import { useState } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'

type Flow = 'clinical' | 'patient'
type OtpStep = 'phone' | 'code'

export default function LoginScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)

  const [flow, setFlow] = useState<Flow>('clinical')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpStep, setOtpStep] = useState<OtpStep>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClinicalLogin() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err || !data.session) {
      setError(err?.message ?? t('login.loginFailed'))
      return
    }
    const session = data.session
    const meta = (session.user.app_metadata ?? {}) as Record<string, unknown>
    login(session.access_token, {
      sub: session.user.id,
      role: (meta['role'] as string) ?? 'PATIENT',
      facilityId: meta['facilityId'] as string | undefined,
    })
    router.replace('/(tabs)' as never)
  }

  async function handleRequestOtp() {
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({ phone })
    setLoading(false)
    if (err) { setError(err.message); return }
    setOtpStep('code')
  }

  async function handleVerifyOtp() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.auth.verifyOtp({ phone, token: otpCode, type: 'sms' })
    setLoading(false)
    if (err || !data.session) {
      setError(err?.message ?? t('login.otpFailed'))
      return
    }
    const session = data.session
    const meta = (session.user.app_metadata ?? {}) as Record<string, unknown>
    login(session.access_token, {
      sub: session.user.id,
      role: (meta['role'] as string) ?? 'PATIENT',
      facilityId: meta['facilityId'] as string | undefined,
    })
    router.replace('/(tabs)' as never)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={styles.title}>{t('login.title')}</Text>

      <View style={styles.segmented}>
        <Pressable
          testID="clinical-tab"
          style={[styles.segment, flow === 'clinical' && styles.segmentActive]}
          onPress={() => setFlow('clinical')}
        >
          <Text style={flow === 'clinical' ? styles.segmentTextActive : styles.segmentText}>
            {t('login.clinicalStaff')}
          </Text>
        </Pressable>
        <Pressable
          testID="patient-tab"
          style={[styles.segment, flow === 'patient' && styles.segmentActive]}
          onPress={() => setFlow('patient')}
        >
          <Text style={flow === 'patient' ? styles.segmentTextActive : styles.segmentText}>
            {t('login.patient')}
          </Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {flow === 'clinical' ? (
        <>
          <TextInput
            testID="email-input"
            style={styles.input}
            placeholder={t('login.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            testID="password-input"
            style={styles.input}
            placeholder={t('login.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Pressable testID="login-button" style={styles.button} onPress={handleClinicalLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('login.logIn')}</Text>}
          </Pressable>
        </>
      ) : otpStep === 'phone' ? (
        <>
          <TextInput
            testID="phone-input"
            style={styles.input}
            placeholder={t('login.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Pressable testID="request-otp-button" style={styles.button} onPress={handleRequestOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('login.sendCode')}</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.hint}>{t('login.enterCode', { phone })}</Text>
          <TextInput
            testID="otp-input"
            style={styles.input}
            placeholder={t('login.sixDigitCode')}
            value={otpCode}
            onChangeText={setOtpCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Pressable testID="verify-otp-button" style={styles.button} onPress={handleVerifyOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('login.verify')}</Text>}
          </Pressable>
          <Pressable onPress={() => setOtpStep('phone')}>
            <Text style={styles.link}>{t('login.back')}</Text>
          </Pressable>
        </>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 32 },
  segmented: { flexDirection: 'row', marginBottom: 24, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#2563eb' },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  segmentActive: { backgroundColor: '#2563eb' },
  segmentText: { color: '#2563eb', fontWeight: '600' },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#dc2626', marginBottom: 12, textAlign: 'center' },
  hint: { color: '#6b7280', marginBottom: 12, textAlign: 'center' },
  link: { color: '#2563eb', textAlign: 'center', marginTop: 12 },
})
```

- [ ] **Step 6: Run tests**

```bash
pnpm -F pharmopedia test src/__tests__/profile-lang-selector.test.tsx
```

Expected: All 3 tests PASS.

- [ ] **Step 7: Run full test suite**

```bash
pnpm -F pharmopedia test
```

Expected: All tests PASS. No regressions.

- [ ] **Step 8: Commit**

```bash
git add apps/pharmopedia/app/\(tabs\)/profile.tsx apps/pharmopedia/app/\(tabs\)/_layout.tsx apps/pharmopedia/app/\(auth\)/login.tsx apps/pharmopedia/src/__tests__/profile-lang-selector.test.tsx
git commit -m "feat(pharmopedia): language selector in Profile, i18n all remaining screen strings"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| 4 languages: en, prs, ps, ar | Task 1 (locale files) |
| Global lang store persisted across restarts | Task 1 (SecureStore) |
| RTL layout for prs, ps, ar via I18nManager | Task 1 (lang-store setLang) + Task 2 (root layout init) |
| Noto Naskh Arabic font for RTL text | Task 2 (font load) + Tasks 3–5 (rtlText style) |
| Arabic included (user requirement) | `ar` in LANGS, locale, lang picker |
| Language selector in Profile | Task 7 |
| RTL change shows restart alert | Task 7 (handleLangPress) |
| Local-name-as-primary in DrugCard | Task 4 |
| Local-name-as-primary in DrugDetail header | Task 5 |
| All hardcoded UI strings replaced | Tasks 3–7 |
| SearchBar reads global lang (not local state) | Task 3 |
| DrugDetail reads global lang (not hardcoded 'en') | Task 5 |
| OverviewTab supports `ar` in localText() | Task 5 (Lang type now includes 'ar') |

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:** `Lang = 'en' | 'prs' | 'ps' | 'ar'` defined once in `src/store/lang-store.ts` and imported everywhere. The old `type Lang = 'en' | 'prs' | 'ps'` in SearchBar, index.tsx, [atcCode].tsx, and OverviewTab is removed in each respective task.

**No missing keys:** The `en.ts` locale defines every key referenced by `t()` across all files. `prs.ts`, `ps.ts`, `ar.ts` are typed as `Translations` (same shape as `en.ts`) so TypeScript will flag any missing key at build time.
