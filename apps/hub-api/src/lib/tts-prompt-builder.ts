/**
 * Story 24.2 Task 2: TTS Audio Prompt Builder
 *
 * Builds structured text from medication data for TTS synthesis.
 * Produces dialect-appropriate, low-literacy-friendly text including
 * the mandatory disclaimer.
 */

export type TTSDialect = 'AR_LEVANTINE' | 'AR_GULF' | 'DARI' | 'EN'

export interface MedicationTTSInput {
  medicationName: string
  dosageInstruction: string
  frequency: string
  duration: string
  timeOfDay?: string
  caution?: string
}

const DISCLAIMER: Record<TTSDialect, string> = {
  EN: 'This is a simplified explanation. Always follow your doctor\'s direct instructions.',
  AR_LEVANTINE: 'هاد شرح مبسّط. دايماً اتبع تعليمات الدكتور مباشرة.',
  AR_GULF: 'هذا شرح مبسّط. دايماً اتبع تعليمات الدكتور مباشرة.',
  DARI: 'این یک توضیح ساده است. همیشه دستورات مستقیم داکتر خود را دنبال کنید.',
}

/**
 * Builds a structured TTS prompt from medication data in the target dialect.
 *
 * The output is conversational text ready for TTS synthesis, NOT clinical jargon.
 * Includes the mandatory disclaimer at the end.
 */
export function buildTTSPrompt(
  input: MedicationTTSInput,
  dialect: TTSDialect,
): string {
  switch (dialect) {
    case 'EN':
      return buildEnglishPrompt(input)
    case 'AR_LEVANTINE':
      return buildArabicLevantinePrompt(input)
    case 'AR_GULF':
      return buildArabicGulfPrompt(input)
    case 'DARI':
      return buildDariPrompt(input)
    default:
      return buildEnglishPrompt(input)
  }
}

export function getDisclaimer(dialect: TTSDialect): string {
  return DISCLAIMER[dialect] ?? DISCLAIMER.EN
}

function buildEnglishPrompt(input: MedicationTTSInput): string {
  const parts: string[] = []

  parts.push(`Your medication is ${input.medicationName}.`)
  parts.push(`${input.dosageInstruction}.`)
  parts.push(`Take it ${input.frequency}.`)

  if (input.duration) {
    parts.push(`Continue for ${input.duration}.`)
  }
  if (input.timeOfDay) {
    parts.push(`Best time: ${input.timeOfDay}.`)
  }
  if (input.caution) {
    parts.push(`Important: ${input.caution}.`)
  }

  parts.push(DISCLAIMER.EN)

  return parts.join(' ')
}

function buildArabicLevantinePrompt(input: MedicationTTSInput): string {
  const parts: string[] = []

  parts.push(`الدوا تبعك هو ${input.medicationName}.`)
  parts.push(`${input.dosageInstruction}.`)
  parts.push(`خده ${input.frequency}.`)

  if (input.duration) {
    parts.push(`استمر لمدة ${input.duration}.`)
  }
  if (input.timeOfDay) {
    parts.push(`أفضل وقت: ${input.timeOfDay}.`)
  }
  if (input.caution) {
    parts.push(`مهم: ${input.caution}.`)
  }

  parts.push(DISCLAIMER.AR_LEVANTINE)

  return parts.join(' ')
}

function buildArabicGulfPrompt(input: MedicationTTSInput): string {
  const parts: string[] = []

  parts.push(`دواك هو ${input.medicationName}.`)
  parts.push(`${input.dosageInstruction}.`)
  parts.push(`خذه ${input.frequency}.`)

  if (input.duration) {
    parts.push(`استمر لمدة ${input.duration}.`)
  }
  if (input.timeOfDay) {
    parts.push(`أفضل وقت: ${input.timeOfDay}.`)
  }
  if (input.caution) {
    parts.push(`مهم: ${input.caution}.`)
  }

  parts.push(DISCLAIMER.AR_GULF)

  return parts.join(' ')
}

function buildDariPrompt(input: MedicationTTSInput): string {
  const parts: string[] = []

  parts.push(`دوای شما ${input.medicationName} است.`)
  parts.push(`${input.dosageInstruction}.`)
  parts.push(`آن را ${input.frequency} مصرف کنید.`)

  if (input.duration) {
    parts.push(`به مدت ${input.duration} ادامه دهید.`)
  }
  if (input.timeOfDay) {
    parts.push(`بهترین وقت: ${input.timeOfDay}.`)
  }
  if (input.caution) {
    parts.push(`مهم: ${input.caution}.`)
  }

  parts.push(DISCLAIMER.DARI)

  return parts.join(' ')
}
