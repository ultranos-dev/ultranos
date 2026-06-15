# Dari/Pashto Language Separation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate Dari (دری, `prs`) and Pashto (پښتو, `ps`) into independent locales across OPD-Lite, Pharmacy-Lite, and Lab-Lite, fixing the current mixing where `prs.json` contains both languages.

**Architecture:** The `prs` locale remains Dari. A new `ps` locale is added for Pashto. All config (routing, middleware, direction, UI-kit) is updated to support 4 locales. Each app's `prs.json` is cleaned of Pashto strings (replaced with Dari), and a new `ps.json` is created with full Pashto translations.

**Tech Stack:** next-intl, @ultranos/ui-kit (LanguageSelector, direction), TypeScript

---

## Pashto String Audit

The following sections in each app's `prs.json` currently contain **Pashto** text instead of Dari. These must be replaced with Dari in `prs.json` and preserved/expanded in the new `ps.json`.

### OPD-Lite (`apps/opd-lite/messages/prs.json`)

| Section | Keys | Language |
|---------|------|----------|
| `sidebar` (all keys) | dashboard, appointments, patients, registerPatient, notifications, conflicts, duplicateReviews, expiringConsents, kyc, settings, signOut, collapse, expand | **Pashto** |
| `patients` (all keys) | title, searchPlaceholder, name, age, gender, phone, lastVisit, status, allergies, active, inactive, merged, all, hasAllergies, yes, no, lastVisitFilter, today, thisWeek, thisMonth, registerNew, noPatients, noPatientsDescription, noResults, previous, next, pageOf, allergyFlag, nidMissingBadge, syncing | **Pashto** |
| `appointments` (all keys) | title, today, dayView, weekView, datePicker, previousDay, nextDay, previousWeek, nextWeek, available, booked, checkedIn, inProgress, completed, noShow, cancelled, newConsult, followUp, urgent, walkIn, bookAppointment, addWalkIn, startEncounter, changeStatus, walkInQueue, queueNumber, waitTime, patient, type, time, selectPatient, selectDate, selectTime, appointmentType, notes, confirmBooking, cancelAppointment, slotTaken, noAppointments, noWalkIns, schedulingConflict, doubleBookWarning, noResults | **Pashto** |
| `registration.mpiAddAnyway` | single key | **Pashto** |
| `registration.mpiNameGiven` | single key | **Pashto** |
| `registration.mpiNameFather` | single key | **Pashto** |
| `duplicateReview.loading` | single key | **Pashto** |
| `duplicateReview.loadError` | single key | **Pashto** |
| `duplicateReview.actionError` | single key | **Pashto** |
| `duplicateReview.noReviews` | single key | **Pashto** |
| `duplicateReview.colPatient` through `flagAriaLabel` | colPatient, colScore, colDecision, colStatus, colActions, decisionPending, decisionDismissed, decisionFlagged, actionDismiss, actionFlagMerge, dismissAriaLabel, flagAriaLabel | **Pashto** |

### Pharmacy-Lite (`apps/pharmacy-lite/messages/prs.json`)

| Section | Keys | Language |
|---------|------|----------|
| `sidebar.paperRx` | single key | **Pashto** spelling |
| `sidebar.queue` | single key | **Pashto** |
| `sidebar.history` | single key | **Pashto** |
| `sidebar.controlled` | single key | **Pashto** |
| `sidebar.unverified` | single key | **Pashto** |
| `sidebar.syncQueue` | single key | **Pashto** |
| `controlled` (all keys) | title, noRecords, date, patient, medication, schedule, prescriber, status, dispensed, flagged, underReview, loading, error, dateFrom, dateTo, notAvailable, page, of, records, previous, next, scheduleNote | **Pashto** |
| `unverified` (all keys) | title, noRecords, pending, resolved, date, patient, medication, reason, supervisor, approve, flag, approved, flagged, loading, error, reviewedBy, reviewedAt, dispenseId, reviewNotConnected, offlineWarning | **Pashto** |
| `registration.mpiAddAnyway` | single key | **Pashto** |
| `registration.mpiNameGiven` | single key | **Pashto** |
| `registration.mpiNameFather` | single key | **Pashto** |

