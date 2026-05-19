# Admin Portal Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Admin Portal UI to match the eHealth PMR design guide — lime/black/white palette, pill buttons, heavily-rounded cards, black table headers — with zero functional regressions.

**Architecture:** Pure CSS/Tailwind class changes across 27 files. No structural React changes, no new dependencies, no logic modifications. Configuration changes in tailwind.config.ts and globals.css establish the design tokens, then every component file gets its classes updated.

**Tech Stack:** Tailwind CSS 3.4, Next.js 15 App Router, TypeScript

---

## File Map

| File | Responsibility |
|------|---------------|
| `apps/admin-portal/tailwind.config.ts` | Design token definitions (colors, radii) |
| `apps/admin-portal/src/app/globals.css` | CSS custom properties, wavy divider utility |
| `apps/admin-portal/src/app/layout.tsx` | Root body classes |
| `apps/admin-portal/src/components/AuthGuard.tsx` | Layout wrapper background, access-denied card |
| `apps/admin-portal/src/components/Sidebar.tsx` | Full sidebar restyle |
| `apps/admin-portal/src/app/page.tsx` | Landing page |
| `apps/admin-portal/src/app/login/page.tsx` | Login form |
| `apps/admin-portal/src/app/register/page.tsx` | Registration wizard |
| `apps/admin-portal/src/app/dashboard/page.tsx` | Dashboard stat cards |
| `apps/admin-portal/src/app/providers/page.tsx` | KYC queue table |
| `apps/admin-portal/src/app/providers/[submissionId]/page.tsx` | KYC detail |
| `apps/admin-portal/src/app/providers/expiry/page.tsx` | License expiry |
| `apps/admin-portal/src/app/labs/page.tsx` | Labs queue |
| `apps/admin-portal/src/app/labs/[labId]/page.tsx` | Lab detail |
| `apps/admin-portal/src/app/ai-models/page.tsx` | AI models |
| `apps/admin-portal/src/app/alerts/page.tsx` | Alerts list |
| `apps/admin-portal/src/app/alerts/[alertId]/page.tsx` | Alert detail |
| `apps/admin-portal/src/app/audit/page.tsx` | Audit chain |
| `apps/admin-portal/src/app/settings/page.tsx` | Settings |
| `apps/admin-portal/src/app/subscriptions/page.tsx` | Subscriptions |
| `apps/admin-portal/src/app/users/create/page.tsx` | User creation |
| `apps/admin-portal/src/components/providers/RenewLicenseModal.tsx` | Renew license modal |
| `apps/admin-portal/src/components/registration/OrgDetailsStep.tsx` | Registration step 1 |
| `apps/admin-portal/src/components/registration/AdminCredentialsStep.tsx` | Registration step 2 |
| `apps/admin-portal/src/components/registration/ModuleSelectionStep.tsx` | Registration step 3 |
| `apps/admin-portal/src/components/subscriptions/AddModuleDialog.tsx` | Add module dialog |
| `apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx` | Remove module dialog |

---

### Task 1: Tailwind Config & Global CSS

**Files:**
- Modify: `apps/admin-portal/tailwind.config.ts`
- Modify: `apps/admin-portal/src/app/globals.css`

- [ ] **Step 1: Update tailwind.config.ts with new design tokens**

Replace the entire file with:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter'", 'system-ui', '-apple-system', "'Segoe UI'", 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          lime: '#D4FF00',
        },
        surface: '#F3F4F6',
        border: '#E5E7EB',
        'text-muted': '#6B7280',
        'success-green': '#A3E635',
        // Keep old primary for any transient references during migration
        primary: {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          400: 'var(--color-primary-400)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
        },
        danger: 'var(--color-danger)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 2: Update globals.css with wavy divider utility**

Replace the entire file with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import '@ultranos/ui-kit/tokens.css';

