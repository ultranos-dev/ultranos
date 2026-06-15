# Noto Kufi Arabic Font Substitution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Noto Naskh Arabic with Noto Kufi Arabic as the `serif-ar` font (formal/clinical content) across all 4 web PWA apps and the shared ui-kit, leaving Noto Sans Arabic (UI text) untouched.

**Architecture:** The ui-kit is the canonical source — `packages/ui-kit/src/styles/fonts-arabic.css` and `packages/ui-kit/src/tokens.{css,ts}` are updated first. The 3 self-hosted PWA apps (`opd-lite`, `lab-lite`, `pharmacy-lite`) have their `public/fonts-arabic.css` synced to match; their font files go into `public/fonts/`. The `admin-portal` loads Arabic fonts from Google Fonts CDN via a `@import` in its `public/fonts-arabic.css` and is updated separately.

**Tech Stack:** WOFF2 font format, Google Fonts CSS2 API (for CDN + download source), Next.js 15 PWAs, Tailwind CSS, shared ui-kit (`packages/ui-kit`), Vitest tests.

---

## Files Modified / Created

| File | Action |
|------|--------|
| `packages/ui-kit/public/fonts/NotoKufiArabic-Regular.woff2` | Create (downloaded) |
| `packages/ui-kit/public/fonts/NotoKufiArabic-Bold.woff2` | Create (downloaded) |
| `apps/opd-lite/public/fonts/NotoKufiArabic-Regular.woff2` | Create (copied) |
| `apps/opd-lite/public/fonts/NotoKufiArabic-Bold.woff2` | Create (copied) |
| `apps/lab-lite/public/fonts/NotoKufiArabic-Regular.woff2` | Create (copied) |
| `apps/lab-lite/public/fonts/NotoKufiArabic-Bold.woff2` | Create (copied) |
| `apps/pharmacy-lite/public/fonts/NotoKufiArabic-Regular.woff2` | Create (copied) |
| `apps/pharmacy-lite/public/fonts/NotoKufiArabic-Bold.woff2` | Create (copied) |
| `apps/admin-portal/public/fonts/NotoKufiArabic-Regular.woff2` | Create (copied) |
| `apps/admin-portal/public/fonts/NotoKufiArabic-Bold.woff2` | Create (copied) |
| `packages/ui-kit/src/styles/fonts-arabic.css` | Modify — swap Naskh @font-face → Kufi |
| `packages/ui-kit/src/tokens.css` | Modify — update `--font-family-serif-ar` |
| `packages/ui-kit/src/tokens.ts` | Modify — update `serif-ar` + `arabicFontFiles` |
| `packages/ui-kit/src/__tests__/arabic-typography.test.ts` | Modify — update assertions |
| `apps/opd-lite/public/fonts-arabic.css` | Modify — swap Naskh → Kufi |
| `apps/lab-lite/public/fonts-arabic.css` | Modify — swap Naskh → Kufi |
| `apps/pharmacy-lite/public/fonts-arabic.css` | Modify — swap Naskh → Kufi |
| `apps/admin-portal/public/fonts-arabic.css` | Modify — update CDN import URL |

---

## Task 1: Download Noto Kufi Arabic WOFF2 Files

**Files:**
- Create: `packages/ui-kit/public/fonts/NotoKufiArabic-Regular.woff2`
- Create: `packages/ui-kit/public/fonts/NotoKufiArabic-Bold.woff2`

- [ ] **Step 1.1: Fetch Google Fonts CSS to find the woff2 download URLs**

```bash
curl -sH "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;700&display=swap" \
  | grep -o 'https://fonts.gstatic.com[^)]*'
```

Expected output: Two `https://fonts.gstatic.com/s/notokufiarabic/...` URLs — one for weight 400, one for 700. The CSS is ordered by weight ascending, so the first URL is Regular (400) and the second is Bold (700).

- [ ] **Step 1.2: Download Regular (weight 400) and rename**

Replace `<REGULAR_URL>` with the first URL from Step 1.1:

```bash
curl -sL "<REGULAR_URL>" \
  -o "packages/ui-kit/public/fonts/NotoKufiArabic-Regular.woff2"
```

- [ ] **Step 1.3: Download Bold (weight 700) and rename**