### Lab-Lite (`apps/lab-lite/messages/prs.json`)

| Section | Keys | Language |
|---------|------|----------|
| `notifications.markAllRead` | single key | **Pashto** |
| `sidebar` (upload, history, queue, notifications) | 4 keys | **Pashto** |
| `settings` (all keys except title, settings) | labInfo, sessionInfo, mfaStatus, name, email, role, labTechnician, practitionerId, labName, accreditation, sessionStart, timeRemaining, sessionId, totpEnrolled, lastVerified, language, signOut | **Pashto** |
| `queuePage` (all keys) | title, pending, uploading, failed, expired, retryAll, retry, reupload, discard, confirmDiscard, patient, testCategory, fileName, queuedAt, verification | **Pashto** |

---

## File Structure

### Files to create:
- `apps/opd-lite/messages/ps.json` — Full Pashto translation (~842 keys)
- `apps/pharmacy-lite/messages/ps.json` — Full Pashto translation (~581 keys)
- `apps/lab-lite/messages/ps.json` — Full Pashto translation (~263 keys)

### Files to modify:
- `packages/ui-kit/src/direction.ts` — Add `ps` to SupportedLocale, update getDirection
- `packages/ui-kit/src/components/LanguageSelector.tsx` — Add Pashto to LANGUAGES array
- `apps/opd-lite/src/i18n/routing.ts` — Add `ps` locale
- `apps/opd-lite/src/i18n/request.ts` — (no change needed, dynamic import handles it)
- `apps/opd-lite/src/middleware.ts` — Add `ps` browser locale mapping
- `apps/pharmacy-lite/src/i18n/routing.ts` — Add `ps` locale
- `apps/pharmacy-lite/src/middleware.ts` — Add `ps` browser locale mapping
- `apps/lab-lite/src/i18n/routing.ts` — Add `ps` locale
- `apps/lab-lite/src/middleware.ts` — Add `ps` browser locale mapping
- `apps/opd-lite/messages/prs.json` — Replace Pashto strings with Dari
- `apps/pharmacy-lite/messages/prs.json` — Replace Pashto strings with Dari
- `apps/lab-lite/messages/prs.json` — Replace Pashto strings with Dari

---

## Task 1: Update ui-kit — Add Pashto locale support

**Files:**
- Modify: `packages/ui-kit/src/direction.ts`
- Modify: `packages/ui-kit/src/components/LanguageSelector.tsx`

- [ ] **Step 1: Update SupportedLocale type and getDirection**

In `packages/ui-kit/src/direction.ts`, add `'ps'` to the union type and update `getDirection` to treat `ps` as RTL:

```typescript
export type SupportedLocale = 'en' | 'ar' | 'prs' | 'ps'

export type Direction = 'ltr' | 'rtl'

/** Returns 'rtl' for Arabic, Dari, and Pashto, 'ltr' for everything else. Handles locale variants (e.g. ar-SA). */
export function getDirection(locale: string): Direction {
  const base = locale?.split('-')[0]?.toLowerCase() ?? ''
  return base === 'ar' || base === 'prs' || base === 'ps' ? 'rtl' : 'ltr'
}
```

- [ ] **Step 2: Add Pashto to LanguageSelector LANGUAGES array**

In `packages/ui-kit/src/components/LanguageSelector.tsx`, add Pashto as the 4th option:

```typescript
const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'prs', label: 'Dari', nativeLabel: 'دری' },
  { code: 'ps', label: 'Pashto', nativeLabel: 'پښتو' },
]
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui-kit/src/direction.ts packages/ui-kit/src/components/LanguageSelector.tsx
git commit -m "feat(ui-kit): add Pashto (ps) locale to SupportedLocale, direction, and LanguageSelector"
```

---

## Task 2: Update i18n routing and middleware — All 3 apps

