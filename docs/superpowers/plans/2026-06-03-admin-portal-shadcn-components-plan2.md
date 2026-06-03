# Admin Portal — ShadCN Component Migration, Plan 2: Color Tokens, Dialog, DropdownMenu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix dark-mode-breaking hardcoded colors (`bg-white`, `bg-black`), migrate all hand-rolled modals to accessible ShadCN Dialog, and replace the TopHeader dropdown with ShadCN DropdownMenu.

**Architecture:** Three phases: (1) install ShadCN Dialog and DropdownMenu, customize to match existing rounded-3xl/rounded-2xl design language; (2) batch-replace hardcoded color tokens across all files; (3) migrate modals → Dialog and TopHeader → DropdownMenu. Card and Table ShadCN components are intentionally deferred to the ui-kit extraction phase — wrapping existing well-styled divs and tables in Card/Table wrappers adds ceremony without meaningful benefit at this stage.

**Tech Stack:** ShadCN (radix-rhea style), Radix UI Dialog + DropdownMenu primitives, Tailwind CSS v3.4, Next.js 15, TypeScript

**Prerequisite:** Plan 1 complete (Button, Badge, Input, Textarea, Label all customized and migrated).

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `apps/admin-portal/src/components/ui/dialog.tsx` | ShadCN Dialog — customized to rounded-3xl |
| Create | `apps/admin-portal/src/components/ui/dropdown-menu.tsx` | ShadCN DropdownMenu — customized to rounded-2xl |
| Modify | `apps/admin-portal/src/components/TopHeader.tsx` | DropdownMenu migration |
| Modify | `apps/admin-portal/src/components/alerts/AcknowledgeAlertModal.tsx` | Dialog migration |
| Modify | `apps/admin-portal/src/components/alerts/EscalationModal.tsx` | Dialog migration |
| Modify | `apps/admin-portal/src/components/alerts/EscalationSection.tsx` | bg-white → bg-card |
| Modify | `apps/admin-portal/src/components/certifications/MilestoneReviewModal.tsx` | Dialog migration |
| Modify | `apps/admin-portal/src/components/certifications/PathwayCreateModal.tsx` | Dialog migration |
| Modify | `apps/admin-portal/src/components/inventory/CreatePurchaseOrderModal.tsx` | Dialog migration |
| Modify | `apps/admin-portal/src/components/inventory/PurchaseOrderDetailModal.tsx` | Dialog migration |
| Modify | `apps/admin-portal/src/components/lab-staff/AssignStaffModal.tsx` | Dialog migration |
| Modify | `apps/admin-portal/src/components/network/ChwEnrollmentModal.tsx` | Dialog migration |
| Modify | `apps/admin-portal/src/components/network/OutbreakActivationModal.tsx` | Dialog migration |
| Modify | `apps/admin-portal/src/components/providers/RenewLicenseModal.tsx` | Dialog migration |
| Modify | `apps/admin-portal/src/components/subscriptions/AddModuleDialog.tsx` | Dialog migration |
| Modify | `apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx` | Dialog migration |
| Modify | `apps/admin-portal/src/app/alerts/[alertId]/page.tsx` | Inline dialog migration |
| Modify | `apps/admin-portal/src/app/mentorship/page.tsx` | Inline dialog migration + color fix |
| Modify | `apps/admin-portal/src/app/providers/[submissionId]/page.tsx` | Inline dialog migration |
| Modify | `apps/admin-portal/src/app/inventory/suppliers/page.tsx` | Inline dialog migration |
| Modify | 22 files with `bg-white` | bg-white → bg-card |
| Modify | 10 files with `bg-black` table headers | bg-black → bg-card, text-white → text-foreground |
| Modify | 3 files with `text-black` | text-black → text-foreground |

---

## Pattern Reference (read before all tasks)

### Dialog migration pattern

Every modal in this app follows the same hand-rolled pattern. The migration wraps it in ShadCN's accessible Dialog primitive.

