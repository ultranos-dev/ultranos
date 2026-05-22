# Navigation Phase 3: Lab-Lite Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add collapsible sidebar navigation to Lab-Lite (currently has header-only layout), create dedicated pages for upload queue, notification center, and settings.

**Architecture:** Add `Sidebar` from `@ultranos/ui-kit` to the locale layout. Move existing header components (OnlineStatusIndicator, NotificationBell, LanguageSelectorClient, LabIdentityCard info) into sidebar slots. Create three new route pages.

**Tech Stack:** React 18/19, TypeScript, Next.js 15, Vitest, next-intl, `@ultranos/ui-kit` Sidebar, Dexie.js

**Stories covered:** 37.7 (Sidebar adoption), 37.8 (Upload Queue page), 37.9 (Notification Center page), 37.10 (Settings page)

---

## File Structure

### New Files
- `apps/lab-lite/src/components/AppSidebar.tsx` — Lab-Lite sidebar wrapper
- `apps/lab-lite/src/app/[locale]/queue/page.tsx` — Dedicated upload queue page
- `apps/lab-lite/src/app/[locale]/notifications/page.tsx` — Notification center page
- `apps/lab-lite/src/app/[locale]/settings/page.tsx` — Settings page
- `apps/lab-lite/src/components/settings/LabSettingsView.tsx` — Settings view component

### Modified Files
- `apps/lab-lite/src/app/[locale]/layout.tsx` — Wrap with AppSidebar
- `apps/lab-lite/src/app/layout.tsx` — Simplify header (sidebar handles nav now)
- `apps/lab-lite/messages/en.json` — Add sidebar + settings keys
- `apps/lab-lite/messages/ar.json` — Same
- `apps/lab-lite/messages/prs.json` — Same

---

## Task 1: Add i18n Keys

**Files:** `apps/lab-lite/messages/{en,ar,prs}.json`

- [ ] **Step 1: Add sidebar, settings, queuePage keys to en.json**

Add to `en.json` top-level:
```json
"sidebar": {
  "dashboard": "Dashboard",
  "upload": "Upload Result",
  "history": "Upload History",
  "queue": "Upload Queue",
  "notifications": "Notifications",
  "settings": "Settings"
},
"settings": {
  "title": "Settings",
  "profile": "Profile",
  "labInfo": "Lab Information",
  "sessionInfo": "Session Information",
  "mfaStatus": "MFA Status",
  "name": "Name",
  "email": "Email",
  "role": "Role",
  "labTechnician": "Lab Technician",
  "practitionerId": "Practitioner ID",
  "labName": "Lab Name",
  "accreditation": "Accreditation",
  "sessionStart": "Session Start",
  "timeRemaining": "Time Remaining",
  "sessionId": "Session ID",
  "totpEnrolled": "TOTP Enrolled",
  "lastVerified": "Last Verified",
  "language": "Language",
  "signOut": "Sign Out"
},
"queuePage": {
  "title": "Upload Queue",
  "pending": "Pending",
  "uploading": "Uploading",
  "failed": "Failed",
  "expired": "Expired",
  "retryAll": "Retry All Failed",
  "retry": "Retry",
  "reupload": "Re-upload",
  "discard": "Discard",
  "confirmDiscard": "Are you sure you want to discard this upload?",
  "patient": "Patient",
  "testCategory": "Test Category",
  "fileName": "File",
  "queuedAt": "Queued",
  "verification": "Verification"
}
```

- [ ] **Step 2: Add Arabic translations to ar.json**
- [ ] **Step 3: Add Dari translations to prs.json**
- [ ] **Step 4: Commit**

```bash
git add apps/lab-lite/messages/
git commit -m "feat(lab-lite): add i18n keys for sidebar, settings, and queue page

Refs: Epic 37, Stories 37.7, 37.8, 37.9, 37.10"
```

---

## Task 2: Create AppSidebar and Integrate into Layout

**Files:**
- Create: `apps/lab-lite/src/components/AppSidebar.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/layout.tsx`
- Modify: `apps/lab-lite/src/app/layout.tsx`

- [ ] **Step 1: Create AppSidebar component**

Client component wrapping `Sidebar` from `@ultranos/ui-kit`. Nav items:

| Group | Label | Icon | Route | Badge |
|-------|-------|------|-------|-------|
| primary | Dashboard | LayoutDashboard | `/` | — |
| primary | Upload Result | Upload | `/upload` | — |
| primary | Upload History | History | `/history` | — |
| clinical | Upload Queue | Clock | `/queue` | Pending+Failed from queue store |
| clinical | Notifications | Bell | `/notifications` | Unread count (poll) |
| system | Settings | Settings | `/settings` | — |

Footer slots:
- `syncIndicator`: `OnlineStatusIndicator` component
- `languageSelector`: `LanguageSelectorClient` component
- User section: lab name + technician name from session store

Sign-out: clear session store, wipe encryption keys, supabase sign out, redirect to `/login`.

Hide sidebar on `/login` and `/offline` routes.

- [ ] **Step 2: Update locale layout**

Wrap children with `<AppSidebar>`:
```tsx
<NextIntlClientProvider messages={messages}>
  <AppSidebar>
    {children}
    <InstallPrompt />
  </AppSidebar>
</NextIntlClientProvider>
```

- [ ] **Step 3: Simplify root layout header**

The root layout currently has a `<header>` with the app title. Since the sidebar now shows the app name, simplify the header to just show a minimal bar or remove it entirely. Keep the skip-to-content link.

- [ ] **Step 4: Build to verify**

Run: `pnpm -F lab-lite build`

- [ ] **Step 5: Commit**

```bash
git add apps/lab-lite/src/components/AppSidebar.tsx apps/lab-lite/src/app/[locale]/layout.tsx apps/lab-lite/src/app/layout.tsx
git commit -m "feat(lab-lite): adopt sidebar navigation with badge counts

Add collapsible sidebar with 6 nav items. OnlineStatusIndicator and
LanguageSelector move to sidebar footer. Lab identity in user section.

Refs: Epic 37, Story 37.7"
```

---

## Task 3: Create Upload Queue, Notification Center, and Settings Pages

**Files:**
- Create: `apps/lab-lite/src/app/[locale]/queue/page.tsx`
- Create: `apps/lab-lite/src/app/[locale]/notifications/page.tsx`
- Create: `apps/lab-lite/src/app/[locale]/settings/page.tsx`
- Create: `apps/lab-lite/src/components/settings/LabSettingsView.tsx`

- [ ] **Step 1: Create Queue page**

Route at `/queue`. Renders the existing `UploadQueue` component from `@/components/UploadQueue` in a full-page layout with a heading. The dashboard already uses this component in compact mode — here it gets a full page with tabs (Pending/Uploading/Failed/Expired).

Read the existing `UploadQueue` component first to understand its props and what it already renders.

- [ ] **Step 2: Create Notifications page**

Route at `/notifications`. Creates a full-page notification center. Read the existing `NotificationPanel` and `NotificationBell` components to understand the data fetching pattern, then create a full-page version with:
- All notifications listed (not just dropdown)
- Tab filters: All, Result Updates, System Notices
- "Mark All Read" button

- [ ] **Step 3: Create Settings page with LabSettingsView**

Route at `/settings`. `LabSettingsView` client component with 4 cards (matching Pharmacy-Lite's pattern):
1. Profile Card — technician name, email, role badge, practitioner ID
2. Lab Info Card — lab name, accreditation status
3. Session Info Card — session start, time remaining (8h for LAB_TECH), session ID
4. MFA Status Card — TOTP enrollment status

Plus language selector and sign-out button.

Read the session store to understand available fields. Use `useTranslations('settings')`.

- [ ] **Step 4: Build to verify**

Run: `pnpm -F lab-lite build`

- [ ] **Step 5: Commit**

```bash
git add apps/lab-lite/src/app/[locale]/queue/ apps/lab-lite/src/app/[locale]/notifications/ apps/lab-lite/src/app/[locale]/settings/ apps/lab-lite/src/components/settings/
git commit -m "feat(lab-lite): add queue, notification center, and settings pages

Dedicated /queue page for upload queue management. Full-page /notifications
center with tab filters. Settings page with profile, lab info, session,
and MFA cards.

Refs: Epic 37, Stories 37.8, 37.9, 37.10"
```