**Files:**
- Modify: `apps/opd-lite/src/i18n/routing.ts`
- Modify: `apps/pharmacy-lite/src/i18n/routing.ts`
- Modify: `apps/lab-lite/src/i18n/routing.ts`
- Modify: `apps/opd-lite/src/middleware.ts`
- Modify: `apps/pharmacy-lite/src/middleware.ts`
- Modify: `apps/lab-lite/src/middleware.ts`

- [ ] **Step 1: Add `ps` to routing in all 3 apps**

All three routing files are identical. Update each to:

```typescript
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'ar', 'prs', 'ps'],
  defaultLocale: 'en',
  localePrefix: 'never',
})
```

Apply to:
- `apps/opd-lite/src/i18n/routing.ts`
- `apps/pharmacy-lite/src/i18n/routing.ts`
- `apps/lab-lite/src/i18n/routing.ts`

- [ ] **Step 2: Add Pashto browser locale mapping to middleware in all 3 apps**

All three middleware files are identical. Add a Pashto mapping block after the existing Dari mapping. The Pashto ISO code `ps` and variant `ps-AF` should map to our `ps` locale:

```typescript
import createMiddleware from 'next-intl/middleware'
import { NextRequest } from 'next/server'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

/**
 * Map Dari/Farsi and Pashto browser locales to our locale codes before
 * next-intl processes the Accept-Language header.
 * PRD HP-001: fa, fa-AF, prs → Dari RTL; ps, ps-AF → Pashto RTL; ar, ar-* → Arabic RTL; all others → English LTR
 */
export default function middleware(request: NextRequest) {
  const acceptLang = request.headers.get('accept-language')

  if (acceptLang) {
    // Rewrite fa/fa-AF/prs locale tags to 'prs', and ps-AF to 'ps'
    const rewritten = acceptLang
      .replace(/\b(fa-AF|fa|prs)\b/g, 'prs')
      .replace(/\b(ps-AF)\b/g, 'ps')
    if (rewritten !== acceptLang) {
      const headers = new Headers(request.headers)
      headers.set('accept-language', rewritten)
      const rewrittenRequest = new NextRequest(request.url, {
        headers,
        method: request.method,
      })
      return intlMiddleware(rewrittenRequest)
    }
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|sw\\.js|manifest\\.webmanifest|.*\\..*).*)',
}
```

Apply to:
- `apps/opd-lite/src/middleware.ts`
- `apps/pharmacy-lite/src/middleware.ts`
- `apps/lab-lite/src/middleware.ts`

