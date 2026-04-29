# Ultranos Design System

> Derived from the Healix healthcare platform reference screens. Optimized for a Desktop PWA targeting urban GP doctors in clinic offices, with an Android companion app. Styled with a Wise-inspired green-forward brand palette. Polished with a design-engineering approach where every unseen detail compounds into something that feels right.

---

## 1. Visual Theme & Atmosphere

The Ultranos interface is a clinical-grade workspace that prioritizes clarity, density, and calm. It operates on a warm off-white canvas (`#f4f5f2` to `#ffffff`) with near-black text (`#0e0f0c`) and a signature **Wise Green** (`#9fe870`) accent that signals interactivity with an optimistic, nature-inspired tone — distinct from the sterile blues of legacy healthcare software.

Typography uses **Inter** as the sole typeface across all surfaces — display, body, and UI. Headlines use weight 600–700 at moderate sizes (18–26px), never exceeding 30px in the dashboard context. There are no billboard-scale display headlines; the largest text on any screen is a patient name at roughly 22–26px semibold. Labels use weight 400 at 12–14px in a muted gray. This creates a calm two-tier hierarchy: semibold values over regular labels.

The interaction palette is driven by the **Wise Green** (`#9fe870`) with **Dark Green** (`#163300`) text — the same fresh, lime-bright pairing from the original Wise system. Primary buttons, active navigation tabs, icon badges on the anatomy viewer, and chart accent points all use this green system. Hover states shift to **Pastel Green** (`#cdffad`) with a subtle `scale(1.03)` expansion; pressed/`:active` states use `scale(0.97)` compression. Every transition specifies exact properties and uses custom easing curves — never `transition: all`, never default CSS easings. This level of craft is invisible to the user individually, but in aggregate it makes the interface feel alive and intentional.

Cards have generous corner radii (16–20px) with subtle `1px` borders or light box shadows. The overall depth model is flat — elevation is communicated through layering and border contrast, not shadow stacking. The right-side detail panel enters as a slide-in sheet with `ease-out` easing, reinforcing a spatial model where deeper information emerges from the right edge.

**Key Characteristics:**
- Inter as the sole typeface — weight 600 for values/headings, weight 400 for labels/body
- Wise Green (`#9fe870`) as the primary interactive color with Dark Green (`#163300`) text
- Warm off-white canvas with minimal shadows — flat, layered depth model
- Generous card radii (16–20px) with thin borders
- Custom easing curves on all transitions — never default CSS easings
- `scale(1.03)` hover / `scale(0.97)` active on buttons — subtle, physical press feedback
- Label-above-value typography pattern for all vitals and data points
- Three-panel desktop layout: left patient context, center workspace, right detail sheet
- Icon badges in green circles as interactive anchor points
- OpenType `"calt"` (contextual alternates) enabled on all text

---

## 2. Color Palette & Roles

### Primary Brand
- **Near Black** (`#0e0f0c`): Primary text — patient names, vital values, headings
- **Wise Green** (`#9fe870`): Primary CTA buttons, active nav tabs, icon badges, interactive hotspots, chart accent points. The signature interactive color across all surfaces.
- **Dark Green** (`#163300`): Button text on green fills, deep green accent text, icon color on green surfaces
- **Light Mint** (`#e2f6d5`): Soft green surface for status badges, selected-state backgrounds, hover tints on secondary elements, card highlight borders
- **Pastel Green** (`#cdffad`): Hover state for primary green buttons and interactive elements

### Semantic
- **Positive Green** (`#054d28`): Success text on light-green surfaces, positive-sentiment indicators, normal-range vital confirmation
- **Danger Red** (`#d03238`): Error states, destructive actions, critical vital alerts, out-of-range indicators
- **Warning Yellow** (`#ffd11a`): Warning badges and caution indicators
- **Background Cyan** (`rgba(56,200,255,0.10)`): Info-tint background for informational callouts
- **Bright Orange** (`#ffc091`): Warm accent, used sparingly for attention-drawing badges (e.g., timestamp pills on vital cards)

### Neutral
- **Warm Dark** (`#454745`): Secondary text — field labels like "Date of birth", "Gender", "Policy number"
- **Gray** (`#868685`): Tertiary text — metadata, axis labels on charts, muted captions
- **Light Surface** (`#e8ebe6`): Card borders, divider lines, subtle surface fills on the canvas

### Derived Interactive States
- **Green hover fill**: `#cdffad` (Pastel Green)
- **Green-tinted nav hover**: `rgba(211, 242, 192, 0.4)` — subtle green wash on inactive nav items
- **Secondary button background**: `rgba(22, 51, 0, 0.08)` — dark green at 8% opacity
- **Focus ring**: `0 0 0 2px #9fe870, 0 0 0 4px rgba(159, 232, 112, 0.3)` — green outline with soft glow

---

## 3. Typography Rules