```tsx
// ═══ BEFORE (hand-rolled modal) ═══
interface FooModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function FooModal({ onClose, onSuccess }: FooModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground">Title</h2>
        <p className="mt-1 text-sm text-muted-foreground">Description</p>
        {/* ... content ... */}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Confirm</Button>
        </div>
      </div>
    </div>
  )
}

// ═══ AFTER (ShadCN Dialog) ═══
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface FooModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function FooModal({ open, onOpenChange, onSuccess }: FooModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Description</DialogDescription>
        </DialogHeader>
        {/* ... content ... */}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Key API changes:**
- `onClose: () => void` → `open: boolean` + `onOpenChange: (open: boolean) => void`
- Remove the outer `<div className="fixed inset-0 ...">` overlay — Dialog handles this
- Remove the inner `<div className="... rounded-3xl bg-white ...">` wrapper — DialogContent handles this
- Remove `onClick={onClose}` and `onClick={(e) => e.stopPropagation()}` — Dialog handles this
- `<h2>` → `<DialogTitle>`
- Subtitle `<p>` → `<DialogDescription>`
- Footer buttons → `<DialogFooter>`
- Cancel `onClick={onClose}` → `onClick={() => onOpenChange(false)}`

**Call-site change:**
```tsx
// Before:
{showModal && <FooModal onClose={() => setShowModal(false)} onSuccess={handleSuccess} />}

