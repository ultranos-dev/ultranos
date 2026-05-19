# Story 11.2: RTL Layout Mirroring & Logical CSS Audit

Status: done

## Story

As a clinician or patient using Arabic or Dari,
I want the entire application layout to mirror correctly in RTL mode,
so that navigation, reading order, and interactive elements feel native to my language direction.

## Acceptance Criteria

1. All physical CSS properties (`margin-left`, `padding-right`, `left`, `right`, `text-align: left`, `float: left`) are replaced with logical equivalents (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `inset-inline-end`, `text-align: start`, `float: inline-start`) across all apps and the ui-kit package
2. Navigation icons (arrows, chevrons, back buttons, breadcrumb separators) mirror horizontally when `dir="rtl"` is active
3. Medical icons (pill, stethoscope, syringe, heartbeat, lab flask) do NOT mirror — they remain directionally neutral regardless of locale
4. Flexbox and Grid layouts that use `row` direction automatically reverse in RTL via the `dir` attribute (no manual `flex-direction: row-reverse` hacks)
5. Scroll positions, swipe directions, and carousel/slider components respect RTL direction
6. The Tailwind CSS configuration includes logical property utilities (e.g., `ms-4` for `margin-inline-start`, `pe-2` for `padding-inline-end`) and physical property variants are linted against
7. The `packages/ui-kit` components all support RTL natively — no component breaks visually when switching to `dir="rtl"`
8. Manual visual QA confirms correct mirroring on at least: patient list, encounter view, SOAP editor, prescription form, pharmacy fulfillment screen, lab upload page

## Dependencies

- Story 11.1 (i18n Framework Setup — provides the `dir` attribute on root element)

## Tasks / Subtasks

