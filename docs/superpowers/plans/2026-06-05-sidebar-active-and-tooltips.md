# Sidebar Active State & Tooltip Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three targeted changes to `packages/ui-kit/src/components/ui/`: (1) active sidebar item gets light-green background, (2) all tooltips use primary green colours, (3) sidebar tooltips only render in icon/collapsed mode.

**Architecture:** All changes are in the shared `packages/ui-kit/src/components/ui/` layer — `sidebar.tsx` and `tooltip.tsx`. No app-level changes required. Because `packages/ui-kit/src/components/ui/` files are imported directly by apps via path aliases (no compiled dist step for these files), edits take effect immediately without a rebuild.

**Tech Stack:** React, Tailwind CSS utility classes, Radix UI Tooltip primitives, CVA (`class-variance-authority`), Next.js 15 PWA monorepo.

---

### Task 1: Active sidebar item — light-green background

**Files:**
- Modify: `packages/ui-kit/src/components/ui/sidebar.tsx` (line 473)

This changes the `data-active` classes in `sidebarMenuButtonVariants`. Currently the active state reuses the hover/accent colour (`bg-sidebar-accent`). The new style uses a light translucent primary green (`bg-primary/10 text-primary`) so active items are visually distinct from hovered items.

- [ ] **Step 1: Write failing test**

Add to `packages/ui-kit/src/__tests__/Sidebar.test.tsx` — this tests the ShadCN `sidebar.tsx` `SidebarMenuButton` component directly, not the `Sidebar` wrapper.

Create `packages/ui-kit/src/__tests__/SidebarMenuButton.test.tsx`:

```tsx
/**
 * Tests for the ShadCN SidebarMenuButton component — active state classes.
 */
import { render, screen } from '@testing-library/react'
import {
  SidebarMenuButton,
  SidebarProvider,
  SidebarMenu,
  SidebarMenuItem,
} from '../components/ui/sidebar.js'

function renderButton(isActive: boolean) {
  return render(
    <SidebarProvider>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={isActive}>Dashboard</SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarProvider>
  )
}

describe('SidebarMenuButton active state', () => {
  it('applies data-active attribute when isActive is true', () => {
    renderButton(true)
    const btn = screen.getByRole('button', { name: /dashboard/i })
    expect(btn).toHaveAttribute('data-active', 'true')
  })

  it('does not apply data-active when isActive is false', () => {
    renderButton(false)
    const btn = screen.getByRole('button', { name: /dashboard/i })
    expect(btn).toHaveAttribute('data-active', 'false')
  })

  it('active button has bg-primary/10 class', () => {
    renderButton(true)
    const btn = screen.getByRole('button', { name: /dashboard/i })
    expect(btn.className).toContain('data-active:bg-primary/10')
  })

  it('active button has text-primary class', () => {
    renderButton(true)
    const btn = screen.getByRole('button', { name: /dashboard/i })
    expect(btn.className).toContain('data-active:text-primary')
  })

  it('active button does NOT have old sidebar-accent active class', () => {
    renderButton(true)
    const btn = screen.getByRole('button', { name: /dashboard/i })
    expect(btn.className).not.toContain('data-active:bg-sidebar-accent')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose src/__tests__/SidebarMenuButton.test.tsx
```

Expected: FAIL — `data-active:bg-primary/10` not found in className.

- [ ] **Step 3: Apply the change in sidebar.tsx**

In `packages/ui-kit/src/components/ui/sidebar.tsx` line 473, in the `cva(...)` base string, replace:

```
data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground
```

with:

```
data-active:bg-primary/10 data-active:font-medium data-active:text-primary
```

The full base string becomes (only the three `data-active:` tokens change):

```tsx
const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-xl px-3 py-2 text-start text-sm whitespace-nowrap ring-sidebar-ring outline-hidden transition-[width,height,padding] duration-200 group-has-data-[sidebar=menu-action]/menu-item:pe-8 group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 has-[>svg:first-child]:ps-2.5 has-[>svg:last-child]:pe-2.5 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-active:bg-primary/10 data-active:font-medium data-active:text-primary [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
```

