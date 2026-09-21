import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
// Import the AppRouter type from hub-api's emitted declaration bundle, NOT its source.
// hub-api's `tsc -p tsconfig.types.json` (pnpm -F hub-api build:types) emits a fully
// self-contained _app.d.ts (the `typeof appRouter` type inlined, no `@/` imports), so
// admin-portal gets full end-to-end tRPC type safety without deep-typechecking hub-api's
// source under a mismatched tsconfig (which pulled in ~90 phantom errors).
import type { AppRouter } from 'hub-api/types/app-router'

function getHubApiUrl(): string {
  return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'
}

// Access token stored in memory only — never localStorage/sessionStorage.
let _accessToken: string | null = null

export function setAccessToken(token: string | null) {
  _accessToken = token
}

export function getAccessToken(): string | null {
  return _accessToken
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: getHubApiUrl(),
      transformer: superjson,
      headers() {
        return _accessToken ? { authorization: `Bearer ${_accessToken}` } : {}
      },
    }),
  ],
})

// Events the client attempts to report to the Hub API.
type ReportableAuthEventType =
  | 'ADMIN_LOGIN_SUCCESS'
  | 'ADMIN_LOGIN_FAILURE'
  | 'ADMIN_PASSWORD_RESET_REQUESTED'
  | 'ADMIN_PASSWORD_RESET_COMPLETED'

// Subset the Hub API's reportAuthEvent endpoint actually accepts (its zod enum).
// The other reportable events are silently rejected there today; forward only
// these two so the input type matches the endpoint contract.
type ApiAcceptedAuthEventType = 'ADMIN_LOGIN_SUCCESS' | 'ADMIN_LOGIN_FAILURE'

const API_ACCEPTED_EVENTS = new Set<ReportableAuthEventType>([
  'ADMIN_LOGIN_SUCCESS',
  'ADMIN_LOGIN_FAILURE',
])

function isApiAcceptedEvent(
  event: AdminAuthEventType,
): event is ApiAcceptedAuthEventType {
  return API_ACCEPTED_EVENTS.has(event as ReportableAuthEventType)
}

// Full set of admin auth events (broader than what the API currently accepts).
export type AdminAuthEventType =
  | ReportableAuthEventType
  | 'ADMIN_MFA_ENROLLED'
  | 'ADMIN_MFA_UNENROLLED'
  | 'ADMIN_PASSWORD_CHANGED'
  | 'ADMIN_SESSION_REVOKED'

const REPORTABLE_EVENTS = new Set<AdminAuthEventType>([
  'ADMIN_LOGIN_SUCCESS',
  'ADMIN_LOGIN_FAILURE',
  'ADMIN_PASSWORD_RESET_REQUESTED',
  'ADMIN_PASSWORD_RESET_COMPLETED',
])

/**
 * Fire-and-forget admin audit event reporting to Hub API via tRPC client.
 * Never throws — auth flow must not be blocked by audit failures.
 * Only LOGIN_SUCCESS and LOGIN_FAILURE are forwarded to the Hub API; other
 * event types are no-ops until the API is extended.
 */
export async function reportAdminAuthEvent(
  event: AdminAuthEventType,
  opts?: { actorId?: string; actorEmail?: string; factorId?: string },
): Promise<void> {
  if (!REPORTABLE_EVENTS.has(event)) return
  // The Hub API endpoint only accepts the two login events (see its zod enum).
  // Other reportable events are rejected there today, so they never had an
  // effect — forward only what the endpoint contract allows.
  if (!isApiAcceptedEvent(event)) return
  try {
    await trpc.admin.reportAuthEvent.mutate({
      event,
      ...(opts?.actorId ? { actorId: opts.actorId } : {}),
      ...(opts?.actorEmail ? { actorEmail: opts.actorEmail } : {}),
    })
  } catch {
    // Audit reporting is best-effort from the client.
  }
}