Replace `<BOLD_URL>` with the second URL from Step 1.1:

```bash
curl -sL "<BOLD_URL>" \
  -o "packages/ui-kit/public/fonts/NotoKufiArabic-Bold.woff2"
```

- [ ] **Step 1.4: Verify both files downloaded successfully**

```bash
ls -lh packages/ui-kit/public/fonts/NotoKufiArabic-*.woff2
file packages/ui-kit/public/fonts/NotoKufiArabic-Regular.woff2
file packages/ui-kit/public/fonts/NotoKufiArabic-Bold.woff2
```

Expected: Two files each > 50 KB; `file` reports `Web Open Font Format (Version 2)`.

---

## Task 2: Distribute Font Files to All 4 PWA Apps

**Files:**
- Create: `apps/opd-lite/public/fonts/NotoKufiArabic-Regular.woff2`
- Create: `apps/opd-lite/public/fonts/NotoKufiArabic-Bold.woff2`
- Create: `apps/lab-lite/public/fonts/NotoKufiArabic-Regular.woff2`
- Create: `apps/lab-lite/public/fonts/NotoKufiArabic-Bold.woff2`
- Create: `apps/pharmacy-lite/public/fonts/NotoKufiArabic-Regular.woff2`
- Create: `apps/pharmacy-lite/public/fonts/NotoKufiArabic-Bold.woff2`
- Create: `apps/admin-portal/public/fonts/NotoKufiArabic-Regular.woff2`
- Create: `apps/admin-portal/public/fonts/NotoKufiArabic-Bold.woff2`

- [ ] **Step 2.1: Copy font files to all app public/fonts directories**

```bash
for APP in apps/opd-lite apps/lab-lite apps/pharmacy-lite apps/admin-portal; do
  cp packages/ui-kit/public/fonts/NotoKufiArabic-Regular.woff2 "$APP/public/fonts/"
  cp packages/ui-kit/public/fonts/NotoKufiArabic-Bold.woff2 "$APP/public/fonts/"
done
```

- [ ] **Step 2.2: Verify all copies landed**

```bash
find apps/*/public/fonts -name "NotoKufiArabic-*.woff2" | sort
```

Expected: 8 lines (2 files × 4 apps).

---

## Task 3: Update the ui-kit Canonical fonts-arabic.css

**Files:**
- Modify: `packages/ui-kit/src/styles/fonts-arabic.css`

- [ ] **Step 3.1: Update the tests first (TDD — write the failing test)**

Open `packages/ui-kit/src/__tests__/arabic-typography.test.ts` and change lines 11–12 and 85–86:

```typescript
// Line 11–12: was "Noto Naskh Arabic"
  it('defines serif-ar font stack with Noto Kufi Arabic', () => {
    expect(typography.fontFamily['serif-ar']).toContain('Noto Kufi Arabic')
  })
```

```typescript
// Line 58–61: was "Noto Naskh Arabic in 2 weights"
  it('includes Noto Kufi Arabic in 2 weights (400, 700)', () => {
    expect(arabicFontFiles).toContain('NotoKufiArabic-Regular.woff2')
    expect(arabicFontFiles).toContain('NotoKufiArabic-Bold.woff2')
  })
```

```typescript
// Line 85–87: was "Noto Naskh Arabic"
  it('declares Noto Kufi Arabic @font-face rules', () => {
    expect(css).toContain("font-family: 'Noto Kufi Arabic'")
  })
```

- [ ] **Step 3.2: Run tests to confirm they fail (red phase)**

```bash
pnpm --filter @ultranos/ui-kit test --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|✓|✗|×|serif-ar|Naskh|Kufi)"
```

Expected: 3 failures — `defines serif-ar font stack with Noto Kufi Arabic`, `includes Noto Kufi Arabic in 2 weights`, `declares Noto Kufi Arabic @font-face rules`.

- [ ] **Step 3.3: Replace Noto Naskh @font-face blocks with Noto Kufi Arabic in ui-kit CSS**

Replace the entire Naskh section (lines 41–61) of `packages/ui-kit/src/styles/fonts-arabic.css`:

