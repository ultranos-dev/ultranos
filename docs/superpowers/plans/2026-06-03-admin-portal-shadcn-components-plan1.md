# Admin Portal — ShadCN Component Migration, Plan 1: Atomic Components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hand-rolled `<button>`, badge `<span>`, and `<input>`/`<textarea>`/`<select>` patterns across the admin-portal with ShadCN primitives, achieving consistent interactive element styling throughout the app.

**Architecture:** Three phases: (1) install and customize the missing ShadCN components to match the app's existing design language (rounded-full buttons, rounded-xl inputs, rounded-full badges); (2) migrate all 220+ raw `<button>` elements to `<Button>` with correct variants; (3) migrate all ~150 inline badge spans to `<Badge>` and all 20 raw input elements to `<Input>`/`<Textarea>`/`<Select>`. Tab/filter pill buttons (where `bg-primary` toggles based on active state) are intentionally left as raw `<button>` elements — they are stateful UI controls, not action triggers, and don't map to a ShadCN variant.

**Tech Stack:** ShadCN (radix-rhea style), class-variance-authority, Tailwind CSS v3.4, Next.js 15, TypeScript

**Related plan:** Plan 2 (`2026-06-03-admin-portal-shadcn-components-plan2.md`) covers Card, Table, Dialog, DropdownMenu, and brand-lime cleanup.

**Design spec:** `docs/superpowers/specs/2026-06-02-admin-portal-radix-rhea-theme-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `apps/admin-portal/src/components/ui/badge.tsx` | ShadCN Badge — customized to rounded-full |
| Create | `apps/admin-portal/src/components/ui/input.tsx` | ShadCN Input — customized to rounded-xl |
| Create | `apps/admin-portal/src/components/ui/textarea.tsx` | ShadCN Textarea — customized to rounded-xl |
| Create | `apps/admin-portal/src/components/ui/select.tsx` | ShadCN Select — customized to rounded-xl |
| Create | `apps/admin-portal/src/components/ui/label.tsx` | ShadCN Label |
| Modify | `apps/admin-portal/src/components/ui/button.tsx` | Change base from rounded-2xl to rounded-full; add success variant |
| Modify | `apps/admin-portal/src/app/dashboard/page.tsx` | Button migration |
| Modify | `apps/admin-portal/src/app/login/page.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/app/register/page.tsx` | Button migration |
| Modify | `apps/admin-portal/src/app/providers/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/providers/[submissionId]/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/providers/expiry/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/providers/profile/[practitionerId]/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/alerts/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/alerts/[alertId]/page.tsx` | Button + Badge + Input migration |
| Modify | `apps/admin-portal/src/app/alerts/configuration/page.tsx` | Button migration |
| Modify | `apps/admin-portal/src/app/labs/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/labs/create/page.tsx` | Button migration |
| Modify | `apps/admin-portal/src/app/labs/[labId]/page.tsx` | Button + Badge + Input migration |
| Modify | `apps/admin-portal/src/app/labs/[labId]/staff/page.tsx` | Button + Badge + Input migration |
| Modify | `apps/admin-portal/src/app/users/page.tsx` | Button migration |
| Modify | `apps/admin-portal/src/app/users/create/page.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/app/users/[userId]/page.tsx` | Button + Badge + Input migration |
| Modify | `apps/admin-portal/src/app/users/_components/AllUsersTab.tsx` | Badge migration |
| Modify | `apps/admin-portal/src/app/users/_components/LabAssignmentsTab.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/staff/page.tsx` | Button migration |
| Modify | `apps/admin-portal/src/app/staff/[practitionerId]/certifications/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/staff/[practitionerId]/health/page.tsx` | Button migration |
| Modify | `apps/admin-portal/src/app/patients/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/patients/[patientId]/page.tsx` | Button migration |
| Modify | `apps/admin-portal/src/app/patients/merge/page.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/app/subscriptions/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/subscriptions/billing/page.tsx` | Button migration |
| Modify | `apps/admin-portal/src/app/subscriptions/invoices/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/settings/page.tsx` | Button migration |
| Modify | `apps/admin-portal/src/app/inventory/page.tsx` | Button migration |
| Modify | `apps/admin-portal/src/app/inventory/suppliers/page.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/app/audit/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/certifications/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/network/page.tsx` | Button migration |
| Modify | `apps/admin-portal/src/app/mentorship/page.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/app/ai-models/page.tsx` | Button + Badge + Input migration |
| Modify | `apps/admin-portal/src/components/TopHeader.tsx` | Button migration (icon buttons) |
| Modify | `apps/admin-portal/src/components/ExportButton.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/AuthGuard.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/registration/AdminCredentialsStep.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/components/registration/OrgDetailsStep.tsx` | Button + Input + Select migration |
| Modify | `apps/admin-portal/src/components/registration/ModuleSelectionStep.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/alerts/AcknowledgeAlertModal.tsx` | Button + Textarea migration |
| Modify | `apps/admin-portal/src/components/alerts/EscalationModal.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/components/alerts/EscalationSection.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/components/alerts/SurveillanceConfigForm.tsx` | Button + Badge + Input migration |
| Modify | `apps/admin-portal/src/components/alerts/SurveillanceAlertHistory.tsx` | Badge migration |
| Modify | `apps/admin-portal/src/components/certifications/ExpiryWarningWidget.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/certifications/MilestoneReviewModal.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/certifications/PathwayCreateModal.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/components/dashboard/SubscriptionWidget.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/inventory/CreatePurchaseOrderModal.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/components/inventory/PurchaseOrderDetailModal.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/lab-staff/AssignStaffModal.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/network/ChwEnrollmentModal.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/components/network/LabNetworkCard.tsx` | Button + Badge migration |
| Modify | `apps/admin-portal/src/components/network/OutbreakActivationModal.tsx` | Button + Badge + Input migration |
| Modify | `apps/admin-portal/src/components/patients/MergePreview.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/providers/RenewLicenseModal.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/components/settings/ModuleSettingsCard.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/settings/NotificationPreferences.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/components/settings/ThresholdSettings.tsx` | Button + Input migration |
| Modify | `apps/admin-portal/src/components/subscriptions/DunningBanner.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/subscriptions/PaymentMethodCard.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/subscriptions/TrialExpiredBanner.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx` | Button migration |
| Modify | `apps/admin-portal/src/components/subscriptions/AddModuleDialog.tsx` | Button migration |

---

## Pattern Reference (read before all migration tasks)

### Button variant mapping

Every `<button>` in this app maps to one of these variants. **Tab/filter pills with conditional `bg-primary` based on active state are NOT migrated** — leave them as raw `<button>` elements (they are state-driven UI toggles, not action buttons).

```tsx
import { Button } from '@/components/ui/button'
import { Link } from 'next/link' // only if already imported
```

| Old className pattern | New component |
|----------------------|---------------|
| `rounded-full bg-primary px-* py-* text-sm font-semibold text-primary-foreground hover:...` | `<Button>` |
| `rounded-full bg-primary ... text-foreground hover:...` | `<Button>` (text-foreground and text-primary-foreground both work since our --primary-foreground = near-white) |
| `rounded-full bg-brand-lime px-* py-* text-sm font-semibold text-black/text-brand-lime-contrast` | `<Button>` (brand-lime → primary) |
| `rounded-full border border-border px-* py-* text-sm font-medium text-muted-foreground hover:bg-card` | `<Button variant="outline">` |
| `rounded-full border border-border px-* py-* text-sm font-medium disabled:opacity-50 hover:...` | `<Button variant="outline">` |
| `flex h-9 w-9 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground hover:bg-primary/10` | `<Button variant="outline" size="icon">` |
| `flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20` | `<Button variant="ghost" size="icon">` |
| `text-muted-foreground hover:bg-primary/10 hover:text-foreground ...` (no border, no bg) | `<Button variant="ghost">` |
| `text-destructive hover:bg-destructive/10 ...` | `<Button variant="destructive">` |
| `bg-destructive px-* py-* text-white hover:...` (filled destructive) | `<Button variant="destructive">` |
| `bg-red-600 text-white hover:bg-red-700` | `<Button variant="destructive">` |
| `bg-green-600 text-white hover:bg-green-700` | `<Button variant="success">` (custom variant — defined in Task 2) |
| `bg-neutral-600 text-white hover:bg-neutral-700` | `<Button variant="secondary">` |
| `bg-purple-600 text-white hover:bg-purple-700` | `<Button variant="secondary">` |
| `text-primary underline-offset-4 hover:underline` | `<Button variant="link">` |

**Link-as-button pattern:**
```tsx
// Before:
<Link href="/labs/create" className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
  Create Lab
