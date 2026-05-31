# Lucide Icon Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install lucide-react in @ultranos/ui-kit and establish a curated icon catalog so all apps import consistent icons from one source, then migrate the OPD-Lite and Lab-Lite sidebars as proof of concept.

**Architecture:** lucide-react is added as a direct dependency of @ultranos/ui-kit. A new `icons.ts` module re-exports curated Lucide icons grouped by domain (navigation, clinical, lab, pharmacy, status, general). Apps import from `@ultranos/ui-kit` — the existing `DirectionalIcon` wrapper handles RTL mirroring as before. A dedicated subpath export `./icons` enables direct tree-shaken imports.

**Tech Stack:** lucide-react, TypeScript, @ultranos/ui-kit (pnpm workspace), Next.js 15 PWA apps

**Scope note:** This plan sets up the foundation and migrates the two most icon-heavy sidebars (OPD-Lite, Lab-Lite) as proof of concept. Remaining ~100 files with inline SVGs can be migrated incrementally in follow-up work — the pattern will be established here.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/ui-kit/package.json` | Add lucide-react dependency |
| Create | `packages/ui-kit/src/icons.ts` | Curated icon catalog with domain groupings |
| Modify | `packages/ui-kit/src/index.ts` | Re-export icon catalog |
| Modify | `packages/ui-kit/tsconfig.json` | No change needed (src/ already included) |
| Create | `packages/ui-kit/src/__tests__/icons.test.tsx` | Verify icon exports and DirectionalIcon integration |
| Modify | `apps/opd-lite/src/components/AppSidebar.tsx` | Replace inline SVGs with Lucide imports |
| Modify | `apps/lab-lite/src/components/AppSidebar.tsx` | Replace inline SVGs with Lucide imports |

---

### Task 1: Install lucide-react in ui-kit

**Files:**
- Modify: `packages/ui-kit/package.json`

- [ ] **Step 1: Install lucide-react**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F @ultranos/ui-kit add lucide-react
```

Expected: lucide-react added to `dependencies` in `packages/ui-kit/package.json`, pnpm-lock.yaml updated.

- [ ] **Step 2: Verify installation**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F @ultranos/ui-kit exec -- node -e "const m = require('lucide-react/package.json'); console.log('lucide-react', m.version)"
```

Expected: Prints version number (e.g., `lucide-react 0.511.0` or similar).

- [ ] **Step 3: Commit**

```bash
git add packages/ui-kit/package.json pnpm-lock.yaml
git commit -m "deps(ui-kit): add lucide-react icon library"
```

---

### Task 2: Create the curated icon catalog

**Files:**
- Create: `packages/ui-kit/src/icons.ts`

- [ ] **Step 1: Create the icon catalog module**

Create `packages/ui-kit/src/icons.ts` with curated re-exports organized by domain. Every icon used across OPD-Lite, Lab-Lite, and Pharmacy-Lite sidebars is included, plus common status/action icons.

```typescript
/**
 * Curated icon catalog for the Ultranos ecosystem.
 *
 * All apps should import icons from '@ultranos/ui-kit' (or '@ultranos/ui-kit/icons')
 * instead of using inline SVGs or importing lucide-react directly.
 *
 * Icons are grouped by domain but exported flat for easy consumption.
 * Wrap navigation icons with <DirectionalIcon category="navigation"> for RTL mirroring.
 * Medical icons must NOT be mirrored — use <DirectionalIcon category="medical">.
 *
 * To add a new icon: import from lucide-react and re-export here.
 */