```css
/* ══════════════════════════════════════════════════════════════
   Noto Kufi Arabic — formal/clinical content (reports, notes)
   ══════════════════════════════════════════════════════════════ */

@font-face {
  font-family: 'Noto Kufi Arabic';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/NotoKufiArabic-Regular.woff2') format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+0000-007F;
}

@font-face {
  font-family: 'Noto Kufi Arabic';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/NotoKufiArabic-Bold.woff2') format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+0000-007F;
}
```

---

## Task 4: Update ui-kit Tokens (tokens.css + tokens.ts)

**Files:**
- Modify: `packages/ui-kit/src/tokens.css` (line 123)
- Modify: `packages/ui-kit/src/tokens.ts` (lines 11, 118–124)

- [ ] **Step 4.1: Update `--font-family-serif-ar` in tokens.css**

In `packages/ui-kit/src/tokens.css`, change line 123:

```css
/* Before */
  --font-family-serif-ar: 'Noto Naskh Arabic', 'Traditional Arabic', 'Simplified Arabic', serif;

/* After */
  --font-family-serif-ar: 'Noto Kufi Arabic', 'Traditional Arabic', 'Simplified Arabic', serif;
```

- [ ] **Step 4.2: Update `serif-ar` font stack and `arabicFontFiles` in tokens.ts**

In `packages/ui-kit/src/tokens.ts`, change line 11:

```typescript
/* Before */
    'serif-ar': "'Noto Naskh Arabic', 'Traditional Arabic', 'Simplified Arabic', serif",

/* After */
    'serif-ar': "'Noto Kufi Arabic', 'Traditional Arabic', 'Simplified Arabic', serif",
```

Change lines 118–124 (`arabicFontFiles`):

```typescript
/** Arabic font file names for self-hosted loading */
export const arabicFontFiles = [
  'NotoSansArabic-Regular.woff2',
  'NotoSansArabic-Medium.woff2',
  'NotoSansArabic-Bold.woff2',
  'NotoKufiArabic-Regular.woff2',
  'NotoKufiArabic-Bold.woff2',
] as const
```

---

## Task 5: Run Tests — Green Phase

**Files:**
- Test: `packages/ui-kit/src/__tests__/arabic-typography.test.ts`

- [ ] **Step 5.1: Run the ui-kit test suite**

```bash
pnpm --filter @ultranos/ui-kit test --reporter=verbose
```

Expected: All tests pass. The previously failing 3 tests should now be green. The `font files exist in packages/ui-kit/public/fonts/` test passes because we placed the files in Task 1.

- [ ] **Step 5.2: Commit the ui-kit changes**

```bash
git add \
  packages/ui-kit/public/fonts/NotoKufiArabic-Regular.woff2 \
  packages/ui-kit/public/fonts/NotoKufiArabic-Bold.woff2 \
  packages/ui-kit/src/styles/fonts-arabic.css \
  packages/ui-kit/src/tokens.css \
  packages/ui-kit/src/tokens.ts \
  packages/ui-kit/src/__tests__/arabic-typography.test.ts
git commit -m "feat(ui-kit): swap Noto Naskh Arabic → Noto Kufi Arabic as serif-ar font"
```

---

## Task 6: Update App-Level fonts-arabic.css (3 Self-Hosted PWAs)

These 3 files mirror the ui-kit source but use weight-range syntax (e.g., `100 500`) instead of individual weights, and don't include `U+0000-007F` (slightly older format). Update only the Naskh section.

**Files:**
- Modify: `apps/opd-lite/public/fonts-arabic.css`
- Modify: `apps/lab-lite/public/fonts-arabic.css`
- Modify: `apps/pharmacy-lite/public/fonts-arabic.css`

- [ ] **Step 6.1: Replace the Naskh section in `apps/opd-lite/public/fonts-arabic.css`**

Replace lines 41–61 (the `Noto Naskh Arabic` section) with:

```css
/* ══════════════════════════════════════════════════════════════
   Noto Kufi Arabic — formal/clinical content (reports, notes)
   ══════════════════════════════════════════════════════════════ */

@font-face {
  font-family: 'Noto Kufi Arabic';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/NotoKufiArabic-Regular.woff2') format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF;
}

@font-face {
  font-family: 'Noto Kufi Arabic';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/NotoKufiArabic-Bold.woff2') format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF;
}
```

