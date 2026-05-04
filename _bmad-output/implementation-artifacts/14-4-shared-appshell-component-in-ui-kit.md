# Story 14.4: Shared AppShell Component in UI-Kit

Status: ready-for-dev

## Story

As a developer,
I want a shared `<AppShell>` component in `@ultranos/ui-kit`,
so that all PWA spoke apps have a consistent, accessible navigation bar without duplicating layout code.

## Acceptance Criteria

1. `<AppShell>` is exported from `@ultranos/ui-kit` with props: `appName`, `navItems`, `user`, `onSignOut`, `syncIndicator`, `notificationBell`, `children`
2. The component renders a persistent navbar with slots for: app name/logo (left), navigation links (center), SyncPulse indicator (right), NotificationBell (right), and user avatar/initials with dropdown menu (right)
3. The user dropdown contains: user name, role badge, "Settings" link, and "Sign Out" button
4. "Sign Out" fires the `onSignOut` callback prop (app handles auth/PHI cleanup)
5. The navbar is responsive: hamburger menu for navItems on mobile, user menu stays visible
6. The component is accessible: keyboard navigable (Enter/Space opens dropdown, Escape closes, Tab navigates items), proper ARIA labels (`aria-expanded`, `aria-haspopup`, `role="navigation"`, `role="menu"`)
7. The component uses `@ultranos/ui-kit` design tokens (HSL colors from `src/tokens.ts`) and inline styles (no Tailwind)
8. The component uses RTL-safe logical CSS properties (`inset-inline-start`, `padding-inline-end`, `margin-inline-start`, etc.)
9. Click outside the dropdown closes it
10. When `user` prop is null/undefined, the navbar shows only the app name and nav links (no avatar or dropdown)
11. The component has unit tests including snapshot tests

## Tasks / Subtasks