// ─── Navigation & Layout ────────────────────────────────────────────
export {
  LayoutGrid,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ArrowLeft,
  ArrowRight,
  Menu,
  X,
  Search,
  Home,
  ExternalLink,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'

// ─── Users & Identity ───────────────────────────────────────────────
export {
  User,
  Users,
  UserPlus,
  UserSearch,
  UserCheck,
  UserX,
  UserCog,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  KeyRound,
  Fingerprint,
} from 'lucide-react'

// ─── Clinical & Medical ─────────────────────────────────────────────
// ⚠️  These icons must NEVER be mirrored in RTL.
// Wrap with <DirectionalIcon category="medical"> if using DirectionalIcon.
export {
  Stethoscope,
  Pill,
  Syringe,
  Thermometer,
  HeartPulse,
  Activity,
  Brain,
  Bone,
  Eye,
  Ear,
  Baby,
  Ambulance,
  Cross,
  Hospital,
} from 'lucide-react'

// ─── Lab & Diagnostics ──────────────────────────────────────────────
export {
  Microscope,
  FlaskConical,
  FlaskRound,
  TestTubeDiagonal,
  TestTubes,
  Droplet,
  Droplets,
  Beaker,
  Pipette,
  Dna,
  Scan,
  ScanLine,
} from 'lucide-react'

// ─── Pharmacy & Medication ──────────────────────────────────────────
export {
  Sun,
  Moon,
  Utensils,
  Clock,
  Timer,
  Package,
  PackageCheck,
  PackageX,
  PackagePlus,
  Warehouse,
  Truck,
  Receipt,
  ReceiptText,
  ShoppingCart,
  BadgePercent,
  Barcode,
} from 'lucide-react'

// ─── Status & Alerts ────────────────────────────────────────────────
export {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  CircleCheck,
  CircleX,
  Ban,
  OctagonAlert,
  TriangleAlert,
  CircleAlert,
  Bell,
  BellRing,
  BellOff,
} from 'lucide-react'

// ─── Documents & Files ──────────────────────────────────────────────
export {
  File,
  FileText,
  FileWarning,
  FilePlus,
  FileCheck,
  FileX,
  ClipboardList,
  ClipboardCheck,
  ClipboardPen,
  Notebook,
  BookOpen,
} from 'lucide-react'

// ─── Actions & Controls ─────────────────────────────────────────────
export {
  Plus,
  Minus,
  Check,
  Trash2,
  Pencil,
  Copy,
  Download,
  Upload,
  Printer,
  RefreshCw,
  RotateCcw,
  Send,
  Share2,
  Filter,
  SlidersHorizontal,
  SortAsc,
  SortDesc,
  MoreHorizontal,
  MoreVertical,
  GripVertical,
  Settings,
  Save,
} from 'lucide-react'

// ─── Calendar & Scheduling ──────────────────────────────────────────
export {
  Calendar,
  CalendarDays,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
} from 'lucide-react'

// ─── Communication & Sync ───────────────────────────────────────────
export {
  Wifi,
  WifiOff,
  Cloud,
  CloudOff,
  CloudUpload,
  CloudDownload,
  Globe,
  MessageSquare,
  MessageCircle,
  Languages,
  QrCode,
} from 'lucide-react'

// ─── Data & Charts ──────────────────────────────────────────────────
export {
  BarChart3,
  LineChart,
  PieChart,
  TrendingUp,
  TrendingDown,
  Table,
  Rows3,
  Columns3,
} from 'lucide-react'

// ─── Geometric Shapes (Queue Tokens) ────────────────────────────────
export {
  Star,
  Circle,
  Triangle,
  Square,
  Diamond,
  Heart,
  Hexagon,
  Pentagon,
  Octagon,
} from 'lucide-react'

// ─── Type re-export for consumers ───────────────────────────────────
export type { LucideProps, LucideIcon } from 'lucide-react'
```

- [ ] **Step 2: Verify the module compiles**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F @ultranos/ui-kit typecheck
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui-kit/src/icons.ts
git commit -m "feat(ui-kit): add curated Lucide icon catalog"
```

---

### Task 3: Export icons from ui-kit barrel and add subpath export

**Files:**
- Modify: `packages/ui-kit/src/index.ts`
- Modify: `packages/ui-kit/package.json`

- [ ] **Step 1: Add icon re-export to index.ts**

Add at the end of `packages/ui-kit/src/index.ts`:

```typescript
// ─── Icons (Lucide) ─────────────────────────────────────────────────
// Consumers: prefer importing from '@ultranos/ui-kit/icons' for better tree-shaking.
export * from './icons.js'
```

- [ ] **Step 2: Add subpath export to package.json**

In `packages/ui-kit/package.json`, add a `./icons` entry to the `exports` field:

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./icons": {
      "import": "./dist/icons.js",
      "types": "./dist/icons.d.ts"
    },
    "./tokens.css": "./src/tokens.css",
    "./connected-language-selector": "./src/components/ConnectedLanguageSelector.tsx"
  }
}
```

- [ ] **Step 3: Build and verify exports resolve**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F @ultranos/ui-kit build
```

Expected: `dist/icons.js` and `dist/icons.d.ts` generated alongside existing dist files.

- [ ] **Step 4: Commit**

```bash
git add packages/ui-kit/src/index.ts packages/ui-kit/package.json
git commit -m "feat(ui-kit): export icon catalog from barrel and add ./icons subpath"
```