- [ ] **Step 4: Run test — verify it passes**

```bash
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose src/__tests__/SidebarMenuButton.test.tsx
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Delete the stale Sidebar snapshot** (it will be regenerated on next snapshot run)

The existing snapshot at `packages/ui-kit/src/__tests__/__snapshots__/Sidebar.test.tsx.snap` tests a different `Sidebar` wrapper component and doesn't include class strings from `sidebarMenuButtonVariants`. No snapshot update is needed here — the existing snapshot tests will still pass. Confirm by running:

```bash
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose src/__tests__/Sidebar.test.tsx
```

Expected: PASS (no snapshot changes required for the wrapper component tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/components/ui/sidebar.tsx \
        packages/ui-kit/src/__tests__/SidebarMenuButton.test.tsx
git commit -m "feat(ui-kit): active sidebar item uses primary/10 green background"
```

---

### Task 2: Global tooltip colours — primary green

**Files:**
- Modify: `packages/ui-kit/src/components/ui/tooltip.tsx` (lines 44-51)

Change `TooltipContent` from dark (`bg-foreground text-background`) to primary green (`bg-primary text-primary-foreground`). The arrow follows the same colour.

- [ ] **Step 1: Write failing test**

Create `packages/ui-kit/src/__tests__/TooltipContent.test.tsx`:

```tsx
/**
 * Tests for TooltipContent colour classes.
 */
import { render } from '@testing-library/react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip.js'

function renderTooltip() {
  return render(
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipContent>Tip text</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

describe('TooltipContent colours', () => {
  it('content element has bg-primary class', () => {
    const { baseElement } = renderTooltip()
    const content = baseElement.querySelector('[data-slot="tooltip-content"]')
    expect(content).not.toBeNull()
    expect(content!.className).toContain('bg-primary')
  })

  it('content element has text-primary-foreground class', () => {
    const { baseElement } = renderTooltip()
    const content = baseElement.querySelector('[data-slot="tooltip-content"]')
    expect(content!.className).toContain('text-primary-foreground')
  })

  it('content element does NOT have old bg-foreground class', () => {
    const { baseElement } = renderTooltip()
    const content = baseElement.querySelector('[data-slot="tooltip-content"]')
    expect(content!.className).not.toContain('bg-foreground')
  })

  it('content element does NOT have old text-background class', () => {
    const { baseElement } = renderTooltip()
    const content = baseElement.querySelector('[data-slot="tooltip-content"]')
    expect(content!.className).not.toContain('text-background')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose src/__tests__/TooltipContent.test.tsx
```

Expected: FAIL — `bg-primary` not found, `bg-foreground` found.

- [ ] **Step 3: Apply the change in tooltip.tsx**

In `packages/ui-kit/src/components/ui/tooltip.tsx`:

1. In the `cn(...)` className string on line 45, replace `bg-foreground` with `bg-primary` and `text-background` with `text-primary-foreground`.

2. On line 51, replace `bg-foreground fill-foreground` with `bg-primary fill-primary`.

The updated `TooltipContent` function body:

```tsx
function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs text-primary-foreground has-data-[slot=kbd]:pe-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-lg data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-primary fill-primary data-[side=left]:translate-x-[-1.5px] rtl:data-[side=left]:-translate-x-[-1.5px] data-[side=right]:translate-x-[1.5px] rtl:data-[side=right]:-translate-x-[1.5px]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose src/__tests__/TooltipContent.test.tsx
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/components/ui/tooltip.tsx \
        packages/ui-kit/src/__tests__/TooltipContent.test.tsx
git commit -m "feat(ui-kit): tooltip uses primary green background and foreground colours"
```

---

### Task 3: Sidebar tooltips — only render in icon/collapsed mode

**Files:**
- Modify: `packages/ui-kit/src/components/ui/sidebar.tsx` (lines 521-541)