### Font Family
- **All surfaces**: `Inter`, fallbacks: `system-ui, -apple-system, Helvetica, Arial, sans-serif`
- **OpenType features**: `"calt" 1` (contextual alternates) enabled on all text

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Usage |
|------|------|--------|-------------|----------------|-------|
| Patient Name (largest) | 22–26px (1.38–1.62rem) | 600 | 1.2 | -0.3px | Patient card header, panel titles |
| Section Title | 20–22px (1.25–1.38rem) | 600 | 1.25 | -0.3px | "Lungs", right-panel organ name |
| Vital Value | 22–28px (1.38–1.75rem) | 700 | 1.1 | -0.2px | "72 BPM", "120/75 mmHg", "97.2%" |
| Card Title | 18–20px (1.13–1.25rem) | 600 | 1.3 | -0.2px | "Pulmonary function test", nav items |
| Body / Description | 14–16px (0.88–1.00rem) | 400 | 1.5 | 0.1px | Report summaries, descriptions |
| Label | 12–14px (0.75–0.88rem) | 400 | 1.4 | 0.1px | "Heart rate", "Blood pressure", "Date of birth", "Policy number" |
| Label Emphasis | 12–14px (0.75–0.88rem) | 600 | 1.4 | -0.05px | "FEV1: 4.8 L", "This month: 97.4%" inline stat labels |
| Caption / Meta | 11–12px (0.69–0.75rem) | 400 | 1.5 | 0.1px | Chart axis labels, timestamps, "October 27, 2025" |
| Button Text | 14–16px (0.88–1.00rem) | 600 | 1.0 | -0.1px | "Patient info", "+ Add record", "View full report" |
| Badge / Tag | 11–12px (0.69–0.75rem) | 600 | 1.0 | 0px | "PrimeCare Plus", "01:34 PM", nav badge counts |

### Typography Patterns

**Label-above-value** is the dominant data-display pattern:
```
Heart rate          ← 12px, weight 400, gray (#868685)
72 BPM              ← 24px, weight 700, near-black (#0e0f0c)
```

**Inline stat pairs** use semibold labels next to semibold values at the same size:
```
FEV1: 4.8 L    Oxygen level: 97.2%    Heart rate: 72 BPM
```
Both label and value at 13–14px weight 600, separated by generous horizontal spacing.

### Principles
- **No display/billboard typography.** The largest text on any screen is ~26px. Clinical UIs prioritize scannable density over attention-grabbing headlines.
- **Weight 600 is the workhorse.** Used for patient names, vital values, button labels, nav items, and inline stat labels.
- **Weight 400 for context.** Labels, descriptions, body text, and metadata.
- **Weight 700 only for vital values.** The bold weight is reserved for numerical health data that a doctor's eye must find instantly: BPM, mmHg, SpO2%.

---

## 4. Layout System

### Desktop PWA — Primary Surface

The Patients dashboard uses a **three-panel layout** with a fixed top navigation bar:

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo] Ultranos   Overview  [Patients]  Docs  Labs  ...  🔔 │  ← Top Nav (56–64px)
├────────┬─────────────────────────────────┬───────────────────┤
│        │                                 │                   │
│  Left  │       Center Workspace          │   Right Detail    │
│ Panel  │     (Anatomy Viewer / Main)     │     Panel         │
│        │                                 │                   │
│ ~280px │         Fluid                   │   ~320px          │
│        │                                 │                   │
├────────┴─────────────────────────────────┴───────────────────┤
```

#### Top Navigation Bar
- **Height**: 56–64px
- **Background**: White with a subtle bottom border (`1px solid #e8ebe6`)
- **Logo**: Left-aligned — icon mark + "Ultranos" wordmark in near-black, weight 700
- **Nav items**: Horizontal row of pill-shaped tabs with icons
  - Inactive: transparent background, `#454745` text, weight 500
  - Inactive hover: `rgba(211, 242, 192, 0.4)` green-tinted background
  - Active: Wise Green fill (`#9fe870`), Dark Green text and icon (`#163300`), weight 600, `border-radius: 9999px`
  - Each tab has a leading icon (16–20px) + label
- **Right actions**: Notification bell with green badge count (`#9fe870` background, `#163300` text), user avatar circle (36–40px), additional icon buttons (chat, settings)

#### Left Panel — Patient Context
- **Width**: 260–300px, fixed
- **Contains** (top to bottom):
  1. **Back chevron** — circular button, top-left
  2. **Patient ID card** — white card with 16–20px radius containing:
     - Verification badge + plan name ("PrimeCare Plus") in small green text (`#054d28`)
     - Patient name (22–26px, weight 600)
     - Patient photo (circular crop, ~80px diameter, top-right of card)
     - Label-value pairs: Date of birth, Gender, Blood type
  3. **Action row** — Share icon button + "Patient info" green pill button (`#9fe870` fill, `#163300` text) + overflow (⋯) button
  4. **Insurance/QR section** — sub-card with QR code (left) and policy details (right)
  5. **Vital summary cards** — stacked vertically with 50ms stagger on initial load:
     - Heart rate card with ECG sparkline chart
     - Blood pressure card with trend line and timestamp badge
     - (Scrollable for additional vitals)
- **Sidebar icon rail**: A narrow vertical strip (~48px) on the far left with icon-only navigation buttons (clock, stethoscope, clipboard, attachment, syringe, settings). Each icon is 20–24px, spaced ~48px apart. The active icon gets a green circular highlight (`#9fe870` fill with `#163300` icon).

