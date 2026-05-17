import { createTRPCRouter } from '../init'
import { healthRouter } from './health'
import { patientRouter } from './patient'
import { encounterRouter } from './encounter'
import { medicationRouter } from './medication'
import { medicationStatementRouter } from './medication-statement'
import { consentRouter } from './consent'
import { labRouter } from './lab'
import { notificationRouter } from './notification'
import { practitionerKeyRouter } from './practitioner-key'
import { auditRouter } from './audit'
import { syncRouter } from './sync'
import { vocabularyRouter } from './vocabulary'
import { allergyRouter } from './allergy'
import { diagnosticReportRouter } from './diagnostic-report'
import { patientKeyRouter } from './patient-key'
import { subscriptionRouter } from './subscription'
import { entitlementRouter } from './entitlement'
import { registrationRouter } from './registration'
import { billingRouter } from './billing'
import { adminRouter } from './admin'
import { aiRouter } from './ai'

/**
 * Root tRPC router — aggregates all domain routers.
 * New domain routers should be added here.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
  patient: patientRouter,
  encounter: encounterRouter,
  medication: medicationRouter,
  medicationStatement: medicationStatementRouter,
  consent: consentRouter,
  lab: labRouter,
  notification: notificationRouter,
  practitionerKey: practitionerKeyRouter,
  audit: auditRouter,
  sync: syncRouter,
  vocabulary: vocabularyRouter,
  allergy: allergyRouter,
  diagnosticReport: diagnosticReportRouter,
  patientKey: patientKeyRouter,
  subscription: subscriptionRouter,
  entitlement: entitlementRouter,
  registration: registrationRouter,
  billing: billingRouter,
  admin: adminRouter,
  ai: aiRouter,
})

export type AppRouter = typeof appRouter
