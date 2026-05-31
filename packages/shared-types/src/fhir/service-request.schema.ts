import { z } from 'zod'
import {
  CodeableConceptSchema,
  ReferenceSchema,
  FhirMetaSchema,
} from './common.schema.js'

// FHIR R4 ServiceRequest Zod Schema
// Ref: https://hl7.org/fhir/R4/servicerequest.html

const ServiceRequestStatusSchema = z.enum([
  'draft',
  'active',
  'on-hold',
  'revoked',
  'completed',
  'entered-in-error',
  'unknown',
])

const ServiceRequestIntentSchema = z.enum([
  'proposal',
  'plan',
  'directive',
  'order',
  'original-order',
  'reflex-order',
  'filler-order',
  'instance-order',
  'option',
])

const ServiceRequestPrioritySchema = z.enum([
  'routine',
  'urgent',
  'asap',
  'stat',
])

const ServiceRequestUltranosExtSchema = z.object({
  createdAt: z.string().datetime(),
  hlcTimestamp: z.string(),
  isOfflineCreated: z.boolean(),
  receivedAt: z.string().datetime().optional(),
  receivedByLabId: z.string().uuid().optional(),
  receivedByTechId: z.string().uuid().optional(),
  specialInstructions: z.string().optional(),
})

export const FhirServiceRequestSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('ServiceRequest'),
  status: ServiceRequestStatusSchema,
  intent: ServiceRequestIntentSchema,
  priority: ServiceRequestPrioritySchema.optional(),
  code: CodeableConceptSchema,
  orderDetail: z.array(CodeableConceptSchema).optional(),
  subject: ReferenceSchema,
  encounter: ReferenceSchema.optional(),
  requester: ReferenceSchema,
  authoredOn: z.string().datetime(),
  reasonCode: z.array(CodeableConceptSchema).optional(),
  supportingInfo: z.array(ReferenceSchema).optional(),
  note: z
    .array(
      z.object({
        text: z.string(),
        time: z.string().datetime().optional(),
        authorReference: ReferenceSchema.optional(),
      }),
    )
    .optional(),
  _ultranos: ServiceRequestUltranosExtSchema,
  meta: FhirMetaSchema,
})

export type FhirServiceRequest = z.infer<typeof FhirServiceRequestSchema>

// Lab-minimized projection — strips all clinical fields per CLAUDE.md Rule #7.
// Used by the Hub API lab.pullOrders endpoint; Lab-Lite never sees the full ServiceRequest.
export interface LabServiceRequest {
  id: string
  resourceType: 'ServiceRequest'
  status: z.infer<typeof ServiceRequestStatusSchema>
  intent: z.infer<typeof ServiceRequestIntentSchema>
  priority?: z.infer<typeof ServiceRequestPrioritySchema>
  code: z.infer<typeof CodeableConceptSchema>
  orderDetail?: Array<z.infer<typeof CodeableConceptSchema>>
  subject: z.infer<typeof ReferenceSchema>
  requester: z.infer<typeof ReferenceSchema>
  authoredOn: string
  // NOTE: reasonCode, supportingInfo, encounter, and note are intentionally
  // EXCLUDED — they contain clinical context (PHI) that must not reach Lab-Lite.
  _ultranos: z.infer<typeof ServiceRequestUltranosExtSchema>
  meta: z.infer<typeof FhirMetaSchema>
}

export { ServiceRequestPrioritySchema, ServiceRequestStatusSchema }