The current approach passes `hidden={state !== "collapsed" || isMobile}` to `TooltipContent`, which is rendered via Radix's Portal into `document.body`. The `hidden` HTML attribute is unreliable on portaled elements — Radix still fires hover events and ARIA announcements. The fix is conditional rendering: only mount the entire `<Tooltip>` tree when `state === "collapsed" && !isMobile`.

- [ ] **Step 1: Write failing test**

Add to `packages/ui-kit/src/__tests__/SidebarMenuButton.test.tsx` — append these tests at the bottom of the `describe` block from Task 1, or create a new describe block in the same file:

```tsx
import { within } from '@testing-library/react'

// Helper — renders SidebarMenuButton inside a controllable SidebarProvider.
// `defaultOpen` controls sidebar expanded/collapsed state.
function renderButtonWithTooltip(collapsed: boolean) {
  return render(
    <SidebarProvider defaultOpen={!collapsed}>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Dashboard label">Dashboard</SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarProvider>
  )
}

describe('SidebarMenuButton tooltip visibility', () => {
  it('does NOT render TooltipTrigger when sidebar is expanded', () => {
    const { baseElement } = renderButtonWithTooltip(false)
    // Radix TooltipTrigger sets data-slot="tooltip-trigger"
    expect(baseElement.querySelector('[data-slot="tooltip-trigger"]')).toBeNull()
  })

  it('renders TooltipTrigger when sidebar is collapsed', () => {
    const { baseElement } = renderButtonWithTooltip(true)
    expect(baseElement.querySelector('[data-slot="tooltip-trigger"]')).not.toBeNull()
  })

  it('tooltip content is mounted in DOM only when collapsed', () => {
    const { baseElement } = renderButtonWithTooltip(true)
    // TooltipContent is portaled — query from baseElement (document.body)
    // Radix only portals after hover; check trigger presence is sufficient
    expect(baseElement.querySelector('[data-slot="tooltip-trigger"]')).not.toBeNull()
  })

  it('tooltip content is NOT mounted when expanded', () => {
    const { baseElement } = renderButtonWithTooltip(false)
    expect(baseElement.querySelector('[data-slot="tooltip-content"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose src/__tests__/SidebarMenuButton.test.tsx
```

Expected: FAIL — tooltip trigger is present even in expanded state because current code always renders the Tooltip wrapper.

- [ ] **Step 3: Apply the change in sidebar.tsx**

Replace the tooltip return block in `SidebarMenuButton` (lines 531-541). The old code:

```tsx
return (
  <Tooltip>
    <TooltipTrigger asChild>{button}</TooltipTrigger>
    <TooltipContent
      side="right"
      align="center"
      hidden={state !== "collapsed" || isMobile}
      {...tooltip}
    />
  </Tooltip>
)
```

New code — only mount the Tooltip tree when the sidebar is in icon/collapsed mode:

```tsx
if (state !== "collapsed" || isMobile) {
  return button
}

return (
  <Tooltip>
    <TooltipTrigger asChild>{button}</TooltipTrigger>
    <TooltipContent
      side="right"
      align="center"
      {...tooltip}
    />
  </Tooltip>
)
```

The full updated `SidebarMenuButton` function (lines 494-542) for reference:

```tsx
function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot.Root : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  if (state !== "collapsed" || isMobile) {
    return button
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        {...tooltip}
      />
    </Tooltip>
  )
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose src/__tests__/SidebarMenuButton.test.tsx
```

Expected: PASS — all tooltip visibility tests green.

- [ ] **Step 5: Run full ui-kit test suite**

```bash
pnpm --filter @ultranos/ui-kit test
```

Expected: all tests pass. The existing `Sidebar.test.tsx` tests the wrapper `Sidebar` component (not the ShadCN primitive) so they are unaffected.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/components/ui/sidebar.tsx \
        packages/ui-kit/src/__tests__/SidebarMenuButton.test.tsx
git commit -m "fix(ui-kit): sidebar tooltips render only in icon/collapsed mode via conditional mount"
```

---

### Final Verification

- [ ] Run complete ui-kit test suite one more time to confirm no regressions:

```bash
pnpm --filter @ultranos/ui-kit test
```

Expected: all tests pass.