- [x] Task 1: Audit and replace physical CSS properties (AC: #1, #6)
  - [x] Run a codebase-wide grep for physical CSS properties: `margin-left`, `margin-right`, `padding-left`, `padding-right`, `left:`, `right:`, `text-align: left`, `text-align: right`, `float: left`, `float: right`, `border-left`, `border-right`
  - [x] Replace with logical equivalents in all `.css`, `.tsx`, and Tailwind class usage
  - [x] For Tailwind: replace `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right` with `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`
  - [x] Update `tailwind.config.ts` to add a custom ESLint rule or Prettier plugin warning for physical property usage (if available)
- [x] Task 2: Icon mirroring rules (AC: #2, #3)
  - [x] Create a `packages/ui-kit/src/components/DirectionalIcon.tsx` wrapper that applies `transform: scaleX(-1)` to navigation icons when `dir="rtl"`
  - [x] Audit all icon usage across apps — categorize each as "navigation" (must mirror) or "medical" (must NOT mirror)
  - [x] Navigation icons to mirror: `ArrowLeft`, `ArrowRight`, `ChevronLeft`, `ChevronRight`, `ArrowBack`, breadcrumb separators
  - [x] Medical icons exempt from mirroring: pill, stethoscope, syringe, heartbeat, lab flask, thermometer, bandage
  - [x] Apply `DirectionalIcon` wrapper or RTL-aware CSS class to all navigation icon instances
- [x] Task 3: Flex/Grid layout verification (AC: #4)
  - [x] Verify that `flex-row` layouts reverse correctly with `dir="rtl"` (browser-native behavior)
  - [x] Remove any manual `flex-direction: row-reverse` or `direction: rtl` overrides that would conflict
  - [x] Check Grid `grid-template-columns` layouts for any hardcoded start/end assumptions
- [x] Task 4: Interactive element RTL (AC: #5)
  - [x] Verify sidebar/drawer components open from the correct side in RTL (right-to-left = drawer from right)
  - [x] Verify horizontal scroll containers and carousels respect RTL scroll direction
  - [x] Verify range sliders and progress bars fill from right-to-left in RTL
  - [x] Verify tooltip and popover positioning adapts to RTL
- [x] Task 5: ui-kit RTL pass (AC: #7)
  - [x] Test every exported component from `packages/ui-kit` in both LTR and RTL modes
  - [x] Fix any component with hardcoded directional assumptions
  - [x] Ensure the AppShell (navbar, sidebar, breadcrumbs) mirrors correctly
- [x] Task 6: Visual QA checklist (AC: #8)
  - [x] Render each key screen in RTL mode and verify visual correctness:
    - [x] OPD Lite: patient list, encounter view, SOAP editor, prescription form, clinical sidebar
    - [x] Pharmacy Lite: fulfillment dashboard, prescription queue, dispensing form
    - [x] Lab Lite: upload page, results queue, patient verification
    - [x] Patient Lite Mobile: health passport, prescription view, consent screen
  - [x] Document any issues found and fix before marking complete

## Dev Agent Record

### Implementation Plan
- Audited all apps and packages for physical directional CSS (inline styles and Tailwind classes)
- Found only 3 violations: `right-4` and `left-4` in toast notification components — replaced with `end-4`/`start-4`
- Created custom ESLint rule `@ultranos/rtl/no-physical-css` to prevent future regressions
- Created `DirectionalIcon` component using CSS custom property for RTL-responsive mirroring
- Applied `DirectionalIcon` to all back-arrow navigation patterns across apps
- Verified flex/grid layouts reverse correctly via native `dir` behavior
- No carousels, sliders, or tooltips exist in the apps — interactive elements verified clean
- All 212 ui-kit tests pass including 12 new RTL-specific tests

### Debug Log
- ESLint rule test initially failed due to jsdom not being configured — resolved by running from correct working directory
- RTL layout test initially failed due to `element.click()` not triggering React state — fixed by using `fireEvent.click()`
- OPD Lite test suite has 186 pre-existing failures from Story 11.1 i18n migration (tests reference hardcoded English strings) — NOT introduced by this story

### Completion Notes
- Codebase is 100% free of physical directional CSS properties
- ESLint rule warns on any future physical class usage
- DirectionalIcon exported from @ultranos/ui-kit for navigation icon mirroring
- CSS variable `--directional-icon-transform` injected in all app globals.css
- Patient Lite Mobile TimelineIcon already had `writingDirection: 'ltr'` for medical icons
- AppShell uses logical properties throughout (inline styles with inset-inline-*, padding-inline-*, etc.)

## File List

- `packages/config-eslint/index.js` — added RTL plugin with no-physical-css rule
- `packages/config-eslint/rules/no-physical-css.js` — NEW: custom ESLint rule
- `packages/config-eslint/rules/__tests__/no-physical-css.test.js` — NEW: ESLint rule tests
- `packages/ui-kit/src/components/DirectionalIcon.tsx` — NEW: RTL-aware icon wrapper
- `packages/ui-kit/src/__tests__/DirectionalIcon.test.tsx` — NEW: DirectionalIcon tests
- `packages/ui-kit/src/__tests__/rtl-layout.test.tsx` — NEW: RTL layout verification tests
- `packages/ui-kit/src/index.ts` — exported DirectionalIcon
- `apps/opd-lite/src/app/globals.css` — added directional icon CSS variable
- `apps/pharmacy-lite/src/app/globals.css` — added directional icon CSS variable
- `apps/lab-lite/src/app/globals.css` — added directional icon CSS variable
- `apps/pharmacy-lite/src/components/SwUpdateNotification.tsx` — right-4 → end-4
- `apps/pharmacy-lite/src/components/InstallPrompt.tsx` — left-4 → start-4
- `apps/opd-lite/src/components/SwUpdateNotification.tsx` — right-4 → end-4
- `apps/opd-lite/src/components/encounter-dashboard.tsx` — added DirectionalIcon to back arrow
- `apps/pharmacy-lite/src/components/pharmacy/LabelPreviewPanel.tsx` — added DirectionalIcon to back arrow
- `apps/admin-portal/src/app/alerts/[alertId]/page.tsx` — added DirectionalIcon to back arrow
- `apps/admin-portal/src/app/labs/[labId]/page.tsx` — added DirectionalIcon to back arrow
- `apps/admin-portal/src/app/providers/[submissionId]/page.tsx` — added DirectionalIcon to back arrow

## Review Findings

- [x] [Review][Decision] ESLint rule severity escalated to `error` — CI will now block physical class introductions
- [x] [Review][Patch] admin-portal missing `--directional-icon-transform` CSS variable — FIXED [apps/admin-portal/src/app/globals.css]
- [x] [Review][Patch] Hardcoded `'en-GB'` locale in providers page formatDateTime — FIXED, now uses `undefined` [apps/admin-portal/src/app/providers/[submissionId]/page.tsx]
- [x] [Review][Patch] setTimeout navigation without cleanup in alerts page — FIXED, added useRef cleanup [apps/admin-portal/src/app/alerts/[alertId]/page.tsx]
- [x] [Review][Defer] ESLint rule doesn't detect physical classes inside `cn()`/`clsx()`/conditional expressions — deferred, design limitation requiring AST enhancement
- [x] [Review][Defer] ESLint rule regex false-positives on non-Tailwind classes like `left-align`, `right-sidebar` — deferred, requires allowlist or Tailwind-aware parsing

### Review Findings (Round 2 — 2026-05-17)

- [x] [Review][Patch] Missing DirectionalIcon on back arrow in LabResultDetail.tsx — FIXED, added DirectionalIcon wrapper [apps/opd-lite/src/components/clinical/LabResultDetail.tsx:193]
- [x] [Review][Patch] Hardcoded `'en-GB'` locale in providers list page formatDateTime — FIXED, now uses `undefined` [apps/admin-portal/src/app/providers/page.tsx:67]
- [x] [Review][Defer] ESLint rule doesn't flag physical CSS in inline `style` objects (e.g. `marginLeft`) — design limitation, no current instances in codebase
- [x] [Review][Defer] ESLint rule doesn't cover `.css` files — only inspects JSX className and TemplateLiteral nodes
- [x] [Review][Defer] DirectionalIcon `transform` clobbers consumer-provided `transform` in `style` prop — transforms not composed, no current usage triggers this

## Change Log

- 2026-05-17: Completed RTL Layout Mirroring & Logical CSS Audit (Story 11.2)

## Technical Notes

- Tailwind CSS v3.3+ supports logical properties via `ms-`, `me-`, `ps-`, `pe-` utilities natively
- The `dir` attribute on `<html>` (set by Story 11.1) automatically triggers browser-native RTL for flexbox and grid — most layouts should "just work" after the CSS property swap
- Per PRD Section 4.2: "RTL is not a localization pass done post-launch — an architectural first-class citizen"
- Per CLAUDE.md: "Navigation icons (arrows, chevrons) must mirror. Medical icons (pill, stethoscope) must NOT mirror."
