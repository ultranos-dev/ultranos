/**
 * FHIR-to-Simple Mapper — "Humanizer"
 *
 * Maps FHIR codes (ICD-10, RxNorm, encounter types) to simplified labels
 * and semantic icon categories for the low-literacy timeline UI.
 *
 * Supports English, Arabic (ar), and Dari (fa-AF) labeling.
 *
 * Privacy guardrail: Sensitive categories (mental health, HIV/STI)
 * are flagged so the timeline can hide them behind an explicit tap.
 */

export type IconCategory =
  | 'stethoscope'
  | 'pill'
  | 'lungs'
  | 'heart'
  | 'bone'
  | 'brain'
  | 'eye'
  | 'tooth'
  | 'baby'
  | 'syringe'
  | 'bandage'
  | 'thermometer'
  | 'clipboard'

export type SupportedLocale = 'en' | 'ar' | 'fa-AF'

export interface HumanizedLabel {
  label: string
  icon: IconCategory
  isSensitive: boolean
}

// --- ICD-10 category prefixes to icon + label mapping ---

interface CategoryMapping {
  prefixes: string[]
  icon: IconCategory
  labels: Record<SupportedLocale, string>
  sensitive?: boolean
}

const ICD10_CATEGORIES: CategoryMapping[] = [
  {
    prefixes: ['J'],
    icon: 'lungs',
    labels: { en: 'Breathing Problem', ar: 'مشكلة في التنفس', 'fa-AF': 'مشکل تنفسی' },
  },
  {
    prefixes: ['I'],
    icon: 'heart',
    labels: { en: 'Heart Condition', ar: 'حالة قلبية', 'fa-AF': 'مشکل قلبی' },
  },
  {
    prefixes: ['M'],
    icon: 'bone',
    labels: { en: 'Bone or Joint Issue', ar: 'مشكلة في العظام أو المفاصل', 'fa-AF': 'مشکل استخوان یا مفصل' },
  },
  {
    prefixes: ['H0', 'H1', 'H2', 'H3', 'H4', 'H5'],
    icon: 'eye',
    labels: { en: 'Eye Problem', ar: 'مشكلة في العين', 'fa-AF': 'مشکل چشم' },
  },
  {
    prefixes: ['K0'],
    icon: 'tooth',
    labels: { en: 'Dental Issue', ar: 'مشكلة أسنان', 'fa-AF': 'مشکل دندان' },
  },
  {
    prefixes: ['O', 'Z3'],
    icon: 'baby',
    labels: { en: 'Pregnancy Care', ar: 'رعاية الحمل', 'fa-AF': 'مراقبت بارداری' },
  },
  {
    prefixes: ['K'],
    icon: 'thermometer',
    labels: { en: 'Stomach Issue', ar: 'مشكلة في المعدة', 'fa-AF': 'مشکل معده' },
  },
  {
    prefixes: ['A', 'B'],
    icon: 'thermometer',
    labels: { en: 'Infection', ar: 'عدوى', 'fa-AF': 'عفونت' },
  },
  {
    prefixes: ['S', 'T'],
    icon: 'bandage',
    labels: { en: 'Injury', ar: 'إصابة', 'fa-AF': 'صدمه' },
  },
  {
    prefixes: ['E'],
    icon: 'thermometer',
    labels: { en: 'Nutrition or Metabolism', ar: 'تغذية أو أيض', 'fa-AF': 'تغذیه یا متابولیسم' },
  },
  {
    prefixes: ['L'],
    icon: 'bandage',
    labels: { en: 'Skin Problem', ar: 'مشكلة جلدية', 'fa-AF': 'مشکل پوستی' },
  },
  {
    prefixes: ['N'],
    icon: 'clipboard',
    labels: { en: 'Kidney or Bladder', ar: 'كلى أو مثانة', 'fa-AF': 'کلیه یا مثانه' },
  },
  // Sensitive categories — hidden by default per Developer Guardrail
  {
    prefixes: ['F'],
    icon: 'brain',
    labels: { en: 'Private Health Matter', ar: 'مسألة صحية خاصة', 'fa-AF': 'موضوع صحی خصوصی' },
    sensitive: true,
  },
  {
    prefixes: ['B20', 'B21', 'B22', 'B23', 'B24'],
    icon: 'clipboard',
    labels: { en: 'Private Health Matter', ar: 'مسألة صحية خاصة', 'fa-AF': 'موضوع صحی خصوصی' },
    sensitive: true,
  },
]

