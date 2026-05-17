# Story 17.4: Lab Lite In-App Notification Center

Status: done

## Story

As a lab technician,
I want to see system notifications within the app,
so that I know about upload confirmations, processing results, and system alerts.

## Acceptance Criteria

1. **Given** the Lab Lite header/navbar, **when** the NotificationBell icon is clicked, **then** a notification panel opens showing recent notifications ordered newest-first
2. **And** notification types include: UPLOAD_CONFIRMED (upload successfully processed by Hub), UPLOAD_FAILED (Hub rejected the upload), SYSTEM_MAINTENANCE, LAB_STATUS_CHANGE (lab approval/suspension)
3. **And** unread notifications show a distinct visual indicator (bold text, dot marker)
4. **And** clicking a notification marks it as acknowledged via `notification.acknowledge()` on the Hub API
5. **And** the bell icon shows an unread count badge that polls every 30 seconds via `notification.unreadCount`
6. **And** the panel is dismissible by clicking outside or pressing Escape

## Tasks / Subtasks

- [x] Task 1: Add notification bell to the app header (AC: #1, #5)
  - [x] 1.1 Create `apps/lab-lite/src/components/notifications/NotificationBell.tsx` — bell icon SVG with unread count badge
  - [x] 1.2 Add to header in `layout.tsx` (or page-level if layout is server component)
  - [x] 1.3 Poll `notification.unreadCount` every 30 seconds via `setInterval`
  - [x] 1.4 Display count badge (red circle with number) when count > 0

- [x] Task 2: Add tRPC client functions for notifications (AC: #4, #5)
  - [x] 2.1 Add `getUnreadCount(token)` to `apps/lab-lite/src/lib/trpc.ts` — calls `notification.unreadCount`
  - [x] 2.2 Add `listNotifications(token)` to `apps/lab-lite/src/lib/trpc.ts` — calls `notification.list`
  - [x] 2.3 Add `acknowledgeNotification(notificationId, token)` to `apps/lab-lite/src/lib/trpc.ts` — calls `notification.acknowledge`

- [x] Task 3: Build notification panel (AC: #1, #2, #3, #6)
  - [x] 3.1 Create `apps/lab-lite/src/components/notifications/NotificationPanel.tsx` — dropdown panel anchored to bell
  - [x] 3.2 Fetch notifications via `listNotifications()` when panel opens
  - [x] 3.3 Render notification items with type-specific icons and messages
  - [x] 3.4 Unread items: bold text + blue dot indicator; read items: normal weight, no dot
  - [x] 3.5 Click outside or Escape key closes panel (use `useEffect` with document click listener)

- [x] Task 4: Notification item rendering (AC: #2, #3, #4)
  - [x] 4.1 Create `apps/lab-lite/src/components/notifications/NotificationItem.tsx`
  - [x] 4.2 UPLOAD_CONFIRMED: green check icon, "Result uploaded successfully — {testCategory}"
  - [x] 4.3 UPLOAD_FAILED: red X icon, "Upload failed — {testCategory}. Please retry."
  - [x] 4.4 SYSTEM_MAINTENANCE: wrench icon, "Scheduled maintenance — {message}"
  - [x] 4.5 LAB_STATUS_CHANGE: shield icon, "Lab status changed to {status}"
  - [x] 4.6 On click: call `acknowledgeNotification(id, token)` → update UI to read state

- [x] Task 5: Tests (AC: all)
  - [x] 5.1 Bell icon renders with correct unread count
  - [x] 5.2 Panel opens on bell click and closes on outside click / Escape
  - [x] 5.3 Notifications render with correct type-specific icons and messages
  - [x] 5.4 Unread notifications have bold styling and dot indicator
  - [x] 5.5 Clicking notification calls acknowledge endpoint
  - [x] 5.6 Polling interval fires every 30 seconds

## Dev Notes

### Hub API Notification Endpoints (Already Implemented)

These endpoints exist in `apps/hub-api/src/trpc/routers/notification.ts`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `notification.list` | query | Returns up to 50 notifications for authenticated user, newest first. Auto-delivers QUEUED→SENT. |
| `notification.acknowledge` | mutation | Marks a notification as ACKNOWLEDGED. Verifies ownership. |
| `notification.unreadCount` | query | Fast count of QUEUED + SENT (unread) notifications. |

**Notification payload shape** (from Hub API):
```typescript
{
  id: string           // UUID
  type: string         // LAB_RESULT_AVAILABLE, LAB_RESULT_ESCALATION, etc.
  payload: {           // Parsed JSON, non-PHI only
    testCategory: string
    labName: string
    uploadTimestamp: string
    diagnosticReportId: string
    loincCode?: string
  }
  status: string       // QUEUED, SENT, ACKNOWLEDGED
  createdAt: string
  deliveredAt: string | null
  acknowledgedAt: string | null
}
```

### Notification Type Mapping

The Hub API uses types like `LAB_RESULT_AVAILABLE`. Map to Lab Lite display types:

| Hub API Type | Display As | Icon | Message Template |
|-------------|-----------|------|-----------------|
| `LAB_RESULT_AVAILABLE` | UPLOAD_CONFIRMED | Green check | "Result uploaded — {testCategory}" |
| `LAB_RESULT_ESCALATION` | UPLOAD_CONFIRMED | Yellow warning | "Result awaiting review — {testCategory}" |
| `SYSTEM_*` | SYSTEM_MAINTENANCE | Wrench | "{payload.message}" |
| `LAB_STATUS_*` | LAB_STATUS_CHANGE | Shield | "Lab status: {status}" |

For UPLOAD_FAILED: the Hub doesn't currently dispatch failure notifications to the lab technician (only to the clinician). If the lab technician's own upload fails, that's visible via the local queue status (failed items in history). Consider whether UPLOAD_FAILED notifications need a new dispatch path or if local queue status suffices.

**Recommendation:** For MVP, only show notifications the Hub actually sends to LAB_TECH recipients. UPLOAD_FAILED is a local concern (visible in queue). Don't invent notification types that don't exist in the Hub.

### Polling vs WebSocket

Per Epic 12 decision: 30-second short-polling meets the 60s SLA. No WebSocket needed. Use `setInterval` with cleanup on unmount.

### Panel Positioning

Anchor the panel below the bell icon in the header. Use absolute positioning with a max-height and overflow-y scroll. Panel width: ~320px. Max 10 items visible, scroll for more.

### tRPC Client Pattern

Follow the existing raw fetch pattern in `apps/lab-lite/src/lib/trpc.ts`:
```typescript
export async function getUnreadCount(token: string): Promise<number> {
  const res = await fetch(`${getHubApiUrl()}/notification.unreadCount`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  return body.result.data.json.count
}
```

### Header Modification

The header in `layout.tsx` currently has only the title. Add the notification bell to the right side of the header. Since `layout.tsx` is a server component, the bell must be a client component imported into it.

If Story 17.3 already adds navigation links to the header, the notification bell goes in the same header bar on the right side.

### Project Structure Notes

**New files:**
- `apps/lab-lite/src/components/notifications/NotificationBell.tsx`
- `apps/lab-lite/src/components/notifications/NotificationPanel.tsx`
- `apps/lab-lite/src/components/notifications/NotificationItem.tsx`
- `apps/lab-lite/src/__tests__/notifications.test.tsx`

**Modified files:**
- `apps/lab-lite/src/app/layout.tsx` — add NotificationBell to header
- `apps/lab-lite/src/lib/trpc.ts` — add `getUnreadCount()`, `listNotifications()`, `acknowledgeNotification()`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-17.4] — Story acceptance criteria
- [Source: _bmad-output/planning-artifacts/gap-analysis-report.md#LAB-G05] — No notification system in app (HIGH)
- [Source: apps/hub-api/src/trpc/routers/notification.ts] — Hub API notification endpoints (list, acknowledge, unreadCount)
- [Source: apps/opd-lite/src/components/NotificationPanel.tsx] — OPD Lite notification panel (reference implementation)
- [Source: apps/patient-lite-mobile/src/components/NotificationIndicator.tsx] — Patient notification indicator (reference)

### Previous Epic Intelligence (from Epic 12)

- Story 12.4 built the notification infrastructure: dispatch on upload, 30s polling, acknowledge endpoint
- OPD Lite has a `NotificationPanel.tsx` — review it for pattern reference but don't import (different app)
- Notification payloads are non-PHI: `{ testCategory, labName, uploadTimestamp, diagnosticReportId }`
- `notification.list` auto-transitions QUEUED→SENT on fetch (delivery tracking)
- Stale closure fix from 12.4 review: compute count inside functional state updater, not from captured closure

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No debug issues encountered. All 14 tests passed on first run. Pre-existing failure in `patient-verify-scanner.test.tsx` confirmed unrelated to this story.

### Completion Notes List

- Added 3 notification API functions (`getUnreadCount`, `listNotifications`, `acknowledgeNotification`) to `trpc.ts` following the existing raw fetch pattern with explicit token parameter
- Created `NotificationBell` component with 30s polling interval, unread count badge (capped at 99+), and SVG bell icon
- Created `NotificationPanel` dropdown with click-outside and Escape key dismissal, loading/empty states
- Created `NotificationItemRow` with type-specific icons (green check for LAB_RESULT_AVAILABLE, yellow warning for LAB_RESULT_ESCALATION, shield for LAB_STATUS_*, wrench for system), bold+dot for unread, acknowledge on click
- Integrated NotificationBell into layout.tsx header, right side next to nav links
- Followed Hub API notification type mapping from Dev Notes (LAB_RESULT_AVAILABLE, LAB_RESULT_ESCALATION, SYSTEM_*, LAB_STATUS_*)
- Per Dev Notes recommendation: UPLOAD_FAILED not implemented as notification type (local queue concern, not Hub-dispatched)
- Auth token sourced via Supabase client (`getSupabaseBrowserClient().auth.getSession()`) matching established Lab Lite pattern
- 14 tests covering all 6 ACs: bell rendering, badge counts, polling interval, panel open/close, notification type rendering, unread styling, acknowledge calls

### Review Findings

- [x] [Review][Decision] **D1: Acknowledge offline resilience** — Resolved: Option B (optimistic UI). State updates immediately on click; API call fires in background. If offline, notification reappears as unread on next panel open. [NotificationPanel.tsx:79-98]
- [x] [Review][Patch] **P1: Click-outside handler listener leak** — Dismissed on re-review: actual code correctly defines handler outside setTimeout and removes it in cleanup. Finding was based on truncated diff. [NotificationPanel.tsx:51-67]
- [x] [Review][Patch] **P2: No error state in notification panel** — Fixed: added `error` state. Panel now shows "Unable to load notifications" amber banner when API fails, distinct from empty state. Test added. [NotificationPanel.tsx]
- [x] [Review][Patch] **P3: Bell visible to unauthenticated users** — Fixed: added `hasSession` state to NotificationBell. Renders null when no session exists. [NotificationBell.tsx]
- [x] [Review][Defer] **W1: Stale token / frozen badge after JWT expiry** [NotificationBell.tsx:23-28] — deferred, pre-existing Supabase auth pattern used across app
- [x] [Review][Defer] **W2: Background tab polling wastes bandwidth** [NotificationBell.tsx:36-39] — deferred, pre-existing pattern; optimization for future
- [x] [Review][Defer] **W3: Double-click race on acknowledge** [NotificationItem.tsx:109] — deferred, Hub API handles idempotently
- [x] [Review][Defer] **W4: `status` field typed as open `string` not union type** [trpc.ts:312] — deferred, type safety improvement
- [x] [Review][Defer] **W5: Empty payload shows degraded messages** [NotificationItem.tsx:70-78] — deferred, server-side data quality concern
- [x] [Review][Defer] **W6: Poll/panel count flicker** [NotificationBell.tsx] — deferred, cosmetic race between poll and panel count
- [x] [Review][Defer] **W7: No test for notification ordering** — deferred, server enforces order; client-side test would only test mock

### Change Log

- 2026-05-11: Story 17.4 implemented — In-App Notification Center for Lab Lite

### File List

- `apps/lab-lite/src/lib/trpc.ts` (modified — added getUnreadCount, listNotifications, acknowledgeNotification, NotificationItem/NotificationPayload types)
- `apps/lab-lite/src/app/layout.tsx` (modified — added NotificationBell import and header integration)
- `apps/lab-lite/src/components/notifications/NotificationBell.tsx` (new)
- `apps/lab-lite/src/components/notifications/NotificationPanel.tsx` (new)
- `apps/lab-lite/src/components/notifications/NotificationItem.tsx` (new)
- `apps/lab-lite/src/__tests__/notifications.test.tsx` (new)
