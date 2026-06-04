# Pharmacy Lite — Visual Parity with Admin-Portal Design System

**Date:** 2026-06-04
**Status:** Approved
**Goal:** Migrate `apps/pharmacy-lite` to use the exact same design system as `apps/admin-portal`: shadcn sidebar primitives, oklch semantic tokens, ThemeProvider, Manrope + Public Sans fonts, and consistent page-level patterns across all 21 pages and 35 components.

---

## Background

The current pharmacy-lite uses:
- A custom `Sidebar` wrapper component from `@ultranos/ui-kit` (not the shadcn sidebar primitives)
- Hardcoded Tailwind colors (`text-neutral-900`, `bg-green-500`, `border-neutral-200`) instead of semantic tokens
- Urbanist font via local woff2, with no heading font distinction
- No ThemeProvider — dark mode not implemented
- A bare `globals.css` with no `@layer base` resets
- Only a hand-rolled `Button.tsx` in `src/components/ui/` — no other shadcn re-exports

Admin-portal uses shadcn sidebar primitives directly, semantic oklch tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `shadow-card`, `rounded-2xl`), ThemeProvider with `data-theme` attribute, Manrope (body) + Public Sans (headings) fonts, and a consistent `TopHeader` + breadcrumb page pattern.

---

## Constraints

- **RTL safety:** Pharmacy-lite serves Arabic and Dari speakers. Font changes must preserve the RTL font override mechanism in `packages/ui-kit/src/tokens.css`. The CSS variable approach (`var(--font-family-sans)`) must be maintained in `tailwind.config.ts` so `[dir="rtl"]` token overrides in `tokens.css` continue to work.
- **PWA / offline:** Fonts must be self-hosted (local woff2 files, not Google Fonts CDN) so the service worker can precache them. Manrope and Public Sans woff2 files are committed to `apps/pharmacy-lite/public/fonts/`.
- **Snapshot tests:** 35 pharmacy components have snapshot tests. Plan 4 will regenerate all snapshots. This is expected and acceptable.
- **Do not modify `packages/ui-kit/src/tokens.css`** — it is shared across all apps.
- **`apps/pharmacy-lite/src/components/ui/Button.tsx`** is deleted and replaced by a re-export of the ui-kit Button in Plan 1.
- **SyncPulse, SyncCapacityBanner, SessionExpiryBanner** are pharmacy-lite-specific sidebar features with no admin-portal equivalent. They are preserved in Plan 2 within the new sidebar architecture.

---

## Deliverable: Four Plans

| Plan | Branch name | Primary change |
|------|-------------|----------------|
| 1 | `feat/pharmacy-lite-design-foundation` | Layout, fonts, globals.css, ThemeProvider, shadcn re-exports |
| 2 | `feat/pharmacy-lite-sidebar-rebuild` | Replace AppShellWrapper with shadcn sidebar primitives |
| 3 | `feat/pharmacy-lite-page-headers` | TopHeader + page structure for all 21 routes |
| 4 | `feat/pharmacy-lite-token-sweep` | Replace hardcoded colors with semantic tokens in 35 components |

---

## Plan 1 — Foundation

### 1.1 Font acquisition

Download and commit the following woff2 files to `apps/pharmacy-lite/public/fonts/`:

```
public/fonts/
  manrope/
    Manrope-Regular.woff2      (weight 400)
    Manrope-Medium.woff2       (weight 500)
    Manrope-SemiBold.woff2     (weight 600)
    Manrope-Bold.woff2         (weight 700)
  public-sans/
    PublicSans-Regular.woff2   (weight 400)
    PublicSans-Medium.woff2    (weight 500)
    PublicSans-SemiBold.woff2  (weight 600)
    PublicSans-Bold.woff2      (weight 700)
```

Both fonts are SIL OFL licensed. Sources: Manrope from https://github.com/sharanda/manrope (releases), Public Sans from https://github.com/uswds/public-sans (releases). Download latin subset only. Total size budget: ~350 KB before Brotli.

**Why local files and not `next/font/google`:** `next/font/google` downloads fonts at build time, which fails in offline CI environments. Local files are in source control and available unconditionally. Serwist precaches all Next.js static assets automatically — no special configuration needed.

