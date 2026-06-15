import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from 'hub-api/src/trpc/routers/_app'

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

// Events accepted by the Hub API's reportAuthEvent endpoint.
type ReportableAuthEventType =
  | 'ADMIN_LOGIN_SUCCESS'
  | 'ADMIN_LOGIN_FAILURE'
  | 'ADMIN_PASSWORD_RESET_REQUESTED'
  | 'ADMIN_PASSWORD_RESET_COMPLETED'

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
  try {
    await trpc.admin.reportAuthEvent.mutate({
      event: event as ReportableAuthEventType,
      ...(opts?.actorId ? { actorId: opts.actorId } : {}),
      ...(opts?.actorEmail ? { actorEmail: opts.actorEmail } : {}),
    })
  } catch {
    // Audit reporting is best-effort from the client.
  }
}