@layer utilities {
  .wavy-divider::after {
    content: '';
    display: block;
    width: 40px;
    height: 6px;
    margin-top: 8px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='6'%3E%3Cpath d='M0 3 Q5 0 10 3 Q15 6 20 3 Q25 0 30 3 Q35 6 40 3' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/tailwind.config.ts apps/admin-portal/src/app/globals.css
git commit -m "style(admin-portal): add design tokens and wavy divider utility"
```

---

### Task 2: Root Layout & AuthGuard

**Files:**
- Modify: `apps/admin-portal/src/app/layout.tsx`
- Modify: `apps/admin-portal/src/components/AuthGuard.tsx`

- [ ] **Step 1: Update layout.tsx body classes**

Change the body className from:
```
font-sans bg-neutral-50 text-neutral-900 antialiased
```
to:
```
font-sans bg-surface text-black antialiased
```

- [ ] **Step 2: Update AuthGuard — access-denied state**

In AuthGuard.tsx, change the access-denied block:

Old:
```tsx
<div className="flex min-h-screen items-center justify-center bg-neutral-50">
  <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 p-8 text-center">
    <h1 className="text-xl font-bold text-red-800">Access Denied</h1>
    <p className="mt-2 text-sm text-red-700">
```

New:
```tsx
<div className="flex min-h-screen items-center justify-center bg-surface">
  <div className="w-full max-w-md rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
    <h1 className="text-xl font-bold text-red-800">Access Denied</h1>
    <p className="mt-2 text-sm text-red-700">
```

- [ ] **Step 3: Update AuthGuard — sign-out button**

Old:
```tsx
className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
```

New:
```tsx
className="mt-4 rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 hover:scale-[1.02] transition-all"
```

- [ ] **Step 4: Update AuthGuard — main layout wrapper**

Old:
```tsx
<div className="flex min-h-screen">
  <Sidebar />
  <main className="flex-1 p-6">{children}</main>
</div>
```

New:
```tsx
<div className="flex min-h-screen">
  <Sidebar />
  <main className="flex-1 p-6 lg:p-8">{children}</main>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/app/layout.tsx apps/admin-portal/src/components/AuthGuard.tsx
git commit -m "style(admin-portal): restyle root layout and AuthGuard shell"
```

---

### Task 3: Sidebar

**Files:**
- Modify: `apps/admin-portal/src/components/Sidebar.tsx`

- [ ] **Step 1: Update sidebar container**

Old:
```tsx
<aside className="w-60 bg-neutral-900 text-neutral-100 flex flex-col shrink-0">
```

New:
```tsx
<aside className="w-60 bg-black text-neutral-400 flex flex-col shrink-0 min-h-screen">
```

- [ ] **Step 2: Update logo area**

Old:
```tsx
<div className="p-4 border-b border-neutral-700">
  <h1 className="text-lg font-bold tracking-tight">Ultranos Admin</h1>
</div>
```

New:
```tsx
<div className="p-4 border-b border-white/10">
  <h1 className="text-lg font-bold tracking-tight text-white">
    <span className="text-brand-lime">U</span>ltranos Admin
  </h1>
</div>
```

- [ ] **Step 3: Update nav item styling**

Old:
```tsx
className={`flex items-center gap-3 ${indent ? 'px-8' : 'px-4'} py-2.5 text-sm transition-colors ${
  isActive
    ? 'bg-neutral-800 text-white font-medium'
    : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
}`}
```

New:
```tsx
className={`flex items-center gap-3 ${indent ? 'px-8' : 'px-4'} py-2.5 text-sm rounded-xl mx-2 transition-colors ${
  isActive
    ? 'bg-brand-lime/10 text-brand-lime font-medium border-s-2 border-brand-lime'
    : 'text-neutral-400 hover:bg-white/5 hover:text-white'
}`}
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin-portal/src/components/Sidebar.tsx
git commit -m "style(admin-portal): restyle sidebar with lime accent and black bg"
```

---

### Task 4: Landing Page

**Files:**
- Modify: `apps/admin-portal/src/app/page.tsx`

- [ ] **Step 1: Update landing page container**

Old:
```tsx
<div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4">
```

New:
```tsx
<div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4">
```

- [ ] **Step 2: Update brand heading**

Old:
```tsx
<h1 className="text-3xl font-bold tracking-tight text-neutral-900">
  Ultranos
</h1>
<p className="mt-2 text-lg text-neutral-600">
  Healthcare Administration Portal
</p>
```

New:
```tsx
<h1 className="text-4xl font-bold tracking-tight text-black wavy-divider">
  Ultranos
</h1>
<p className="mt-4 text-lg text-text-muted">
  Healthcare Administration Portal
</p>
```

- [ ] **Step 3: Update CTA buttons**

Old:
```tsx
<a
  href="/register"
  className="inline-flex items-center justify-center rounded-md bg-primary-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
>
  Register Your Organization
</a>
<a
  href="/login"
  className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-6 py-3 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
>
  Sign In
</a>
```

New:
```tsx
<a
  href="/register"
  className="inline-flex items-center justify-center rounded-full bg-brand-lime px-6 py-3 text-sm font-semibold text-black hover:brightness-95 hover:scale-[1.02] transition-all focus:outline-none focus:ring-2 focus:ring-brand-lime/50 focus:ring-offset-2"
>
  Register Your Organization
</a>
<a
  href="/login"
  className="inline-flex items-center justify-center rounded-full border border-black bg-white px-6 py-3 text-sm font-medium text-black hover:bg-neutral-50 hover:scale-[1.02] transition-all focus:outline-none focus:ring-2 focus:ring-brand-lime/50 focus:ring-offset-2"
>
  Sign In
</a>
```

- [ ] **Step 4: Update feature highlight cards**

Old:
```tsx
<div className="rounded-lg border border-neutral-200 bg-white p-4">
  <p className="text-sm font-medium text-neutral-900">Multi-Module Platform</p>
  <p className="mt-1 text-xs text-neutral-500">
```

New (apply to all three cards):
```tsx
<div className="rounded-3xl bg-white p-5">
  <p className="text-sm font-medium text-black">Multi-Module Platform</p>
  <p className="mt-1 text-xs text-text-muted">
```

- [ ] **Step 5: Update value prop paragraph**

Old:
```tsx
<p className="mx-auto mt-6 max-w-md text-sm text-neutral-500">
```

New:
```tsx
<p className="mx-auto mt-6 max-w-md text-sm text-text-muted">
```

- [ ] **Step 6: Commit**

```bash
git add apps/admin-portal/src/app/page.tsx
git commit -m "style(admin-portal): restyle landing page with lime CTAs and rounded cards"
```

---

### Task 5: Login Page

**Files:**
- Modify: `apps/admin-portal/src/app/login/page.tsx`

- [ ] **Step 1: Update login container and card**

Old:
```tsx
<div className="flex min-h-screen items-center justify-center bg-neutral-50">
  <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
    <h2 className="mb-6 text-center text-xl font-bold text-neutral-900">
```

New:
```tsx
<div className="flex min-h-screen items-center justify-center bg-surface">
  <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
    <h2 className="mb-6 text-center text-xl font-bold text-black">
```

- [ ] **Step 2: Update error alert**

Old:
```tsx
className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
```

New:
```tsx
className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
```

- [ ] **Step 3: Update form labels**

Old (both email and password labels):
```tsx
className="mb-1 block text-sm font-medium text-neutral-700"
```

New:
```tsx
className="mb-1 block text-sm font-medium text-text-muted"
```

- [ ] **Step 4: Update form inputs**

Old (both email and password inputs):
```tsx
className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
```

New:
```tsx
className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
```

- [ ] **Step 5: Update primary buttons (Sign In, Verify Security Key)**

Old:
```tsx
className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
```

New:
```tsx
className="w-full rounded-full bg-brand-lime px-4 py-2.5 text-sm font-semibold text-black hover:brightness-95 hover:scale-[1.02] transition-all disabled:opacity-50"
```

- [ ] **Step 6: Update MFA info box**

Old:
```tsx
className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
```

New:
```tsx
className="rounded-2xl border border-brand-lime/30 bg-brand-lime/10 px-4 py-3 text-sm text-black"
```

- [ ] **Step 7: Update back-to-sign-in link**

Old:
```tsx
className="w-full text-sm text-neutral-500 hover:text-neutral-700"
```

New:
```tsx
className="w-full text-sm text-text-muted hover:text-black transition-colors"
```

- [ ] **Step 8: Update register link**

Old:
```tsx
<p className="mt-6 text-center text-xs text-neutral-500">
  New to Ultranos?{' '}
  <a href="/register" className="font-medium text-primary-600 hover:text-primary-700">
```

New:
```tsx
<p className="mt-6 text-center text-xs text-text-muted">
  New to Ultranos?{' '}
  <a href="/register" className="font-medium text-black hover:text-brand-lime transition-colors">
```

- [ ] **Step 9: Commit**

```bash
git add apps/admin-portal/src/app/login/page.tsx
git commit -m "style(admin-portal): restyle login page with lime accent and rounded forms"
```

---

### Task 6: Registration Wizard & Steps

**Files:**
- Modify: `apps/admin-portal/src/app/register/page.tsx`
- Modify: `apps/admin-portal/src/components/registration/OrgDetailsStep.tsx`
- Modify: `apps/admin-portal/src/components/registration/AdminCredentialsStep.tsx`
- Modify: `apps/admin-portal/src/components/registration/ModuleSelectionStep.tsx`

- [ ] **Step 1: Update register/page.tsx container and card**

Old:
```tsx
<div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
  <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
    <h1 className="mb-2 text-center text-xl font-bold text-neutral-900">
```

New:
```tsx
<div className="flex min-h-screen items-center justify-center bg-surface px-4">
  <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
    <h1 className="mb-2 text-center text-xl font-bold text-black">
```

- [ ] **Step 2: Update register/page.tsx subtitle**

Old:
```tsx
<p className="mb-6 text-center text-sm text-neutral-500">
```

New:
```tsx
<p className="mb-6 text-center text-sm text-text-muted">
```

- [ ] **Step 3: Update progress indicator step circles**

Old:
```tsx
className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
  isActive
    ? 'bg-primary-600 text-white'
    : isComplete
      ? 'bg-green-500 text-white'
      : 'bg-neutral-200 text-neutral-500'
}`}
```

New:
```tsx
className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
  isActive
    ? 'bg-black text-white'
    : isComplete
      ? 'bg-brand-lime text-black'
      : 'bg-surface text-text-muted'
}`}
```

- [ ] **Step 4: Update step label text**

Old:
```tsx
<span className="mt-1 text-xs text-neutral-500">{label}</span>
```

New:
```tsx
<span className="mt-1 text-xs text-text-muted">{label}</span>
```

- [ ] **Step 5: Update error alert**

Old:
```tsx
className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
```

New:
```tsx
className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
```

- [ ] **Step 6: Update sign-in link**

Old:
```tsx
<p className="mt-6 text-center text-xs text-neutral-500">
  Already have an account?{' '}
  <a href="/login" className="font-medium text-primary-600 hover:text-primary-700">