#### Center Workspace
- **Width**: Fluid, fills remaining space
- **Content**: The anatomy viewer (3D body model) with interactive hotspots — green circular badges (`#9fe870`) with organ system icons in dark green (`#163300`), numbered indicators, and connecting bezier lines to the selected organ
- **Toolbar**: Top-right of the center area — search, copy, print, download icons in a horizontal row
- **Zoom controls**: Floating on the right edge — +/− buttons stacked vertically
- **Canvas controls**: Bottom edge — expand toggle, code view toggle, layer toggle

#### Right Detail Panel
- **Width**: 300–360px, slide-in from right edge
- **Entry animation**: `translateX(100%)` → `translateX(0)`, 250ms, `--ease-out` curve. Content items stagger in at 50ms intervals after the panel lands.
- **Behavior**: Overlay panel that appears when a hotspot is clicked on the anatomy viewer. Has a close (×) button top-right.
- **Contains** (top to bottom):
  1. **Organ header**: Title ("Lungs") at 20–22px weight 600, with "Updated: [date]" caption below
  2. **Last checkup section**: Icon + "Last checkup" label + test name ("Pulmonary function test") at 18px weight 600
  3. **Report description**: Body text at 14px weight 400, summarizing findings
  4. **Inline vitals row**: "FEV1: 4.8 L  Oxygen level: 97.2%  Heart rate: 72 BPM"
  5. **Image carousel**: Row of X-ray/imaging thumbnails (~80px tall), horizontally scrollable with a right-arrow indicator
  6. **Doctor attribution**: Avatar (36px circle) + "Dr. John Smith" (weight 600) + date + specialty
  7. **Actions**: "View full report" button (outlined/secondary) + calendar icon button
  8. **Trend chart**: Oxygen level section with current value, this-month/previous comparisons, and a line chart
  9. **Bottom action bar**: "+ Add record" primary green pill button (`#9fe870` fill, `#163300` text) + download + share icon buttons

### Spacing System
- **Base unit**: 8px
- **Common spacings**: 4px (tight), 8px (compact), 12px (default inner), 16px (standard), 20px (section gap), 24px (panel padding), 32px (large section gap)
- **Card internal padding**: 16–20px
- **Panel padding**: 16–24px

### Android App — Companion Surface

The card components from the InfoCards screenshot show how the same data renders on a narrower mobile viewport:
- Patient ID card and vitals cards stack vertically at full width
- Cards maintain the same 16–20px border radius
- Vital values remain at the same size hierarchy (the doctor needs to read these at the same speed)
- Charts compress horizontally but maintain the same height

---

## 5. Interaction & Animation System

Every animation in Ultranos exists to serve a purpose: providing feedback, maintaining spatial consistency, or preventing jarring state changes. Decoration is used sparingly and only where the user encounters it infrequently. In a clinical tool used hundreds of times per day, speed and precision always outrank delight.

### Easing Curves (CSS Custom Properties)

Never use default CSS `ease`, `ease-in`, or `ease-out`. These built-in curves are too weak — they lack the punch that makes interactions feel intentional. Define custom curves as CSS custom properties at `:root`:

```css
:root {
  /* Primary UI easing — entering elements, button feedback, popovers */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);

  /* On-screen movement — elements morphing, repositioning, layout shifts */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);

  /* Panel slides — right detail panel, bottom sheets, drawers */
  --ease-panel: cubic-bezier(0.32, 0.72, 0, 1);

  /* Hover/color shifts only */
  --ease-subtle: cubic-bezier(0.25, 0.1, 0.25, 1);
}
```

### Duration Tokens

| Element | Duration | Easing | Notes |
|---------|----------|--------|-------|
| Button press (`:active`) | 100–160ms | `--ease-out` | Instant feedback — the user must feel the press |
| Tooltips | 125ms | `--ease-out` | After first tooltip opens, subsequent ones skip delay and animation entirely |
| Dropdown / select / popover | 150–200ms | `--ease-out` | Origin-aware: `transform-origin` set to trigger location |
| Nav tab switch | 150ms | `--ease-in-out` | Background-color crossfade between active/inactive |
| Right detail panel (enter) | 250ms | `--ease-panel` | `translateX(100%)` → `translateX(0)` |
| Right detail panel (exit) | 180ms | `--ease-out` | Exit is always faster than enter |
| Toast / notification | 200–300ms | `--ease-out` | Enters and exits from the same direction |
| Card stagger (on load) | 300ms per card | `--ease-out` | 50ms delay between siblings, opacity + translateY(8px) |
| Vital value update | 200ms | `--ease-in-out` | Number morphs, not snaps — use tabular-nums for stable width |

**Rule: UI animations stay under 300ms.** Longer durations are reserved for rare/first-time flows (onboarding, first patient load). Anything the doctor sees daily must be crisp.

### Animation Decision Framework

Before adding any animation, answer in order:

1. **How often will the user see this?** If hundreds of times daily (keyboard shortcuts, command palette toggle, nav tab switching via keyboard), use zero animation. If occasional (panel open, modal, toast), use standard animation. If rare (onboarding, first load), can add delight.

