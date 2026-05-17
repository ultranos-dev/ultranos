# Story 21.4a: PWA Security Headers via next.config

Status: done

## Story

As a security officer,
I want all PWA spoke apps to serve security headers,
so that the browser enforces Content Security Policy and transport security.

## Acceptance Criteria

1. **Given** OPD Lite, Pharmacy Lite, and Lab Lite `next.config.js` files, **When** a page is served, **Then** the following headers are included: `Content-Security-Policy` with restrictive `default-src`, `script-src` (self + nonce), `connect-src` (self + Hub API origin), `img-src`, `font-src`
2. **Given** any PWA page response, **Then** `Strict-Transport-Security: max-age=31536000; includeSubDomains` is included
3. **Given** any PWA page response, **Then** `X-Content-Type-Options: nosniff` is included
4. **Given** any PWA page response, **Then** `X-Frame-Options: DENY` is included
5. **Given** a CSP violation in the browser, **When** the violation occurs, **Then** it is reported to a configurable `report-uri` endpoint

## Tasks / Subtasks

- [x] Task 1: Create shared security headers utility (AC: #1, #2, #3, #4, #5)
  - [x] 1.1 Create `packages/ui-kit/src/security-headers.ts` (or inline per app if package build is complex) — export a function `getSecurityHeaders(config: { hubApiOrigin: string; reportUri?: string }): Header[]` that returns the Next.js headers config array
  - [x] 1.2 Define the CSP directive string:
    ```
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    connect-src 'self' ${hubApiOrigin};
    img-src 'self' data: blob:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    report-uri ${reportUri};
    ```
  - [x] 1.3 Note: `'unsafe-inline'` for `style-src` is needed because Tailwind CSS injects inline styles. Nonce-based `script-src` requires Next.js middleware to inject nonces — use `'self'` only (no inline scripts) for initial implementation.
  - [x] 1.4 Include all standard security headers: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-DNS-Prefetch-Control

- [x] Task 2: Add headers to OPD Lite next.config.js (AC: #1–#5)
  - [x] 2.1 In `apps/opd-lite/next.config.js`, add `headers()` async function returning security headers for `source: '/(.*)'`
  - [x] 2.2 Hub API origin from `process.env.NEXT_PUBLIC_HUB_API_URL` or fallback to `http://localhost:3001`
  - [x] 2.3 Report URI from `process.env.CSP_REPORT_URI` or omit the directive
  - [x] 2.4 Ensure headers work correctly WITH the Serwist PWA wrapper (headers function must be in the base config object before `withSerwist` wraps it)

- [x] Task 3: Add headers to Pharmacy Lite next.config.js (AC: #1–#5)
  - [x] 3.1 Same pattern as Task 2, applied to `apps/pharmacy-lite/next.config.js`
  - [x] 3.2 Same env vars and fallbacks

- [x] Task 4: Add headers to Lab Lite next.config.js (AC: #1–#5)
  - [x] 4.1 Same pattern as Task 2, applied to `apps/lab-lite/next.config.js`
  - [x] 4.2 Same env vars and fallbacks

- [x] Task 5: PWA Service Worker CSP compatibility (AC: #1)
  - [x] 5.1 Verify that the CSP `connect-src` allows the service worker to fetch from the Hub API and cache resources
  - [x] 5.2 Verify `worker-src 'self'` is included (for service worker registration) — add to CSP if missing
  - [x] 5.3 Verify `manifest-src 'self'` is included (for PWA manifest) — add to CSP if missing

- [x] Task 6: Tests (AC: all)
  - [x] 6.1 Unit test `getSecurityHeaders()` returns all required headers with correct values
  - [x] 6.2 For each app, verify `next.config.js` loads without error (import and check headers function exists)
  - [x] 6.3 Verify CSP string contains correct directives for each PWA's specific Hub API origin

### Review Findings

- [x] [Review][Decision] `script-src 'self'` blocks Next.js inline scripts — resolved: switched to `Content-Security-Policy-Report-Only` until nonce middleware is implemented
- [x] [Review][Patch] CSP injection via unsanitized `hubApiOrigin` — fixed: added `sanitizeOrigin()` that rejects semicolons/whitespace and extracts origin via `new URL()`
- [x] [Review][Patch] `hubApiOrigin` with URL path breaks `connect-src` — fixed: `sanitizeOrigin()` extracts origin (scheme+host+port), strips path
- [x] [Review][Patch] Fallback port mismatch — fixed: all three next.config.js fallbacks changed from `:3001` to `:3000`
- [x] [Review][Patch] `X-DNS-Prefetch-Control: on` is anti-hardening — fixed: changed to `off`
- [x] [Review][Defer] Missing `upgrade-insecure-requests` CSP directive — deferred, not in current AC scope
- [x] [Review][Defer] `report-uri` deprecated in CSP Level 3, `report-to` + `Reporting-Endpoints` header missing — deferred, report-uri still functional
- [x] [Review][Defer] No `Permissions-Policy` header to restrict device API access — deferred, not in current AC scope
- [x] [Review][Defer] `worker-src 'self'` may block Serwist blob URLs in dev mode — deferred, needs runtime verification

## Dev Notes

### Architecture & Patterns

- **All three PWA configs follow the same pattern.** Each uses `withSerwistInit` from `@serwist/next` wrapping a base config. The `headers()` function goes in the base config BEFORE the Serwist wrapper.
- **CSP nonce challenge:** Full nonce-based CSP requires Next.js middleware to generate a nonce per request and inject it into both the CSP header and script tags. This is complex with App Router. Initial implementation uses `'self'` for `script-src` without nonces. If inline scripts are needed later, nonce support can be added as a follow-up.
- **`unsafe-inline` for styles:** Tailwind CSS and many UI libraries inject inline styles. `'unsafe-inline'` for `style-src` is a pragmatic choice. Nonce-based style loading is impractical with Tailwind.
- **Shared vs duplicated:** Creating a shared utility in `packages/ui-kit` is cleaner but adds a build dependency. If the utility is simple (just returns a header array), consider inlining it in each `next.config.js` to avoid package build complexity. Dev agent should judge based on current build tooling.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `apps/opd-lite/next.config.js` | Add `headers()` function with security headers + CSP |
| `apps/pharmacy-lite/next.config.js` | Add `headers()` function with security headers + CSP |
| `apps/lab-lite/next.config.js` | Add `headers()` function with security headers + CSP |
| `.env.example` | Add `CSP_REPORT_URI` |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `packages/ui-kit/src/security-headers.ts` (optional) | Shared security headers generator |

### References

- [Source: apps/opd-lite/next.config.js] — current OPD Lite config (no headers, Serwist wrapper)
- [Source: apps/pharmacy-lite/next.config.js] — current Pharmacy Lite config
- [Source: apps/lab-lite/next.config.js] — current Lab Lite config
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-21] — Story 21.4a acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
N/A — no debug issues encountered.

### Completion Notes List
- Created shared `getSecurityHeaders()` utility in `packages/ui-kit/src/security-headers.ts` with full CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and X-DNS-Prefetch-Control headers.
- CSP includes `worker-src 'self'` and `manifest-src 'self'` for PWA service worker and manifest compatibility.
- CSP `report-uri` directive is conditionally included only when `CSP_REPORT_URI` env var is set.
- `headers()` function placed in base config before `withSerwist` wrapper in all three apps — Serwist passes through headers correctly.
- 15 unit + integration tests added (11 unit, 4 integration) — all pass with zero regressions across the full 121-test ui-kit suite.
- `.env.example` files updated for all three apps with `CSP_REPORT_URI`.

### Change Log
- 2026-05-13: Story implemented — shared security headers utility + integration into all 3 PWA configs.

### File List
- `packages/ui-kit/src/security-headers.ts` (NEW)
- `packages/ui-kit/src/index.ts` (MODIFIED — added export)
- `packages/ui-kit/src/__tests__/security-headers.test.ts` (NEW)
- `packages/ui-kit/src/__tests__/security-headers-integration.test.ts` (NEW)
- `apps/opd-lite/next.config.js` (MODIFIED — added headers)
- `apps/pharmacy-lite/next.config.js` (MODIFIED — added headers)
- `apps/lab-lite/next.config.js` (MODIFIED — added headers)
- `apps/opd-lite/.env.example` (NEW)
- `apps/pharmacy-lite/.env.example` (MODIFIED — added CSP_REPORT_URI)
- `apps/lab-lite/.env.example` (MODIFIED — added CSP_REPORT_URI)
