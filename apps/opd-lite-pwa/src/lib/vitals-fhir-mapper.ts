import type { FhirObservation } from '@ultranos/shared-types'

// Standard LOINC codes for vital signs
export const LOINC = {
  BODY_WEIGHT: '29463-7',
  BODY_HEIGHT: '8302-2',
  BMI: '39156-5',
  BLOOD_PRESSURE: '85354-9',
  SYSTOLIC_BP: '8480-6',
  DIASTOLIC_BP: '8462-4',
  BODY_TEMPERATURE: '8310-5',
} as const

const LOINC_SYSTEM = 'http://loinc.org'
const UCUM_SYSTEM = 'http://unitsofmeasure.org'
const VITAL_SIGNS_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/observation-category'

interface VitalsData {
  weight: string
  height: string
  systolic: string
  diastolic: string
  temperature: string
  bmi: number | null
}

interface MappingContext {
  patientId: string
  encounterId: string
  hlcTimestamp: string
  nowIso: string
}

function makeObservation(
  code: string,
  display: string,
  ctx: MappingContext,
): Omit<FhirObservation, 'valueQuantity' | 'component'> {
  return {
    id: crypto.randomUUID(),
    resourceType: 'Observation',
    status: 'final',
    category: [
      {
        coding: [
          {
            system: VITAL_SIGNS_CATEGORY_SYSTEM,
            code: 'vital-signs',
            display: 'Vital Signs',
          },
        ],
      },
    ],
    code: {
      coding: [{ system: LOINC_SYSTEM, code, display }],
      text: display,
    },
    subject: { reference: `Patient/${ctx.patientId}` },
    encounter: { reference: `Encounter/${ctx.encounterId}` },
    effectiveDateTime: ctx.nowIso,
    _ultranos: {
      isOfflineCreated: true,
      hlcTimestamp: ctx.hlcTimestamp,
      createdAt: ctx.nowIso,
    },
    meta: {
      lastUpdated: ctx.nowIso,
      versionId: '1',
    },
  }
}

export function mapVitalsToObservations(
  data: VitalsData,
  ctx: MappingContext,
): FhirObservation[] {
  const observations: FhirObservation[] = []

  const w = parseFloat(data.weight)
  if (Number.isFinite(w) && w > 0) {
    observations.push({
      ...makeObservation(LOINC.BODY_WEIGHT, 'Body Weight', ctx),
      valueQuantity: { value: w, unit: 'kg', system: UCUM_SYSTEM, code: 'kg' },
    })
  }

  const h = parseFloat(data.height)
  if (Number.isFinite(h) && h > 0) {
    observations.push({
      ...makeObservation(LOINC.BODY_HEIGHT, 'Body Height', ctx),
      valueQuantity: {
        value: h,
        unit: 'cm',
        system: UCUM_SYSTEM,
        code: 'cm',
      },
    })
  }

  if (data.bmi !== null) {
    observations.push({
      ...makeObservation(LOINC.BMI, 'Body Mass Index', ctx),
      valueQuantity: {
        value: Math.round(data.bmi * 10) / 10,
        unit: 'kg/m2',
        system: UCUM_SYSTEM,
        code: 'kg/m2',
      },
    })
  }

  const sys = parseFloat(data.systolic)
  const dia = parseFloat(data.diastolic)
  if (
    Number.isFinite(sys) && sys > 0 &&
    Number.isFinite(dia) && dia > 0
  ) {
    observations.push({
      ...makeObservation(LOINC.BLOOD_PRESSURE, 'Blood Pressure', ctx),
      component: [
        {
          code: {
            coding: [
              { system: LOINC_SYSTEM, code: LOINC.SYSTOLIC_BP, display: 'Systolic Blood Pressure' },
            ],
          },
          valueQuantity: {
            value: sys,
            unit: 'mmHg',
            system: UCUM_SYSTEM,
            code: 'mm[Hg]',
          },
        },
        {
          code: {
            coding: [
              { system: LOINC_SYSTEM, code: LOINC.DIASTOLIC_BP, display: 'Diastolic Blood Pressure' },
            ],
          },
          valueQuantity: {
            value: dia,
            unit: 'mmHg',
            system: UCUM_SYSTEM,
            code: 'mm[Hg]',
          },
        },
      ],
    })
  }

  const temp = parseFloat(data.temperature)
  if (Number.isFinite(temp) && temp > 0) {
    observations.push({
      ...makeObservation(LOINC.BODY_TEMPERATURE, 'Body Temperature', ctx),
      valueQuantity: {
        value: temp,
        unit: 'Cel',
        system: UCUM_SYSTEM,
        code: 'Cel',
      },
    })
  }

  return observations
}