```

New:
```tsx
<p className="mt-6 text-center text-xs text-text-muted">
  Already have an account?{' '}
  <a href="/login" className="font-medium text-black hover:text-brand-lime transition-colors">
```

- [ ] **Step 7: Update OrgDetailsStep.tsx — form labels, inputs, and button**

Apply to all labels:
Old: `text-sm font-medium text-neutral-700`
New: `text-sm font-medium text-text-muted`

Apply to all inputs and selects:
Old: `rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500`
New: `rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30`

Apply to Next button:
Old: `rounded-md bg-primary-600 ... text-white hover:bg-primary-700`
New: `rounded-full bg-brand-lime ... text-black font-semibold hover:brightness-95 hover:scale-[1.02] transition-all`

- [ ] **Step 8: Update AdminCredentialsStep.tsx — same pattern as OrgDetailsStep**

Apply identical label, input, and button changes as Step 7.

Additionally, update password strength bar colors if they use `primary-*`:
- Weak: keep `bg-red-500`
- Fair: keep `bg-amber-500`
- Strong: change from `bg-green-500` to `bg-brand-lime`

Apply to Back button:
Old: `rounded-md border border-neutral-300 ... hover:bg-neutral-50`
New: `rounded-full border border-black ... hover:bg-neutral-50 hover:scale-[1.02] transition-all`

- [ ] **Step 9: Update ModuleSelectionStep.tsx — checkboxes, cards, buttons**

Module cards:
Old: `rounded-lg border border-neutral-200 p-4`
New: `rounded-3xl border border-border p-4`

Selected module card:
Old: `border-primary-500 bg-primary-50`
New: `border-brand-lime bg-brand-lime/10`

Checkbox accent:
Old: `accent-primary-600`
New: `accent-[#D4FF00]`

Complete Registration button:
Old: `rounded-md bg-primary-600 ... text-white hover:bg-primary-700`
New: `rounded-full bg-brand-lime ... text-black font-semibold hover:brightness-95 hover:scale-[1.02] transition-all`

Back button: same as AdminCredentialsStep.

Trial text:
Old: `text-xs text-neutral-500`
New: `text-xs text-text-muted`

- [ ] **Step 10: Commit**

```bash
git add apps/admin-portal/src/app/register/page.tsx apps/admin-portal/src/components/registration/
git commit -m "style(admin-portal): restyle registration wizard with lime progress and rounded cards"
```

---

### Task 7: Dashboard

**Files:**
- Modify: `apps/admin-portal/src/app/dashboard/page.tsx`

- [ ] **Step 1: Update page heading**

Old:
```tsx
<h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
<p className="mt-1 text-neutral-500">Overview of pending actions and system health.</p>
```

New:
```tsx
<h1 className="text-4xl font-bold tracking-tight wavy-divider">Dashboard</h1>
<p className="mt-4 text-text-muted">Overview of pending actions and system health.</p>
```

- [ ] **Step 2: Update error message**

Old:
```tsx
<div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
```

New:
```tsx
<div className="mt-4 rounded-2xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
```

- [ ] **Step 3: Update stat cards with mixed color variants**

Old:
```tsx
const statCards = [
  { title: 'Pending KYC Reviews', value: stats?.pendingKycReviews ?? '—', color: 'border-amber-400 bg-amber-50', href: '/providers' },
  { title: 'Pending Lab Approvals', value: stats?.pendingLabApprovals ?? '—', color: 'border-blue-400 bg-blue-50', href: '/labs' },
  { title: 'Active Alerts', value: stats?.activeAlerts ?? '—', color: 'border-red-400 bg-red-50', href: '/alerts' },
  { title: 'Recent Audit Events', value: stats?.recentAuditEvents ?? '—', color: 'border-neutral-400 bg-neutral-50', href: null },
]
```

New:
```tsx
const statCards = [
  { title: 'Pending KYC Reviews', value: stats?.pendingKycReviews ?? '—', color: 'bg-brand-lime text-black', href: '/providers' },
  { title: 'Pending Lab Approvals', value: stats?.pendingLabApprovals ?? '—', color: 'bg-black text-white', href: '/labs' },
  { title: 'Active Alerts', value: stats?.activeAlerts ?? '—', color: 'bg-white text-black border border-border', href: '/alerts' },
  { title: 'Recent Audit Events', value: stats?.recentAuditEvents ?? '—', color: 'bg-white text-black border border-border', href: null },
]
```

- [ ] **Step 4: Update card rendering**

Old:
```tsx
<div
  key={card.title}
  onClick={card.href ? () => router.push(card.href) : undefined}
  className={`rounded-lg border-s-4 p-4 shadow-sm ${card.color} ${card.href ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
>
  <p className="text-sm font-medium text-neutral-600">{card.title}</p>
  <p className="mt-2 text-3xl font-bold text-neutral-900">{card.value}</p>
</div>
```

New:
```tsx
<div
  key={card.title}
  onClick={card.href ? () => router.push(card.href) : undefined}
  className={`rounded-3xl p-6 ${card.color} ${card.href ? 'cursor-pointer hover:scale-[1.02] transition-all' : ''}`}
>
  <p className="text-sm font-medium opacity-70">{card.title}</p>
  <p className="mt-2 text-4xl font-bold tracking-tight">{card.value}</p>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/app/dashboard/page.tsx
git commit -m "style(admin-portal): restyle dashboard with lime/dark stat cards"
```

---

### Task 8: KYC Queue (Providers Page)

**Files:**
- Modify: `apps/admin-portal/src/app/providers/page.tsx`

- [ ] **Step 1: Update page heading**

Old:
```tsx
<h1 className="text-2xl font-bold tracking-tight">KYC Verification Queue</h1>
<p className="mt-1 text-neutral-500">Review pending provider KYC submissions.</p>
```

New:
```tsx
<h1 className="text-4xl font-bold tracking-tight wavy-divider">KYC Verification Queue</h1>
<p className="mt-4 text-text-muted">Review pending provider KYC submissions.</p>
```

- [ ] **Step 2: Update filter tabs**

Old:
```tsx
<div className="mt-6 flex gap-1 rounded-lg bg-neutral-100 p-1 w-fit">
```

New:
```tsx
<div className="mt-6 flex gap-1 rounded-full bg-black p-1 w-fit">
```

Old filter button:
```tsx
className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
  filter === s
    ? 'bg-white text-neutral-900 shadow-sm'
    : 'text-neutral-600 hover:text-neutral-900'
}`}
```

New:
```tsx
className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
  filter === s
    ? 'bg-brand-lime text-black'
    : 'text-neutral-400 hover:text-white'
}`}
```

- [ ] **Step 3: Update empty state**

Old:
```tsx
<div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
  <p className="text-neutral-500">
