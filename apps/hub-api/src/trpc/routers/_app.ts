import { createTRPCRouter } from '../init'
import { healthRouter } from './health'
import { patientRouter } from './patient'
import { encounterRouter } from './encounter'
import { medicationRouter } from './medication'

/**
 * Root tRPC router — aggregates all domain routers.
 * New domain routers should be added here.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
  patient: patientRouter,
  encounter: encounterRouter,
  medication: medicationRouter,
})

export type AppRouter = typeof appRouter