// After:
<FooModal open={showModal} onOpenChange={setShowModal} onSuccess={handleSuccess} />
```

Note: The Dialog renders nothing when `open={false}`, so no conditional `{showModal && ...}` wrapper is needed.

### Color token replacements

| Old | New | Reason |
|-----|-----|--------|
| `bg-white` (on cards, sections) | `bg-card` | Dark mode support — bg-card maps to white in light, dark gray in dark |
| `bg-white` (on modals) | Removed — DialogContent handles this | Dialog provides its own bg-popover |
| `bg-white` (on toggle switch thumb) | Keep as `bg-white` | Intentional contrast for switch knob |
| `bg-white dark:bg-popover` | `bg-popover` | Simplify — bg-popover already handles both modes |
| `bg-black` (on table `<thead>`) | `bg-card` | Theme-consistent header |
| `text-white` (on table `<th>`) | Remove (inherits from card foreground) | Paired with bg-black removal |
| `text-black` (hover states) | `text-foreground` | Dark mode support |
| `bg-black/50` (modal overlay) | Removed — Dialog handles this | Dialog provides its own overlay |

---

## Task 1: Install and customize Dialog and DropdownMenu

**Files:**
- Create: `apps/admin-portal/src/components/ui/dialog.tsx`
- Create: `apps/admin-portal/src/components/ui/dropdown-menu.tsx`

- [ ] **Step 1: Install ShadCN Dialog and DropdownMenu**

  ```bash
  cd apps/admin-portal
  pnpm dlx shadcn@latest add dialog dropdown-menu
  ```

- [ ] **Step 2: Verify files exist**

  ```bash
  ls apps/admin-portal/src/components/ui/dialog.tsx apps/admin-portal/src/components/ui/dropdown-menu.tsx
  ```

- [ ] **Step 3: Customize Dialog — replace `dialog.tsx`**

  Read the installed file first. Then replace with a version that uses `rounded-3xl` (matching modal design) and `bg-popover` (not bg-white). The key customizations:

  - `DialogOverlay`: keep `fixed inset-0 z-50 bg-black/50` (matches existing modal overlay)
  - `DialogContent`: change from `rounded-2xl` to `rounded-3xl`, ensure `bg-popover` (not `bg-white`), add `mx-4` for mobile margins, `shadow-xl`, `max-w-lg` default
  - `DialogHeader`: `space-y-1.5`
  - `DialogTitle`: `text-lg font-semibold text-foreground`
  - `DialogDescription`: `text-sm text-muted-foreground`
  - `DialogFooter`: `mt-6 flex justify-end gap-3`

  Replace with:

  ```tsx
  "use client"

  import * as React from "react"
  import { Dialog as DialogPrimitive } from "radix-ui"
  import { X } from "@ultranos/ui-kit/icons"

  import { cn } from "@/lib/utils"

  function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
    return <DialogPrimitive.Root data-slot="dialog" {...props} />
  }

  function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
    return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
  }

  function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
    return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
  }

  function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
    return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
  }

  function DialogOverlay({
    className,
    ...props
  }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
    return (
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className={cn(
          "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className
        )}
        {...props}
      />
    )
  }

  function DialogContent({
    className,
    children,
    ...props
  }: React.ComponentProps<typeof DialogPrimitive.Content>) {
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            "fixed top-[50%] left-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-3xl bg-popover p-6 mx-4 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            className
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close className="absolute top-4 right-4 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    )
  }

  function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
      <div
        data-slot="dialog-header"
        className={cn("space-y-1.5", className)}
        {...props}
      />
    )
  }

  function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
      <div
        data-slot="dialog-footer"
        className={cn("mt-6 flex justify-end gap-3", className)}
        {...props}
      />
    )
  }

  function DialogTitle({
    className,
    ...props
  }: React.ComponentProps<typeof DialogPrimitive.Title>) {
    return (
      <DialogPrimitive.Title
        data-slot="dialog-title"
        className={cn("text-lg font-semibold text-foreground", className)}
        {...props}
      />
    )
  }

  function DialogDescription({
    className,
    ...props
  }: React.ComponentProps<typeof DialogPrimitive.Description>) {
    return (
      <DialogPrimitive.Description
        data-slot="dialog-description"
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
      />
    )
  }

  export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogTrigger,
  }
  ```

- [ ] **Step 4: Customize DropdownMenu — replace `dropdown-menu.tsx`**

  Read the installed file. The key customization: change `rounded-xl` to `rounded-2xl` to match the existing TopHeader menu, and ensure `bg-popover` and `shadow-card`. Replace any `lucide-react` imports with `@ultranos/ui-kit/icons`.

  Read the installed file's content, then make these edits:
  - Replace any `from "lucide-react"` → `from "@ultranos/ui-kit/icons"` and adjust icon names if needed (e.g. `CheckIcon` → `Check as CheckIcon`, `ChevronRightIcon` → `ChevronRight as ChevronRightIcon`, `CircleIcon` → `Circle as CircleIcon`)
  - Change `rounded-xl` to `rounded-2xl` in `DropdownMenuContent`
  - Ensure items use `rounded-xl` (for menu item hover radius matching existing design)

- [ ] **Step 5: Verify TypeScript**

  ```bash
  pnpm -F @ultranos/admin-portal typecheck 2>&1 | grep "ui/dialog\|ui/dropdown" || echo "No dialog/dropdown errors"
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/admin-portal/src/components/ui/dialog.tsx apps/admin-portal/src/components/ui/dropdown-menu.tsx
  git commit -m "feat(admin-portal): install and customize ShadCN Dialog and DropdownMenu"
  ```

---

## Task 2: Color token cleanup — bg-white → bg-card

**Files (22 files):** Every file in admin-portal `src/` that contains `bg-white` on card/section divs.

Read each file before editing. Replace `bg-white` with `bg-card` on card containers and section divs. **Exception:** Leave `bg-white` on toggle switch thumbs (`h-5 w-5 rounded-full bg-white shadow-sm`) — those need white for contrast.

- [ ] **Step 1: Replace bg-white on card/section containers**

  Files to modify (find the `bg-white` lines and replace):

  ```
  apps/admin-portal/src/components/alerts/EscalationSection.tsx
  apps/admin-portal/src/app/users/_components/LabAssignmentsTab.tsx
  apps/admin-portal/src/app/users/_components/AllUsersTab.tsx
  apps/admin-portal/src/app/users/[userId]/page.tsx
  apps/admin-portal/src/app/mentorship/page.tsx
  apps/admin-portal/src/components/patients/MergePreview.tsx
  apps/admin-portal/src/components/patients/ConsentTimeline.tsx
  apps/admin-portal/src/components/subscriptions/PaymentMethodCard.tsx
  apps/admin-portal/src/components/audit/EventBrowser.tsx
  apps/admin-portal/src/app/settings/page.tsx (5 instances)
  apps/admin-portal/src/app/patients/merge/page.tsx (4 instances)
  apps/admin-portal/src/app/patients/[patientId]/page.tsx (2 instances)
  apps/admin-portal/src/app/patients/page.tsx (2 instances)
  apps/admin-portal/src/app/subscriptions/invoices/page.tsx
  apps/admin-portal/src/app/providers/profile/[practitionerId]/page.tsx (4 instances)
  ```

  For each file:
  ```tsx
  // Before:
  <div className="rounded-3xl bg-white p-5 border border-border">
  // After:
  <div className="rounded-3xl bg-card p-5 border border-border">

  // Before:
  <div className="rounded-3xl border border-border bg-white p-12 text-center">
  // After:
  <div className="rounded-3xl border border-border bg-card p-12 text-center">
  ```

  **Leave unchanged:**
  - `bg-white` inside toggle switch thumbs (NotificationPreferences.tsx, ModuleSettingsCard.tsx) — intentional for switch knob contrast
  - `bg-white dark:bg-popover` → change to just `bg-popover` (AcknowledgeAlertModal.tsx — but this file gets Dialog migration in Task 4, so skip it here)

- [ ] **Step 2: Replace text-black**

  ```
  apps/admin-portal/src/app/subscriptions/page.tsx (2 instances)
  apps/admin-portal/src/app/subscriptions/billing/page.tsx (1 instance)
  apps/admin-portal/src/app/subscriptions/invoices/page.tsx (1 instance)
  ```

  ```tsx
  // Before: text-black
  // After:  text-foreground
  ```

- [ ] **Step 3: Standardize table headers — bg-black → bg-card**

  These files use `bg-black text-white` on table `<thead>` or `<tr>`. Replace with `bg-card` and remove `text-white` (inherits foreground color from card).

  ```
  apps/admin-portal/src/components/alerts/SurveillanceConfigForm.tsx
  apps/admin-portal/src/components/alerts/SurveillanceAlertHistory.tsx
  apps/admin-portal/src/app/users/_components/LabAssignmentsTab.tsx
  apps/admin-portal/src/app/users/_components/AllUsersTab.tsx
  apps/admin-portal/src/app/mentorship/page.tsx
  apps/admin-portal/src/components/patients/PatientComparisonTable.tsx
  apps/admin-portal/src/app/patients/page.tsx
  apps/admin-portal/src/components/audit/EventBrowser.tsx
  apps/admin-portal/src/app/inventory/page.tsx
  apps/admin-portal/src/app/inventory/suppliers/page.tsx
  apps/admin-portal/src/components/inventory/HeatMapGrid.tsx
  apps/admin-portal/src/components/inventory/PurchaseOrderDetailModal.tsx
  apps/admin-portal/src/app/subscriptions/invoices/page.tsx
  apps/admin-portal/src/app/providers/profile/[practitionerId]/page.tsx (2 instances)
  apps/admin-portal/src/app/users/page.tsx (conditional — change 'bg-black text-white' to 'bg-primary text-primary-foreground')
  ```

  ```tsx
  // Before:
  <thead className="bg-black text-white">
  // After:
  <thead className="bg-card">

  // Before:
  <thead className="bg-black">
  // After:
  <thead className="bg-card">

  // Before:
  <tr className="bg-black text-white">
  // After:
  <tr className="bg-card">
  ```

  For `<th>` elements inside these heads: if they have `text-white`, remove it. The `text-muted-foreground` styling on `<th>` should be preserved if present.

  Special case — `users/page.tsx` has a conditional tab active state using `bg-black text-white`:
  ```tsx
  // Before: ? 'bg-black text-white' : ...
  // After:  ? 'bg-primary text-primary-foreground' : ...
  ```

- [ ] **Step 4: Fix hover:bg-brand-lime/5 in EventBrowser.tsx**

  ```tsx
  // Before: hover:bg-brand-lime/5
  // After:  hover:bg-primary/5
  ```

  This was flagged in Task 9 review but not in scope for that task.

- [ ] **Step 5: Run tests**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  ```

  Expected: 181 passing, 11 pre-existing failures.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/admin-portal/src
  git commit -m "fix(admin-portal): replace hardcoded bg-white/bg-black/text-black with semantic color tokens"
  ```

---

## Task 3: TopHeader — DropdownMenu migration

**Files:**
- Modify: `apps/admin-portal/src/components/TopHeader.tsx`

- [ ] **Step 1: Read current TopHeader.tsx**

  The current user menu uses a hand-rolled dropdown pattern:
  ```tsx
  {showUserMenu && (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
      <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-2xl border border-border bg-popover p-2 shadow-card">
        {/* menu items */}
      </div>
    </>
  )}
  ```

- [ ] **Step 2: Replace with ShadCN DropdownMenu**

  ```tsx
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  ```

  Replace the `<div className="relative">` user menu block with:

  ```tsx
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20"
        aria-label="User menu"
      >
        {initials}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel>
        <p className="text-sm font-medium text-foreground">{email}</p>
        <p className="text-xs text-muted-foreground">Administrator</p>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/settings">Settings</Link>
      </DropdownMenuItem>
      <DropdownMenuItem
        className="text-destructive focus:text-destructive focus:bg-destructive/10"
        onClick={handleSignOut}
      >
        Sign Out
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  ```

  Remove:
  - `const [showUserMenu, setShowUserMenu] = useState(false)` — DropdownMenu manages its own open state
  - The `useState` import can stay if other state variables exist, otherwise remove

- [ ] **Step 3: Run tests**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/admin-portal/src/components/TopHeader.tsx
  git commit -m "feat(admin-portal): migrate TopHeader user menu to ShadCN DropdownMenu"
  ```