2. **What is the purpose?** Valid: spatial consistency (panel enters and exits from the same edge), state indication (button press confirms click), preventing jarring changes (card appears with fade instead of instant pop). Invalid: "it looks cool."

3. **Is it entering or exiting?** Entering → `--ease-out` (starts fast, feels responsive). Moving on screen → `--ease-in-out`. Constant motion (progress bar, spinner) → `linear`.

### Button Interaction Model

Buttons are the most-touched interactive element. They must feel responsive on every single press.

```css
.btn-primary {
  /* Specify exact properties — never 'transition: all' */
  transition:
    transform 160ms var(--ease-out),
    background-color 160ms var(--ease-subtle);
}

/* Gate hover behind pointer capability — prevents false positives on touch */
@media (hover: hover) and (pointer: fine) {
  .btn-primary:hover {
    background-color: #cdffad;
    transform: scale(1.03);
  }
}

.btn-primary:active {
  transform: scale(0.97);
  /* Active is instant-feeling — slightly faster than hover */
  transition-duration: 100ms;
}
```

**Why `0.97` and `1.03`, not `0.95` and `1.05`?** Subtlety. A 3% scale is felt but not seen. A 5% scale draws conscious attention, which is wrong for a clinical tool — the button should acknowledge the press without becoming the focus. The doctor's attention belongs on the patient data, not the UI chrome.

### Panel & Sheet Transitions

The right detail panel uses `translateX` for entry/exit — hardware-accelerated, no layout thrash:

```css
.detail-panel {
  transform: translateX(100%);
  transition: transform 250ms var(--ease-panel);
}

.detail-panel[data-open="true"] {
  transform: translateX(0);
}

/* Exit is faster — the system responds, not deliberates */
.detail-panel[data-open="false"] {
  transition-duration: 180ms;
  transition-timing-function: var(--ease-out);
}
```

**Asymmetric timing principle**: Slow where the user is deciding (panel opening — 250ms gives spatial grounding), fast where the system is responding (panel closing — 180ms gets out of the way).

### Stagger Pattern for Card Lists

When vital cards or list items load, stagger their entry to create a cascading effect that feels natural:

```css
.vital-card {
  opacity: 0;
  transform: translateY(8px);
  animation: cardEnter 300ms var(--ease-out) forwards;
}

.vital-card:nth-child(1) { animation-delay: 0ms; }
.vital-card:nth-child(2) { animation-delay: 50ms; }
.vital-card:nth-child(3) { animation-delay: 100ms; }
.vital-card:nth-child(4) { animation-delay: 150ms; }

@keyframes cardEnter {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Keep stagger delays short (50ms between items). Never block interaction while stagger animations play — all cards are immediately clickable even if still animating.

### Tooltip Behavior

Tooltips for toolbar icons (search, filter, print, download) follow the skip-delay pattern: the first tooltip waits 400ms before appearing. Once any tooltip is open, hovering over adjacent icons opens their tooltips instantly with no animation. This makes the entire toolbar feel fast.

```css
.tooltip {
  transition: transform 125ms var(--ease-out), opacity 125ms var(--ease-out);
  transform-origin: var(--tooltip-origin);
}

.tooltip[data-starting-style],
.tooltip[data-ending-style] {
  opacity: 0;
  transform: scale(0.97);
}

/* Skip animation after first tooltip is open */
.tooltip[data-instant] {
  transition-duration: 0ms;
}
```

**Never animate from `scale(0)`.** Nothing in the real world appears from nothing. Start from `scale(0.95)` or `scale(0.97)` with `opacity: 0` — the element has a visible shape even when "deflated."

### Popover & Dropdown Origin

Popovers and dropdowns must scale in from their trigger, not from center. The default `transform-origin: center` is wrong for every popover. Exception: modals keep `transform-origin: center` because they are viewport-centered.

```css
.popover {
  transform-origin: var(--radix-popover-content-transform-origin);
}
```

### Number Value Transitions

When vital values update (new heart rate reading, updated SpO2), the number should morph, not snap. Use CSS transitions on the value with `font-variant-numeric: tabular-nums` to prevent layout shift from digit-width changes:

```css
.vital-value {
  font-variant-numeric: tabular-nums;
  transition: opacity 200ms var(--ease-in-out);
}
```

For larger transitions (e.g., 72 → 85 BPM), consider a brief blur bridge: `filter: blur(1px)` during the 200ms crossfade masks the two-state overlap.

### Performance Rules

1. **Only animate `transform` and `opacity`.** These skip layout and paint, running on the GPU. Never animate `padding`, `margin`, `height`, `width`, or `border-radius`.
2. **Specify exact transition properties.** `transition: all 300ms` is banned. Always list: `transition: transform 160ms var(--ease-out), background-color 160ms var(--ease-subtle)`.
3. **Prefer CSS transitions over keyframes for interruptible UI.** Toasts, toggles, any rapidly-triggered state change — transitions retarget smoothly mid-animation; keyframes restart from zero.
4. **Use WAAPI for programmatic animations.** The Web Animations API gives JavaScript control with CSS performance — hardware-accelerated and interruptible without a library.
5. **Avoid Framer Motion shorthand (`x`, `y`, `scale`) under load.** These use `requestAnimationFrame` on the main thread. Use full `transform` strings for hardware acceleration: `animate={{ transform: "translateX(100px)" }}`.
6. **CSS variables are inheritable — don't update them during drags.** Changing `--swipe-amount` on a parent recalculates styles for all children. Update `transform` directly on the dragged element.

---

## 6. Component Specifications

### Buttons

**Primary Green Pill (CTA)**
- Background: `#9fe870` (Wise Green)
- Text: `#163300` (Dark Green), 14–16px, weight 600
- Icon: `#163300`, 16px, left of label (optional)
- Padding: 10px 20px
- Border-radius: 9999px (pill)
- Transition: `transform 160ms var(--ease-out), background-color 160ms var(--ease-subtle)`
- Hover: background `#cdffad`, `scale(1.03)` — gated behind `@media (hover: hover) and (pointer: fine)`
- Active: `scale(0.97)`, transition-duration `100ms`
- Focus: `0 0 0 2px #9fe870, 0 0 0 4px rgba(159, 232, 112, 0.3)`