</Link>

// After:
<Button asChild>
  <Link href="/labs/create">Create Lab</Link>
</Button>
```

**Disabled state** — remove `disabled:opacity-50` from className; Button handles this:
```tsx
// Before:
<button disabled={loading} className="rounded-full bg-primary ... disabled:opacity-50">

// After:
<Button disabled={loading}>
```

### Badge variant mapping

```tsx
import { Badge } from '@/components/ui/badge'
```

| Old className pattern | New component |
|----------------------|---------------|
| `rounded-full px-2.5 py-0.5 text-xs font-medium bg-success/10 text-success` | `<Badge variant="success">` |
| `rounded-full px-2.5 py-0.5 text-xs font-medium bg-warning/10 text-warning` | `<Badge variant="warning">` |
| `rounded-full px-2.5 py-0.5 text-xs font-medium bg-destructive/10 text-destructive` | `<Badge variant="destructive">` |
| `rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary` | `<Badge variant="default">` |
| `rounded-full px-2.5 py-0.5 text-xs font-medium bg-card text-muted-foreground` or neutral | `<Badge variant="secondary">` |
| `inline-block rounded-full px-3 py-1 text-sm font-medium bg-*` | Same mapping but size="lg" (defined in Task 3) |

**colorMap pattern** — many pages have:
```tsx
const colorMap: Record<string, string> = {
  APPROVED: 'bg-success/10 text-success',
  PENDING: 'bg-warning/10 text-warning',
  REJECTED: 'bg-destructive/10 text-destructive',
}
// used as: <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status]}`}>

// Replace with a variantMap:
const variantMap: Record<string, 'success' | 'warning' | 'destructive' | 'default' | 'secondary'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'destructive',
}
// used as: <Badge variant={variantMap[status] ?? 'secondary'}>
```

### Input/Textarea/Select mapping

```tsx
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
```

```tsx
// Before:
<input
  type="text"
  value={value}
  onChange={e => setValue(e.target.value)}
  placeholder="Enter name"
  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
/>

// After:
<Input
  type="text"
  value={value}
  onChange={e => setValue(e.target.value)}
  placeholder="Enter name"
/>
// className is only needed to add width: <Input className="w-full" .../>
// but Input is already full-width by default (w-full in base styles) — omit className entirely
```

```tsx
// Before:
<textarea
  value={notes}
  onChange={e => setNotes(e.target.value)}
  rows={4}
  className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
/>

// After:
<Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
```

```tsx
// Before:
<select
  value={countryCode}
  onChange={e => setCountryCode(e.target.value)}
  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
>
  <option value="KW">Kuwait</option>
  <option value="JO">Jordan</option>
</select>

// After:
<Select value={countryCode} onValueChange={setCountryCode}>
  <SelectTrigger>
    <SelectValue placeholder="Select country" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="KW">Kuwait</SelectItem>
    <SelectItem value="JO">Jordan</SelectItem>
  </SelectContent>
</Select>
```

**Label usage** — add `<Label>` above any input that had an adjacent label text:
```tsx
// Before:
<label className="text-sm font-medium text-foreground">Email</label>
<input ... />

