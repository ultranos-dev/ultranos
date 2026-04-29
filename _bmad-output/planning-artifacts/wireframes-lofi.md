---
type: wireframes-lofi
version: 1.0
date: 2026-04-28
author: Sally, UX Designer
screens: [WF-01, WF-02, WF-03, WF-04, WF-05, WF-06]
status: draft
based_on: ux-design-specification.md
---

# Ultranos — Low-Fidelity Wireframes

**Author:** Sally, UX Designer
**Date:** 2026-04-28
**Status:** Draft · Pending stakeholder review

> These are annotated low-fidelity layout specifications. They define structure, component placement,
> interaction states, and safety-critical UI rules — not visual polish. Pixel-precise design follows
> in hi-fi. Every annotation cross-references the UX Design Specification.

---

## Notation Guide

| Symbol | Meaning |
|--------|---------|
| `╔═╗ / ╚═╝` | Container / interactive card boundary |
| `█` | Danger Red (#d03238) solid accent band — safety-critical |
| `██████` | Warning Yellow (#ffd11a) fill — stale data / check unavailable |
| `[LABEL]` | Named component from UX Spec |
| `(N)` | Numbered callout — see annotation table below wireframe |
| `⚠` | Safety alert (never suppress, never collapse) |
| `⟳` | Global Sync Indicator state |
| `✓` | Optimistic success state (local, instant) |
| `RTL →` | Element mirrors in right-to-left layouts (Arabic / Dari) |
| `↳` | Inline behavior note |

---

## WF-01 · OPD Desktop PWA — GP Dashboard
**Theme:** Clinical (Near Black / White, dense typography)
**Users:** GP / OPD Clinician
**Platform:** Next.js 15 PWA — Desktop (≥992px) + Mobile (≤576px)

---

### WF-01-A · Desktop (≥992px)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ (1) HEADER — Near Black bg (#0e0f0c), White text, 14px Inter 600, fixed full-width      │
│                                                                                          │
│  ╔══════════════╗   ╔═══════════════════════════════════════════════╗  ╔═══════╗ ╔─────╗│
│  ║ U  ULTRANOS  ║   ║ ⌘K  Search patients, medications, labs...    ║  ║ ⟳  3▲ ║ ║Dr.A▾║│
│  ╚══════════════╝   ╚═══════════════════════════════════════════════╝  ╚═══════╝ ╚─────╝│
│       (2)                              (3)                               (4)      (5)   │
│                                                                                          │
├──────────────────────┬───────────────────────────────────────────────────────────────────┤
│ (6) SIDEBAR          │ (7) MAIN CONTENT AREA — Patient Queue                            │
│ 200px · Near Black   │ White bg                                                         │
│                      │                                                                   │
│  Dashboard           │  Today's Queue  ·  Mon 28 Apr 2026                              │
│  ▶ Queue       (8)   │  10 patients  ·  3 waiting                 ╔════════════════════╗│
│    Patients          │                                             ║   + New Patient    ║│
│    History           │                                             ╚════════════════════╝│
│    ──────────────    │  ─────────────────────────────────────────────   (9) PRIMARY BTN │
│    Rx Pending        │                                                                   │
│    Lab Refs          │  ╔══ ⚠ ALLERGY ══════════════════════════════════════════════════╗│
│    ──────────────    │  ║█ Fatima Hassan   ·   F / 34   ·   ID: PT-00291               ║│
│    Settings          │  ║  ⚠ Penicillin (PCN) — SEVERE allergy on record               ║│
│    Logout            │  ║  Chief: Persistent cough · 3 days   ·   Arrived: 09:15       ║│
│                      │  ║                                             View Encounter →  ║│
│                      │  ╚════════════════════════════════════════════════════════════════╝│
│                      │  (10) Allergy card — Danger Red (#d03238) left band; always      │
│                      │  sorted FIRST; allergy name + class shown inline; never collapsed │
│                      │                                                                   │
│                      │  ╔═══════════════════════════════════════════════════════════════╗│
│                      │  ║  Ahmad Karimi    ·   M / 52   ·   ID: PT-00145               ║│
│                      │  ║  Chief: Routine blood pressure check                         ║│
│                      │  ║  ⏱ Waiting — 12 minutes                   View Encounter →   ║│
│                      │  ╚═══════════════════════════════════════════════════════════════╝│
│                      │                                                                   │
│                      │  ╔═══════════════════════════════════════════════════════════════╗│
│                      │  ║  Sara Nazari     ·   F / 28   ·   ID: PT-00389               ║│
│                      │  ║  Chief: Prenatal visit — 24 weeks                            ║│
│                      │  ║  📅 Scheduled 10:00                        View Encounter →  ║│
│                      │  ╚═══════════════════════════════════════════════════════════════╝│
│                      │                                                                   │
│                      │  ╔═══════════════════════════════════════════════════════════════╗│
│                      │  ║  Yusuf Rahimi    ·   M / 7    ·   ID: PT-00512               ║│
│                      │  ║  Chief: Fever 38.5°C · 2 days                                ║│
│                      │  ║  📅 Scheduled 10:30                        View Encounter →  ║│
│                      │  ╚═══════════════════════════════════════════════════════════════╝│
└──────────────────────┴───────────────────────────────────────────────────────────────────┘

── OFFLINE STATE VARIANT — full-width banner below header (network down) ──────────────────
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  ⟳  You are offline. Patient queue loaded from local cache. All actions save locally.   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

#### WF-01-A Annotations

| # | Component | Spec Reference | Behavior |
|---|-----------|----------------|----------|
| (1) | Header bar | Design System Foundation | Fixed full-width. Near Black bg. 100% viewport width. |
| (2) | Logo | Brand | Wordmark; links to Dashboard / Queue. Pill-shaped container on hover. |
| (3) | Command Palette Trigger | Custom Components — Clinical Command Palette | Always-visible search bar. Activates full palette on click or Cmd+K. Full-text search: patients, meds, labs, orders. |
| (4) | Global Sync Indicator | Custom Components — Global Sync Indicator | Idle: minimal / invisible. Queued: numeric badge (e.g., "3 ▲"). Syncing: yellow pulse animation. Success: green pulse (visual + haptic on mobile). |
| (5) | User Menu | Auth & Sessions | Shows "Dr. [Name]". Dropdown: Profile, MFA, Session info, Logout. Warning at 25 min inactivity; forced re-auth at 30 min. |
| (6) | Left Sidebar | Navigation Patterns | Fixed 200px. Near Black bg, White text. |
| (7) | Main Content | Offline-First Architecture | White bg. Data loaded from local IndexedDB cache. Zero network spinners. |
| (8) | Active Nav Item | Button Hierarchy | Wise Green (#9fe870) left-border strip (4px). Slightly lighter Near Black bg on active item. |
| (9) | "+ New Patient" | Button Hierarchy — Primary | Wise Green pill (border-radius: 9999px). Dark Green text. scale(1.05) on hover; scale(0.95) on active. |
| (10) | Allergy Patient Card | Healthcare Safety Rule #4 | Always sorted first. Danger Red (#d03238) left band. ⚠ badge + allergy name + class. Never collapsed. Sourced from Tier 1 sync data. |
| — | Standard Patient Card | Queue Pattern | White bg, ring shadow. Name, sex/age, ID, wait time or scheduled time, chief complaint. "View Encounter →" secondary link. |
| — | Offline Banner | Offline-First | Appears below header. Warning Yellow or neutral bg. Persistent until connection restored. Non-blocking — all actions still work. |

---

### WF-01-B · Mobile (≤576px)

```
┌─────────────────────────────────────┐
│  [≡]  ULTRANOS    [⟳ 3▲]   [Dr. A] │  ← Header compact; [≡] opens drawer
├─────────────────────────────────────┤
│  Patient Queue  ·  Mon 28 Apr       │
├─────────────────────────────────────┤
│  ╔══ ⚠ ALLERGY ══════════════════╗  │
│  ║█ Fatima Hassan   ·   F / 34   ║  │
│  ║  ⚠ Penicillin (PCN) — SEVERE  ║  │
│  ║  Cough · 3 days · Arr. 09:15  ║  │
│  ║                      View →   ║  │
│  ╚════════════════════════════════╝  │
│                                      │
│  ╔════════════════════════════════╗  │
│  ║  Ahmad Karimi    ·   M / 52   ║  │
│  ║  BP Check  ·  ⏱ Waiting 12m  ║  │
│  ║                      View →   ║  │
│  ╚════════════════════════════════╝  │
│                                      │
│  ╔════════════════════════════════╗  │
│  ║  Sara Nazari     ·   F / 28   ║  │
│  ║  Prenatal  ·  📅 Sched 10:00  ║  │
│  ║                      View →   ║  │
│  ╚════════════════════════════════╝  │
├─────────────────────────────────────┤
│  🏠 Queue  │  👥 Patients  │  💊 Rx │  ← Bottom Tab Bar (primary nav on mobile)
└─────────────────────────────────────┘
                              ╔════════╗
                              ║  🔍⌘K ║  ← Search FAB, bottom-right, 44pt min
                              ╚════════╝
```

> **RTL (WF-01):** Sidebar migrates to RIGHT side. Active border moves to RIGHT edge.
> All `→` arrows and chevrons flip to `←`. Text aligns RIGHT. Patient info right-aligned.
> Sync indicator and user menu shift to LEFT of header. Medical icons (⚠, 📅) do NOT flip.
> Red left-band on allergy card becomes a RED RIGHT-BAND.

---

## WF-02 · OPD Desktop PWA — Patient Encounter & Charting
**Theme:** Clinical
**Platform:** Next.js 15 PWA

---

### WF-02-A · Desktop (≥992px) — Split View

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER (same as WF-01) — [⌘K Search]  [⟳ 1 pending]  [Dr. Amiri ▾]                    │
├──────────────────────────┬───────────────────────────────────────────────────────────────┤
│ (1) LEFT: PATIENT SUMMARY│ (2) RIGHT: SOAP CHARTING EDITOR                              │
│ 38% width                │ 62% width                                                     │
│                          │                                                                │
│ Fatima Hassan            │  Encounter — New  ·  Mon 28 Apr 2026  ·  Dr. Amiri           │
│ F / 34  ·  PT-00291      │                                                               │
│ ────────────────────     │  S — Subjective                                              │
│                          │  ╔═══════════════════════════════════════════════════════╗   │
│ (3) ⚠ ALLERGIES          │  ║                                                       ║   │
│ ╔════════════════════╗   │  ║  Patient presents with productive cough × 3 days,    ║   │
│ ║█ Penicillin (PCN)  ║   │  ║  low-grade fever. No prior antibiotic use.           ║   │
│ ║  ALLERGY — SEVERE  ║   │  ║                                                       ║   │
│ ╚════════════════════╝   │  ╚═══════════════════════════════════════════════════════╝   │
│ ↳ ALWAYS first. Red band.│                                                               │
│ Never collapsible.       │  O — Objective                                               │
│                          │  ╔═══════════════════════════════════════════════════════╗   │
│ ACTIVE MEDICATIONS  (4)  │  ║  Temp: 37.8°C   HR: 88   RR: 18   SpO2: 98%         ║   │
│ ╔════════════════════╗   │  ║  BP: 118/74                                           ║   │
│ ║ Metformin 500mg    ║   │  ╚═══════════════════════════════════════════════════════╝   │
│ ║ daily · (T2DM)     ║   │                                                               │
│ ╚════════════════════╝   │  A — Assessment                                              │
│                          │  ╔═══════════════════════════════════════════════════════╗   │
│ VITALS HISTORY     (5)   │  ║  Acute bronchitis. R/O community-acquired pneumonia. ║   │
│ BP:     118/74           │  ╚═══════════════════════════════════════════════════════╝   │
│ Weight: 62 kg            │                                                               │
│ Last:   12-Mar-2026      │  P — Plan                                                    │
│                          │  ╔═══════════════════════════════════════════════════════╗   │
│ LAB RESULTS        (6)   │  ║  Prescribe antibiotic (avoid PCN class — allergy).   ║   │
│ CBC:  15-Apr-2026        │  ║  Follow up in 5 days.                                 ║   │
│ HbA1c: 7.2% · Mar-2026   │  ╚═══════════════════════════════════════════════════════╝   │
│                          │                                                               │
│ SYNC STATUS              │  ╔══════════════════════════════════════════════════════════╗│
│ ⟳ 1 pending              │  ║  ✨ AI DRAFT — Physician Review Required           (7)  ║│
│                          │  ║  ─────────────────────────────────────────────────────  ║│
│                          │  ║  S: Cough 3d, fever 37.8°C, no prior ABx this month. ║│
│                          │  ║  O: Temp 37.8, SpO2 98%, clear CXR last visit.       ║│
│                          │  ║  A: Acute bronchitis; R/O CAP.                        ║│
│                          │  ║  P: Azithromycin 500mg d1, 250mg d2–5. Review 5d.   ║│
│                          │  ║  ─────────────────────────────────────────────────────  ║│
│                          │  ║  ⚠ This is an AI draft. Review fully before accepting. ║│
│                          │  ║  [Discard]    [Edit Draft]        [Accept & Sign] (8) ║│
│                          │  ╚══════════════════════════════════════════════════════════╝│
│                          │                                                               │
│                          │  ──────────────────────────────────────────────────────────  │
│                          │                                                               │
│                          │  [+ Add Prescription]  [+ Order Lab]    ╔═══════════════╗   │
│                          │                                          ║  Save & Sign  ║   │
│                          │                                          ╚═══════════════╝   │
│                          │                                          (9) PRIMARY CTA     │
└──────────────────────────┴───────────────────────────────────────────────────────────────┘
```

---

### WF-02 · TIER 1 SYNC CONFLICT BANNER (Safety-Critical State)

> Triggered when Tier 1 data (allergies, active meds, critical diagnoses) has a merge conflict.
> Prescription generation is **hard-blocked** until resolved.

```
╔══ ⚠ SYNC CONFLICT — Safety Data Review Required ═════════════════════════════════════════╗
║  A conflict was detected in Tier 1 (safety-critical) data.                               ║
║  Prescription generation is BLOCKED until this conflict is resolved.                     ║
║                                                                                           ║
║  CONFLICT: Allergies — Sulfonamide severity disagrees between devices                    ║
║                                                                                           ║
║  ┌────────────────────────────────────────────┐  ┌─────────────────────────────────────┐ ║
║  │ Local  ·  Dr. Amiri  ·  09:14 HLC         │  │ Hub  ·  Nurse K.  ·  09:16 HLC     │ ║
║  │ Sulfonamide allergy — MODERATE             │  │ Sulfonamide allergy — SEVERE         │ ║
║  └────────────────────────────────────────────┘  └─────────────────────────────────────┘ ║
║                                                                                           ║
║  Both entries will be kept (append-only merge — Tier 1 rule).                            ║
║  Review and confirm to unblock prescribing.                                               ║
║                                                          [Flag for Review]  [Merge Both] ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

#### WF-02-A Annotations

| # | Component | Spec Reference | Behavior |
|---|-----------|----------------|----------|
| (1) | Left Column — Patient Summary | Encounter Pattern | 38% width. Scrollable. Sticky header with patient name. |
| (2) | Right Column — SOAP Editor | Defining Experience | 62% width. Multi-zone freetext. Each zone independently saveable. |
| (3) | Allergy Panel | Healthcare Safety Rule #4 | **Rendered FIRST** in left column. Danger Red left band. Cannot be collapsed, hidden, or reordered. Sourced from Tier 1 sync (append-only). |
| (4) | Active Medications | Tier 1 Data | Below allergies. Cannot be moved above allergy panel. Tier 1 data — append-only. |
| (5) | Vitals History | Tier 2 Data | Collapsible on mobile. Open by default on desktop. Tier 2 (timestamp-merge). |
| (6) | Lab Results | Tier 2 Data | Links to Lab Portal results. Read-only in this view. |
| (7) | AI Draft Panel | Healthcare Safety Rule #2 | Shown only when AI suggestion available. Neutral bg. Clearly labelled "AI DRAFT". Three explicit doctor actions only — never auto-commits. Both AI version and confirmed version stored on Accept. |
| (8) | Accept & Sign | Physician Confirmation Gate | Explicit physician gate — required action. Wise Green pill. Triggers audit event. Cannot be triggered programmatically. |
| (9) | Save & Sign | Optimistic Action Button | Primary CTA. Wise Green pill. scale(1.05) hover. **Optimistic UI**: instantly shows ✓ checkmark (<50ms) regardless of network. Sync queued in background. Global Sync Indicator updates. User never blocked from navigating away. |
| — | Conflict Banner | Conflict Resolution — Tier 1 | Displayed above entire right column. Blocks "Add Prescription" and "Save & Sign" until resolved. Cannot be dismissed without a decision. Uses HLC timestamps (not wall-clock). |

---

### WF-02-B · Mobile (≤576px) — Tabbed Layout

```
┌──────────────────────────────────────┐
│  ← Fatima H.  ·  F/34   [⟳]   [⋮]  │  ← Compact header; [⋮] = more options
├───────────────┬──────────┬───────────┤
│   Summary     │   SOAP   │    Rx     │  ← Tab bar (swipeable)
├───────────────┴──────────┴───────────┤
│ (SUMMARY TAB — default first view)   │
│                                      │
│  ╔════════════════════════════════╗  │
│  ║█ ⚠ Penicillin — SEVERE        ║  │  ← Allergy always at top of Summary
│  ╚════════════════════════════════╝  │
│                                      │
│  Active Meds:  Metformin 500mg daily │
│  Last BP:      118/74  ·  12-Mar     │
│  Last HbA1c:   7.2%   ·  Mar-2026   │
│                                      │
│ (SOAP TAB — second tab)              │
│                                      │
│  S  ╔════════════════════════════╗   │
│     ║ Productive cough × 3d ... ║   │
│     ╚════════════════════════════╝   │
│  O  ╔════════════════════════════╗   │
│     ║ Temp 37.8 · SpO2 98% ...  ║   │
│     ╚════════════════════════════╝   │
│  A  ╔════════════════════════════╗   │
│     ║ Acute bronchitis ...       ║   │
│     ╚════════════════════════════╝   │
│  P  ╔════════════════════════════╗   │
│     ║ Avoid PCN class Abx ...    ║   │
│     ╚════════════════════════════╝   │
│                                      │
│  ╔════════════════════════════════╗  │
│  ║  ✨ AI Draft — Review Required ║  │
│  ║  [Discard] [Edit] [Accept ✓]  ║  │
│  ╚════════════════════════════════╝  │
│                                      │
├──────────────────────────────────────┤
│  [+ Rx]  [+ Lab]    ╔═════════════╗ │
│                     ║ Save & Sign ║ │
│                     ╚═════════════╝ │
└──────────────────────────────────────┘
```

> **RTL (WF-02):** Left/right columns swap. Allergy panel stays at top (not left) on mobile.
> On desktop RTL: patient summary moves to RIGHT, SOAP editor to LEFT.
> All `→` arrows flip. Text aligns RIGHT. HLC timestamps display LTR (numeric).

---

## WF-03 · OPD Desktop PWA — Prescribing Flow (Drug Safety Panel)
**Theme:** Clinical
**Opens as:** Right-side sliding panel (desktop) · Bottom Sheet (mobile)
**Trigger:** Tapping "+ Add Prescription" within an encounter

> This panel is the most safety-critical UX surface in the system.
> It must correctly handle 6 distinct interaction-check states.
> State 6 (check unavailable) is as important as State 4 (contraindicated).

---

### WF-03-A · Panel Shell + State 1: Searching

```
┌──────────────────────────────────────────┬───────────────────────────────────────────────┐
│ ← ENCOUNTER VIEW (dimmed, still visible) │ (1) PRESCRIBING PANEL — slides in from right  │
│                                          │                                                │
│ ...existing SOAP content (read-only)...  │  💊  Add Prescription                    ✕   │
│                                          │  ─────────────────────────────────────────    │
│                                          │                                                │
│                                          │  Drug Name                            (2)    │
│                                          │  ╔═══════════════════════════════════════╗   │
│                                          │  ║ Azithromycin                    ↕     ║   │
│                                          │  ╚═══════════════════════════════════════╝   │
│                                          │  ┌───────────────────────────────────────┐   │
│                                          │  │  Azithromycin 250mg              (3)  │   │
│                                          │  │  Azithromycin 500mg                   │   │
│                                          │  │  Azithromycin 200mg/5ml (syrup)       │   │
│                                          │  └───────────────────────────────────────┘   │
│                                          │  ↳ From local drug-db (offline-capable)      │
│                                          │                                                │
│                                          │  Dosage             Frequency                │
│                                          │  ╔═══════════════╗  ╔═══════════════════╗   │
│                                          │  ║  500mg         ║  ║  Once daily       ║   │
│                                          │  ╚═══════════════╝  ╚═══════════════════╝   │
│                                          │                                                │
│                                          │  Duration                                     │
│                                          │  ╔═══════════════════════════════════════╗   │
│                                          │  ║  5 days                               ║   │
│                                          │  ╚═══════════════════════════════════════╝   │
│                                          │                                                │
│                                          │  Instructions (optional)                      │
│                                          │  ╔═══════════════════════════════════════╗   │
│                                          │  ║  Day 1: 500mg. Days 2–5: 250mg.       ║   │
│                                          │  ╚═══════════════════════════════════════╝   │
│                                          │                                                │
│                                          │  ─── Drug Interaction Check ──────── (4)    │
│                                          │  ⟳  Checking interactions...                 │
│                                          │  ↳ Local ONNX model (offline) or cloud API   │
│                                          │                                                │
│                                          │  ╔═══════════════════════════════════════╗   │
│                                          │  ║   Add to Prescription  [disabled]     ║   │  ← Grayed, non-interactive during check
│                                          │  ╚═══════════════════════════════════════╝   │
└──────────────────────────────────────────┴───────────────────────────────────────────────┘
```

---

### WF-03-B · State 2: CLEAR — No Interactions Found

```
│  ─── Drug Interaction Check ──────────────────────────────────────────────  │
│  ✓  No known drug interactions detected                                     │
│  ✓  No allergy match for this patient                                       │
│                                                                              │
│  ╔═════════════════════════════════════════════════════════════════════╗    │
│  ║                    Add to Prescription                              ║    │  ← Wise Green pill (enabled)
│  ╚═════════════════════════════════════════════════════════════════════╝    │
│  ↳ Optimistic: instantly added to encounter Rx list. Synced in background.  │
```

---

### WF-03-C · State 3: MODERATE WARNING — Override Available

```
│  ─── Drug Interaction Check ──────────────────────────────────────────────  │
│  ⚠  MODERATE INTERACTION                                                    │
│  Azithromycin × Metformin                                                   │
│  May slightly prolong QT interval. Monitor ECG if clinically indicated.     │
│                                                                              │
│  Clinical override reason  (required to proceed)                            │
│  ╔═════════════════════════════════════════════════════════════════════╗    │
│  ║  Type reason to continue...                                         ║    │
│  ╚═════════════════════════════════════════════════════════════════════╝    │
│                                                                              │
│  ╔═════════════════════════════════════════════════════════════════════╗    │
│  ║              Add to Prescription (Override)                         ║    │  ← Wise Green, enabled only after reason entered
│  ╚═════════════════════════════════════════════════════════════════════╝    │
│  ↳ Reason, timestamp, doctor ID, and "MODERATE override" logged to audit.   │
```

---

### WF-03-D · State 4: CONTRAINDICATED — Hard Warning, Override Requires Reason

```
│  ─── Drug Interaction Check ──────────────────────────────────────────────  │
│  ╔════════════════════════════════════════════════════════════════════════╗  │
│  ║█ 🚫  CONTRAINDICATED                                                  ║  │  ← Danger Red band
│  ║  Azithromycin × Amiodarone                                            ║  │
│  ║  Severe QT prolongation risk. Potential fatal arrhythmia.             ║  │
│  ║  DO NOT prescribe without specialist review.                          ║  │
│  ╚════════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
│  Specialist override reason  (mandatory field — non-empty to unlock button) │
│  ╔═════════════════════════════════════════════════════════════════════╗    │
│  ║  Specialist has reviewed and authorized. [Ref: Dr. M. Yilmaz...]   ║    │
│  ╚═════════════════════════════════════════════════════════════════════╝    │
│                                                                              │
│  ╔═════════════════════════════════════════════════════════════════════╗    │
│  ║              Override & Add  (Full Audit Logged)                    ║    │  ← Danger Red pill, not Wise Green
│  ╚═════════════════════════════════════════════════════════════════════╝    │
│  ↳ Non-empty reason required. Audit record: reason + doctor + timestamp +   │
│    "CONTRAINDICATED override". Prescription flagged in patient record.       │
```

---

### WF-03-E · State 5: ALLERGY MATCH — Hard Block (No Patient Override)

```
│  ─── Drug Interaction Check ──────────────────────────────────────────────  │
│  ╔════════════════════════════════════════════════════════════════════════╗  │
│  ║█ 🚫  ALLERGY MATCH                                                    ║  │  ← Danger Red band
│  ║  Amoxicillin matches patient's recorded allergy:                      ║  │
│  ║  ⚠ Penicillin (PCN) — SEVERE                                         ║  │
│  ║  Prescribing this drug class requires specialist authorization.       ║  │
│  ╚════════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
│  ╔═════════════════════════════════════════════════════════════════════╗    │
│  ║              Add to Prescription  [blocked — disabled]              ║    │  ← Gray, non-interactive
│  ╚═════════════════════════════════════════════════════════════════════╝    │
│                                                                              │
│  [Request Specialist Authorization]    ← secondary action; opens request flow│
│  ↳ Specialist override logged. Allergy override stored as separate record.   │
│  ↳ Patient's allergy data is NEVER modified (append-only, Tier 1).           │
```

---

### WF-03-F · State 6: CHECK UNAVAILABLE — The Critical Failure State

> **Healthcare Safety Rule #3:** If drug interaction check fails for ANY reason
> (network error, DB timeout, local model unavailable), the system MUST show this state.
> It must NEVER silently default to "no interactions found." That would be a false negative
> that could kill a patient.

```
│  ─── Drug Interaction Check ──────────────────────────────────────────────  │
│  ╔████████████████████████████████████████████████████████████████████████╗  │
│  ║  ⚠  Interaction check unavailable                                     ║  │  ← Warning Yellow (#ffd11a) bg
│  ║     Network error — drug interaction database unreachable.            ║  │
│  ║                                                                        ║  │
│  ║     This does NOT mean no interactions exist.                         ║  │
│  ║     You must verify drug interactions manually before prescribing.    ║  │
│  ╚████████████████████████████████████████████████████████████████████████╝  │
│                                                                              │
│  ╔═════════════════════════════════════════════════════════════════════╗    │
│  ║  ☐  I have manually verified — no known interactions for this Rx    ║    │  ← Checkbox, unchecked by default
│  ╚═════════════════════════════════════════════════════════════════════╝    │
│                                                                              │
│  ╔═════════════════════════════════════════════════════════════════════╗    │
│  ║          Add to Prescription  (Manual Verify)                       ║    │  ← Disabled until checkbox ticked
│  ╚═════════════════════════════════════════════════════════════════════╝    │
│  ↳ Checkbox required. Audit record stores: "check_unavailable",             │
│    doctor acknowledgement, timestamp, reason (network error / timeout).     │
│  ↳ This state is NEVER suppressed or auto-bypassed. Ever.                   │
```

#### WF-03 Annotations

| # | Component | Spec Reference | Behavior |
|---|-----------|----------------|----------|
| (1) | Prescribing Panel | Component Strategy | Slides in from right (desktop). Non-blocking — encounter view remains visible behind it. |
| (2) | Drug Name Input | Drug Interaction Checker | Auto-complete from `@ultranos/drug-db` local subset (offline). Searches generic + brand names in both English and Arabic transliteration. |
| (3) | Autocomplete Dropdown | Component Primitives | Max 5 results. Keyboard-navigable (↑↓ + Enter). Shows generic name, strength, form. Closes on Escape. |
| (4) | Drug Interaction Check Zone | Healthcare Safety Rule #3 | Triggered immediately on drug selection. Uses local ONNX model offline; cloud API when online. Transitions through all 6 states. NEVER skipped. NEVER defaults to "clear" on failure. |
| — | Add to Prescription button | Optimistic Action Button | Disabled during check and on States 5 (allergy). Enabled on States 2 (clear), 3 (warning + reason), 4 (contraindicated + reason). State 6 requires checkbox. |
| — | Override Reason Field | Audit Logger | Required for States 3, 4, 6. Non-empty. Stored verbatim in audit log alongside drug name, doctor ID, patient ID (opaque), HLC timestamp, severity tier. |

---

### WF-03-G · Mobile — Bottom Sheet

```
┌──────────────────────────────────────┐
│  ...encounter content (dimmed)...    │
├──────────────────────────────────────┤
│  ▬  (drag handle)                    │  ← Bottom sheet; swipe down to dismiss
│  💊  Add Prescription          ✕     │
│  ─────────────────────────────────   │
│                                      │
│  Drug Name                           │
│  ╔════════════════════════════════╗  │
│  ║  Azithromycin            ↕    ║  │
│  ╚════════════════════════════════╝  │
│                                      │
│  Dosage    ×   Frequency   ×  Days   │
│  [ 500mg ]   [ Once/day ]  [ 5d  ]  │
│                                      │
│  ─── Interaction Check ────────────  │
│  ✓  No interactions  ·  ✓  No allergy│
│                                      │
│  ╔════════════════════════════════╗  │
│  ║      Add to Prescription       ║  │  ← Full-width Wise Green pill (min 44pt height)
│  ╚════════════════════════════════╝  │
└──────────────────────────────────────┘
```

> **RTL (WF-03):** Panel slides in from LEFT on desktop RTL. Bottom sheet direction-neutral.
> Autocomplete results align RIGHT. Drug names remain LTR (international pharmaceutical standard).
> Warning/error bands span full width — direction-neutral.

---

## WF-04 · Pharmacy POS — Prescription Queue
**Theme:** Fulfillment (Positive Green #054d28, Light Surface #e8ebe6)
**Platform:** Next.js 15 PWA — Desktop + Mobile

---

### WF-04-A · Desktop — Queue + Order Detail (Side-by-side)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER — Fulfillment Theme — Light Surface bg                                           │
│  ╔════════════════╗  ╔═══════════════════════════════════════╗  ╔════════╗  ╔════════╗  │
│  ║ U PHARMACY POS ║  ║ Search prescriptions, patients...     ║  ║ ⟳ Idle ║  ║Pharm.K▾║  │
│  ╚════════════════╝  ╚═══════════════════════════════════════╝  ╚════════╝  ╚════════╝  │
├──────────────────────────────────────┬───────────────────────────────────────────────────┤
│ (1) PRESCRIPTION QUEUE               │ (2) ORDER DETAIL PANEL                           │
│ Light Surface bg                     │                                                   │
│                                      │  Rx-84920                                        │
│  Pending (4)  ·  Dispensed today (12)│  ─────────────────────────────────────────────── │
│                                      │  Patient:     Fatima Hassan                      │
│  ── (3) STALE DATA WARNING ───────   │  Prescribed:  Dr. Amiri  ·  28 Apr  ·  10:02    │
│  ╔══════════════════════════════╗    │                                                   │
│  ║████████████████████████████████║    │  MEDICATIONS                                    │
│  ║  ⚠ Data may be stale (18m)  ║    │  ╔═══════════════════════════════════════════╗  │
│  ║  Last sync: 09:58            ║    │  ║  Azithromycin 500mg  ·  Day 1            ║  │
│  ║  Sync before dispensing.     ║    │  ║  then 250mg  ·  Days 2–5                 ║  │
│  ║  [Force Sync] [I Understand] ║    │  ║  Qty: 5 tablets total                    ║  │
│  ╚══════════════════════════════╝    │  ╚═══════════════════════════════════════════╝  │
│                                      │                                                   │
│  ╔══════════════════════════════╗    │  Status:   ● Pending Dispensing                  │
│  ║ Rx-84920  ·  Fatima Hassan  ║    │  Received: 28 Apr  ·  10:02                      │
│  ║ Azithromycin  ·  5 tabs     ║    │  ↳ "Mark Dispensed" BLOCKED until stale warning  │
│  ║ Dr. Amiri  ·  28 Apr 10:02  ║    │  acknowledged (Force Sync or I Understand)        │
│  ║  ● Pending        View →   ║    │                                                   │
│  ╚══════════════════════════════╝    │  ╔═══════════════════════════════════════════╗  │
│                                      │  ║  [Scan Barcode]  (optional verification)  ║  │  (4)
│  ╔══════════════════════════════╗    │  ╚═══════════════════════════════════════════╝  │
│  ║ Rx-84891  ·  Ahmad Karimi   ║    │                                                   │
│  ║ Lisinopril  ·  30 tabs      ║    │  ╔═══════════════════════════════════════════╗  │
│  ║ Dr. Rahimi  ·  27 Apr 09:30 ║    │  ║              Mark Dispensed          (5)  ║  │  ← Wise Green pill
│  ║  ● Pending        View →   ║    │  ╚═══════════════════════════════════════════╝  │
│  ╚══════════════════════════════╝    │  ↳ Optimistic: instantly marks locally;          │
│                                      │  syncs to Hub API in background.                 │
└──────────────────────────────────────┴───────────────────────────────────────────────────┘
```

---

### WF-04-B · Mark Dispensed — Confirmation Modal

```
╔══════════════════════════════════════════════════════════════════════╗
║  Confirm Dispensing — Rx-84920                                       ║
║  ──────────────────────────────────────────────────────────────────  ║
║  Patient:       Fatima Hassan                                        ║
║  Medication:    Azithromycin 500mg (Day 1) + 250mg (Days 2–5)       ║
║  Quantity:      5 tablets                                            ║
║  Dispensed by:  Pharm. K  ·  28 Apr 2026  ·  10:22                 ║
║                                                                      ║
║  [Cancel]                                    [Confirm Dispense]     ║
╚══════════════════════════════════════════════════════════════════════╝
↳ On confirm: optimistic local success → background sync → Hub API update.
↳ Audit event emitted with: pharmacist ID, Rx ID, patient ID (opaque), timestamp (HLC).
```

#### WF-04-A Annotations

| # | Component | Spec Reference | Behavior |
|---|-----------|----------------|----------|
| (1) | Prescription Queue | Fulfillment Theme | Sorted: Pending first, then Dispensed. Loaded from local cache. No spinner ever shown. |
| (2) | Order Detail Panel | Split-pane Pattern | Opens on queue row click. Right panel on desktop; full screen on mobile. |
| (3) | Stale Data Warning | Trust Through Transparency | Triggered when last sync > 15 min ago. Warning Yellow (#ffd11a) bg. Must be acknowledged via "Force Sync" OR "I Understand" before "Mark Dispensed" activates. Cannot be bypassed silently. |
| (4) | Barcode Scan | Verification Step | Optional hardware scanner or camera. Validates medication packaging matches prescription. Not a hard requirement, but surfaced as a clear optional step. |
| (5) | Mark Dispensed | Optimistic Action Button | Wise Green pill. Blocked until stale data acknowledged. Optimistic UI — instant local success state. Sync queued in background. Global Sync Indicator updates. |

> **RTL (WF-04):** Queue panel moves to RIGHT. Detail panel to LEFT. All `→` arrows flip.
> Text aligns RIGHT. Confirmation modal text aligns RIGHT. Buttons remain in same left/right order.

---

### WF-04-C · Mobile (≤576px)

```
┌──────────────────────────────────────┐
│  PHARMACY POS   [⟳ Idle]  [Pharm. K]│
├──────────────────────────────────────┤
│  ╔════════████████████════════════╗  │  ← Stale data banner (Warning Yellow)
│  ║  ⚠ Data may be stale (18m)    ║  │
│  ║  [Force Sync]  [I Understand]  ║  │
│  ╚════════════════════════════════╝  │
│                                      │
│  Pending (4)                         │
│                                      │
│  ╔════════════════════════════════╗  │
│  ║  Rx-84920  ·  Fatima Hassan   ║  │
│  ║  Azithromycin  ·  5 tabs      ║  │
│  ║  Dr. Amiri  ·  10:02          ║  │
│  ║  ● Pending          Dispense → ║  │
│  ╚════════════════════════════════╝  │
│                                      │
│  ╔════════════════════════════════╗  │
│  ║  Rx-84891  ·  Ahmad Karimi    ║  │
│  ║  Lisinopril  ·  30 tabs       ║  │
│  ║  Dr. Rahimi  ·  09:30         ║  │
│  ║  ● Pending          Dispense → ║  │
│  ╚════════════════════════════════╝  │
├──────────────────────────────────────┤
│  📋 Queue  │  ✅ Dispensed  │  🔍    │
└──────────────────────────────────────┘
```

---

## WF-05 · Lab Portal — Lab Orders & Result Entry
**Theme:** Fulfillment (Positive Green)
**Platform:** Next.js 15 PWA
**Data Minimization Rule:** Patient visible as FIRST NAME + AGE only — enforced at API layer.
No patient ID, no surname, no diagnosis, no DOB, no address visible anywhere in this app.

---

### WF-05-A · Desktop — Orders List + Result Entry Form

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER — Fulfillment Theme                                                              │
│  ╔═══════════════╗  ╔═══════════════════════════════════════╗  ╔════════╗  ╔════════╗  │
│  ║  U LAB PORTAL ║  ║  Search lab orders...                 ║  ║ ⟳ Idle ║  ║Lab. T ▾║  │
│  ╚═══════════════╝  ╚═══════════════════════════════════════╝  ╚════════╝  ╚════════╝  │
├───────────────────────────────────────┬──────────────────────────────────────────────────┤
│ (1) ORDERS LIST                       │ (2) RESULT ENTRY FORM                           │
│                                       │                                                  │
│  Today  ·  28 Apr 2026                │  Lab Order: LAB-20264-001                       │
│  Active Orders (5)                    │  ───────────────────────────────────────────    │
│                                       │  (3) Patient:   Fatima, 34yo                   │
│  ╔═════════════════════════════════╗  │  ↳ FIRST NAME + AGE ONLY — by design           │
│  ║  LAB-20264-001   ● Pending      ║  │  ↳ No surname. No patient ID. No DOB.          │
│  ║  Fatima, 34yo                   ║  │                                                  │
│  ║  Tests: CBC · CRP               ║  │  Ordered by:    Dr. Amiri  ·  28 Apr 09:55     │
│  ║                       Enter →  ║  │                                                  │
│  ╚═════════════════════════════════╝  │  ──────────────────────────────────────────     │
│                                       │  CBC — Complete Blood Count                     │
│  ╔═════════════════════════════════╗  │  ╔════════════════════════════════════════════╗ │
│  ║  LAB-20264-002   ● In Progress  ║  │  ║  WBC   [          ]  ×10³/µL  Ref: 4–10  ║ │
│  ║  Ahmad, 52yo                    ║  │  ║  RBC   [          ]  ×10⁶/µL  Ref: 4.2–5.4║ │
│  ║  Tests: Lipid Panel · HbA1c     ║  │  ║  HGB   [          ]  g/dL     Ref: 13–17  ║ │
│  ║                       Enter →  ║  │  ║  PLT   [          ]  ×10³/µL  Ref: 150–400║ │
│  ╚═════════════════════════════════╝  │  ╚════════════════════════════════════════════╝ │
│                                       │                                                  │
│  ╔═════════════════════════════════╗  │  CRP — C-Reactive Protein                       │
│  ║  LAB-20264-003   ✓ Complete    ║  │  ╔════════════════════════════════════════════╗ │
│  ║  Sara, 28yo                     ║  │  ║  CRP   [  12.4    ]  mg/L     Ref: <5.0   ║ │
│  ║  Tests: Prenatal Panel          ║  │  ╚════════════════════════════════════════════╝ │
│  ║                        View →  ║  │                                                  │
│  ╚═════════════════════════════════╝  │  (4) ABNORMAL FLAG (auto-calculated)            │
│                                       │  ╔════════════════════════════════════════════╗ │
│                                       │  ║  ⚠  CRP 12.4 — ABOVE reference range      ║ │
│                                       │  ╚════════════════════════════════════════════╝ │
│                                       │  ↳ Cannot be dismissed. Clinician must see it. │
│                                       │                                                  │
│                                       │  Notes (optional)                               │
│                                       │  ╔════════════════════════════════════════════╗ │
│                                       │  ║  Sample slightly haemolysed, noted.        ║ │
│                                       │  ╚════════════════════════════════════════════╝ │
│                                       │                                                  │
│                                       │  ╔════════════════════════════════════════════╗ │
│                                       │  ║              Submit Results           (5)  ║ │  ← Wise Green pill
│                                       │  ╚════════════════════════════════════════════╝ │
│                                       │  ↳ Triggers sync → GP app notification.        │
│                                       │  ↳ Audit event emitted (lab ID, order ID).    │
└───────────────────────────────────────┴──────────────────────────────────────────────────┘
```

#### WF-05-A Annotations

| # | Component | Spec Reference | Behavior |
|---|-----------|----------------|----------|
| (1) | Orders List | Lab Portal Data Rule | Sorted: Pending first, In Progress, then Complete. Patient shown as "FirstName, Ageyo" only. No surname, no ID, no diagnosis. API enforces this — UI cannot override it even if data were present. |
| (2) | Result Entry Form | Lab Portal | Opens on order row click. Right panel desktop; full screen mobile. Shows: order ID, patient identifier (name + age only), ordering doctor, test list with fields. |
| (3) | Patient Identifier | Healthcare Safety Rule #7 | ALWAYS "FirstName, Ageyo" format (e.g., "Fatima, 34yo"). This is the maximum PHI the Lab Portal may display. Enforced at the Hub API endpoint level, not only the UI. |
| (4) | Abnormal Flag | Clinical Safety | Auto-calculated against reference ranges inline. Warning Yellow bg. Persists until form is submitted — cannot be dismissed or collapsed. |
| (5) | Submit Results | Optimistic Action Button | Wise Green pill. Validates all required fields filled. Optimistic success state. Triggers notification to GP encounter via sync engine. Audit event: lab technician ID, order ID, timestamp (HLC). |

> **RTL (WF-05):** Orders list panel moves to RIGHT. Form panel to LEFT. Reference range values remain LTR (numeric data). Text labels align RIGHT.

---

## WF-06 · Health Passport — Patient Home
**Theme:** Consumer (Soft Teal / Warm Accents, large touch targets)
**Platform:** React Native 0.76+ — iOS + Android
**Auth:** OTP-only (no password). Session token in memory only.
**RTL-First:** Layouts designed Arabic/Dari RTL as default; LTR shown here for annotation clarity.

---

### WF-06-A · Home Screen

```
┌──────────────────────────────────────┐
│  ░░░░░░░░░░ STATUS BAR (system) ░░░░ │
├──────────────────────────────────────┤
│  ╔════════════════════════════════╗  │
│  ║  My Health Passport            ║  │  ← Consumer theme header (teal/soft bg)
│  ║  Fatima Hassan                 ║  │
│  ║  ID Reference: PT-00291        ║  │  ← Reference number only; no diagnosis
│  ╚════════════════════════════════╝  │
│                                      │
│  ── Quick Actions ─────────────────  │
│                                      │
│  ╔═══════════════╗  ╔══════════════╗ │
│  ║               ║  ║              ║ │
│  ║     📋        ║  ║     💊       ║ │  ← Min 44pt touch targets
│  ║   My QR       ║  ║   My Meds   ║ │
│  ╚═══════════════╝  ╚══════════════╝ │
│                                      │
│  ╔═══════════════╗  ╔══════════════╗ │
│  ║               ║  ║              ║ │
│  ║     🧪        ║  ║     📅       ║ │
│  ║  Lab Results  ║  ║   Appoints  ║ │
│  ╚═══════════════╝  ╚══════════════╝ │
│                                      │
│  ── Active Prescriptions ──────────  │
│                                      │
│  ╔════════════════════════════════╗  │
│  ║  Azithromycin 500mg            ║  │
│  ║  Dr. Amiri  ·  28 Apr 2026    ║  │
│  ║  ●●○○○  Day 2 of 5            ║  │  ← Prescription journey tracker dots
│  ╚════════════════════════════════╝  │
│                                      │
│  ╔════════════════════════════════╗  │
│  ║  Metformin 500mg               ║  │
│  ║  Dr. Amiri  ·  Ongoing         ║  │
│  ║  ♻  Refill due in 8 days       ║  │
│  ╚════════════════════════════════╝  │
│                                      │
│  ── Upcoming ──────────────────────  │
│  📅  Follow-up  ·  Dr. Amiri  ·  3 May│
│                                      │
├──────────────────────────────────────┤
│  🏠 Home │ 📋 QR  │ 💊 Meds │ 👤 Me │  ← Bottom Tab Bar
└──────────────────────────────────────┘
```

---

### WF-06-B · My QR Code Screen

```
┌──────────────────────────────────────┐
│  ←  Back         My QR Code  [Share] │
├──────────────────────────────────────┤
│                                      │
│  ╔════════════════════════════════╗  │
│  ║                                ║  │
│  ║   █▀▀▀█  █ █ ██ █▀▀▀█         ║  │
│  ║   █   █ ▀ █▀  █ █   █         ║  │
│  ║   █▄▄▄█ ▄▀▄ ▄ ▄ █▄▄▄█         ║  │
│  ║   ▄▄▄▄▄ █ ▄ ▀▄▀ ▄▀▄▄▄         ║  │  ← QR Code (display only; not functional)
│  ║   ██ ▀ ▀▀█▀ █▄█▀▀ ▄▄▄         ║  │
│  ║   █▀▀▀█ ▄██ ▀▀▄ ▄ ▀▀▄         ║  │
│  ║   █   █ ▀▄ █▀▄▀▄▄▀█▄          ║  │
│  ║   █▄▄▄█ ▄▀▀▄ ██▀▄▀▄▄          ║  │
│  ║                                ║  │
│  ╚════════════════════════════════╝  │
│                                      │
│  Fatima Hassan                       │
│  Show this to your clinician to      │
│  verify your identity.               │
│                                      │
│  ╔════════════████████═══════════╗  │
│  ║  ⏱  Expires in 47 minutes    ║  │  ← Countdown timer (Warning Yellow near expiry)
│  ╚════════════════════════════════╝  │
│                                      │
│  ─────────────────────────────────── │
│  ℹ  What's stored in this QR?        │
│     Only your secure patient         │
│     reference number is encoded.     │
│     No medical data is visible.      │
│                                      │
│  ╔════════════════════════════════╗  │
│  ║        Refresh QR Code         ║  │  ← Regenerates signed QR on demand
│  ╚════════════════════════════════╝  │
│  ↳ QR encodes: { patient_id, issued_at,│
│    expiry, ECDSA-P256 signature }    │
│  ↳ NEVER contains raw PHI.           │
└──────────────────────────────────────┘
```

---

### WF-06-C · My Medications Screen

```
┌──────────────────────────────────────┐
│  ←  Back         My Medications      │
├──────────────────────────────────────┤
│  Active (2)  ·  Past (14)            │
│  ──────────────────────────────────  │
│                                      │
│  ╔════════════════════════════════╗  │
│  ║  Azithromycin 500mg            ║  │
│  ║  Take once daily with food     ║  │
│  ║  Dr. Amiri  ·  28 Apr 2026    ║  │
│  ║  ─────────────────────────── ║  │
│  ║  Progress:   Day 2 of 5        ║  │
│  ║  ●  ●  ○  ○  ○                 ║  │  ← Filled dot = day taken/passed; empty = upcoming
│  ╚════════════════════════════════╝  │
│                                      │
│  ╔════════════════════════════════╗  │
│  ║  Metformin 500mg               ║  │
│  ║  Twice daily with meals        ║  │
│  ║  Dr. Amiri  ·  Ongoing         ║  │
│  ║  ─────────────────────────── ║  │
│  ║  ♻  Refill due in 8 days       ║  │
│  ╚════════════════════════════════╝  │
│                                      │
│  Past Medications                    │
│  ──────────────────────────────────  │
│  ╔════════════════════════════════╗  │
│  ║  Amoxicillin 500mg             ║  │
│  ║  Completed  ·  March 2026      ║  │
│  ╚════════════════════════════════╝  │
└──────────────────────────────────────┘
```

#### WF-06 Annotations

| # | Component | Spec Reference | Behavior |
|---|-----------|----------------|----------|
| — | Home Screen | Consumer Theme | Data from local SQLCipher DB (Android Keystore key). Zero spinners. Fully offline. |
| — | Quick Action Grid | Touch-Optimized Pattern | 2×2 grid. Large card buttons (≥44pt tap targets). Medical icons (💊, 🧪, 📅, 📋) do NOT flip in RTL. Labels flip alignment only. |
| — | Prescription Journey Tracker | Prescription Journey Pattern | Filled dots = days taken or elapsed. Empty dots = remaining. Progress calculated from local prescription record. Adapted from the "Uber ride tracking" pattern in UX spec. |
| — | QR Code | Encryption Architecture | Encodes: `{ patient_id, issued_at, expiry, ECDSA-P256 signature }`. No raw PHI ever encoded in QR. Patient name shown as screen label ONLY — not in QR data. |
| — | QR Expiry Timer | Session Security | Countdown displayed. Turns Warning Yellow in last 5 minutes. Auto-regenerates if app is in foreground within 5 min of expiry. |
| — | Refill Due Indicator | Prescription Journey | Calculated locally: (last_fill_date + days_supply) - today. Surfaced proactively on Home and Meds screens. |

> **RTL (WF-06):** All text aligns RIGHT. Back arrow (←) becomes right-pointing (→). Bottom tab order mirrors. Progress dots fill right-to-left. Quick action grid layout mirrors. QR code itself is direction-neutral (matrix code). Medical icons (💊, 🧪) do NOT flip — they are clinical, not directional.

---

## Cross-Cutting Reference Tables

### Offline Behavior by Screen

| Screen | Offline State | What Still Works |
|--------|--------------|------------------|
| WF-01 GP Dashboard | Banner: "Offline — queue from local cache" | Full queue view, tap to open encounters |
| WF-02 Charting | Sync indicator shows pending count | Full SOAP editing, Save & Sign (queued) |
| WF-03 Prescribing | Local drug-db ONNX model used | Drug search, all States 1–6 (State 6 if ONNX also fails) |
| WF-04 Pharmacy | Stale data warning shown | Queue view, Mark Dispensed (queued) |
| WF-05 Lab Portal | Orders from cache | Result entry (queued); submission on reconnect |
| WF-06 Health Passport | Fully offline-first by design | All features, QR uses local ECDSA key |

---

### Safety-Critical Element Checklist

| Rule | Implementation | Screens |
|------|---------------|---------|
| Allergies FIRST, in RED, never collapsed | Danger Red (#d03238) band, sorted position 0, no collapse control | WF-01, WF-02 |
| Drug interaction NEVER silently skipped | State 6 (check unavailable) shown on any failure; checkbox required | WF-03 |
| AI suggestions require physician gate | "AI DRAFT" label + 3-action panel; no auto-commit path exists | WF-02 |
| Tier 1 conflict blocks prescribing | Conflict banner hard-blocks Rx generation | WF-02 |
| Lab Portal: name + age only | "FirstName, Ageyo" enforced at API; no UI escape hatch | WF-05 |
| Stale data explicit warning | Warning Yellow banner; must be acknowledged before dispensing | WF-04 |
| Audit event on every PHI action | Save & Sign, Mark Dispensed, Override, Accept AI, Submit Results | WF-02, WF-03, WF-04, WF-05 |
| QR contains no raw PHI | QR encodes only patient_id + ECDSA signature | WF-06 |

---

### RTL Layout Summary

| Screen | Sidebar / Nav | Arrow Direction | Text Align | Medical Icons |
|--------|--------------|-----------------|------------|----------------|
| WF-01 GP Dashboard | Moves to RIGHT | Flip ← | Right | No flip |
| WF-02 Encounter | Columns swap (summary RIGHT, SOAP LEFT) | Flip ← | Right | No flip |
| WF-03 Prescribing | Panel slides from LEFT | Flip ← | Right | Drug icons: no flip |
| WF-04 Pharmacy | Queue RIGHT, Detail LEFT | Flip ← | Right | No flip |
| WF-05 Lab Portal | Orders RIGHT, Form LEFT | Flip ← | Right | Lab icons: no flip |
| WF-06 Health Passport | Mobile — tabs mirror | Flip ← | Right | No flip |

---

*End of Low-Fidelity Wireframes — v1.0 · Ultranos · 2026-04-28*
*Next: Hi-fidelity mockups incorporating design tokens from ux-design-specification.md*