```

New:
```tsx
<div className="mt-6 rounded-3xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-text-muted">
```

- [ ] **Step 4: Update table container and header**

Old:
```tsx
<div className="mt-4 overflow-hidden rounded-lg border border-neutral-200 bg-white">
  <table className="w-full text-sm">
    <thead className="border-b border-neutral-200 bg-neutral-50">
      <tr>
        <th className="px-4 py-3 text-start font-medium text-neutral-600">
```

New:
```tsx
<div className="mt-4 overflow-hidden rounded-2xl border border-border">
  <table className="w-full text-sm">
    <thead className="bg-black">
      <tr>
        <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">
```

- [ ] **Step 5: Update table body**

Old:
```tsx
<tbody className="divide-y divide-neutral-100">
```

New:
```tsx
<tbody className="divide-y divide-border bg-white">
```

- [ ] **Step 6: Update table row hover**

Old:
```tsx
className={`cursor-pointer transition-colors ${
  sub.slaBreached
    ? 'bg-red-50 hover:bg-red-100'
    : 'hover:bg-neutral-50'
}`}
```

New:
```tsx
className={`cursor-pointer transition-colors ${
  sub.slaBreached
    ? 'bg-red-50 hover:bg-red-100'
    : 'hover:bg-brand-lime/5'
}`}
```

- [ ] **Step 7: Update pagination buttons**

Old:
```tsx
className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-neutral-50 transition-colors"
```

New:
```tsx
className="rounded-full border border-black px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-neutral-50 hover:scale-[1.02] transition-all"
```

- [ ] **Step 8: Commit**

```bash
git add apps/admin-portal/src/app/providers/page.tsx
git commit -m "style(admin-portal): restyle KYC queue with black table headers and lime filters"
```

---

### Task 9: KYC Detail Page

**Files:**
- Modify: `apps/admin-portal/src/app/providers/[submissionId]/page.tsx`

- [ ] **Step 1: Update back link**

Old:
```tsx
<button onClick={() => router.push('/providers')} className="text-sm text-blue-600 hover:text-blue-800">
```

New:
```tsx
<button onClick={() => router.push('/providers')} className="text-sm text-text-muted hover:text-black transition-colors">
```

- [ ] **Step 2: Update page title**

Old:
```tsx
<h1 className="text-2xl font-bold tracking-tight">{detail.providerName}</h1>
```

New:
```tsx
<h1 className="text-4xl font-bold tracking-tight">{detail.providerName}</h1>
```

- [ ] **Step 3: Update action buttons**

Old:
```tsx
<button
  onClick={() => setPendingAction('APPROVE')}
  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