**Secondary Subtle Pill**
- Background: `rgba(22, 51, 0, 0.08)` (dark green at 8% opacity)
- Text: `#0e0f0c`, 14px, weight 600
- Padding: 8px 16px
- Border-radius: 9999px
- Transition: `transform 160ms var(--ease-out), background-color 160ms var(--ease-subtle)`
- Hover: background `rgba(22, 51, 0, 0.14)`, `scale(1.03)`
- Active: `scale(0.97)`

**Outlined Pill (Secondary Action)**
- Background: `#ffffff`
- Border: `1px solid #e8ebe6`
- Text: `#0e0f0c`, 14px, weight 600
- Padding: 8px 16px
- Border-radius: 9999px
- Transition: `transform 160ms var(--ease-out), background-color 160ms var(--ease-subtle), border-color 160ms var(--ease-subtle)`
- Hover: background `#f4f5f2`, border `#868685`, `scale(1.03)`
- Active: `scale(0.97)`, background `#e8ebe6`

**Icon Button (Circle)**
- Size: 36–40px diameter
- Background: `#ffffff` or transparent
- Border: `1px solid #e8ebe6` (when on white) or none (when on colored surface)
- Icon: 18–20px, `#454745`
- Border-radius: 50%
- Transition: `transform 160ms var(--ease-out), background-color 160ms var(--ease-subtle)`
- Hover: background `rgba(211, 242, 192, 0.4)`, `scale(1.03)`
- Active: `scale(0.97)`

**Icon Button (Green Badge — Anatomy Hotspot)**
- Size: 32–36px diameter
- Background: `#9fe870`
- Icon: `#163300`, 16–18px
- Border-radius: 50%
- Box-shadow: `0 2px 8px rgba(159, 232, 112, 0.4)`
- Transition: `transform 160ms var(--ease-out), box-shadow 200ms var(--ease-subtle)`
- Hover: background `#cdffad`, shadow intensifies to `0 4px 12px rgba(159, 232, 112, 0.6)`, `scale(1.05)` — slightly more dramatic because these are discovery affordances, not repeated actions
- Active: `scale(0.95)`

**Floating Action Button ("+ Add record")**
- Background: `#9fe870`
- Text: `#163300`, 14px, weight 600
- Icon: `#163300` "+" prefix, 16px
- Padding: 12px 24px
- Border-radius: 9999px
- Transition: `transform 160ms var(--ease-out), background-color 160ms var(--ease-subtle)`
- Hover: `scale(1.03)`, background `#cdffad`
- Active: `scale(0.97)`
- Position: Bottom of right panel, sticky

### Cards

**Patient Identity Card**
- Background: `#ffffff`
- Border-radius: 16–20px
- Border: `1px solid #e8ebe6`
- Padding: 16–20px
- Shadow: none or `0 1px 3px rgba(0,0,0,0.05)` (very subtle)
- Photo: Circular crop, 72–88px, positioned top-right with slight overlap/bleed beyond the card edge

**Vital Summary Card**
- Background: `#ffffff`
- Border-radius: 16px
- Border: `1px solid #e8ebe6`
- Padding: 16px
- Layout: Label (top, gray) → Value (large, bold) → Sparkline/chart (below)
- Icon: Green-outlined circle (24px) with organ/system icon in `#054d28`, top-left next to the label
- Entry: Staggered fade + `translateY(8px)`, 300ms `--ease-out`, 50ms delay between siblings

**Insurance/QR Sub-Card**
- Background: `#ffffff`
- Border-radius: 12px
- Border: `1px solid #e8ebe6`
- Layout: QR code (left, ~100px) | Policy details (right, label-value stacked)

**Right Panel Detail Sheet**
- Background: `#ffffff`
- Border-radius: 20px (top-left and bottom-left only, when overlaying)
- Shadow: `-4px 0 16px rgba(0,0,0,0.08)` (left-side shadow for overlay effect)
- Entry: `translateX(100%)` → `translateX(0)`, 250ms `--ease-panel`
- Exit: 180ms `--ease-out` (asymmetric — exit is faster)
- Close button: × icon, top-right, 32px hit target
- Scrollable content area with bottom action bar pinned
- Content items stagger in at 50ms intervals after panel lands