### 1.2 `apps/pharmacy-lite/src/app/layout.tsx`

Replace the current root layout. Key changes:
- Replace `urbanist` with two `localFont` declarations: `manrope` (variable `--font-manrope`) and `publicSans` (variable `--font-public-sans`)
- Apply both font variables on `<html>` className: `${manrope.variable} ${publicSans.variable}`
- Add `suppressHydrationWarning` to `<html>` (required for dark mode — prevents React hydration mismatch from the inline theme script)
- Add the dark mode flash-prevention inline script in `<head>` (identical to admin-portal's — reads `localStorage.theme`, falls back to `prefers-color-scheme`, sets `data-theme` attribute synchronously before first paint)
- Change `<body>` className from `font-sans bg-neutral-50 text-neutral-900` to `font-sans bg-background text-foreground antialiased`
- Wrap children in `<ThemeProvider>` (import from `@/components/ThemeProvider`)
- Keep: `<ClientErrorBoundary>`, locale/dir detection, RTL Arabic stylesheet link

```tsx
// Target shape:
export default async function RootLayout({ children }) {
  const locale = await getLocale()
  const dir = getDirection(locale)
  return (
    <html lang={locale} dir={dir} suppressHydrationWarning
          className={`${manrope.variable} ${publicSans.variable}`}>
      <head>
        {isRtl && <link rel="stylesheet" href="/fonts-arabic.css" />}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans bg-background text-foreground antialiased">
        <ThemeProvider>
          <ClientErrorBoundary>
            {children}
          </ClientErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

### 1.3 `apps/pharmacy-lite/tailwind.config.ts`

Update `theme.extend.fontFamily` to reference the new font CSS variables AND preserve the RTL-safe CSS variable approach:

```ts
fontFamily: {
  sans:    ['var(--font-family-sans)', 'system-ui', 'sans-serif'],
  heading: ['var(--font-family-heading)', 'system-ui', 'sans-serif'],
},
```

The values stay as CSS variables. The actual font names are provided by the overrides in `globals.css` (section 1.4). This preserves the `[dir="rtl"]` override chain in `tokens.css`.

Remove the existing `fontFamily` entry (`['var(--font-family-sans)', 'system-ui', 'sans-serif']` — already correct, no change needed if present).

### 1.4 `apps/pharmacy-lite/src/app/globals.css`

Add the following to `globals.css`:

```css
/* ── Font overrides (Manrope replaces Urbanist) ── */
:root {
  --font-family-sans:    var(--font-manrope), system-ui, sans-serif;
  --font-family-heading: var(--font-public-sans), system-ui, sans-serif;
}
[dir="rtl"] {
  --font-family-sans: var(--font-family-sans-ar);
}

/* ── Base resets (matches admin-portal) ── */
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

Also add `@import "tw-animate-css";` after the tailwind directives (same as admin-portal). `tw-animate-css` is already a transitive dependency — verify it's in `package.json`; add `"tw-animate-css": "^1.0.0"` to devDependencies if missing.

The print styles block at the bottom is preserved unchanged.

### 1.5 `apps/pharmacy-lite/src/components/ThemeProvider.tsx`

Create this file — identical copy of `apps/admin-portal/src/components/ThemeProvider.tsx`. No modifications.

### 1.6 `apps/pharmacy-lite/src/components/ui/` — shadcn re-exports

Delete `Button.tsx` (the hand-rolled version). Create the following re-export files, each importing from the corresponding `@ultranos/ui-kit` subpath export:

| File | Import from |
|------|-------------|
| `button.tsx` | `@ultranos/ui-kit/components/ui/button` |
| `badge.tsx` | `@ultranos/ui-kit/components/ui/badge` |
| `breadcrumb.tsx` | `@ultranos/ui-kit/components/ui/breadcrumb` |
| `dialog.tsx` | `@ultranos/ui-kit/components/ui/dialog` |
| `dropdown-menu.tsx` | `@ultranos/ui-kit/components/ui/dropdown-menu` |
| `input.tsx` | `@ultranos/ui-kit/components/ui/input` |
| `label.tsx` | `@ultranos/ui-kit/components/ui/label` |
| `select.tsx` | `@ultranos/ui-kit/components/ui/select` |
| `separator.tsx` | `@ultranos/ui-kit/components/ui/separator` |
| `sheet.tsx` | `@ultranos/ui-kit/components/ui/sheet` |
| `sidebar.tsx` | `@ultranos/ui-kit/components/ui/sidebar` |
| `skeleton.tsx` | `@ultranos/ui-kit/components/ui/skeleton` |
| `textarea.tsx` | `@ultranos/ui-kit/components/ui/textarea` |
| `tooltip.tsx` | `@ultranos/ui-kit/components/ui/tooltip` |

Each file is a barrel re-export:
```ts
export * from '@ultranos/ui-kit/components/ui/button'
```

**Impact on existing imports:** Any `import { Button } from '@/components/ui/Button'` (capital B) must be updated to `import { Button } from '@/components/ui/button'` (lowercase b). Grep for this pattern across `src/` to find all occurrences.

### 1.7 `apps/pharmacy-lite/package.json`

Add `"tw-animate-css"` to `devDependencies` if not already present. Run `pnpm install`.

### 1.8 Verification (Plan 1)

```bash
pnpm -F pharmacy-lite typecheck   # expect 0 new errors
pnpm -F pharmacy-lite test        # expect no new failures (snapshot changes from font var updates are acceptable)
pnpm -F pharmacy-lite build       # expect successful build
```

---

## Plan 2 — Sidebar Rebuild

Replace `AppShellWrapper.tsx` (which uses the legacy ui-kit `Sidebar` wrapper) with the shadcn sidebar primitive pattern used by admin-portal.

### 2.1 New file structure

```
src/components/sidebar/
  app-sidebar.tsx       ← root sidebar component
  nav-config.ts         ← NavGroup/NavItem type definitions + navGroups array
  nav-main.tsx          ← group-based collapsible nav (copied from admin-portal, adapted)
  nav-user.tsx          ← user dropdown with sign-out + theme toggle
  pharmacy-header.tsx   ← sidebar header showing pharmacy name + Pill icon (replaces LocationSwitcher)
```

### 2.2 `src/components/sidebar/nav-config.ts`

Define `NavItem` and `NavGroup` types (identical to admin-portal's `nav-config.ts`). Migrate the existing `navItems` array from `AppShellWrapper.tsx` into `navGroups`:

```ts
// Group mapping from AppShellWrapper navItems:
// group: 'primary'    → NavGroup 'Dispensing'
// group: 'inventory'  → NavGroup 'Inventory'
// group: 'financial'  → NavGroup 'Financial'
// group: 'clinical'   → NavGroup 'Clinical'
// group: 'system'     → NavGroup 'System' (single-item groups for Reports + Sync Queue + Settings)
```

Badge counts (pending/failed sync) are **not** part of `nav-config.ts` static data. They come from `useSyncStore` — handle in `nav-main.tsx` by accepting an optional `badges?: Record<string, number>` prop, or pass them into the nav item definitions at runtime inside `app-sidebar.tsx`.

The `i18n` translations from `useTranslations('sidebar')` are kept — `nav-config.ts` exports icon/url/grouping; the label comes from the translation key, resolved at render time in `nav-main.tsx`.

### 2.3 `src/components/sidebar/pharmacy-header.tsx`

Analogous to admin-portal's `location-switcher.tsx` but simpler — no dropdown, no multi-location switching. Displays the pharmacy name and a `Pill` icon. Reads pharmacy name from `useAuthSessionStore` (the `session.pharmacyName` field, falling back to `'Pharmacy Lite'`).

```tsx
// Shape:
export function PharmacyHeader() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className="pointer-events-none">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Pill className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{pharmacyName}</span>
            <span className="truncate text-xs text-muted-foreground">Pharmacy</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
```

### 2.4 `src/components/sidebar/nav-main.tsx`

Copy `apps/admin-portal/src/components/sidebar/nav-main.tsx` verbatim, then adapt:
- Import from `@/components/ui/sidebar` (not admin-portal's local path)
- Add badge support: if a nav item has a non-zero `badge` count, render it as a small `<span>` with `bg-primary text-primary-foreground` beside the label
- SyncPulse indicator: not in nav-main — placed in the sidebar footer instead (see 2.5)
- i18n: `nav-config.ts` exports a `titleKey` string (e.g. `'dashboard'`) per item. `nav-main.tsx` calls `useTranslations('sidebar')` and resolves each key at render time — same namespace already used in `AppShellWrapper.tsx`.

### 2.5 `src/components/sidebar/nav-user.tsx`

Copy `apps/admin-portal/src/components/sidebar/nav-user.tsx`, then adapt:
- Replace `setAccessToken(null)` (admin-portal-specific trpc) with the existing pharmacy-lite sign-out logic from `AppShellWrapper`: `encryptionKeyStore.wipe()`, `stopSyncDrain()`, `stopKrlSync()`, `stopAuditDrain()`
- Replace the `SessionTimer` sub-component with the existing `SessionExpiryBanner` or inline the timer display
- Read `session.name` (not just email) for the display name — fallback chain: `session.name → email.split('@')[0] → 'Pharmacist'`
- Role label under the user name: show `session.role` (e.g., `'pharmacist'`)
- Keep the theme toggle `DropdownMenuItem` (Moon/Sun) identical to admin-portal

### 2.6 `src/components/sidebar/app-sidebar.tsx`

```tsx
export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <PharmacyHeader />
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={navGroups} />
      </SidebarContent>
      <SidebarFooter>
        <SyncCapacityBanner />        {/* pharmacy-lite-specific */}
        <SyncPulse />                 {/* pharmacy-lite-specific */}
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
```

### 2.7 `src/app/[locale]/layout.tsx`

Replace `<AppShellWrapper>` with `SidebarProvider` + `AppSidebar` + `SidebarInset`:

```tsx
export default async function LocaleLayout({ children }) {
  const messages = await getMessages()
  return (
    <NextIntlClientProvider messages={messages}>
      <SyncProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <a href="#main-content" className="sr-only focus:not-sr-only ...">
              Skip to content
            </a>
            <main id="main-content">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </SyncProvider>
    </NextIntlClientProvider>
  )
}
```

`SessionExpiryBanner` moves from `AppShellWrapper` into `app-sidebar.tsx` footer (before `NavUser`). `SyncCapacityBanner` also goes in the footer.

### 2.8 Delete `src/components/AppShellWrapper.tsx`

Once the new sidebar is wired, delete this file. It is fully replaced by the sidebar directory.

### 2.9 Verification (Plan 2)

```bash
pnpm -F pharmacy-lite typecheck
pnpm -F pharmacy-lite test
# Manual: open the app, confirm sidebar renders, nav links work, sign-out works, theme toggle works
```

---

## Plan 3 — Page Structure (TopHeader)

### 3.1 `src/components/TopHeader.tsx`

Exact copy of `apps/admin-portal/src/components/TopHeader.tsx`. No modifications required:

```tsx
interface TopHeaderProps {
  title: string
  description?: string
}
export function TopHeader({ title, description }: TopHeaderProps) {
  return (
    <div className="px-6 pt-6 pb-4">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}
```

### 3.2 `src/components/BreadcrumbHeader.tsx`

For sub-pages (e.g. `/inventory/receive`, `/pos/cash-drawer`). Displays a breadcrumb and the sidebar trigger button. Mirrors the admin-portal's `BreadcrumbHeader` pattern:

```tsx
// Props:
interface BreadcrumbHeaderProps {
  crumbs: { label: string; href?: string }[]
}
// Renders: SidebarTrigger + Separator + Breadcrumb
```

Uses `SidebarTrigger`, `Separator`, `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbSeparator`, `BreadcrumbPage` — all from `@/components/ui/` re-exports.

### 3.3 Page updates

Every page that currently renders a `<div className="mb-8 flex items-center justify-between">` welcome header or ad-hoc `<h2>` title gets a `<TopHeader>` at the top. The inner component's ad-hoc header is removed.

| Page file | Current header | Change |
|-----------|---------------|--------|
| `[locale]/page.tsx` (dashboard) | Inline in `PharmacyDashboard` | Add `<TopHeader title="Dashboard" />` above `<PharmacyDashboard />`, remove inline header from component |
| `[locale]/queue/page.tsx` | In `PrescriptionQueueView` | Add `<TopHeader title="Prescription Queue" />` |
| `[locale]/scan/page.tsx` | In `PharmacyScannerView` | Add `<TopHeader title="Scan Prescription" />` |
| `[locale]/paper-rx/page.tsx` | In `ManualRxEntry` | Add `<TopHeader title="Paper Prescription" />` |
| `[locale]/history/page.tsx` | In `DispensingHistoryView` | Add `<TopHeader title="Dispensing History" />` |
| `[locale]/controlled/page.tsx` | In `ControlledSubstancesView` | Add `<TopHeader title="Controlled Substances" />` |
| `[locale]/unverified/page.tsx` | In `UnverifiedDispensesView` | Add `<TopHeader title="Unverified Dispenses" />` |
| `[locale]/sync/page.tsx` | In `SyncQueueDashboard` | Add `<TopHeader title="Sync Queue" description="Offline sync status and queue management." />` |
| `[locale]/settings/page.tsx` | In `PharmacySettingsView` | Add `<TopHeader title="Settings" />` |
| `[locale]/reports/page.tsx` | — | Add `<TopHeader title="Reports" />` |
| `[locale]/inventory/page.tsx` | — | Add `<TopHeader title="Inventory" />` |
| `[locale]/inventory/receive/page.tsx` | — | Add `<BreadcrumbHeader crumbs={[{label:'Inventory',href:'/inventory'},{label:'Receive Stock'}]} />` |
| `[locale]/inventory/catalog/page.tsx` | — | `<BreadcrumbHeader>` |
| `[locale]/inventory/suppliers/page.tsx` | — | `<BreadcrumbHeader>` |
| `[locale]/inventory/count/page.tsx` | — | `<BreadcrumbHeader>` |
| `[locale]/inventory/transfers/page.tsx` | — | `<BreadcrumbHeader>` |
| `[locale]/pos/page.tsx` | — | Add `<TopHeader title="Point of Sale" />` |
| `[locale]/pos/cash-drawer/page.tsx` | — | `<BreadcrumbHeader>` |
| `[locale]/pos/accounts/page.tsx` | — | `<BreadcrumbHeader>` |
| `[locale]/register-patient/page.tsx` | — | Add `<TopHeader title="Register Patient" />` |

Login page (`[locale]/login/page.tsx`) is excluded — no sidebar or header.

### 3.4 Remove ad-hoc headers from components

After TopHeader is added to the page level, remove the old ad-hoc headers from inside the component files. Specifically:

- `PharmacyDashboard.tsx`: remove the `<div className="mb-8 flex items-center justify-between">` welcome header block (lines 173–194). Keep the stats, action hub, cards.
- Other components: grep for `<h2` and `<h1` inside pharmacy components and remove anything that duplicates what TopHeader now provides.

### 3.5 Verification (Plan 3)

```bash
pnpm -F pharmacy-lite typecheck
pnpm -F pharmacy-lite test
# Visual: every page has a TopHeader with consistent padding and typography
```

---

## Plan 4 — Component Token Sweep

### 4.1 Color token mapping

| Old class | New class | Notes |
|-----------|-----------|-------|
| `text-neutral-900` | `text-foreground` | Primary text |
| `text-neutral-800` | `text-foreground` | |
| `text-neutral-700` | `text-foreground` | |
| `text-neutral-600` | `text-muted-foreground` | Secondary text |
| `text-neutral-500` | `text-muted-foreground` | Secondary text |
| `text-neutral-400` | `text-muted-foreground` | Placeholder/disabled |
| `bg-white` | `bg-card` | Card backgrounds |
| `bg-neutral-50` | `bg-background` or `bg-accent` | Page bg or hover state |
| `bg-neutral-100` | `bg-muted` | Subtle bg |
| `border-neutral-200` | `border-border` | Default borders |
| `border-neutral-300` | `border-border` | |
| `hover:bg-neutral-50` | `hover:bg-accent` | Hover state |
| `hover:bg-neutral-100` | `hover:bg-accent` | |
| `rounded-lg` (on cards) | `rounded-2xl` | Card border radius |
| `rounded-xl` (on cards) | `rounded-2xl` | |
| `shadow-md` | `shadow-card` | Card shadows |
| `shadow-sm` | `shadow-card` | |
| `bg-green-100 text-green-700` | `bg-success/10 text-success` | Success badge |
| `bg-green-500` / `bg-green-600` | `bg-success` | Success fill |
| `bg-red-100 text-red-700` | `bg-destructive/10 text-destructive` | Error badge |
| `bg-red-500` | `bg-destructive` | Error fill |
| `bg-amber-100 text-amber-700` | `bg-warning/10 text-warning` | Warning badge |
| `bg-blue-100 text-blue-700` | `bg-primary/10 text-primary` | Info/primary badge |
| `bg-orange-100 text-orange-700` | `bg-warning/10 text-warning` | |
| `text-green-600` / `text-green-700` | `text-success` | Success text |
| `text-red-600` / `text-red-700` | `text-destructive` | Error text |
| `text-amber-600` / `text-amber-700` | `text-warning` | Warning text |
| `divide-neutral-100` | `divide-border` | Table dividers |
| `bg-primary-500` / `bg-pill-green` | `bg-primary` | Primary fill (keep pill-green for pill-shaped brand elements only) |
| `text-primary-700` | `text-primary` | |
| `border-primary-200` | `border-primary/20` | |

**Exceptions — keep as-is:**
- `bg-pill-green` and `text-pill-text` on pill-shaped brand elements (the pharmacy-lite brand identity — the pill button shape)
- `bg-green-500` / `bg-red-500` on the connectivity indicator dot in `PharmacyDashboard` — these are direct status indicators, not semantic UI
- `animate-spin` spinner borders — these use color classes for the spinner effect and should not be changed to semantic tokens

### 4.2 Structural/layout token changes

All card containers (any `<div>` with `rounded-lg`, `border`, `shadow`, `bg-white`, `p-4`/`p-6`) should be updated to match admin-portal's card pattern:

```
rounded-2xl bg-card border border-border p-6 shadow-card
```

The `shadow-card` value is `0 1px 3px oklch(0.145 0 0 / 0.06)` (defined in `tokens.css`). It's subtle — just a light depth cue.

### 4.3 Badge pattern

Replace inline badge spans with the shadcn `Badge` component from `@/components/ui/badge`:

```tsx
// Before:
<span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Synced</span>

// After:
<Badge variant="outline" className="bg-success/10 text-success border-success/20">Synced</Badge>
```

Status badge variants:
- Synced / Completed / Active → `bg-success/10 text-success border-success/20`
- Pending / Reviewing / In-flight → `bg-warning/10 text-warning border-warning/20`
- Failed / Error / Overdue → `bg-destructive/10 text-destructive border-destructive/20`
- Loaded / Info / Primary → `bg-primary/10 text-primary border-primary/20`
- Paper Rx → `bg-warning/10 text-warning` (same as pending)

### 4.4 Button variant mapping

The old `Button.tsx` had variants: `primary`, `secondary`, `danger`, `warning`, `ghost`, `outline`. The ui-kit Button (shadcn) has: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`.

| Old variant | New variant | Notes |
|-------------|-------------|-------|
| `primary` | `default` | |
| `secondary` | `secondary` | |
| `danger` | `destructive` | |
| `warning` | `outline` + `className="border-warning text-warning hover:bg-warning/10"` | No direct shadcn equivalent |
| `ghost` | `ghost` | |
| `outline` | `outline` | |

All `variant="danger"` usages must be changed to `variant="destructive"` in the component sweep.

### 4.5 Files to update

All 35 pharmacy components in `src/components/pharmacy/` plus supporting components:

```
src/components/pharmacy/
  AllergyBanner.tsx
  ControlledSubstancesView.tsx
  DashboardActionHub.tsx
  DispensingConfirmationModal.tsx
  DispensingHistoryView.tsx
  DispensingSummaryCard.tsx
  EmptyState.tsx
  FulfillmentChecklist.tsx
  HistoryFilterBar.tsx
  HistoryItemRow.tsx
  InteractionCheckBanner.tsx
  LabelPreviewPanel.tsx
  ManualRxEntry.tsx
  MedicationLabel.tsx
  OfflineGraceForm.tsx
  Pagination.tsx
  PatientRegistrationForm.tsx
  PatientSearchBar.tsx
  PatientSearchResults.tsx
  PharmacyDashboard.tsx          ← also removes inline welcome header (Plan 3)
  PharmacySettingsView.tsx
  PharmacyScannerView.tsx
  PrescriptionQueueView.tsx
  PrescriptionScanner.tsx
  QueueItemCard.tsx
  RecentDispensingList.tsx
  SessionExpiryBanner.tsx
  ShiftSummary.tsx
  SyncCapacityBanner.tsx
  SyncPulse.tsx
  SyncQueueCard.tsx
  SyncQueueDashboard.tsx
  SyncQueueEntry.tsx
  UnverifiedDispensesCard.tsx
  UnverifiedDispensesView.tsx

src/components/inventory/          ← inventory-specific components
src/components/pos/                ← POS-specific components
src/components/patient/            ← if any exist
```

Additionally check: `src/components/AuthGuard.tsx`, `src/components/LanguageSelectorClient.tsx`, `src/components/ClientErrorBoundary.tsx` for any hardcoded color classes.

### 4.6 Snapshot updates

After token sweep, run:
```bash
pnpm -F pharmacy-lite test -- --update-snapshots
```

Review the snapshot diffs carefully — confirm only class name changes, no structural changes to the rendered HTML.

### 4.7 Verification (Plan 4)

```bash
pnpm -F pharmacy-lite typecheck
pnpm -F pharmacy-lite test   # after snapshot update, all should pass
pnpm -F pharmacy-lite build
```

---

## Cross-cutting concerns

### Dark mode

After Plan 1 (ThemeProvider wired), dark mode is immediately active via the theme toggle in `NavUser` (Plan 2). Plans 3 and 4 use only semantic tokens, so dark mode works automatically — no dark-specific classes needed in any component.

### RTL

The `[dir="rtl"]` override in `tokens.css` switches `--font-family-sans` to `var(--font-family-sans-ar)` (Noto Sans Arabic). Plan 1's globals.css override uses `var(--font-family-sans)` at the `tailwind.config` level, and the `[dir="rtl"]` block in `globals.css` re-overrides it to `var(--font-family-sans-ar)`. Chain:

```
LTR: tailwind `font-sans` → var(--font-family-sans) → var(--font-manrope) → Manrope
RTL: [dir="rtl"] in globals.css → var(--font-family-sans-ar) → Noto Sans Arabic
```

The `fonts-arabic.css` link in `layout.tsx` is preserved and loads Noto Sans Arabic when `isRtl === true`.

### Test impact summary

| Plan | Test impact |
|------|------------|
| 1 | Possible font-related snapshot changes in any test that renders text; `Button` import path changes (`@/components/ui/Button` → `@/components/ui/button`) |
| 2 | Sidebar component tests may need updating; `AppShellWrapper`-dependent tests replaced |
| 3 | Snapshot updates for page-level components that had inline headers |
| 4 | All 35 component snapshots regenerated |

### Dependency on ui-kit exports

All 14 shadcn subpath exports used in Plan 1 already exist in `packages/ui-kit/package.json` (confirmed). No ui-kit changes needed for Plans 1–4.

---

## Out of scope

- Pharmacy-lite-specific brand colors (`pill-green: #9fe870`, `pill-text: #163300`, `danger: var(--color-danger)`) — preserved in `tailwind.config.ts` as custom extensions on top of the preset
- New features, pages, or clinical functionality
- `apps/opd-lite`, `apps/lab-lite` — separate plans exist for those
- Accessibility improvements beyond what semantic token adoption provides
- Animation/motion beyond what `tw-animate-css` provides
