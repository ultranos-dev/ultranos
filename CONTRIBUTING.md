# Contributing to Ultranos

## RTL Snapshot Testing

Ultranos uses Playwright visual regression testing to ensure all patient-facing UIs render correctly in both LTR and RTL modes.

### Running RTL Tests Locally

```bash
# Install Playwright browsers (first time only)
npx playwright install --with-deps chromium

# Run all RTL snapshot tests
pnpm rtl:test

# View the HTML report after a test run
pnpm rtl:report
```

### Updating Snapshot Baselines

Snapshot baselines are committed to the repository under `tests/rtl/__snapshots__/`. They must be updated intentionally — never auto-updated.

**When to update:**
- After an intentional UI change that affects RTL layout
- After adding new components or pages
- After modifying shared styling (Tailwind config, tokens, etc.)

**How to update:**

```bash
# Regenerate all RTL snapshot baselines
pnpm rtl:update-snapshots

# Review the changes visually
pnpm rtl:report

# Commit ONLY snapshot updates in a dedicated commit
git add tests/rtl/__snapshots__/
git commit -m "chore: update RTL snapshot baselines [rtl-snapshots]"
```

**Rules:**
1. Snapshot updates MUST be in a dedicated commit (separate from code changes)
2. The commit message MUST contain `[rtl-snapshots]` for traceability
3. Review the visual diff report before committing — verify changes are intentional
4. Never bulk-update snapshots to "fix" CI without understanding what changed

### CI Pipeline

The RTL validation workflow (`.github/workflows/rtl-validation.yml`) runs on every PR that modifies `.tsx`, `.css`, or Tailwind config files. It:

1. Lints for physical CSS properties (must use logical equivalents)
2. Runs Playwright RTL snapshot tests against committed baselines
3. On failure: uploads a visual diff report as a GitHub Actions artifact
4. On failure: posts a PR comment with instructions

### Physical CSS Properties

The `@ultranos/rtl/no-physical-css` ESLint rule enforces logical CSS properties. Physical directional properties are banned:

| Banned (Physical) | Use Instead (Logical) |
|---|---|
| `ml-*`, `mr-*` | `ms-*`, `me-*` |
| `pl-*`, `pr-*` | `ps-*`, `pe-*` |
| `left-*`, `right-*` | `start-*`, `end-*` |
| `text-left`, `text-right` | `text-start`, `text-end` |
| `marginLeft`, `marginRight` | `marginInlineStart`, `marginInlineEnd` |
| `paddingLeft`, `paddingRight` | `paddingInlineStart`, `paddingInlineEnd` |
| `left`, `right` (positioning) | `insetInlineStart`, `insetInlineEnd` |
| `textAlign: 'left'/'right'` | `textAlign: 'start'/'end'` |

### Icon Mirroring

Use the `DirectionalIcon` component from `@ultranos/ui-kit` for all icons:

- **Navigation icons** (`category="navigation"`): Mirror in RTL (arrows, chevrons, back buttons)
- **Medical icons** (`category="medical"`): Never mirror (pill, stethoscope, syringe)
- **Neutral icons** (default): Never mirror
