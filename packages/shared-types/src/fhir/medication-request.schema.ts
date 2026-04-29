import { z } from 'zod'
import { PrescriptionStatus } from '../enums.js'
import {
  CodeableConceptSchema,
  ReferenceSchema,
  FhirMetaSchema,
} from './common.schema.js'

// FHIR R4 MedicationRequest Zod Schema
// Ref: https://hl7.org/fhir/R4/medicationrequest.html

const MedicationRequestStatusSchema = z.enum([
  'active',
  'on-hold',
  'cancelled',
  'completed',
  'entered-in-error',
  'stopped',
  'draft',
  'unknown',
])

const MedicationRequestIntentSchema = z.enum([
  'proposal',
  'plan',
  'order',
  'original-order',
  'reflex-order',
  'filler-order',
  'instance-order',
  'option',
])

const DosageSchema = z.object({
  sequence: z.number().int().positive().optional(),
  text: z.string().optional(),
  timing: z.object({
    repeat: z.object({
      frequency: z.number().int().positive().optional(),
      period: z.number().positive().optional(),
      periodUnit: z.enum(['s', 'min', 'h', 'd', 'wk', 'mo', 'a']).optional(),
      when: z.array(z.string()).optional(),
    }).optional(),
    code: CodeableConceptSchema.optional(),
  }).optional(),
  route: CodeableConceptSchema.optional(),
  doseAndRate: z.array(z.object({
    type: CodeableConceptSchema.optional(),
    doseQuantity: z.object({
      value: z.number(),
      unit: z.string(),
      system: z.string().optional(),
      code: z.string().optional(),
    }).optional(),
  })).optional(),
})

const DispenseRequestSchema = z.object({
  numberOfRepeatsAllowed: z.number().int().nonnegative().optional(),
  quantity: z.object({
    value: z.number(),
    unit: z.string(),
  }).optional(),
  expectedSupplyDuration: z.object({
    value: z.number(),
    unit: z.string(),
  }).optional(),
})

const InteractionCheckResultSchema = z.enum(['CLEAR', 'WARNING', 'BLOCKED', 'UNAVAILABLE'])

const MedicationRequestUltranosExtSchema = z
  .object({
    prescriptionStatus: z.nativeEnum(PrescriptionStatus),
    interactionCheckResult: InteractionCheckResultSchema,
    interactionOverrideReason: z.string().optional(),
    qrCodeId: z.string().optional(),
    isOfflineCreated: z.boolean(),
    hlcTimestamp: z.string(),
    createdAt: z.string().datetime(),
  })
  .refine(
    (val) =>
      val.interactionCheckResult !== 'BLOCKED' ||
      (val.interactionOverrideReason !== undefined &&
        val.interactionOverrideReason.length > 0),
    {
      message:
        'interactionOverrideReason is required when interactionCheckResult is BLOCKED',
      path: ['interactionOverrideReason'],
    },
  )

export const FhirMedicationRequestSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('MedicationRequest'),
  status: MedicationRequestStatusSchema,
  intent: MedicationRequestIntentSchema,
  medicationCodeableConcept: CodeableConceptSchema,
  subject: ReferenceSchema,
  encounter: ReferenceSchema.optional(),
  requester: ReferenceSchema,
  authoredOn: z.string().datetime(),
  dosageInstruction: z.array(DosageSchema).optional(),
  dispenseRequest: DispenseRequestSchema.optional(),
  reasonCode: z.array(CodeableConceptSchema).optional(),
  note: z.array(z.object({
    text: z.string(),
    time: z.string().datetime().optional(),
    authorReference: ReferenceSchema.optional(),
  })).optional(),
  _ultranos: MedicationRequestUltranosExtSchema,
  meta: FhirMetaSchema,
})

export type FhirMedicationRequestZod = z.infer<typeof FhirMedicationRequestSchema>