### Navigation

**Top Nav Tab (Active)**
- Background: `#9fe870` (Wise Green)
- Text: `#163300` (Dark Green), 14px, weight 600
- Icon: `#163300`, 16px, left of label
- Padding: 8px 16px
- Border-radius: 9999px (pill)
- Transition between tabs: 150ms `--ease-in-out` on background-color

**Top Nav Tab (Inactive)**
- Background: transparent
- Text: `#454745`, 14px, weight 500
- Icon: `#454745`, 16px
- Hover: background `rgba(211, 242, 192, 0.4)` (green-tinted), 150ms `--ease-subtle`

**Sidebar Icon Rail**
- Width: 48px
- Background: transparent (inherits panel background)
- Icon size: 20–24px
- Icon color: `#868685` (inactive), `#163300` on `#9fe870` fill (active)
- Active indicator: Wise Green circular fill (36px diameter) behind the icon
- Spacing: 44–48px center-to-center

### Charts & Data Visualization

**ECG/Sparkline (Heart Rate)**
- Stroke: `#054d28` (Positive Green), 1.5px
- Fill: none
- Grid: Light gray (`#e8ebe6`) horizontal rules
- Axis labels: 11px, weight 400, `#868685`

**Trend Line (Blood Pressure, Oxygen)**
- Primary line: `#054d28` (Positive Green), 2px, with circle endpoints
- Comparison/previous-period line: `#9fe870` (Wise Green), 1.5px
- Active data point: Green circle (8px) with a tooltip badge showing the value
- X-axis: Date labels at 12px, `#868685`
- Y-axis: Percentage or value labels at 11px, `#868685`

**Value Badge on Chart**
- Background: `#9fe870`
- Text: `#163300`, 11px, weight 600
- Padding: 4px 8px
- Border-radius: 9999px
- Connected to the data point with a thin vertical dashed line

### Image Carousel (X-ray Thumbnails)
- Thumbnail size: ~80px height, auto width
- Border-radius: 8px
- Gap: 8px between thumbnails
- Overflow: Horizontal scroll with a right-arrow overlay button
- Active/selected: `2px solid #9fe870` border
- Scroll behavior: CSS `scroll-snap-type: x mandatory` with `scroll-snap-align: start` on each thumbnail

### Timestamp / Status Badges

**Time Badge (e.g., "01:34 PM")**
- Background: `#9fe870` (default) or `#d03238` (critical alert context)
- Text: `#163300` (on green) or `#ffffff` (on red), 11px, weight 600
- Padding: 3px 8px
- Border-radius: 9999px

**Plan Badge (e.g., "PrimeCare Plus")**
- Text: `#054d28`, 12px, weight 600
- Icon: Green checkmark circle (`#9fe870`), 14px, left of text
- No background fill — inline text treatment

**Notification Count Badge**
- Size: 18–20px diameter
- Background: `#9fe870`
- Text: `#163300`, 10px, weight 700
- Position: Top-right of parent icon, offset by -4px
- Border-radius: 50%

---

## 7. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (Level 0) | No shadow, no border | Default canvas, transparent elements |
| Bordered (Level 1) | `1px solid #e8ebe6` | Cards, sub-cards, input fields |
| Subtle lift (Level 2) | `0 1px 3px rgba(0,0,0,0.05)` | Patient ID card, hover-state cards |
| Panel overlay (Level 3) | `-4px 0 16px rgba(0,0,0,0.08)` | Right detail panel when overlaying center |
| Badge glow (Level 4) | `0 2px 8px rgba(159, 232, 112, 0.4)` | Green hotspot badges on the anatomy viewer |

**Shadow Philosophy**: Shadows are rare and subtle. The interface communicates depth through panel layering (left → center → right), border contrast, and background color shifts — not through stacked shadows. Green-glow shadows are reserved exclusively for interactive hotspot badges on the anatomy viewer.

---

## 8. Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `radius-xs` | 4px | Inline tags, tiny elements |
| `radius-sm` | 8px | Image thumbnails, input fields, small badges |
| `radius-md` | 12px | Sub-cards (QR section, insurance panel) |
| `radius-lg` | 16px | Vital cards, standard cards |
| `radius-xl` | 20px | Patient ID card, detail panel |
| `radius-pill` | 9999px | All buttons, nav tabs, timestamp badges, avatar images |
| `radius-circle` | 50% | Icon buttons, avatar photos, notification badges |

---

## 9. Iconography

- **Style**: Outlined/stroke icons, 1.5–2px stroke weight, rounded line caps
- **Size**: 16px (in buttons/nav), 20px (sidebar rail), 24px (standalone actions)
- **Color**: Inherits from context — `#454745` default, `#163300` on green fills, `#163300` on `#9fe870` active sidebar highlight
- **Icon set direction**: Medical/clinical icons (stethoscope, clipboard, syringe, heart, lungs) alongside standard UI icons (search, filter, download, print, share, chevron, close)
- **Green circle icon treatment**: For vital-card icons and anatomy hotspots, the icon sits inside a 24–36px green-outlined (`#9fe870` stroke or `#e2f6d5` fill) or green-filled (`#9fe870`) circle with `#163300` icon color

---