---

### Task 4: Write tests for icon exports and DirectionalIcon integration

**Files:**
- Create: `packages/ui-kit/src/__tests__/icons.test.tsx`

- [ ] **Step 1: Write the test file**

Create `packages/ui-kit/src/__tests__/icons.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  LayoutGrid,
  Users,
  Microscope,
  Bell,
  Calendar,
  Settings,
  ChevronRight,
  Pill,
  FlaskConical,
  Sun,
  AlertTriangle,
  Search,
} from '../icons'
import { DirectionalIcon } from '../components/DirectionalIcon'

describe('Icon catalog exports', () => {
  it('exports navigation icons as valid React components', () => {
    const icons = [LayoutGrid, ChevronRight, Search, Calendar, Settings]
    for (const Icon of icons) {
      expect(Icon).toBeDefined()
      expect(typeof Icon).toBe('object') // Lucide icons are forwardRef objects
    }
  })

  it('exports clinical icons as valid React components', () => {
    const icons = [Microscope, Pill, FlaskConical, Bell, AlertTriangle]
    for (const Icon of icons) {
      expect(Icon).toBeDefined()
    }
  })

  it('renders a Lucide icon with default props', () => {
    const { container } = render(<LayoutGrid />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('width')).toBe('24')
    expect(svg?.getAttribute('height')).toBe('24')
  })

  it('renders a Lucide icon with custom size', () => {
    const { container } = render(<Users size={20} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('width')).toBe('20')
    expect(svg?.getAttribute('height')).toBe('20')
  })

  it('renders a Lucide icon with className for Tailwind styling', () => {
    const { container } = render(<Bell className="h-5 w-5 text-red-600" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('class')).toContain('h-5 w-5 text-red-600')
  })
})

describe('Lucide icons with DirectionalIcon wrapper', () => {
  it('wraps a navigation icon for RTL mirroring', () => {
    const { container } = render(
      <DirectionalIcon category="navigation">
        <ChevronRight size={20} />
      </DirectionalIcon>
    )
    const span = container.querySelector('span')
    expect(span).toBeTruthy()
    expect(span?.getAttribute('aria-hidden')).toBe('true')
    // Navigation icons get the transform CSS variable
    expect(span?.style.transform).toBe('var(--directional-icon-transform, none)')
    // SVG renders inside
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('wraps a medical icon without mirroring', () => {
    const { container } = render(
      <DirectionalIcon category="medical">
        <Pill size={20} />
      </DirectionalIcon>
    )
    const span = container.querySelector('span')
    expect(span).toBeTruthy()
    // Medical icons should NOT have the transform
    expect(span?.style.transform).toBeFalsy()
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('renders a lab icon at sidebar size (20px)', () => {
    const { container } = render(
      <DirectionalIcon category="medical">
        <Microscope size={20} />
      </DirectionalIcon>
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('20')
  })

  it('renders Sun icon for pharmacy dosage timing', () => {
    const { container } = render(<Sun size={16} className="text-amber-500" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('width')).toBe('16')
    expect(svg?.getAttribute('class')).toContain('text-amber-500')
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F @ultranos/ui-kit test -- icons
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/ui-kit/src/__tests__/icons.test.tsx
git commit -m "test(ui-kit): verify icon catalog exports and DirectionalIcon integration"
```

---

### Task 5: Migrate OPD-Lite AppSidebar to Lucide icons

**Files:**
- Modify: `apps/opd-lite/src/components/AppSidebar.tsx`

- [ ] **Step 1: Read the full current file**

```bash
# Read the complete AppSidebar.tsx to understand all inline SVGs and their usage
```

Read `apps/opd-lite/src/components/AppSidebar.tsx` in its entirety before making changes.

- [ ] **Step 2: Replace inline SVG icon object with Lucide imports**

Remove the entire `const icons = { ... }` block (approximately lines 24–100) containing all inline SVGs.

Add this import at the top of the file (after existing imports):

```typescript
import {
  LayoutGrid,
  Calendar,
  Users,
  UserPlus,
  Bell,
  AlertTriangle,
  UserSearch,
  FileWarning,
  Shield,
  Settings,
} from '@ultranos/ui-kit/icons'
```

Then replace every reference to `icons.dashboard`, `icons.calendar`, etc. in the nav items array with the Lucide component rendered at size 20 (matching the previous `width="20" height="20"`):

