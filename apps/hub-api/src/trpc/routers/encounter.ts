import { createTRPCRouter } from '../init'
// NOTE: When encounter data endpoints are added, apply consent enforcement:
//   .use(enforceConsentMiddleware('Encounter'))
// See: apps/hub-api/src/trpc/middleware/enforceConsent.ts

/**
 * Encounter domain router — stub.
 * Procedures will be added in later stories (encounter lifecycle, SOAP notes, etc.).
 * Grouped by domain per Developer Guardrails.
 */
export const encounterRouter = createTRPCRouter({})