Note: `request.ts` in all 3 apps uses dynamic import (`import(\`../../messages/${locale}.json\`)`) so it will automatically pick up the new `ps.json` files — no changes needed there.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/i18n/routing.ts apps/pharmacy-lite/src/i18n/routing.ts apps/lab-lite/src/i18n/routing.ts apps/opd-lite/src/middleware.ts apps/pharmacy-lite/src/middleware.ts apps/lab-lite/src/middleware.ts
git commit -m "feat(i18n): add Pashto (ps) locale to routing and middleware across all 3 apps"
```

---

## Task 3: Fix OPD-Lite Dari translations and create Pashto file

**Files:**
- Modify: `apps/opd-lite/messages/prs.json` — Replace Pashto strings with Dari
- Create: `apps/opd-lite/messages/ps.json` — Full Pashto translation

- [ ] **Step 1: Fix Pashto strings in prs.json with correct Dari**

Replace the following Pashto sections/keys in `apps/opd-lite/messages/prs.json` with proper Dari:

**`sidebar` section** — replace entire section:
```json
"sidebar": {
  "dashboard": "داشبورد",
  "appointments": "وقت‌ها",
  "patients": "مریضان",
  "registerPatient": "ثبت مریض",
  "notifications": "اطلاعیه‌ها",
  "conflicts": "تعارضات",
  "duplicateReviews": "بررسی تکراری‌ها",
  "expiringConsents": "رضایت‌های در حال انقضا",
  "kyc": "تایید هویت",
  "settings": "تنظیمات",
  "signOut": "خروج",
  "collapse": "جمع کردن منو",
  "expand": "باز کردن منو"
}
```

**`patients` section** — replace entire section:
```json
"patients": {
  "title": "لیست مریضان",
  "searchPlaceholder": "جستجو با نام یا شماره تلیفون...",
  "name": "نام",
  "age": "سن",
  "gender": "جنسیت",
  "phone": "تلیفون",
  "lastVisit": "آخرین مراجعه",
  "lastUpdatedCol": "آخرین بروزرسانی",
  "status": "وضعیت",
  "allergies": "حساسیت",
  "active": "فعال",
  "inactive": "غیرفعال",
  "merged": "ادغام شده",
  "all": "همه",
  "hasAllergies": "حساسیت دارد",
  "yes": "بلی",
  "no": "نخیر",
  "lastVisitFilter": "آخرین مراجعه",
  "today": "امروز",
  "thisWeek": "این هفته",
  "thisMonth": "این ماه",
  "registerNew": "ثبت مریض جدید",
  "noPatients": "تا هنوز هیچ مریضی ثبت نشده است",
  "noPatientsDescription": "با ثبت اولین مریض خود شروع کنید.",
  "noResults": "هیچ مریضی با فیلترهای شما مطابقت ندارد",
  "previous": "قبلی",
  "next": "بعدی",
  "pageOf": "صفحه {current} از {total}",
  "allergyFlag": "حساسیت دارد",
  "nidMissingBadge": "بدون تذکره",
  "syncing": "همگام‌سازی..."
}
```

**`appointments` section** — replace entire section:
```json
"appointments": {
  "title": "وقت‌ها",
  "today": "امروز",
  "dayView": "روز",
  "weekView": "هفته",
  "datePicker": "انتخاب تاریخ",
  "previousDay": "روز قبلی",
  "nextDay": "روز بعدی",
  "previousWeek": "هفته قبلی",
  "nextWeek": "هفته بعدی",
  "available": "خالی",
  "booked": "رزرو شده",
  "checkedIn": "حضور ثبت شده",
  "inProgress": "در جریان",
  "completed": "تکمیل شده",
  "noShow": "غایب",
  "cancelled": "لغو شده",
  "newConsult": "مشوره جدید",
  "followUp": "پیگیری",
  "urgent": "عاجل",
  "walkIn": "بدون وقت قبلی",
  "bookAppointment": "رزرو وقت",
  "addWalkIn": "افزودن بدون وقت",
  "startEncounter": "شروع ویزیت",
  "changeStatus": "تغییر وضعیت",
  "walkInQueue": "صف بدون وقت",
  "queueNumber": "#{number}",
  "waitTime": "{minutes}د انتظار",
  "patient": "مریض",
  "type": "نوع",
  "time": "وقت",
  "selectPatient": "مریض را انتخاب کنید",
  "selectDate": "تاریخ را انتخاب کنید",
  "selectTime": "وقت را انتخاب کنید",
  "appointmentType": "نوع وقت",
  "notes": "یادداشت (اختیاری)",
  "confirmBooking": "تایید",
  "cancelAppointment": "لغو وقت",
  "slotTaken": "این وقت قبلاً گرفته شده",
  "noAppointments": "هیچ وقتی تعیین نشده",
  "noWalkIns": "مریض بدون وقت قبلی نیست",
  "schedulingConflict": "تعارض زمان‌بندی پیدا شد — لطفاً بررسی کنید",
  "doubleBookWarning": "رزرو دوگانه برای این وقت شناسایی شده",
  "noResults": "هیچ مریضی یافت نشد"
}
```

**`registration` — 3 individual keys to fix:**
```json
"mpiAddAnyway": "به هر حال اضافه کنید",
"mpiNameGiven": "نام",
"mpiNameFather": "نام پدر"
```

**`duplicateReview` — keys to fix (lines 780-795):**
```json
"loading": "در حال بارگذاری بررسی‌ها...",
"loadError": "بارگذاری بررسی‌های تکراری ناکام شد",
"actionError": "به‌روزرسانی بررسی ناکام شد",
"noReviews": "هیچ بررسی تکراری یافت نشد",
"colPatient": "مریض",
"colScore": "امتیاز MPI",
"colDecision": "تصمیم",
"colStatus": "وضعیت",
"colActions": "اقدامات",
"decisionPending": "معلق",
"decisionDismissed": "رد شده",
"decisionFlagged": "علامت‌گذاری شده برای ادغام",
"actionDismiss": "تکراری نیست",
"actionFlagMerge": "علامت‌گذاری برای ادغام",
"dismissAriaLabel": "رد بررسی تکراری برای {patient}",
"flagAriaLabel": "علامت‌گذاری برای ادغام {patient}"
```

- [ ] **Step 2: Create `apps/opd-lite/messages/ps.json`**

Create a complete Pashto translation file with all ~842 keys. Use the **existing Pashto strings** from the current `prs.json` for sections where they exist (sidebar, patients, appointments, duplicateReview partial, registration partial). For all other sections, write new Pashto translations based on the English keys in `en.json`.

The file must have the exact same JSON structure as `en.json` and `prs.json`. Every key in `en.json` must have a corresponding Pashto translation in `ps.json`.

Key Pashto vocabulary reference (from existing strings):
- Patient = ناروغ
- Doctor = ډاکټر
- Appointment = وخت
- Settings = تنظیمات
- Search = لټون
- Loading = لوډ کیږي
- Error/Failed = ناکام
- Submit = واستول
- Cancel = لغوه کول
- Confirm = تایید
- Save = ساتل
- Delete = حذف
- Back = شاته
- Next = راتلونکی
- Previous = مخکینی
- Name = نوم
- Date = نیټه
- Status = حالت
- Notification = خبرتیا
- Upload = پورته کول
- Queue = لیست
- Review = بیاکتنه

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/messages/prs.json apps/opd-lite/messages/ps.json
git commit -m "feat(opd-lite): separate Dari and Pashto — fix prs.json, add ps.json with full Pashto translations"
```