---

## Task 4: Dialog migration — standalone modal components (batch 1)

**Files (6 modals):**
- Modify: `apps/admin-portal/src/components/alerts/AcknowledgeAlertModal.tsx`
- Modify: `apps/admin-portal/src/components/alerts/EscalationModal.tsx`
- Modify: `apps/admin-portal/src/components/certifications/MilestoneReviewModal.tsx`
- Modify: `apps/admin-portal/src/components/certifications/PathwayCreateModal.tsx`
- Modify: `apps/admin-portal/src/components/network/ChwEnrollmentModal.tsx`
- Modify: `apps/admin-portal/src/components/network/OutbreakActivationModal.tsx`

Read each file before editing. Apply the Dialog migration pattern from the Pattern Reference section.

- [ ] **Step 1: Migrate `AcknowledgeAlertModal.tsx`**

  Add imports:
  ```tsx
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from '@/components/ui/dialog'
  ```

  Change props interface:
  ```tsx
  // Before:
  interface AcknowledgeAlertModalProps {
    alertId: string
    labName: string
    testCategory: string
    onClose: () => void
    onSuccess: () => void
  }

  // After:
  interface AcknowledgeAlertModalProps {
    alertId: string
    labName: string
    testCategory: string
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
  }
  ```

  Replace the return JSX:
  ```tsx
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Acknowledge Alert</DialogTitle>
          <DialogDescription>
            {testCategory} alert for <span className="font-medium">{labName}</span>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
        )}

        <div className="mt-4">
          <label htmlFor="ack-notes" className="block text-sm font-medium text-foreground">
            Notes <span className="text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="ack-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1"
            placeholder="Add any notes about this acknowledgment..."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Acknowledging...' : 'Acknowledge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  ```

  Then update the **call site** in `apps/admin-portal/src/app/alerts/page.tsx`:
  ```tsx
  // Before:
  {showAckModal && selectedAlert && (
    <AcknowledgeAlertModal
      alertId={selectedAlert.id}
      labName={selectedAlert.labName}
      testCategory={selectedAlert.testCategory}
      onClose={() => setShowAckModal(false)}
      onSuccess={() => { setShowAckModal(false); refetch() }}
    />
  )}

  // After:
  {selectedAlert && (
    <AcknowledgeAlertModal
      alertId={selectedAlert.id}
      labName={selectedAlert.labName}
      testCategory={selectedAlert.testCategory}
      open={showAckModal}
      onOpenChange={setShowAckModal}
      onSuccess={() => { setShowAckModal(false); refetch() }}
    />
  )}
  ```