- [ ] **Step 6.2: Apply the same change to `apps/lab-lite/public/fonts-arabic.css`**

Identical replacement of the Naskh section (lines 41–61) with the same Kufi block above.

- [ ] **Step 6.3: Apply the same change to `apps/pharmacy-lite/public/fonts-arabic.css`**

Identical replacement of the Naskh section (lines 41–61) with the same Kufi block above.

---

## Task 7: Update admin-portal CDN Import

The admin-portal uses Google Fonts CDN instead of self-hosted files. Its `public/fonts-arabic.css` currently imports both `Noto+Sans+Arabic` and `Noto+Naskh+Arabic`.

**Files:**
- Modify: `apps/admin-portal/public/fonts-arabic.css`

- [ ] **Step 7.1: Update the Google Fonts import URL**

Replace the entire content of `apps/admin-portal/public/fonts-arabic.css`:

```css
/*
 * Arabic font loading for admin-portal (online-only — uses Google Fonts CDN).
 * Loaded conditionally only for RTL locales (ar, prs, ps).
 * Noto Sans Arabic — UI text (body, labels, buttons)
 * Noto Kufi Arabic — formal/clinical content (reports, prescriptions)
 */
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@100..900&family=Noto+Kufi+Arabic:wght@400;700&display=swap');
```

---

## Task 8: Commit App Changes and Verify

- [ ] **Step 8.1: Stage and commit all app-level changes**

```bash
git add \
  apps/opd-lite/public/fonts/NotoKufiArabic-Regular.woff2 \
  apps/opd-lite/public/fonts/NotoKufiArabic-Bold.woff2 \
  apps/opd-lite/public/fonts-arabic.css \
  apps/lab-lite/public/fonts/NotoKufiArabic-Regular.woff2 \
  apps/lab-lite/public/fonts/NotoKufiArabic-Bold.woff2 \
  apps/lab-lite/public/fonts-arabic.css \
  apps/pharmacy-lite/public/fonts/NotoKufiArabic-Regular.woff2 \
  apps/pharmacy-lite/public/fonts/NotoKufiArabic-Bold.woff2 \
  apps/pharmacy-lite/public/fonts-arabic.css \
  apps/admin-portal/public/fonts/NotoKufiArabic-Regular.woff2 \
  apps/admin-portal/public/fonts/NotoKufiArabic-Bold.woff2 \
  apps/admin-portal/public/fonts-arabic.css
git commit -m "feat(apps): deploy Noto Kufi Arabic to all 4 PWA apps (swap from Noto Naskh Arabic)"
```

- [ ] **Step 8.2: Verify no Naskh references remain in font CSS files**

```bash
grep -r "Naskh" \
  apps/opd-lite/public/fonts-arabic.css \
  apps/lab-lite/public/fonts-arabic.css \
  apps/pharmacy-lite/public/fonts-arabic.css \
  apps/admin-portal/public/fonts-arabic.css \
  packages/ui-kit/src/styles/fonts-arabic.css \
  packages/ui-kit/src/tokens.css \
  packages/ui-kit/src/tokens.ts
```

Expected: No output (zero matches).

- [ ] **Step 8.3: Verify Kufi references are present in all expected files**

```bash
grep -r "Kufi" \
  apps/opd-lite/public/fonts-arabic.css \
  apps/lab-lite/public/fonts-arabic.css \
  apps/pharmacy-lite/public/fonts-arabic.css \
  apps/admin-portal/public/fonts-arabic.css \
  packages/ui-kit/src/styles/fonts-arabic.css \
  packages/ui-kit/src/tokens.css \
  packages/ui-kit/src/tokens.ts
```

Expected: 7 files each contain at least one `Kufi` match.

- [ ] **Step 8.4: Run full ui-kit test suite one final time**

```bash
pnpm --filter @ultranos/ui-kit test
```

Expected: All tests pass.

---

## Reverting (if Kufi is rejected after visual review)

To revert the entire change cleanly:

```bash
# Undo both commits
git revert HEAD HEAD~1 --no-edit

# Or if you prefer a single hard reset (destructive):
git reset --hard HEAD~2
```

The old `NotoNaskhArabic-*.woff2` files are still present in all `public/fonts/` directories (we never deleted them), so no font files need to be restored.
