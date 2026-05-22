import { z } from 'zod'
import { CodingSchema, ReferenceSchema, FhirMetaSchema } from './common.schema.js'

// FHIR R4 Appointment Zod Schema
// Ref: https://hl7.org/fhir/R4/appointment.html

export const AppointmentStatusSchema = z.enum([
  'proposed',
  'pending',
  'booked',
  'arrived',
  'fulfilled',
  'cancelled',
  'noshow',
  'entered-in-error',
])

export const AppointmentServiceTypeSchema = z.enum([
  'new-consult',
  'follow-up',
  'urgent',
  'walk-in',
])

const AppointmentParticipantSchema = z.object({
  actor: ReferenceSchema,
  status: z.enum(['accepted', 'declined', 'tentative', 'needs-action']),
})

export const FhirAppointmentSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('Appointment'),
  status: AppointmentStatusSchema,
  serviceType: z.array(CodingSchema),
  start: z.string().datetime(),
  end: z.string().datetime(),
  participant: z.array(AppointmentParticipantSchema),
  description: z.string().optional(),
  _ultranos: z.object({
    walkIn: z.boolean(),
    queuePosition: z.number().int().nonnegative().nullable(),
    isOfflineCreated: z.boolean(),
    hlcTimestamp: z.string(),
    createdAt: z.string().datetime(),
    clinicId: z.string().optional(),
  }),
  meta: FhirMetaSchema,
})

export type FhirAppointmentZod = z.infer<typeof FhirAppointmentSchema>
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>
export type AppointmentServiceType = z.infer<typeof AppointmentServiceTypeSchema>

// FHIR R4 Slot Zod Schema
// Ref: https://hl7.org/fhir/R4/slot.html

export const SlotStatusSchema = z.enum([
  'free',
  'busy',
  'busy-unavailable',
  'busy-tentative',
  'entered-in-error',
])

export const FhirSlotSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('Slot'),
  schedule: ReferenceSchema,
  status: SlotStatusSchema,
  start: z.string().datetime(),
  end: z.string().datetime(),
  _ultranos: z.object({
    slotDurationMinutes: z.number().int().positive(),
    hlcTimestamp: z.string(),
  }),
  meta: FhirMetaSchema,
})

export type FhirSlotZod = z.infer<typeof FhirSlotSchema>
export type SlotStatus = z.infer<typeof SlotStatusSchema>