- [ ] **Step 2: Migrate `EscalationModal.tsx`**

  Same pattern. Change `onClose` → `open` + `onOpenChange`. Wrap content in Dialog/DialogContent/DialogHeader/DialogFooter. Update call site in `apps/admin-portal/src/components/alerts/EscalationSection.tsx`.

- [ ] **Step 3: Migrate `MilestoneReviewModal.tsx`**

  Same pattern. Update call site in `apps/admin-portal/src/app/staff/[practitionerId]/certifications/page.tsx`.

- [ ] **Step 4: Migrate `PathwayCreateModal.tsx`**

  Same pattern. Update call site in `apps/admin-portal/src/app/certifications/page.tsx`.

- [ ] **Step 5: Migrate `ChwEnrollmentModal.tsx`**

  Same pattern. Update call site in `apps/admin-portal/src/app/network/page.tsx`.

- [ ] **Step 6: Migrate `OutbreakActivationModal.tsx`**

  Same pattern. Update call site in `apps/admin-portal/src/app/network/page.tsx`.

- [ ] **Step 7: Run tests**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add apps/admin-portal/src/components/alerts/ apps/admin-portal/src/components/certifications/ apps/admin-portal/src/components/network/ apps/admin-portal/src/app/alerts/ apps/admin-portal/src/app/staff/ apps/admin-portal/src/app/certifications/ apps/admin-portal/src/app/network/
  git commit -m "feat(admin-portal): migrate alerts, certifications, network modals to ShadCN Dialog"
  ```

---

## Task 5: Dialog migration — standalone modal components (batch 2)

**Files (6 modals):**
- Modify: `apps/admin-portal/src/components/inventory/CreatePurchaseOrderModal.tsx`
- Modify: `apps/admin-portal/src/components/inventory/PurchaseOrderDetailModal.tsx`
- Modify: `apps/admin-portal/src/components/lab-staff/AssignStaffModal.tsx`
- Modify: `apps/admin-portal/src/components/providers/RenewLicenseModal.tsx`
- Modify: `apps/admin-portal/src/components/subscriptions/AddModuleDialog.tsx`
- Modify: `apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx`

Read each file before editing.

- [ ] **Step 1: Migrate `CreatePurchaseOrderModal.tsx`**

  Same Dialog pattern. This modal uses `max-w-2xl max-h-[90vh] overflow-y-auto` — preserve these by passing to `DialogContent className`:
  ```tsx
  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
  ```

  Update call site in `apps/admin-portal/src/app/inventory/page.tsx`.

- [ ] **Step 2: Migrate `PurchaseOrderDetailModal.tsx`**

  Same pattern with `max-w-2xl max-h-[90vh] overflow-y-auto`. Remove the existing manual X close button (Dialog adds one automatically). Update call site in `apps/admin-portal/src/app/inventory/page.tsx`.

- [ ] **Step 3: Migrate `AssignStaffModal.tsx`**

  Same pattern. Update call site in `apps/admin-portal/src/app/labs/[labId]/staff/page.tsx`.

- [ ] **Step 4: Migrate `RenewLicenseModal.tsx`**

  Same pattern. Update call site in `apps/admin-portal/src/app/providers/expiry/page.tsx`.

- [ ] **Step 5: Migrate `AddModuleDialog.tsx`**

  Same pattern. Update call site in `apps/admin-portal/src/app/subscriptions/page.tsx`.

- [ ] **Step 6: Migrate `RemoveModuleDialog.tsx`**

  Same pattern. Update call site in `apps/admin-portal/src/app/subscriptions/page.tsx`.

- [ ] **Step 7: Run tests**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add apps/admin-portal/src/components/inventory/ apps/admin-portal/src/components/lab-staff/ apps/admin-portal/src/components/providers/ apps/admin-portal/src/components/subscriptions/ apps/admin-portal/src/app/inventory/ apps/admin-portal/src/app/labs/ apps/admin-portal/src/app/providers/ apps/admin-portal/src/app/subscriptions/
  git commit -m "feat(admin-portal): migrate inventory, lab-staff, providers, subscriptions modals to ShadCN Dialog"
  ```