const ENCOUNTER_LABELS: Record<SupportedLocale, string> = {
  en: 'Doctor Visit',
  ar: 'زيارة طبيب',
  'fa-AF': 'ویزیت داکتر',
}

const MEDICATION_LABELS: Record<SupportedLocale, string> = {
  en: 'Medicine',
  ar: 'دواء',
  'fa-AF': 'دارو',
}

const UNKNOWN_LABELS: Record<SupportedLocale, string> = {
  en: 'Health Record',
  ar: 'سجل صحي',
  'fa-AF': 'سوابق صحی',
}

/**
 * Humanize an ICD-10 code into a simple label, icon, and sensitivity flag.
 */
export function humanizeIcd10(
  code: string,
  locale: SupportedLocale = 'en',
): HumanizedLabel {
  const upper = code.toUpperCase()

  // Build a flat list of all prefix matches, then pick the longest (most specific) match.
  // Sensitive matches always take priority over non-sensitive.
  let bestMatch: { cat: CategoryMapping; prefixLen: number } | null = null

  for (const cat of ICD10_CATEGORIES) {
    for (const p of cat.prefixes) {
      if (upper.startsWith(p)) {
        const isBetter =
          !bestMatch ||
          (cat.sensitive && !bestMatch.cat.sensitive) ||
          (cat.sensitive === (bestMatch.cat.sensitive ?? false) && p.length > bestMatch.prefixLen)

        if (isBetter) {
          bestMatch = { cat, prefixLen: p.length }
        }
      }
    }
  }

  if (bestMatch) {
    return {
      label: bestMatch.cat.labels[locale],
      icon: bestMatch.cat.icon,
      isSensitive: bestMatch.cat.sensitive ?? false,
    }
  }

  return {
    label: UNKNOWN_LABELS[locale],
    icon: 'clipboard',
    isSensitive: false,
  }
}

/**
 * Generate a simple label for an encounter.
 * Uses reasonCode ICD-10 if available, otherwise falls back to generic label.
 */
export function humanizeEncounter(
  reasonCodes: Array<{ coding?: Array<{ system?: string; code: string }>; text?: string }> | undefined,
  locale: SupportedLocale = 'en',
): HumanizedLabel {
  if (reasonCodes?.length) {
    for (const concept of reasonCodes) {
      const icd10 = concept.coding?.find(
        (c) =>
          c.system?.includes('icd') ||
          c.system?.includes('ICD') ||
          c.system?.includes('2.16.840.1.113883.6.90'),
      )
      if (icd10) {
        return humanizeIcd10(icd10.code, locale)
      }
    }
    // Has reason text but no ICD-10 code — treat as sensitive since
    // free-text may contain explicit diagnoses (e.g., "HIV infection")
    const textReason = reasonCodes[0]?.text
    if (textReason) {
      return {
        label: textReason,
        icon: 'stethoscope',
        isSensitive: true,
      }
    }
  }

  return {
    label: ENCOUNTER_LABELS[locale],
    icon: 'stethoscope',
    isSensitive: false,
  }
}

/**
 * Generate a simple label for a medication.
 * Prefers the CodeableConcept text, falling back to generic "Medicine" label.
 */
export function humanizeMedication(
  medicationConcept: { coding?: Array<{ display?: string }>; text?: string } | undefined,
  locale: SupportedLocale = 'en',
): HumanizedLabel {
  const displayText =
    medicationConcept?.text ??
    medicationConcept?.coding?.[0]?.display

  return {
    label: displayText ?? MEDICATION_LABELS[locale],
    icon: 'pill',
    isSensitive: false,
  }
}