- [ ] Task 1: Create `AppShell` component (AC: #1, #2, #3, #4, #5, #6, #7, #8, #9, #10)
  - [ ] Create `packages/ui-kit/src/AppShell.tsx`
  - [ ] Add `'use client'` directive at top of file
  - [ ] Define and export interfaces: `NavItem`, `AppShellUser`, `AppShellProps`
  - [ ] Implement navbar layout with inline styles using design tokens from `src/tokens.ts`
  - [ ] Navbar height: 56px, white background, border-bottom 1px solid neutral-200
  - [ ] Left section: app name with font-weight 700, color primary-700
  - [ ] Center section: navigation links with font-weight 500, color neutral-600, active state = primary-600 with underline
  - [ ] Right section: slots for `syncIndicator` and `notificationBell` (rendered as-is via ReactNode)
  - [ ] Right section: user avatar circle (32px, bg primary-100, text primary-700, font-weight 600, displays `user.initials`)
  - [ ] Implement dropdown toggle on avatar click
  - [ ] Dropdown: absolute positioned, white bg, shadow-lg, border neutral-200, border-radius 0.5rem
  - [ ] Dropdown contents: user name (bold), role badge (pill: bg primary-50, text primary-700, font-size 0.75rem), "Settings" link, "Sign Out" button
  - [ ] "Sign Out" button calls `onSignOut` callback
  - [ ] Click outside dropdown closes it (use `useEffect` with document click listener)
  - [ ] Keyboard: Enter/Space toggles dropdown, Escape closes it, Tab navigates dropdown items
  - [ ] ARIA attributes: `aria-expanded`, `aria-haspopup="menu"`, `role="navigation"`, `role="menu"`, `role="menuitem"`
  - [ ] When `user` is null/undefined, hide avatar and dropdown entirely
  - [ ] Mobile responsive: hamburger button toggles navItems visibility, user menu remains visible
  - [ ] Use logical CSS properties throughout for RTL safety (e.g., `paddingInlineStart`, `marginInlineEnd`, `insetInlineEnd`)
  - [ ] `children` rendered below the navbar as main content area

- [ ] Task 2: Export `AppShell` from ui-kit (AC: #1)
  - [ ] Update `packages/ui-kit/src/index.ts` to export:
    - `AppShell` component
    - `AppShellProps` type
    - `AppShellUser` type
    - `NavItem` type
  - [ ] Run `pnpm -F ui-kit build` to verify exports compile cleanly

- [ ] Task 3: Unit tests with snapshots (AC: #11)
  - [ ] Create `packages/ui-kit/src/__tests__/AppShell.test.tsx`
  - [ ] Test: renders app name in navbar
  - [ ] Test: renders nav items with correct active state styling
  - [ ] Test: renders user avatar with initials when user prop provided
  - [ ] Test: does not render avatar/dropdown when user is null
  - [ ] Test: dropdown opens on avatar click, contains user name, role badge, Settings, Sign Out
  - [ ] Test: Sign Out button calls onSignOut callback
  - [ ] Test: dropdown closes on click outside
  - [ ] Test: dropdown closes on Escape key
  - [ ] Test: dropdown opens on Enter/Space key on avatar button
  - [ ] Test: renders syncIndicator and notificationBell slot content
  - [ ] Test: hamburger menu toggles nav visibility (simulated mobile)
  - [ ] Snapshot test: default render with all props
  - [ ] Snapshot test: render with user=null (unauthenticated state)
  - [ ] Run `pnpm -F ui-kit test` to verify all tests pass

## Dev Notes

### Component API

```typescript
import { ReactNode } from 'react'

export interface NavItem {
  label: string
  href: string
  icon?: ReactNode
  active?: boolean
}

export interface AppShellUser {
  name: string
  email: string
  role: string
  initials: string  // 2 chars for avatar circle
}

export interface AppShellProps {
  appName: string
  navItems?: NavItem[]
  user?: AppShellUser | null
  onSignOut?: () => void
  syncIndicator?: ReactNode  // SyncPulse slot
  notificationBell?: ReactNode  // NotificationBell slot
  children: ReactNode
}
```

### Styling Specs

All styles are inline (no Tailwind). Use design tokens from `packages/ui-kit/src/tokens.ts`.

| Element | Style |
|---------|-------|
| Navbar | height: 56px, background: white, border-bottom: 1px solid neutral-200 |
| App name | font-weight: 700, color: primary-700 |
| Nav links | font-weight: 500, color: neutral-600 |
| Nav link (active) | color: primary-600, border-bottom: 2px solid primary-600 |
| Avatar circle | width/height: 32px, border-radius: 50%, bg: primary-100, color: primary-700, font-weight: 600 |
| Dropdown | position: absolute, bg: white, box-shadow: shadow-lg, border: 1px solid neutral-200, border-radius: 0.5rem |
| Role badge | display: inline-block, padding: 2px 8px, bg: primary-50, color: primary-700, font-size: 0.75rem, border-radius: 9999px |

### Accessibility

- Navbar landmark: `<nav role="navigation" aria-label="Main navigation">`
- Avatar button: `aria-haspopup="menu"`, `aria-expanded="true|false"`
- Dropdown: `role="menu"`, items have `role="menuitem"`
- Keyboard: Enter/Space opens dropdown, Escape closes, Tab navigates items within dropdown
- Focus management: when dropdown opens, focus moves to first menu item; when closed, focus returns to avatar button

### Keyboard Behavior

| Key | Action |
|-----|--------|
| Enter / Space | Toggle dropdown open/close on avatar button |
| Escape | Close dropdown, return focus to avatar button |
| Tab | Navigate between menu items within open dropdown |
| Tab (on last item) | Close dropdown, move focus to next focusable element |

### RTL Handling

Use CSS logical properties in all inline styles:
- `paddingInlineStart` / `paddingInlineEnd` (not `paddingLeft` / `paddingRight`)
- `marginInlineStart` / `marginInlineEnd`
- `insetInlineEnd` (not `right`)
- `borderInlineEnd` (not `borderRight`)
- Flexbox with `row` direction handles RTL automatically

### Files Changed

| File | Action |
|------|--------|
| `packages/ui-kit/src/AppShell.tsx` | NEW |
| `packages/ui-kit/src/index.ts` | UPDATE (add exports) |
| `packages/ui-kit/src/__tests__/AppShell.test.tsx` | NEW |

### What NOT to Change

- Do NOT add external dependencies (no headlessui, radix, etc.)
- Do NOT use Tailwind classes
- Do NOT modify any app code (opd-lite, pharmacy-lite, etc.) -- this story is ui-kit only
- Do NOT use `localStorage` for dropdown state
- Do NOT import from `next/link` or any framework-specific router -- use plain `<a>` tags for nav links (apps wrap with their own Link component if needed)

### Testing Standards

- Use Vitest + @testing-library/react + jsdom (already configured in ui-kit)
- `fireEvent` for click, keyboard interactions
- `toMatchSnapshot()` for snapshot tests
- Mock `document.addEventListener` for click-outside behavior
- No need to test actual navigation (no router in ui-kit)

### References

- Design tokens: `packages/ui-kit/src/tokens.ts`
- Existing component patterns: `packages/ui-kit/src/StaleDataBanner.tsx`, `packages/ui-kit/src/ErrorBoundary.tsx`
- Existing test patterns: `packages/ui-kit/src/__tests__/SessionWarningToast.test.tsx`
- RTL best practices: use logical CSS properties per CLAUDE.md guidelines