---

## Task 6: Dialog migration — inline modals in page files

**Files (4 files with inline modal divs):**
- Modify: `apps/admin-portal/src/app/alerts/[alertId]/page.tsx`
- Modify: `apps/admin-portal/src/app/mentorship/page.tsx`
- Modify: `apps/admin-portal/src/app/providers/[submissionId]/page.tsx`
- Modify: `apps/admin-portal/src/app/inventory/suppliers/page.tsx`

These pages have inline confirmation dialogs (not separate component files). Apply the same Dialog migration pattern inline.

- [ ] **Step 1: Migrate `alerts/[alertId]/page.tsx` inline ReviewDialog**

  Read the file. Find the `ReviewDialog` component or inline modal div (uses `fixed inset-0 z-50 bg-black/50`). Wrap in Dialog primitives. Replace `onCancel` prop with `open`/`onOpenChange`.

- [ ] **Step 2: Migrate `mentorship/page.tsx` inline modals**

  This file has 2 inline modals (dissolve confirmation and create pair). Find both `fixed inset-0 z-50 bg-black/50` blocks. Replace each with `<Dialog>` / `<DialogContent>`.

  **Also:** This file likely has `bg-white` on modal divs — these will be removed as part of the Dialog migration (DialogContent uses bg-popover).

- [ ] **Step 3: Migrate `providers/[submissionId]/page.tsx` inline ConfirmationDialog**

  Same pattern as alerts/[alertId].

