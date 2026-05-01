import { createTRPCRouter } from '../init'
import { healthRouter } from './health'
import { patientRouter } from './patient'
import { encounterRouter } from './encounter'
import { medicationRouter } from './medication'
import { consentRouter } from './consent'
import { labRouter } from './lab'
import { notificationRouter } from './notification'
import { practitionerKeyRouter } from './practitioner-key'

/**
 * Root tRPC router — aggregates all domain routers.
 * New domain routers should be added here.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
  patient: patientRouter,
  encounter: encounterRouter,
  medication: medicationRouter,
  consent: consentRouter,
  lab: labRouter,
  notification: notificationRouter,
  practitionerKey: practitionerKeyRouter,
})

export type AppRouter = typeof appRouter