>
<button
  onClick={() => setPendingAction('REJECT')}
  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
>
<button
  onClick={() => setPendingAction('REQUEST_MORE_INFO')}
  className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
>
```

New:
```tsx
<button
  onClick={() => setPendingAction('APPROVE')}
  className="rounded-full bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 hover:scale-[1.02] transition-all"
>
<button
  onClick={() => setPendingAction('REJECT')}
  className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 hover:scale-[1.02] transition-all"
>
<button
  onClick={() => setPendingAction('REQUEST_MORE_INFO')}
  className="rounded-full bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 hover:scale-[1.02] transition-all"
>
```

- [ ] **Step 4: Update document/OCR panels**

Old (both panels):
```tsx
<div className="rounded-lg border border-neutral-200 bg-white p-5">
  <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">
```

New:
```tsx
<div className="rounded-3xl bg-white p-5 border border-border">
  <h2 className="text-sm font-semibold text-black uppercase tracking-wide">
```

- [ ] **Step 5: Update OCR field rows**

Old:
```tsx
<div key={i} className="flex items-center justify-between rounded-md bg-neutral-50 px-3 py-2">
```

New:
```tsx
<div key={i} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2">
```

- [ ] **Step 6: Update submission details card**

Old:
```tsx
<div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
```

New:
```tsx
<div className="mt-6 rounded-3xl bg-white p-5 border border-border">
```

- [ ] **Step 7: Update confirmation dialog**

Old:
```tsx
<div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
  <h2 className="text-lg font-semibold">{c.title}</h2>
```

New:
```tsx
<div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
  <h2 className="text-lg font-semibold text-black">{c.title}</h2>
```

- [ ] **Step 8: Update dialog textarea**

Old:
```tsx
className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
```

New:
```tsx
className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
```

- [ ] **Step 9: Update dialog buttons**

Cancel button old:
```tsx
className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
```

Cancel button new:
```tsx
className="rounded-full border border-black px-6 py-2.5 text-sm font-medium text-black hover:bg-neutral-50 hover:scale-[1.02] transition-all"
```

Action button old:
```tsx
className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors ${c.buttonColor}`}
```

Action button new:
```tsx
className={`rounded-full px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:scale-[1.02] transition-all ${c.buttonColor}`}
```

- [ ] **Step 10: Commit**

```bash
git add apps/admin-portal/src/app/providers/[submissionId]/page.tsx
git commit -m "style(admin-portal): restyle KYC detail with rounded panels and pill buttons"
```

---

### Task 10: License Expiry Page

**Files:**
- Modify: `apps/admin-portal/src/app/providers/expiry/page.tsx`

- [ ] **Step 1: Update page title**

Old:
```tsx
<h1 className="text-2xl font-bold text-neutral-900">License Expiry</h1>
<p className="text-sm text-neutral-500 mt-1">
```

New:
```tsx
<h1 className="text-4xl font-bold text-black tracking-tight wavy-divider">License Expiry</h1>
<p className="text-sm text-text-muted mt-4">
```

- [ ] **Step 2: Update filter buttons**

Old:
```tsx
className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
  expiryWindow === w
    ? 'bg-neutral-900 text-white border-neutral-900'
    : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
}`}
```

New:
```tsx
className={`px-4 py-1.5 text-sm rounded-full border transition-all ${
  expiryWindow === w
    ? 'bg-brand-lime text-black border-brand-lime'
    : 'bg-white text-black border-black hover:bg-neutral-50 hover:scale-[1.02]'
}`}
```

- [ ] **Step 3: Update table container and header**

Old:
```tsx
<div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
```

New:
```tsx
<div className="bg-white rounded-2xl border border-border overflow-hidden">
```

Old thead:
```tsx
<tr className="border-b border-neutral-200 bg-neutral-50">
  <th className="text-start px-4 py-3 font-medium text-neutral-600">
```

New:
```tsx
<tr className="bg-black">
  <th className="text-start px-4 py-3 font-medium text-white text-xs uppercase tracking-wider">