---

## Task 4: Fix Pharmacy-Lite Dari translations and create Pashto file

**Files:**
- Modify: `apps/pharmacy-lite/messages/prs.json` — Replace Pashto strings with Dari
- Create: `apps/pharmacy-lite/messages/ps.json` — Full Pashto translation

- [ ] **Step 1: Fix Pashto strings in prs.json with correct Dari**

Replace the following keys/sections:

**`sidebar` — 6 keys to fix:**
```json
"paperRx": "نسخه کاغذی",
"queue": "صف انتظار",
"history": "تاریخچه تحویل",
"controlled": "مواد کنترول شده",
"unverified": "تحویل‌های تایید نشده",
"syncQueue": "صف همگام‌سازی"
```

**`controlled` section** — replace entire section:
```json
"controlled": {
  "title": "سوابق مواد کنترول شده",
  "noRecords": "هیچ سابقه مواد کنترول شده وجود ندارد",
  "date": "تاریخ/وقت",
  "patient": "مریض",
  "medication": "دوا",
  "schedule": "زمان‌بندی",
  "prescriber": "تجویزکننده",
  "status": "وضعیت",
  "dispensed": "تحویل شده",
  "flagged": "علامت‌گذاری شده",
  "underReview": "در حال بررسی",
  "loading": "در حال بارگذاری سوابق...",
  "error": "بارگذاری سوابق ناکام شد. لطفاً دوباره تلاش کنید.",
  "dateFrom": "از",
  "dateTo": "تا",
  "notAvailable": "در دسترس نیست",
  "page": "صفحه",
  "of": "از",
  "records": "{count} سابقه یافت شد",
  "previous": "قبلی",
  "next": "بعدی",
  "scheduleNote": "طبقه‌بندی مواد کنترول شده هنوز در سکیمای تحویل وجود ندارد"
}
```