## 10. Accessibility & Reduced Motion

### `prefers-reduced-motion`

Animations can cause motion sickness. Reduced motion means fewer and gentler animations — not zero. Keep opacity and color transitions that aid comprehension. Remove transform-based movement and position animations.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* Preserve opacity fades for state clarity */
  .vital-card,
  .detail-panel,
  .toast {
    transition: opacity 200ms var(--ease-subtle);
    /* No transform — only opacity */
  }
}
```

### Touch Device Hover States

Touch devices trigger hover on tap, causing false positives. Gate all hover animations behind a pointer-capability media query:

```css
@media (hover: hover) and (pointer: fine) {
  .btn-primary:hover {
    background-color: #cdffad;
    transform: scale(1.03);
  }
}
```

This is applied to every component with a hover state throughout this system. `:active` states are not gated — they apply on both touch and pointer.

### Focus Visibility

Use `:focus-visible` (not `:focus`) so keyboard users see focus rings while mouse users do not:

```css
.btn-primary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #9fe870, 0 0 0 4px rgba(159, 232, 112, 0.3);
}
```

---

## 11. Do's and Don'ts

### Do
- Use Inter as the only typeface — weight 600 for headings/values, weight 400 for labels/body, weight 700 only for vital numbers
- Use Wise Green (`#9fe870`) with Dark Green (`#163300`) text as the primary interactive color system
- Specify exact transition properties: `transition: transform 160ms var(--ease-out)` — never `transition: all`
- Use custom easing curves (`--ease-out`, `--ease-in-out`, `--ease-panel`) — never default CSS easings
- Apply `scale(1.03)` hover and `scale(0.97)` active on buttons — subtle, not dramatic
- Gate hover effects behind `@media (hover: hover) and (pointer: fine)`
- Respect `prefers-reduced-motion` — remove transforms, keep opacity fades
- Make exit transitions faster than enter transitions (asymmetric timing)
- Start appearing elements from `scale(0.95)` with `opacity: 0` — never from `scale(0)`
- Set `transform-origin` to trigger location on popovers (except modals — keep centered)
- Use stagger delays (50ms between siblings) when loading card lists
- Only animate `transform` and `opacity` — never layout properties
- Apply the label-above-value pattern for all vitals and data displays
- Use pill-shaped buttons (`border-radius: 9999px`) for all CTAs and nav tabs
- Keep shadows minimal — prefer borders and layering for depth
- Use the three-panel layout on desktop: patient context (left), workspace (center), detail (right)
- Enable OpenType `"calt"` on all text
- Use `font-variant-numeric: tabular-nums` on all numerical vital displays

### Don't
- Don't use `transition: all` — it's a code smell; specify exact properties
- Don't use default CSS `ease`, `ease-in`, or `ease-out` — use custom curves
- Don't use `ease-in` on any entering element — it starts slow and feels sluggish
- Don't animate from `scale(0)` — nothing in the real world appears from nothing
- Don't exceed 300ms on any UI animation — clinical tools must feel instant
- Don't animate keyboard-initiated actions (nav via keyboard, command palette) — zero animation for high-frequency actions
- Don't use the Wise Green as background for large surfaces — it's for buttons, badges, and accents only
- Don't apply heavy box shadows — the depth model is flat with borders
- Don't exceed three levels of panel depth on any single screen
- Don't use arbitrary blues or other hues as interactive colors — the green palette is the sole interactive system
- Don't animate `padding`, `margin`, `height`, or `width` — layout properties trigger expensive reflows
- Don't use Framer Motion shorthand props (`x`, `y`, `scale`) under load — use full `transform` strings for GPU acceleration
- Don't mix icon styles — stick to outlined/stroke icons with consistent stroke weight

---

## 12. Responsive Behavior

### Breakpoints

| Name | Width | Layout |
|------|-------|--------|
| Mobile (Android app) | < 576px | Single column — cards stack vertically, no sidebar |
| Tablet | 576–992px | Two-panel — left patient sidebar + center workspace, detail panel overlays full-screen |
| Desktop PWA (primary) | 992–1440px | Three-panel — left + center + right, right panel as overlay |
| Large Desktop | > 1440px | Three-panel with expanded center workspace, right panel as persistent sidebar |

### Panel Collapse Rules
- **Below 992px**: Sidebar icon rail hides; left panel collapses to a top patient banner
- **Below 576px**: Full single-column stack; anatomy viewer becomes swipeable with momentum-based dismissal (velocity > 0.11 triggers dismiss regardless of distance); right detail panel becomes a bottom sheet with `--ease-panel` entry
- **Above 1440px**: Right detail panel can optionally persist without overlaying the center workspace

### Touch Gesture Specifics (Android / Mobile)
- **Bottom sheet drag**: Apply damping at boundaries — the further past the natural stop, the less the sheet moves. Friction instead of hard stops.
- **Swipe to dismiss**: Calculate velocity (`distance / elapsed time`). If velocity exceeds 0.11, dismiss regardless of distance. A quick flick is enough.
- **Pointer capture**: Once dragging starts, capture all pointer events on the sheet element to prevent losing the drag if the finger drifts outside bounds.
- **Multi-touch protection**: Ignore additional touch points after the initial drag begins to prevent jump-to-position bugs.