```

- [ ] **Step 4: Update table row hover**

Old:
```tsx
className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer"
```

New:
```tsx
className="border-b border-border hover:bg-brand-lime/5 cursor-pointer transition-colors"
```

- [ ] **Step 5: Update pagination**

Old:
```tsx
<div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
```

New:
```tsx
<div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface">
```

Old pagination buttons:
```tsx
className="px-3 py-1 text-sm rounded border border-neutral-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50"
```

New:
```tsx
className="px-4 py-1.5 text-sm rounded-full border border-black bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50 hover:scale-[1.02] transition-all"
```

- [ ] **Step 6: Update Renew link button**

Old:
```tsx
className="text-sm text-blue-600 hover:text-blue-800 font-medium"
```

New:
```tsx
className="text-sm text-black hover:text-brand-lime font-medium transition-colors"
```

- [ ] **Step 7: Commit**

```bash
git add apps/admin-portal/src/app/providers/expiry/page.tsx
git commit -m "style(admin-portal): restyle license expiry with black headers and lime filters"
```

---

### Task 11: Labs Page

**Files:**
- Modify: `apps/admin-portal/src/app/labs/page.tsx`

- [ ] **Step 1: Update page heading**

Old:
```tsx
<h1 className="text-2xl font-bold tracking-tight">Lab Registrations</h1>
<p className="mt-1 text-neutral-500">Review and manage lab registration approvals.</p>
```

New:
```tsx
<h1 className="text-4xl font-bold tracking-tight wavy-divider">Lab Registrations</h1>
<p className="mt-4 text-text-muted">Review and manage lab registration approvals.</p>
```

- [ ] **Step 2: Update filter tabs (identical pattern to KYC queue)**

Old:
```tsx
<div className="mt-6 flex gap-1 rounded-lg bg-neutral-100 p-1 w-fit">
```

New:
```tsx
<div className="mt-6 flex gap-1 rounded-full bg-black p-1 w-fit">
```

Old button:
```tsx
className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
  filter === s
    ? 'bg-white text-neutral-900 shadow-sm'
    : 'text-neutral-600 hover:text-neutral-900'
}`}
```

New:
```tsx
className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
  filter === s
    ? 'bg-brand-lime text-black'
    : 'text-neutral-400 hover:text-white'
}`}
```

- [ ] **Step 3: Update empty state**

Old:
```tsx
<div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
  <p className="text-neutral-500">
```

New:
```tsx
<div className="mt-6 rounded-3xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-text-muted">
```

- [ ] **Step 4: Update table container and header**

Old:
```tsx
<div className="mt-4 overflow-hidden rounded-lg border border-neutral-200 bg-white">
  ...
  <thead className="border-b border-neutral-200 bg-neutral-50">
    <tr>
      <th className="px-4 py-3 text-start font-medium text-neutral-600">
```

New:
```tsx
<div className="mt-4 overflow-hidden rounded-2xl border border-border">
  ...
  <thead className="bg-black">
    <tr>
      <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">
```

- [ ] **Step 5: Update table body and rows**

Old:
```tsx
<tbody className="divide-y divide-neutral-100">
  ...
  className="cursor-pointer hover:bg-neutral-50 transition-colors"
```

New:
```tsx
<tbody className="divide-y divide-border bg-white">
  ...
  className="cursor-pointer hover:bg-brand-lime/5 transition-colors"
```

- [ ] **Step 6: Update pagination buttons**

Old:
```tsx
className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-neutral-50 transition-colors"
```

New:
```tsx
className="rounded-full border border-black px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-neutral-50 hover:scale-[1.02] transition-all"
```

- [ ] **Step 7: Commit**

```bash
git add apps/admin-portal/src/app/labs/page.tsx
git commit -m "style(admin-portal): restyle labs queue with design system"
```

---

### Task 12: Lab Detail Page

**Files:**
- Modify: `apps/admin-portal/src/app/labs/[labId]/page.tsx`

- [ ] **Step 1: Apply same patterns as KYC detail**

- Back button: `text-sm text-text-muted hover:text-black transition-colors`
- Page title: `text-4xl font-bold tracking-tight`
- Action buttons: `rounded-full px-6 py-2.5 text-sm font-semibold ... hover:scale-[1.02] transition-all`
- Detail cards: `rounded-3xl bg-white p-5 border border-border`
- Section headings: `text-sm font-semibold text-black uppercase tracking-wide`
- Confirmation dialog: `rounded-3xl` card, `rounded-xl` textarea, `rounded-full` buttons
- Timeline left border: keep `border-s-2 border-neutral-200 ps-4`

- [ ] **Step 2: Commit**

```bash
git add apps/admin-portal/src/app/labs/[labId]/page.tsx
git commit -m "style(admin-portal): restyle lab detail page"
```

---

### Task 13: AI Models Page

**Files:**
- Modify: `apps/admin-portal/src/app/ai-models/page.tsx`

- [ ] **Step 1: Apply design system patterns**

- Page title: `text-4xl font-bold tracking-tight wavy-divider`
- Subtitle: `text-text-muted` with `mt-4`
- Stat cards: `rounded-3xl bg-white p-5 border border-border`
- Tables: `rounded-2xl border border-border overflow-hidden`, black `<thead>`, white `<tbody>`, `hover:bg-brand-lime/5`
- Table headers: `bg-black` with `text-white text-xs uppercase tracking-wider`
- Type badges: keep semantic colors, ensure `rounded-full`
- Publish form container: `rounded-3xl bg-white p-5 border border-border`
- Form inputs: `rounded-xl border border-border px-4 py-2.5 ... focus:border-brand-lime focus:ring-2 focus:ring-brand-lime/30`
- Form labels: `text-sm font-medium text-text-muted`
- Submit button: `rounded-full bg-brand-lime text-black font-semibold hover:brightness-95 hover:scale-[1.02] transition-all`

- [ ] **Step 2: Commit**

```bash
git add apps/admin-portal/src/app/ai-models/page.tsx
git commit -m "style(admin-portal): restyle AI models page"
```

---

### Task 14: Alerts Page

**Files:**
- Modify: `apps/admin-portal/src/app/alerts/page.tsx`

- [ ] **Step 1: Update page heading**

Old:
```tsx
<h1 className="text-2xl font-bold tracking-tight">Alerts & Safety</h1>
<p className="mt-1 text-neutral-500">
```

New:
```tsx
<h1 className="text-4xl font-bold tracking-tight wavy-divider">Alerts & Safety</h1>
<p className="mt-4 text-text-muted">
```

- [ ] **Step 2: Update section tabs**

Old:
```tsx
<div className="mt-6 flex gap-1 border-b border-neutral-200">
```

New:
```tsx
<div className="mt-6 flex gap-1 border-b border-border">
```

Old tab button:
```tsx
className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
  activeTab === 'anomalies'
    ? 'border-neutral-900 text-neutral-900'
    : 'border-transparent text-neutral-500 hover:text-neutral-700'
}`}
```