**`unverified` section** — replace entire section:
```json
"unverified": {
  "title": "تحویل‌های تایید نشده",
  "noRecords": "هیچ تحویل تایید نشده‌ای وجود ندارد",
  "pending": "معلق",
  "resolved": "حل شده",
  "date": "تاریخ/وقت",
  "patient": "مریض",
  "medication": "دوا",
  "reason": "دلیل تجاوز",
  "supervisor": "سرپرست",
  "approve": "تایید",
  "flag": "علامت‌گذاری",
  "approved": "تایید شده",
  "flagged": "علامت‌گذاری شده",
  "loading": "در حال بارگذاری بررسی‌ها...",
  "error": "بارگذاری بررسی‌ها ناکام شد. لطفاً دوباره تلاش کنید.",
  "reviewedBy": "بررسی شده توسط",
  "reviewedAt": "تاریخ بررسی",
  "dispenseId": "شناسه تحویل",
  "reviewNotConnected": "نقطه بررسی هنوز وصل نشده است",
  "offlineWarning": "اقدامات بررسی نیاز به اتصال انترنت دارد"
}
```

**`registration` — 3 individual keys to fix:**
```json
"mpiAddAnyway": "به هر حال اضافه کنید",
"mpiNameGiven": "نام",
"mpiNameFather": "نام پدر"
```

- [ ] **Step 2: Create `apps/pharmacy-lite/messages/ps.json`**

Create a complete Pashto translation file with all ~581 keys. Use the **existing Pashto strings** from the current `prs.json` for sections where they exist (sidebar partial, controlled, unverified, registration partial). For all other sections, write new Pashto translations based on the English keys in `en.json`.

Key Pashto pharmacy vocabulary (from existing strings):
- Prescription = نسخه
- Dispensing/Dispense = ورکول
- Controlled substances = کنترول شوي مواد
- Unverified = نه تایید شوي
- Medication = درمل
- Flagged = نښه شوی
- Override = تساهل
- Supervisor = سرپرست
- Review = بیاکتنه

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "feat(pharmacy-lite): separate Dari and Pashto — fix prs.json, add ps.json with full Pashto translations"
```

---

## Task 5: Fix Lab-Lite Dari translations and create Pashto file

**Files:**
- Modify: `apps/lab-lite/messages/prs.json` — Replace Pashto strings with Dari
- Create: `apps/lab-lite/messages/ps.json` — Full Pashto translation

- [ ] **Step 1: Fix Pashto strings in prs.json with correct Dari**

Replace the following keys/sections:

**`notifications.markAllRead`:**
```json
"markAllRead": "خواندن همه"
```

**`sidebar` section — 4 keys to fix:**
```json
"sidebar": {
  "dashboard": "داشبورد",
  "upload": "بارگذاری نتیجه",
  "history": "تاریخچه بارگذاری",
  "queue": "صف بارگذاری",
  "notifications": "اطلاعیه‌ها",
  "settings": "تنظیمات"
}
```

**`settings` section** — replace entire section:
```json
"settings": {
  "title": "تنظیمات",
  "profile": "مشخصات",
  "labInfo": "معلومات لابراتوار",
  "sessionInfo": "معلومات جلسه",
  "mfaStatus": "وضعیت MFA",
  "name": "نام",
  "email": "ایمیل",
  "role": "نقش",
  "labTechnician": "تکنیشن لابراتوار",
  "practitionerId": "شناسه تکنیشن",
  "labName": "نام لابراتوار",
  "accreditation": "اعتبارنامه",
  "sessionStart": "شروع جلسه",
  "timeRemaining": "وقت باقیمانده",
  "sessionId": "شناسه جلسه",
  "totpEnrolled": "TOTP ثبت شده",
  "lastVerified": "آخرین تایید",
  "language": "زبان",
  "signOut": "خروج"
}
```

**`queuePage` section** — replace entire section:
```json
"queuePage": {
  "title": "صف بارگذاری",
  "pending": "در انتظار",
  "uploading": "در حال بارگذاری",
  "failed": "ناکام",
  "expired": "منقضی شده",
  "retryAll": "تلاش مجدد همه",
  "retry": "تلاش مجدد",
  "reupload": "بارگذاری مجدد",
  "discard": "رد کردن",
  "confirmDiscard": "آیا مطمئن هستید که این بارگذاری را رد می‌کنید؟",
  "patient": "مریض",
  "testCategory": "دسته‌بندی تست",
  "fileName": "فایل",
  "queuedAt": "اضافه شده",
  "verification": "تایید"
}
```

- [ ] **Step 2: Create `apps/lab-lite/messages/ps.json`**

Create a complete Pashto translation file with all ~263 keys. Use the **existing Pashto strings** from the current `prs.json` for sections where they exist (notifications.markAllRead, sidebar, settings, queuePage). For all other sections, write new Pashto translations based on the English keys in `en.json`.

Key Pashto lab vocabulary (from existing strings):
- Upload = پورته کول
- Result = نتیجه
- Queue = لیست
- Retry = بیا هڅه
- Discard = لغوه کول
- Expired = پای ته رسیدلی
- Lab = لابراتوار
- Technician = تخنیکر
- Notification = خبرتیا

- [ ] **Step 3: Commit**

```bash
git add apps/lab-lite/messages/prs.json apps/lab-lite/messages/ps.json
git commit -m "feat(lab-lite): separate Dari and Pashto — fix prs.json, add ps.json with full Pashto translations"
```

---

## Task 6: Verification

- [ ] **Step 1: Verify all 4 locale JSON files parse correctly for each app**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
node -e "for(const app of ['opd-lite','pharmacy-lite','lab-lite']){for(const loc of ['en','ar','prs','ps']){const f='apps/'+app+'/messages/'+loc+'.json';try{const j=require('./'+f);console.log(f+': '+Object.keys(j).length+' sections OK')}catch(e){console.error(f+': PARSE ERROR - '+e.message)}}}"
```