- `icons.dashboard` → `<LayoutGrid size={20} />`
- `icons.calendar` → `<Calendar size={20} />`
- `icons.users` → `<Users size={20} />`
- `icons.userPlus` → `<UserPlus size={20} />`
- `icons.bell` → `<Bell size={20} />`
- `icons.alertTriangle` → `<AlertTriangle size={20} />`
- `icons.userSearch` → `<UserSearch size={20} />`
- `icons.fileWarning` → `<FileWarning size={20} />`
- `icons.shield` → `<Shield size={20} />`
- `icons.settings` → `<Settings size={20} />`

- [ ] **Step 3: Verify OPD-Lite typechecks**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F opd-lite typecheck
```

Expected: No TypeScript errors.

- [ ] **Step 4: Run OPD-Lite tests**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F opd-lite test
```

Expected: All tests pass. Snapshot tests may need updating if they contain inline SVG markup.

- [ ] **Step 5: If snapshot tests fail, update them**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F opd-lite test -- --update
```

Review the snapshot diffs to confirm they only show the SVG source change (inline → Lucide component output), not layout or behavior changes.

- [ ] **Step 6: Commit**

```bash
git add apps/opd-lite/src/components/AppSidebar.tsx
# Include any updated snapshots
git add apps/opd-lite/src/__tests__/__snapshots__/
git commit -m "refactor(opd-lite): replace inline SVG icons with Lucide imports from ui-kit"
```

---

### Task 6: Migrate Lab-Lite AppSidebar to Lucide icons

**Files:**
- Modify: `apps/lab-lite/src/components/AppSidebar.tsx`

- [ ] **Step 1: Read the full current file**

Read `apps/lab-lite/src/components/AppSidebar.tsx` in its entirety before making changes.

- [ ] **Step 2: Replace inline SVG icons with Lucide imports**

Follow the same pattern as Task 5:

1. Remove inline SVG definitions
2. Add import from `@ultranos/ui-kit/icons` with the icons used in this sidebar
3. Replace each inline SVG reference with `<IconName size={20} />`

Map sidebar icons to their Lucide equivalents based on what you find in the file. Common mappings:
- Microscope → `<Microscope size={20} />`
- Flask/Beaker → `<FlaskConical size={20} />` or `<Beaker size={20} />`
- Droplet → `<Droplet size={20} />`
- Activity → `<Activity size={20} />`
- Settings → `<Settings size={20} />`
- Shield → `<Shield size={20} />`
- Any navigation chevrons → wrap with `<DirectionalIcon category="navigation">`

- [ ] **Step 3: Verify Lab-Lite typechecks**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F lab-lite typecheck
```

Expected: No TypeScript errors.

- [ ] **Step 4: Run Lab-Lite tests**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F lab-lite test
```

Expected: All tests pass (update snapshots if needed, review diffs).

- [ ] **Step 5: If snapshot tests fail, update them**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F lab-lite test -- --update
```

Review snapshot diffs — should only show SVG source changes.

- [ ] **Step 6: Commit**

```bash
git add apps/lab-lite/src/components/AppSidebar.tsx
git add apps/lab-lite/src/__tests__/__snapshots__/
git commit -m "refactor(lab-lite): replace inline SVG icons with Lucide imports from ui-kit"
```

---

### Task 7: Final verification — monorepo build and typecheck

**Files:** None (verification only)

- [ ] **Step 1: Run monorepo-wide typecheck**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm typecheck
```

Expected: No TypeScript errors across the monorepo.

- [ ] **Step 2: Run all tests**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm test
```

Expected: All tests pass.

- [ ] **Step 3: Verify ui-kit build output includes icons**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
ls packages/ui-kit/dist/icons.js packages/ui-kit/dist/icons.d.ts
```

Expected: Both files exist.

---

## Migration Guide for Remaining Files

After this plan is complete, ~100 files still use inline SVGs. To migrate them incrementally:

1. **Find inline SVGs:** `grep -r '<svg' apps/*/src/components/ --include='*.tsx' -l`
2. **For each file:**
   - Identify the icons used (match SVG paths to Lucide names at https://lucide.dev/icons)
   - If the icon isn't in `packages/ui-kit/src/icons.ts`, add it there first
   - Import from `@ultranos/ui-kit/icons`
   - Replace inline SVG with `<IconName size={N} />` (match the original width/height)
   - Wrap navigation icons with `<DirectionalIcon category="navigation">`
   - Never wrap medical icons for mirroring
3. **Run tests** for the affected app after each migration batch
4. **Commit per app** to keep changes reviewable