---

## 13. Agent Prompt Guide

### Quick Color Reference
- Text primary: Near Black (`#0e0f0c`)
- Text secondary: Warm Dark (`#454745`)
- Text tertiary: Gray (`#868685`)
- Background: White (`#ffffff`) / Off-white (`#f4f5f2`)
- Interactive fill: Wise Green (`#9fe870`)
- Interactive text: Dark Green (`#163300`)
- Interactive hover: Pastel Green (`#cdffad`)
- Positive/success: Positive Green (`#054d28`)
- Soft green surface: Light Mint (`#e2f6d5`)
- Danger: Danger Red (`#d03238`)
- Borders: Light Surface (`#e8ebe6`)

### Quick Animation Reference
- Easing (enter/feedback): `cubic-bezier(0.23, 1, 0.32, 1)`
- Easing (movement): `cubic-bezier(0.77, 0, 0.175, 1)`
- Easing (panels): `cubic-bezier(0.32, 0.72, 0, 1)`
- Button hover: `scale(1.03)`, active: `scale(0.97)`
- UI duration ceiling: 300ms
- Button press: 100–160ms
- Panel enter: 250ms, exit: 180ms
- Stagger: 50ms between siblings
- Never animate from `scale(0)` — start at `scale(0.95)` + `opacity: 0`

### Example Component Prompts
- "Create a patient vital card: white background, 16px radius, 1px solid #e8ebe6 border. Green-outlined circle icon (24px, #e2f6d5 fill, #054d28 icon) top-left. Label at 12px Inter weight 400 #868685. Value at 24px Inter weight 700 #0e0f0c with tabular-nums. Sparkline in #054d28, 1.5px stroke. Entry: opacity 0 + translateY(8px) → settled, 300ms cubic-bezier(0.23,1,0.32,1), stagger 50ms."
- "Build the top nav bar: white background, 56px height, bottom border 1px #e8ebe6. Logo left (icon + wordmark weight 700). Nav tabs as pills — active: #9fe870 fill, #163300 text, 9999px radius. Inactive: transparent, #454745 text. Hover: rgba(211,242,192,0.4) background, 150ms cubic-bezier(0.25,0.1,0.25,1). Gate hover behind @media (hover: hover)."
- "Create the right detail panel: white background, 20px top-left radius, shadow -4px 0 16px rgba(0,0,0,0.08). Entry: translateX(100%) → 0, 250ms cubic-bezier(0.32,0.72,0,1). Exit: 180ms cubic-bezier(0.23,1,0.32,1). Close × top-right. Content stagger 50ms. Bottom sticky bar: green pill '+ Add record' with scale(0.97) active."

### Iteration Guide
1. Inter only — weight 600 for headings, 400 for labels, 700 for vital numbers
2. Wise Green (`#9fe870`) + Dark Green (`#163300`) for all interactive elements
3. Custom easing curves — `cubic-bezier(0.23, 1, 0.32, 1)` as the primary UI easing
4. `scale(1.03)` hover, `scale(0.97)` active — subtle physical feedback
5. Specify exact transition properties — `transform`, `opacity`, `background-color` — never `all`
6. Asymmetric timing — enter slower (250ms), exit faster (180ms)
7. Stagger card entries at 50ms intervals
8. Gate hover behind `@media (hover: hover) and (pointer: fine)`
9. Respect `prefers-reduced-motion` — opacity only, no transforms
10. Label-above-value pattern for every data display
11. Pill shape (9999px) for all buttons and nav tabs
12. Three-panel layout on desktop: patient left, workspace center, detail right
13. Flat depth model — borders over shadows, layering over elevation
14. `"calt"` on all text, `tabular-nums` on all vital values

### Review Checklist

When reviewing Ultranos UI code, check for these issues:

| Issue | Fix | Why |
|-------|-----|-----|
| `transition: all` | Specify exact properties | `all` animates unintended properties and hurts performance |
| `scale(0)` entry | Start from `scale(0.95)` + `opacity: 0` | Nothing in the real world appears from nothing |
| Default CSS `ease-in` | Use `var(--ease-out)` or custom curve | `ease-in` feels sluggish — delays initial movement |
| `transform-origin: center` on popover | Set to trigger location | Popovers should scale from their anchor (modals are exempt) |
| Animation on keyboard-triggered action | Remove animation entirely | High-frequency actions must be instant |
| Duration > 300ms on UI element | Reduce to 150–250ms | Clinical tools demand speed |
| Hover animation without media query | Add `@media (hover: hover) and (pointer: fine)` | Prevents false hover on touch devices |
| Same enter/exit duration | Make exit 30–40% faster than enter | System response should feel snappier than user initiation |
| Cards all appear at once | Add 50ms stagger delay between siblings | Cascading entry feels natural and oriented |
| `:focus` instead of `:focus-visible` | Switch to `:focus-visible` | Mouse users shouldn't see focus rings |
| Missing `tabular-nums` on vitals | Add `font-variant-numeric: tabular-nums` | Prevents layout shift when numbers change |
| Animating `height` or `margin` | Switch to `transform: translateY()` | Layout animations trigger expensive reflows |