Expected: all 12 files parse without errors.

- [ ] **Step 2: Verify key parity — every app's ps.json has the same keys as en.json**

```bash
node -e "
const fs=require('fs');
function getKeys(obj,prefix=''){let keys=[];for(const[k,v]of Object.entries(obj)){const p=prefix?prefix+'.'+k:k;if(typeof v==='object'&&v!==null&&!Array.isArray(v))keys.push(...getKeys(v,p));else keys.push(p)}return keys.sort()}
for(const app of ['opd-lite','pharmacy-lite','lab-lite']){
  const en=JSON.parse(fs.readFileSync('apps/'+app+'/messages/en.json','utf8'));
  const ps=JSON.parse(fs.readFileSync('apps/'+app+'/messages/ps.json','utf8'));
  const enKeys=getKeys(en);const psKeys=getKeys(ps);
  const missing=enKeys.filter(k=>!psKeys.includes(k));
  const extra=psKeys.filter(k=>!enKeys.includes(k));
  if(missing.length)console.error(app+' ps.json MISSING '+missing.length+' keys:',missing.slice(0,10));
  if(extra.length)console.warn(app+' ps.json has '+extra.length+' EXTRA keys:',extra.slice(0,10));
  if(!missing.length&&!extra.length)console.log(app+': ps.json keys match en.json ✓');
}"
```

- [ ] **Step 3: Spot-check no Pashto remains in prs.json**

Manually verify these markers are absent from all 3 `prs.json` files — these are distinctive Pashto constructions:
- `ناروغ` (Pashto for patient — Dari uses مریض)
- `وکړئ` (Pashto imperative suffix)
- `کیږي` (Pashto passive suffix)
- `لومړی` (Pashto for "first")
- `پورته کول` (Pashto for "uploading")

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
for app in opd-lite pharmacy-lite lab-lite; do
  echo "=== $app prs.json ==="
  grep -c 'ناروغ\|وکړئ\|کیږي\|لومړی\|پورته کول' apps/$app/messages/prs.json || echo "No Pashto markers found ✓"
done
```

- [ ] **Step 4: Commit verification results (if any fixes needed)**

```bash
git add -A
git commit -m "fix(i18n): address any key parity or remaining Pashto issues in prs.json"
```