// After:
<Label htmlFor="email">Email</Label>
<Input id="email" ... />
```

---

## Task 1: Install missing ShadCN components

**Files:**
- Run from: `apps/admin-portal/`

- [ ] **Step 1: Install badge, input, textarea, select, label, separator**

  Run from the `apps/admin-portal` directory:

  ```bash
  cd apps/admin-portal
  pnpm dlx shadcn@latest add badge input textarea select label separator
  ```

  Expected output: each component shows `✔ Created 1 file: src/components/ui/<name>.tsx`

- [ ] **Step 2: Verify all files exist**

  ```bash
  ls apps/admin-portal/src/components/ui/
  ```

  Expected: `badge.tsx  button.tsx  input.tsx  label.tsx  select.tsx  separator.tsx  textarea.tsx`

- [ ] **Step 3: Commit**

  ```bash
  cd ../..  # back to repo root
  git add apps/admin-portal/src/components/ui/ apps/admin-portal/package.json pnpm-lock.yaml
  git commit -m "feat(admin-portal): install ShadCN badge, input, textarea, select, label, separator"
  ```

---

## Task 2: Customize Button component

**Files:**
- Modify: `apps/admin-portal/src/components/ui/button.tsx`

The installed button uses `rounded-2xl`. The app's design language uses `rounded-full` for all action buttons. We also need a `success` variant for approve/activate actions (currently using `bg-green-600`).

- [ ] **Step 1: Update `button.tsx`**

  Replace the entire file with:

  ```tsx
  import * as React from "react"
  import { cva, type VariantProps } from "class-variance-authority"
  import { Slot } from "radix-ui"

  import { cn } from "@/lib/utils"

  const buttonVariants = cva(
    "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
      variants: {
        variant: {
          default:     "bg-primary text-primary-foreground hover:bg-primary/80",
          outline:     "border-border bg-background hover:bg-muted hover:text-foreground [data-theme=dark_&]:bg-transparent [data-theme=dark_&]:hover:bg-input/30",
          secondary:   "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          ghost:       "hover:bg-muted hover:text-foreground",
          destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
          success:     "bg-success/10 text-success hover:bg-success/20 focus-visible:border-success/40 focus-visible:ring-success/20",
          link:        "text-primary underline-offset-4 hover:underline",
        },
        size: {
          default:   "h-9 gap-1.5 px-4",
          xs:        "h-6 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
          sm:        "h-8 gap-1 px-3",
          lg:        "h-10 gap-1.5 px-5",
          icon:      "size-9",
          "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
          "icon-sm": "size-8",
          "icon-lg": "size-10",
        },
      },
      defaultVariants: {
        variant: "default",
        size: "default",
      },
    }
  )

  function Button({
    className,
    variant = "default",
    size = "default",
    asChild = false,
    ...props
  }: React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
    }) {
    const Comp = asChild ? Slot.Root : "button"

    return (
      <Comp
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }

  export { Button, buttonVariants }
  ```

- [ ] **Step 2: Verify TypeScript is valid**

  ```bash
  pnpm -F @ultranos/admin-portal typecheck 2>&1 | grep "ui/button" || echo "No button errors"
  ```

  Expected: `No button errors`

- [ ] **Step 3: Commit**

  ```bash
  git add apps/admin-portal/src/components/ui/button.tsx
  git commit -m "feat(admin-portal): customize Button — rounded-full, add success variant"
  ```

---

## Task 3: Customize Badge component

**Files:**
- Modify: `apps/admin-portal/src/components/ui/badge.tsx`

The installed badge needs `rounded-full` (app uses pill-style badges), `success` and `warning` variants (used heavily for status indicators), and a `lg` size for larger badges on detail pages.

- [ ] **Step 1: Replace `badge.tsx`**

  ```tsx
  import * as React from "react"
  import { cva, type VariantProps } from "class-variance-authority"

  import { cn } from "@/lib/utils"

  const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
      variants: {
        variant: {
          default:     "border-transparent bg-primary/10 text-primary",
          secondary:   "border-transparent bg-card text-muted-foreground",
          destructive: "border-transparent bg-destructive/10 text-destructive",
          outline:     "border-border text-foreground",
          success:     "border-transparent bg-success/10 text-success",
          warning:     "border-transparent bg-warning/10 text-warning",
        },
        size: {
          default: "px-2.5 py-0.5 text-xs",
          lg:      "px-3 py-1 text-sm",
        },
      },
      defaultVariants: {
        variant: "default",
        size: "default",
      },
    }
  )

  function Badge({
    className,
    variant,
    size,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
    return (
      <span
        data-slot="badge"
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      />
    )
  }

  export { Badge, badgeVariants }
  ```

- [ ] **Step 2: Customize Input component**

  Read `apps/admin-portal/src/components/ui/input.tsx`, then replace its className with `rounded-xl`:

  ```tsx
  import * as React from "react"

  import { cn } from "@/lib/utils"

  function Input({ className, type, ...props }: React.ComponentProps<"input">) {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          "flex h-10 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }

  export { Input }
  ```

- [ ] **Step 3: Customize Textarea component**

  Read `apps/admin-portal/src/components/ui/textarea.tsx`, then replace:

  ```tsx
  import * as React from "react"

  import { cn } from "@/lib/utils"

  function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
    return (
      <textarea
        data-slot="textarea"
        className={cn(
          "flex min-h-[80px] w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }

  export { Textarea }
  ```

- [ ] **Step 4: Verify TypeScript**

  ```bash
  pnpm -F @ultranos/admin-portal typecheck 2>&1 | grep "ui/" || echo "No ui errors"
  ```

  Expected: `No ui errors`

- [ ] **Step 5: Commit**

  ```bash
  git add apps/admin-portal/src/components/ui/
  git commit -m "feat(admin-portal): customize Badge (rounded-full, success/warning variants), Input/Textarea (rounded-xl)"
  ```

---

## Task 4: Button migration — dashboard, login, register

**Files:**
- Modify: `apps/admin-portal/src/app/dashboard/page.tsx`
- Modify: `apps/admin-portal/src/app/login/page.tsx`
- Modify: `apps/admin-portal/src/app/register/page.tsx`

Read each file before editing. Apply the pattern mapping from the Pattern Reference section above.

- [ ] **Step 1: Migrate `dashboard/page.tsx`**

  The dashboard has stat cards that are clickable divs (not buttons) — leave those. Look for actual `<button>` elements (there are typically 2–4 icon buttons in the header area and maybe pagination). Add import and replace.

  ```tsx
  // Add at top with other imports:
  import { Button } from '@/components/ui/button'
  ```

  Replace each `<button className="...">` with the appropriate `<Button variant="...">`. Remove all `className` strings that match the patterns in the Pattern Reference. Keep only `className` if there are truly unique layout overrides needed (e.g., `className="w-full"` or `className="mt-4"`).

- [ ] **Step 2: Migrate `login/page.tsx`**

  The login page has a submit button and possibly a "Forgot password" link-button. Also migrate any `<input>` elements here using the Input pattern.

  ```tsx
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  ```

  Submit button: `<Button type="submit" className="w-full" disabled={loading}>`

- [ ] **Step 3: Migrate `register/page.tsx`**

  The register page has step navigation buttons (Back/Next) and possibly tab-style step indicators. Replace Back/Next buttons with `<Button variant="outline">` and `<Button>`. Leave step indicator pills (conditional active state) as raw `<button>`.

- [ ] **Step 4: Run tests**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  ```

  Expected: same pass/fail count as before (181 passing, 11 pre-existing failures).

- [ ] **Step 5: Commit**

  ```bash
  git add apps/admin-portal/src/app/dashboard/page.tsx apps/admin-portal/src/app/login/page.tsx apps/admin-portal/src/app/register/page.tsx
  git commit -m "feat(admin-portal): migrate Button in dashboard, login, register pages"
  ```

---

## Task 5: Button + Badge migration — providers feature

**Files:**
- Modify: `apps/admin-portal/src/app/providers/page.tsx`
- Modify: `apps/admin-portal/src/app/providers/[submissionId]/page.tsx`
- Modify: `apps/admin-portal/src/app/providers/expiry/page.tsx`
- Modify: `apps/admin-portal/src/app/providers/profile/[practitionerId]/page.tsx`
- Modify: `apps/admin-portal/src/components/providers/RenewLicenseModal.tsx`

Read each file before editing.

- [ ] **Step 1: Migrate `providers/page.tsx`**

  This file has:
  - Filter tab pills with conditional `bg-primary` → **leave as raw `<button>`** (these are tab toggles, not action buttons)
  - Pagination buttons (`<button ... disabled={cursor === 0}>`) → `<Button variant="outline" size="sm">`
  - The `KycStatusBadge` inline component that uses a `colorMap` → replace with `variantMap` + `<Badge>`

  ```tsx
  import { Button } from '@/components/ui/button'
  import { Badge } from '@/components/ui/badge'
  ```

  For `KycStatusBadge`, replace the colorMap pattern:
  ```tsx
  // Before:
  const colorMap: Record<string, string> = {
    PENDING_REVIEW: 'bg-warning/10 text-warning',
    APPROVED: 'bg-success/10 text-success',
    REJECTED: 'bg-destructive/10 text-destructive',
    // etc.
  }
  function KycStatusBadge({ status }: { status: string }) {
    return (
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-card text-muted-foreground'}`}>
        {status.replace(/_/g, ' ')}
      </span>
    )
  }

  // After:
  const variantMap: Record<string, 'warning' | 'success' | 'destructive' | 'secondary'> = {
    PENDING_REVIEW: 'warning',
    APPROVED: 'success',
    REJECTED: 'destructive',
  }
  function KycStatusBadge({ status }: { status: string }) {
    return (
      <Badge variant={variantMap[status] ?? 'secondary'}>
        {status.replace(/_/g, ' ')}
      </Badge>
    )
  }
  ```

  Also fix the provider name link that uses `text-black hover:text-brand-lime`:
  ```tsx
  // Before:
  <button className="text-black hover:text-brand-lime font-medium text-start">

  // After:
  <button className="font-medium text-start text-foreground hover:text-primary transition-colors">
  ```

- [ ] **Step 2: Migrate `providers/[submissionId]/page.tsx`**

  This page has approval workflow buttons using `buttonColor` map with hardcoded `bg-green-600` and `bg-red-600`:
  ```tsx
  // Before — buttonColor approach:
  const actions = [
    { label: 'Approve', buttonColor: 'bg-green-600 hover:bg-green-700', action: 'APPROVED' },
    { label: 'Reject', buttonColor: 'bg-red-600 hover:bg-red-700', action: 'REJECTED' },
  ]
  // rendered as:
  <button className={`rounded-full px-6 py-2.5 text-sm font-semibold ${action.buttonColor} text-white hover:scale-[1.02] transition-transform duration-200`}>

  // After — use variantMap:
  const variantMap: Record<string, 'success' | 'destructive' | 'secondary'> = {
    APPROVED: 'success',
    REJECTED: 'destructive',
  }
  // rendered as:
  <Button variant={variantMap[action.action] ?? 'secondary'}>
    {action.label}
  </Button>
  ```

  Also migrate all other `<button>` elements on the page.

- [ ] **Step 3: Migrate `providers/expiry/page.tsx`**

  Replace filter tabs that are NOT conditional-active (static style buttons) with `<Button variant="outline">`. Leave conditional-active tab pills as raw `<button>`.

- [ ] **Step 4: Migrate `providers/profile/[practitionerId]/page.tsx` and `RenewLicenseModal.tsx`**

  Standard Button migration. RenewLicenseModal also has `<input>` elements — replace with `<Input>`.

- [ ] **Step 5: Run tests**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/admin-portal/src/app/providers/ apps/admin-portal/src/components/providers/
  git commit -m "feat(admin-portal): migrate Button + Badge in providers feature"
  ```

---

## Task 6: Button + Badge migration — alerts feature

**Files:**
- Modify: `apps/admin-portal/src/app/alerts/page.tsx`
- Modify: `apps/admin-portal/src/app/alerts/[alertId]/page.tsx`
- Modify: `apps/admin-portal/src/app/alerts/configuration/page.tsx`
- Modify: `apps/admin-portal/src/components/alerts/AcknowledgeAlertModal.tsx`
- Modify: `apps/admin-portal/src/components/alerts/EscalationModal.tsx`
- Modify: `apps/admin-portal/src/components/alerts/EscalationSection.tsx`
- Modify: `apps/admin-portal/src/components/alerts/SurveillanceConfigForm.tsx`
- Modify: `apps/admin-portal/src/components/alerts/SurveillanceAlertHistory.tsx`

Read each file before editing.

- [ ] **Step 1: Migrate `alerts/page.tsx`**

  ```tsx
  import { Button } from '@/components/ui/button'
  import { Badge } from '@/components/ui/badge'
  ```

  - Filter tab pills (conditional `bg-primary`) → **leave as raw `<button>`**
  - Pagination buttons → `<Button variant="outline" size="sm">`
  - Status badges with colorMap → replace with `variantMap` + `<Badge>` (same pattern as providers page)
  - Severity badges → `<Badge variant="destructive">` / `<Badge variant="warning">` etc.

- [ ] **Step 2: Migrate `alerts/[alertId]/page.tsx`**

  This page has the `buttonColor` map with `bg-neutral-600`, `bg-purple-600`, `bg-red-600`. Map them:
  ```tsx
  // Before:
  const buttonColor: Record<string, string> = {
    CLOSE: 'bg-neutral-600 hover:bg-neutral-700',
    ESCALATE: 'bg-purple-600 hover:bg-purple-700',
    MARK_CRITICAL: 'bg-red-600 hover:bg-red-700',
  }

  // After:
  const variantMap: Record<string, 'secondary' | 'destructive'> = {
    CLOSE: 'secondary',
    ESCALATE: 'secondary',
    MARK_CRITICAL: 'destructive',
  }
  // render as: <Button variant={variantMap[action.key] ?? 'secondary'}>
  ```

  Also migrate the raw `<input>` elements with `<Input>`.

- [ ] **Step 3: Migrate `configuration/page.tsx`**

  Standard button migration — action buttons for save/cancel/add configuration.

- [ ] **Step 4: Migrate modal components**

  `AcknowledgeAlertModal.tsx`: Button (was `bg-brand-lime` → `<Button>`) + Textarea (notes field)
  `EscalationModal.tsx`: Button + Input
  `EscalationSection.tsx`: Button + Input
  `SurveillanceConfigForm.tsx`: Button (`bg-brand-lime` → `<Button>`) + Input + Badge
  `SurveillanceAlertHistory.tsx`: Badge only

- [ ] **Step 5: Run tests**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/admin-portal/src/app/alerts/ apps/admin-portal/src/components/alerts/
  git commit -m "feat(admin-portal): migrate Button + Badge + Input in alerts feature"
  ```

---

## Task 7: Button + Badge migration — labs feature

**Files:**
- Modify: `apps/admin-portal/src/app/labs/page.tsx`
- Modify: `apps/admin-portal/src/app/labs/create/page.tsx`
- Modify: `apps/admin-portal/src/app/labs/[labId]/page.tsx`
- Modify: `apps/admin-portal/src/app/labs/[labId]/staff/page.tsx`
- Modify: `apps/admin-portal/src/components/lab-staff/AssignStaffModal.tsx`

Read each file before editing.

- [ ] **Step 1: Migrate `labs/page.tsx`**

  ```tsx
  import { Button } from '@/components/ui/button'
  import { Badge } from '@/components/ui/badge'
  ```

  - "Create Lab" button (`bg-brand-lime`) → `<Button>` (default variant)
  - Filter tabs (conditional active state) → leave as raw `<button>`
  - Status badges → `<Badge variant={...}>`
  - Pagination → `<Button variant="outline" size="sm">`

- [ ] **Step 2: Migrate `labs/create/page.tsx`**

  - Submit button (`bg-brand-lime`) → `<Button>`
  - Back button → `<Button variant="outline">`

- [ ] **Step 3: Migrate `labs/[labId]/page.tsx`**

  This page has the `buttonColor` map with `bg-green-600` (activate) and `bg-red-600` (deactivate):
  ```tsx
  // Before:
  { label: 'Activate', buttonColor: 'bg-green-600 hover:bg-green-700', action: 'ACTIVE' },
  { label: 'Suspend', buttonColor: 'bg-red-600 hover:bg-red-700', action: 'SUSPENDED' },

  // After:
  const variantMap: Record<string, 'success' | 'destructive'> = {
    ACTIVE: 'success',
    SUSPENDED: 'destructive',
  }
  ```

  Also migrate `<input>` elements with `<Input>` and status badges with `<Badge>`.

- [ ] **Step 4: Migrate `labs/[labId]/staff/page.tsx` and `AssignStaffModal.tsx`**

  Standard button + input + badge migration. "Assign Staff" button (`bg-brand-lime`) → `<Button>`.

- [ ] **Step 5: Run tests + commit**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  git add apps/admin-portal/src/app/labs/ apps/admin-portal/src/components/lab-staff/
  git commit -m "feat(admin-portal): migrate Button + Badge + Input in labs feature"
  ```

---

## Task 8: Button + Badge migration — users, staff, patients

**Files:**
- Modify: `apps/admin-portal/src/app/users/page.tsx`
- Modify: `apps/admin-portal/src/app/users/create/page.tsx`
- Modify: `apps/admin-portal/src/app/users/[userId]/page.tsx`
- Modify: `apps/admin-portal/src/app/users/_components/AllUsersTab.tsx`
- Modify: `apps/admin-portal/src/app/users/_components/LabAssignmentsTab.tsx`
- Modify: `apps/admin-portal/src/app/staff/page.tsx`
- Modify: `apps/admin-portal/src/app/staff/[practitionerId]/certifications/page.tsx`
- Modify: `apps/admin-portal/src/app/staff/[practitionerId]/health/page.tsx`
- Modify: `apps/admin-portal/src/app/patients/page.tsx`
- Modify: `apps/admin-portal/src/app/patients/[patientId]/page.tsx`
- Modify: `apps/admin-portal/src/app/patients/merge/page.tsx`
- Modify: `apps/admin-portal/src/components/patients/MergePreview.tsx`

Read each file before editing.

- [ ] **Step 1: Migrate `users/` pages**

  - `users/page.tsx`: Filter tabs (conditional active) → leave; action buttons → `<Button>`
  - `users/create/page.tsx`: Submit → `<Button>`, inputs → `<Input>`, Back → `<Button variant="outline">`
  - `users/[userId]/page.tsx`: Has `bg-red-600` for destructive action → `<Button variant="destructive">`. Also `<Input>` for edit fields. Has `<Badge>` for status.
  - `AllUsersTab.tsx`: `<Badge>` for role/status columns
  - `LabAssignmentsTab.tsx`: `<Button>` + `<Badge>`

- [ ] **Step 2: Migrate `staff/` pages**

  Standard button + badge migration. `staff/[practitionerId]/certifications/page.tsx` has certification status badges.

- [ ] **Step 3: Migrate `patients/` pages**

  - `patients/page.tsx`: "New Patient" button (`bg-brand-lime`) → `<Button>`. Row hover with `hover:bg-brand-lime/5` → change to `hover:bg-primary/5`. Badge for patient status.
  - `patients/[patientId]/page.tsx`: Standard button migration.
  - `patients/merge/page.tsx`: Has `bg-brand-lime` on several buttons → `<Button>`. Has conditional active-state tab pills (field selection) — check if these are truly tab toggles or action buttons. If they toggle which record's field to accept, they are state-driven → leave as raw `<button>` with updated token colors.

  For `hover:bg-brand-lime/5` row hover:
  ```tsx
  // Before: className="cursor-pointer transition-colors hover:bg-brand-lime/5"
  // After:  className="cursor-pointer transition-colors hover:bg-primary/5"
  ```

- [ ] **Step 4: Run tests + commit**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  git add apps/admin-portal/src/app/users/ apps/admin-portal/src/app/staff/ apps/admin-portal/src/app/patients/ apps/admin-portal/src/components/patients/
  git commit -m "feat(admin-portal): migrate Button + Badge + Input in users, staff, patients features"
  ```

---

## Task 9: Button + Badge migration — subscriptions, settings, inventory, audit

**Files:**
- Modify: `apps/admin-portal/src/app/subscriptions/page.tsx`
- Modify: `apps/admin-portal/src/app/subscriptions/billing/page.tsx`
- Modify: `apps/admin-portal/src/app/subscriptions/invoices/page.tsx`
- Modify: `apps/admin-portal/src/app/settings/page.tsx`
- Modify: `apps/admin-portal/src/app/inventory/page.tsx`
- Modify: `apps/admin-portal/src/app/inventory/suppliers/page.tsx`
- Modify: `apps/admin-portal/src/app/audit/page.tsx`
- Modify: `apps/admin-portal/src/components/subscriptions/DunningBanner.tsx`
- Modify: `apps/admin-portal/src/components/subscriptions/PaymentMethodCard.tsx`
- Modify: `apps/admin-portal/src/components/subscriptions/TrialExpiredBanner.tsx`
- Modify: `apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx`
- Modify: `apps/admin-portal/src/components/subscriptions/AddModuleDialog.tsx`
- Modify: `apps/admin-portal/src/components/settings/ModuleSettingsCard.tsx`
- Modify: `apps/admin-portal/src/components/settings/NotificationPreferences.tsx`
- Modify: `apps/admin-portal/src/components/settings/ThresholdSettings.tsx`
- Modify: `apps/admin-portal/src/components/inventory/CreatePurchaseOrderModal.tsx`
- Modify: `apps/admin-portal/src/components/inventory/PurchaseOrderDetailModal.tsx`

Read each file before editing.

- [ ] **Step 1: Migrate subscriptions**

  - `subscriptions/page.tsx`: Action buttons → `<Button>`. Badge for plan type/status.
  - `billing/page.tsx`: CTA buttons (possibly `bg-brand-lime`) → `<Button>`.
  - `invoices/page.tsx`: Download/export buttons → `<Button variant="outline">`. Invoice status → `<Badge>`.
  - `DunningBanner.tsx`: The Link-as-button → `<Button asChild><Link>`. Use `variant="destructive"`.
  - `PaymentMethodCard.tsx`: Edit/remove buttons → `<Button variant="ghost">` / `<Button variant="outline">`.
  - `TrialExpiredBanner.tsx`: CTA → `<Button>`.
  - `RemoveModuleDialog.tsx`: Confirm → `<Button variant="destructive">`, Cancel → `<Button variant="outline">`.
  - `AddModuleDialog.tsx`: Add → `<Button>`, Cancel → `<Button variant="outline">`.

- [ ] **Step 2: Migrate settings**

  - `settings/page.tsx`: Save/cancel buttons → `<Button>`. Tab filters (conditional active) → leave as raw `<button>`.
  - `ModuleSettingsCard.tsx`: Toggle/save → `<Button>`.
  - `NotificationPreferences.tsx`: Save → `<Button>`, inputs → `<Input>`.
  - `ThresholdSettings.tsx`: Save → `<Button>`, inputs → `<Input>`.

- [ ] **Step 3: Migrate inventory**

  - `inventory/page.tsx`: "New PO" button (`bg-brand-lime`) → `<Button>`. Tab filters → leave. Badge for status.
  - `inventory/suppliers/page.tsx`: Action buttons (`bg-brand-lime`) → `<Button>`. Inputs → `<Input>`.
  - `CreatePurchaseOrderModal.tsx`: Submit → `<Button>`, Cancel → `<Button variant="outline">`, inputs → `<Input>`.
  - `PurchaseOrderDetailModal.tsx`: Action buttons → `<Button>`.

- [ ] **Step 4: Migrate audit**

  - `audit/page.tsx`: Tab pills with `bg-brand-lime` (active state) → these use `bg-brand-lime` for active, which was the old brand color. Now change active state to `bg-primary text-foreground`. Leave as raw `<button>` (tab toggles). Export/filter action buttons → `<Button variant="outline">`. Badges for event type → `<Badge>`.

    ```tsx
    // Before (tab pill):
    tab === 'integrity' ? 'bg-brand-lime text-black' : 'border border-border text-muted-foreground hover:bg-card'
    // After:
    tab === 'integrity' ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-card'
    ```

- [ ] **Step 5: Run tests + commit**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  git add apps/admin-portal/src/app/subscriptions/ apps/admin-portal/src/app/settings/ apps/admin-portal/src/app/inventory/ apps/admin-portal/src/app/audit/ apps/admin-portal/src/components/subscriptions/ apps/admin-portal/src/components/settings/ apps/admin-portal/src/components/inventory/
  git commit -m "feat(admin-portal): migrate Button + Badge + Input in subscriptions, settings, inventory, audit"
  ```

---

## Task 10: Button + Badge migration — certifications, network, mentorship, AI models

**Files:**
- Modify: `apps/admin-portal/src/app/certifications/page.tsx`
- Modify: `apps/admin-portal/src/app/network/page.tsx`
- Modify: `apps/admin-portal/src/app/mentorship/page.tsx`
- Modify: `apps/admin-portal/src/app/ai-models/page.tsx`
- Modify: `apps/admin-portal/src/components/certifications/ExpiryWarningWidget.tsx`
- Modify: `apps/admin-portal/src/components/certifications/MilestoneReviewModal.tsx`
- Modify: `apps/admin-portal/src/components/certifications/PathwayCreateModal.tsx`
- Modify: `apps/admin-portal/src/components/network/ChwEnrollmentModal.tsx`
- Modify: `apps/admin-portal/src/components/network/LabNetworkCard.tsx`
- Modify: `apps/admin-portal/src/components/network/OutbreakActivationModal.tsx`

Read each file before editing.

- [ ] **Step 1: Migrate certifications**

  - `certifications/page.tsx`: Filter tabs (conditional active) → leave. Action buttons → `<Button>`. Status badges → `<Badge>`.
  - `ExpiryWarningWidget.tsx`: Action button → `<Button>`.
  - `MilestoneReviewModal.tsx`: Approve/reject/cancel buttons → `<Button variant="success">` / `<Button variant="destructive">` / `<Button variant="outline">`.
  - `PathwayCreateModal.tsx`: Submit → `<Button>`, Cancel → `<Button variant="outline">`, inputs → `<Input>`.

- [ ] **Step 2: Migrate network**

  - `network/page.tsx`: "Enroll CHW" button (`bg-brand-lime`) → `<Button>`. Tabs → leave.
  - `ChwEnrollmentModal.tsx`: Submit → `<Button>`, Cancel → `<Button variant="outline">`, inputs → `<Input>`.
  - `LabNetworkCard.tsx`: Action buttons → `<Button variant="outline">`. Status badge → `<Badge>`.
  - `OutbreakActivationModal.tsx`: Activate → `<Button variant="destructive">`, Cancel → `<Button variant="outline">`. Inputs → `<Input>`. Status → `<Badge>`.

- [ ] **Step 3: Migrate mentorship**

  - `mentorship/page.tsx`: Multiple `bg-brand-lime` buttons → `<Button>`. `hover:bg-brand-lime/5` on row/card → change to `hover:bg-primary/5`. Badges for status/role → `<Badge>`.

- [ ] **Step 4: Migrate ai-models**

  - `ai-models/page.tsx`: Action buttons → `<Button>`. Type/status badges → `<Badge>`. Any inputs → `<Input>`.

- [ ] **Step 5: Run tests + commit**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  git add apps/admin-portal/src/app/certifications/ apps/admin-portal/src/app/network/ apps/admin-portal/src/app/mentorship/ apps/admin-portal/src/app/ai-models/ apps/admin-portal/src/components/certifications/ apps/admin-portal/src/components/network/
  git commit -m "feat(admin-portal): migrate Button + Badge + Input in certifications, network, mentorship, AI models"
  ```

---

## Task 11: Button migration — shared components

**Files:**
- Modify: `apps/admin-portal/src/components/TopHeader.tsx`
- Modify: `apps/admin-portal/src/components/ExportButton.tsx`
- Modify: `apps/admin-portal/src/components/AuthGuard.tsx`
- Modify: `apps/admin-portal/src/components/dashboard/SubscriptionWidget.tsx`
- Modify: `apps/admin-portal/src/components/registration/AdminCredentialsStep.tsx`
- Modify: `apps/admin-portal/src/components/registration/OrgDetailsStep.tsx`
- Modify: `apps/admin-portal/src/components/registration/ModuleSelectionStep.tsx`

Read each file before editing.

- [ ] **Step 1: Migrate `TopHeader.tsx`**

  ```tsx
  import { Button } from '@/components/ui/button'
  ```

  The header has several icon buttons (search, notifications, theme toggle) — these are `flex h-9 w-9 items-center justify-center rounded-full border border-border`:
  ```tsx
  // Before:
  <button className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors duration-200" aria-label="Search">
    <SearchIcon size={16} />
  </button>

  // After:
  <Button variant="outline" size="icon" aria-label="Search">
    <SearchIcon size={16} />
  </Button>
  ```

  The user avatar button:
  ```tsx
  // Before:
  <button className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors duration-200">
    {initials}
  </button>

  // After:
  <Button variant="ghost" size="icon" className="rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20">
    {initials}
  </Button>
  ```

  The sign-out menu item:
  ```tsx
  // Before:
  <button onClick={handleSignOut} className="flex w-full items-center rounded-xl px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">

  // After:
  <Button variant="ghost" className="w-full justify-start rounded-xl px-3 py-2 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleSignOut}>
  ```

  The settings link:
  ```tsx
  // Before:
  <Link href="/settings" className="flex items-center rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors">

  // After:
  <Button variant="ghost" size="sm" className="w-full justify-start rounded-xl" asChild>
    <Link href="/settings">
  ```

- [ ] **Step 2: Migrate `ExportButton.tsx`**

  ```tsx
  // Before:
  <button onClick={handleClick} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-border text-black px-4 py-2 text-sm hover:bg-primary/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">

  // After:
  <Button variant="outline" onClick={handleClick} disabled={loading}>
  ```

- [ ] **Step 3: Migrate `AuthGuard.tsx`**

  Any button in AuthGuard (typically a "Sign in" CTA) → `<Button>`.

- [ ] **Step 4: Migrate `SubscriptionWidget.tsx`**

  ```tsx
  // Before (router.push button, was bg-brand-lime):
  <button onClick={() => router.push('/subscriptions/billing')} className="mt-4 rounded-xl bg-brand-lime px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-opacity">

  // After:
  <Button className="mt-4 w-full" onClick={() => router.push('/subscriptions/billing')}>
  ```

- [ ] **Step 5: Migrate registration steps**

  `AdminCredentialsStep.tsx`:
  - Back button → `<Button variant="outline">`
  - Next button → `<Button type="submit">` (or just `<Button>`)
  - All `<input>` fields → `<Input>` with `<Label>`
  - Password field → `<Input type="password">`

  `OrgDetailsStep.tsx`:
  - Next button → `<Button>`
  - `<input>` fields → `<Input>` with `<Label>`
  - `<select>` for country code → `<Select>` with `<Label>`

  `ModuleSelectionStep.tsx`:
  - Back/Next → `<Button variant="outline">` / `<Button>`
  - The module selection items are clickable labels with checkboxes — leave these as-is (they are not buttons)

- [ ] **Step 6: Run tests + commit**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  git add apps/admin-portal/src/components/TopHeader.tsx apps/admin-portal/src/components/ExportButton.tsx apps/admin-portal/src/components/AuthGuard.tsx apps/admin-portal/src/components/dashboard/ apps/admin-portal/src/components/registration/
  git commit -m "feat(admin-portal): migrate Button + Input in shared components and registration steps"
  ```

---

## Task 12: Final verification + badge audit

**Files:** No new modifications — this is a verification pass.

- [ ] **Step 1: Grep for remaining raw `<button>` elements (excluding legitimate tab pills)**

  ```bash
  grep -rn "<button" apps/admin-portal/src --include="*.tsx" | grep -v "rounded-full.*\${" | grep -v "// " | wc -l
  ```

  The remaining count should be only the conditional tab-pill buttons (which have `${condition ? '...' : '...'}` patterns). Anything without a conditional className pattern is a missed migration.

  If unexpected `<button>` elements appear:
  ```bash
  grep -rn "<button" apps/admin-portal/src --include="*.tsx" | grep -v "\${" | head -30
  ```
  Fix any missed buttons.

- [ ] **Step 2: Grep for remaining raw badge spans**

  ```bash
  grep -rn "rounded-full px-2\.5 py-0\.5\|rounded-full px-3 py-1" apps/admin-portal/src --include="*.tsx" | grep -v "// " | head -20
  ```

  Any remaining instances should be migrated to `<Badge>`. Fix if found.

- [ ] **Step 3: Grep for remaining raw inputs**

  ```bash
  grep -rn "focus:border-primary focus:outline-none focus:ring" apps/admin-portal/src --include="*.tsx" | grep -v "// " | head -20
  ```

  Any remaining instances should be migrated to `<Input>` or `<Textarea>`. Fix if found.

- [ ] **Step 4: Grep for remaining brand-lime and hardcoded colors**

  ```bash
  grep -rn "bg-brand-lime\|bg-green-600\|bg-red-600\|bg-neutral-600\|bg-purple-600" apps/admin-portal/src --include="*.tsx" | grep -v "// " | head -20
  ```

  Any remaining instances → migrate to `<Button variant="success">`, `<Button variant="destructive">`, or `<Button variant="secondary">` as appropriate.

- [ ] **Step 5: Run full test suite**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -10
  ```

  Expected: 181 passing, 11 pre-existing failures (same as before migration). If new failures appear, investigate — they will be JSX syntax errors from missed closing tags or wrong prop types.

- [ ] **Step 6: TypeScript check**

  ```bash
  pnpm -F @ultranos/admin-portal typecheck 2>&1 | grep -v "hub-api\|OrderStatusPipeline\|TopHeader\|implicit any" | head -20
  ```

  Fix any new TypeScript errors related to our changes (wrong variant names, missing imports, etc.).

- [ ] **Step 7: Commit cleanup fixes if any**

  ```bash
  git add apps/admin-portal/src
  git commit -m "fix(admin-portal): cleanup remaining raw buttons, badges, inputs after migration"
  ```

---

## Appendix: Button variant quick reference

| Scenario | Variant |
|----------|---------|
| Primary action (save, submit, create, confirm) | `default` |
| Secondary/cancel/back | `outline` |
| Destructive (delete, reject, suspend, deactivate) | `destructive` |
| Approve/activate/success actions | `success` |
| Neutral secondary action (archive, close workflow) | `secondary` |
| Icon-only toolbar buttons (header icons, inline actions) | `outline size="icon"` or `ghost size="icon"` |
| Navigation link styled as button | `default asChild` with `<Link>` |
| Text link | `link` |
| Tab/filter pills with conditional active bg | **Not migrated — leave as raw `<button>`** |

## Appendix: Badge variant quick reference

| Status / Use case | Variant |
|-------------------|---------|
| Active, approved, completed, success | `success` |
| Pending, review, warning, expiring soon | `warning` |
| Rejected, suspended, failed, critical | `destructive` |
| Default / highlighted state | `default` (teal-green tint) |
| Neutral / info / role label | `secondary` |
| Outlined tag | `outline` |
| Larger badge on detail pages | any variant + `size="lg"` |