New:
```tsx
className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
  activeTab === 'anomalies'
    ? 'border-brand-lime text-black'
    : 'border-transparent text-text-muted hover:text-black'
}`}
```

- [ ] **Step 3: Update anomaly filter tabs (same as KYC queue pattern)**

Old:
```tsx
<div className="mt-6 flex gap-1 rounded-lg bg-neutral-100 p-1 w-fit">
```

New:
```tsx
<div className="mt-6 flex gap-1 rounded-full bg-black p-1 w-fit">
```

Button classes: same as Task 8 Step 2.

- [ ] **Step 4: Update alert table (same pattern as KYC queue)**

- Container: `rounded-2xl border border-border overflow-hidden`
- Thead: `bg-black`, th: `text-white text-xs uppercase tracking-wider`
- Tbody: `divide-y divide-border bg-white`
- Row hover: `hover:bg-brand-lime/5 transition-colors`
- Empty state: `rounded-3xl border-2 border-dashed border-border`

- [ ] **Step 5: Update MetricCard in ClinicalSafetySection**

Old:
```tsx
<div className={`rounded-lg border p-4 ${statusColor[status]}`}>
```

New:
```tsx
<div className={`rounded-3xl border p-4 ${statusColor[status]}`}>
```

- [ ] **Step 6: Update monthly reports table (same pattern)**

- Container: `rounded-2xl border border-border overflow-hidden`
- Thead: `bg-black`, th: `text-white text-xs uppercase tracking-wider`
- Row hover: `hover:bg-brand-lime/5 transition-colors`

- [ ] **Step 7: Update report detail panel**

Old:
```tsx
<div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
```

New:
```tsx
<div className="mt-4 rounded-3xl border border-border bg-white p-4">
```

- [ ] **Step 8: Update pagination buttons (same as Task 8)**

- [ ] **Step 9: Commit**

```bash
git add apps/admin-portal/src/app/alerts/page.tsx
git commit -m "style(admin-portal): restyle alerts page with lime tabs and black headers"
```

---

### Task 15: Alert Detail Page

**Files:**
- Modify: `apps/admin-portal/src/app/alerts/[alertId]/page.tsx`

- [ ] **Step 1: Apply same patterns as KYC detail**

- Back link: `text-sm text-text-muted hover:text-black transition-colors`
- Page title: `text-4xl font-bold tracking-tight`
- Action buttons: `rounded-full px-6 py-2.5 text-sm font-semibold ... hover:scale-[1.02] transition-all`
- Detail cards: `rounded-3xl bg-white p-5 border border-border`
- Section headings: `text-sm font-semibold text-black uppercase tracking-wide`
- Timeline bar chart: keep existing colors (red/emerald for threshold comparison)
- Confirmation dialog: `rounded-3xl` card, `rounded-xl` textarea, `rounded-full` buttons
- Error/success messages: `rounded-2xl`

- [ ] **Step 2: Commit**

```bash
git add apps/admin-portal/src/app/alerts/[alertId]/page.tsx
git commit -m "style(admin-portal): restyle alert detail page"
```

---

### Task 16: Audit Chain Page

**Files:**
- Modify: `apps/admin-portal/src/app/audit/page.tsx`

- [ ] **Step 1: Update page heading**

Old:
```tsx
<h1 className="text-2xl font-bold tracking-tight">Audit Log Integrity</h1>
<p className="mt-1 text-neutral-500">
```

New:
```tsx
<h1 className="text-4xl font-bold tracking-tight wavy-divider">Audit Log Integrity</h1>
<p className="mt-4 text-text-muted">
```

- [ ] **Step 2: Update status cards**

Old:
```tsx
<div className="rounded-lg border border-neutral-200 bg-white p-4">
  <p className="text-sm font-medium text-neutral-500">
```

New:
```tsx
<div className="rounded-3xl bg-white p-4 border border-border">
  <p className="text-sm font-medium text-text-muted">