- [ ] **Step 4: Migrate `inventory/suppliers/page.tsx` inline modal**

  Same pattern.

- [ ] **Step 5: Run tests**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/admin-portal/src/app/alerts/ apps/admin-portal/src/app/mentorship/ apps/admin-portal/src/app/providers/ apps/admin-portal/src/app/inventory/
  git commit -m "feat(admin-portal): migrate inline confirmation dialogs to ShadCN Dialog"
  ```

---

## Task 7: Final verification

**Files:** No new modifications — verification pass.

- [ ] **Step 1: Grep for remaining bg-white**

  ```bash
  grep -rn "bg-white" apps/admin-portal/src --include="*.tsx" | grep -v "__tests__"
  ```

  Expected: only toggle switch thumbs (`h-5 w-5 rounded-full bg-white shadow-sm`). Everything else should be `bg-card` or handled by Dialog.

- [ ] **Step 2: Grep for remaining bg-black (non-overlay)**

  ```bash
  grep -rn "bg-black" apps/admin-portal/src --include="*.tsx" | grep -v "__tests__" | grep -v "bg-black/50"
  ```

  Expected: 0 results. All `bg-black` table headers should now be `bg-card`.

- [ ] **Step 3: Grep for remaining hand-rolled modals**

  ```bash
  grep -rn "fixed inset-0 z-50" apps/admin-portal/src --include="*.tsx" | grep -v "__tests__" | grep -v "components/ui/"
  ```

  Expected: 0 results. All modals should now use `<Dialog>` which handles overlay internally.

- [ ] **Step 4: Grep for remaining text-black**

  ```bash
  grep -rn "text-black" apps/admin-portal/src --include="*.tsx" | grep -v "__tests__"
  ```

  Expected: 0 results.

- [ ] **Step 5: Run full test suite**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -10
  ```

  Expected: 181 passing, 11 pre-existing failures.

- [ ] **Step 6: TypeScript check**

  ```bash
  pnpm -F @ultranos/admin-portal typecheck 2>&1 | head -30
  ```

  Fix any new errors from Dialog/DropdownMenu prop changes.

- [ ] **Step 7: Commit cleanup fixes if any**

  ```bash
  git add apps/admin-portal/src
  git commit -m "fix(admin-portal): cleanup remaining color tokens and dialog migrations"
  ```

---

## Appendix: What's NOT in this plan (and why)

| Component | Reason deferred |
|-----------|----------------|
| **ShadCN Card** | Existing card divs already have consistent `rounded-3xl bg-card p-5 border border-border`. Wrapping in `<Card><CardContent>` adds JSX depth without visual or behavioral change. Will be added during ui-kit extraction when a shared Card becomes valuable across 4 apps. |
| **ShadCN Table** | Tables are raw HTML `<table>` with consistent styling. ShadCN Table is a thin wrapper that doesn't add functionality. Better to introduce during ui-kit extraction. |
| **ShadCN Separator** | Already installed (Plan 1) but not actively migrated because `<div className="border-t border-border" />` is idiomatic and replacing with `<Separator />` is pure churn. |

## Appendix: Dialog prop migration quick reference

| Old prop | New props |
|----------|-----------|
| `onClose: () => void` | `open: boolean` + `onOpenChange: (open: boolean) => void` |
| `onClick={onClose}` on Cancel button | `onClick={() => onOpenChange(false)}` |
| `{showModal && <Modal onClose={...} />}` | `<Modal open={showModal} onOpenChange={setShowModal} />` |