```

- [ ] **Step 3: Update Full Verification button**

Old:
```tsx
className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors"
```

New:
```tsx
className="rounded-full bg-black px-6 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 hover:scale-[1.02] disabled:opacity-50 transition-all"
```

- [ ] **Step 4: Update verification history table (same pattern as other tables)**

- Container: `rounded-2xl border border-border overflow-hidden`
- Thead: `bg-black`, th: `text-white text-xs uppercase tracking-wider`
- Tbody: `divide-y divide-border bg-white`
- Row hover: `hover:bg-brand-lime/5 transition-colors`

- [ ] **Step 5: Update pagination (same pattern)**

- [ ] **Step 6: Commit**

```bash
git add apps/admin-portal/src/app/audit/page.tsx
git commit -m "style(admin-portal): restyle audit chain page"
```

---

### Task 17: Settings Page

**Files:**
- Modify: `apps/admin-portal/src/app/settings/page.tsx`

- [ ] **Step 1: Apply design system**

- Page title: `text-4xl font-bold tracking-tight wavy-divider`
- Subtitle: `text-text-muted` with `mt-4`
- Card container: `rounded-3xl bg-white p-5 border border-border`
- Enroll button: `rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 hover:scale-[1.02] transition-all`
- Remove key button: `rounded-full text-sm text-red-600 hover:text-red-800 font-medium`
- Key list items: `rounded-xl bg-surface px-4 py-3`
- Info text: `text-text-muted`

- [ ] **Step 2: Commit**

```bash
git add apps/admin-portal/src/app/settings/page.tsx
git commit -m "style(admin-portal): restyle settings page"
```

---

### Task 18: Subscriptions Page

**Files:**
- Modify: `apps/admin-portal/src/app/subscriptions/page.tsx`

- [ ] **Step 1: Apply design system**

- Page title: `text-4xl font-bold tracking-tight wavy-divider`
- Org info card: `rounded-3xl bg-white p-5 border border-border`
- Status badge: ensure `rounded-full`
- Subscriptions table: `rounded-2xl border border-border overflow-hidden`, `bg-black` thead, `text-white text-xs uppercase tracking-wider` th
- Row hover: `hover:bg-brand-lime/5 transition-colors`
- Add Module button: `rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 hover:scale-[1.02] transition-all`
- Remove button: `rounded-full text-sm text-red-600 hover:text-red-800 font-medium`
- Total footer: `rounded-b-2xl bg-surface border-t border-border`

- [ ] **Step 2: Commit**

```bash
git add apps/admin-portal/src/app/subscriptions/page.tsx
git commit -m "style(admin-portal): restyle subscriptions page"
```

---

### Task 19: User Creation Page

**Files:**
- Modify: `apps/admin-portal/src/app/users/create/page.tsx`

- [ ] **Step 1: Apply design system**

- Page title: `text-4xl font-bold tracking-tight wavy-divider`
- Form card: `rounded-3xl bg-white p-6 border border-border`
- Labels: `text-sm font-medium text-text-muted`
- Inputs: `rounded-xl border border-border px-4 py-2.5 ... focus:border-brand-lime focus:ring-2 focus:ring-brand-lime/30`
- Radio buttons: accent color via `accent-[#D4FF00]`
- Role cards: `rounded-xl border border-border p-3`
- Selected role card: `border-brand-lime bg-brand-lime/10`
- Disabled role card: `opacity-50`
- Submit button: `rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 hover:scale-[1.02] transition-all`
- Link to subscriptions: `text-brand-lime hover:underline`

- [ ] **Step 2: Commit**

```bash
git add apps/admin-portal/src/app/users/create/page.tsx
git commit -m "style(admin-portal): restyle user creation page"
```

---

### Task 20: Modal Components

**Files:**
- Modify: `apps/admin-portal/src/components/providers/RenewLicenseModal.tsx`
- Modify: `apps/admin-portal/src/components/subscriptions/AddModuleDialog.tsx`
- Modify: `apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx`

- [ ] **Step 1: Update RenewLicenseModal**

- Dialog container: `rounded-3xl bg-white p-6 shadow-xl`
- Title: `text-lg font-semibold text-black`
- Labels: `text-sm font-medium text-text-muted`
- Inputs: `rounded-xl border border-border px-4 py-2.5 ... focus:border-brand-lime focus:ring-2 focus:ring-brand-lime/30`
- Primary button (Renew/Confirm): `rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 hover:scale-[1.02] transition-all`
- Cancel button: `rounded-full border border-black px-6 py-2.5 text-sm font-medium text-black hover:bg-neutral-50 hover:scale-[1.02] transition-all`
- Warning box: `rounded-2xl border border-amber-200 bg-amber-50`

- [ ] **Step 2: Update AddModuleDialog**

- Dialog container: `rounded-3xl bg-white p-6 shadow-xl`
- Title: `text-lg font-semibold text-black`
- Module cards: `rounded-3xl border border-border p-4 hover:border-brand-lime hover:bg-brand-lime/5 transition-colors`
- Add button: `rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 hover:scale-[1.02] transition-all`
- Cancel button: `rounded-full border border-black px-6 py-2.5`
- Module price text: `text-text-muted`

- [ ] **Step 3: Update RemoveModuleDialog**

- Dialog container: `rounded-3xl bg-white p-6 shadow-xl`
- Title: `text-lg font-semibold text-black`
- Warning text: `rounded-2xl border border-red-200 bg-red-50 p-3`
- Remove/Confirm button: `rounded-full bg-red-600 text-white font-semibold px-6 py-2.5 hover:bg-red-700 hover:scale-[1.02] transition-all`
- Cancel/Keep button: `rounded-full border border-black px-6 py-2.5 text-sm font-medium text-black hover:bg-neutral-50 hover:scale-[1.02] transition-all`

- [ ] **Step 4: Commit**

```bash
git add apps/admin-portal/src/components/providers/RenewLicenseModal.tsx apps/admin-portal/src/components/subscriptions/
git commit -m "style(admin-portal): restyle all modal/dialog components"
```

---

### Task 21: Visual Verification

- [ ] **Step 1: Run TypeScript check to verify no broken class references**

```bash
cd apps/admin-portal && npx tsc --noEmit
```

Expected: No errors (all changes are string literals in className, not type-checked).

- [ ] **Step 2: Run lint to catch any formatting issues**

```bash
pnpm -F admin-portal lint
```

Expected: PASS or only pre-existing warnings.

- [ ] **Step 3: Start dev server and visually confirm**

```bash
pnpm -F admin-portal dev
```

Manually confirm:
- Landing page renders with lime CTA buttons and rounded cards
- Login page has rounded-3xl card and lime button
- Sidebar is black with lime active indicators
- Dashboard shows lime/dark/white stat card variants
- Tables have black headers with white text
- All buttons are pill-shaped
- Page titles have wavy dividers

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A && git commit -m "style(admin-portal): fix visual regressions from restyle"
```
