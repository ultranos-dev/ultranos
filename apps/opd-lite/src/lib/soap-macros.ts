/**
 * Story 24.1 Task 7: Offline macro fallback for SOAP notes.
 * Keyword-triggered template macros that surface within 300ms.
 * No generative output offline — pre-validated clinical text only.
 */

export interface SOAPTemplate {
  keyword: string
  label: string
  subjective: string
  objective: string
  assessment: string
  plan: string
}

/**
 * Bundled SOAP macro templates keyed by medical keywords.
 * These are pre-validated clinical text — no generative output.
 */
const SOAP_TEMPLATES: SOAPTemplate[] = [
  {
    keyword: 'hypertension',
    label: 'Hypertension (HTN)',
    subjective: 'Patient presents with elevated blood pressure. Reports occasional headaches and dizziness.',
    objective: 'BP: ___/___. HR: ___. No papilledema. Heart: RRR, no murmurs.',
    assessment: 'Essential hypertension. Stage ___.',
    plan: 'Continue/initiate antihypertensive therapy. Lifestyle modifications: low sodium diet, exercise. Follow-up in ___ weeks.',
  },
  {
    keyword: 'diabetes',
    label: 'Diabetes Mellitus Type 2',
    subjective: 'Patient with known/suspected diabetes. Reports polyuria, polydipsia, fatigue.',
    objective: 'Fasting glucose: ___. HbA1c: ___. BMI: ___. Foot exam: ___.',
    assessment: 'Diabetes mellitus type 2. HbA1c ___.',
    plan: 'Continue/initiate oral hypoglycemic/insulin therapy. Diet counseling. Monitor glucose. Follow-up in ___ months.',
  },
  {
    keyword: 'uri',
    label: 'Upper Respiratory Infection',
    subjective: 'Patient presents with cough, nasal congestion, sore throat for ___ days. No fever reported.',
    objective: 'Temp: ___. Throat: mild erythema, no exudates. Lungs: clear bilateral. TM: normal.',
    assessment: 'Acute upper respiratory infection, likely viral.',
    plan: 'Supportive care: rest, fluids, OTC analgesics. Return if symptoms worsen or persist >10 days.',
  },
  {
    keyword: 'headache',
    label: 'Headache Evaluation',
    subjective: 'Patient reports headache, onset ___, location ___, character ___, severity ___/10. Associated symptoms: ___.',
    objective: 'Neuro exam: alert, oriented. PERRLA. No focal deficits. Neck: supple, no meningismus.',
    assessment: 'Headache, ___ type. No red flags for secondary cause.',
    plan: 'Analgesic trial: ___. Headache diary. Return if: sudden severe onset, fever, visual changes, or neurological symptoms.',
  },
  {
    keyword: 'gastritis',
    label: 'Gastritis / Dyspepsia',
    subjective: 'Patient reports epigastric pain/discomfort, ___ onset. Associated with meals/fasting. Nausea: ___. Vomiting: ___.',
    objective: 'Abdomen: soft, epigastric tenderness. No guarding/rebound. BS: normal.',
    assessment: 'Dyspepsia / functional gastritis.',
    plan: 'PPI trial for ___ weeks. Dietary modifications. H. pylori testing if persistent. Return if alarm symptoms.',
  },
  {
    keyword: 'uti',
    label: 'Urinary Tract Infection',
    subjective: 'Patient presents with dysuria, urinary frequency, urgency for ___ days. Fever: ___. Flank pain: ___.',
    objective: 'Temp: ___. CVA tenderness: ___. Urinalysis: ___.',
    assessment: 'Uncomplicated urinary tract infection.',
    plan: 'Antibiotic therapy: ___. Increase fluid intake. Follow-up urinalysis if not improving in 48-72 hours.',
  },
  {
    keyword: 'asthma',
    label: 'Asthma',
    subjective: 'Patient reports wheezing, shortness of breath, cough. Triggers: ___. Frequency of rescue inhaler use: ___.',
    objective: 'SpO2: ___. Lungs: ___ wheezing. Peak flow: ___. No accessory muscle use.',
    assessment: 'Asthma, ___ severity (intermittent/mild/moderate/severe persistent).',
    plan: 'Controller medication: ___. Rescue inhaler PRN. Asthma action plan reviewed. Follow-up in ___ weeks.',
  },
  {
    keyword: 'back pain',
    label: 'Low Back Pain',
    subjective: 'Patient reports low back pain for ___. Radiation: ___. Numbness/weakness: ___. Bowel/bladder changes: ___.',
    objective: 'Gait: normal. SLR: ___. Strength: ___ bilateral LE. Reflexes: ___. Sensory: intact.',
    assessment: 'Mechanical low back pain. No red flags for cauda equina or fracture.',
    plan: 'NSAIDs, activity modification, physical therapy referral. Return if radiculopathy or red flags develop.',
  },
  {
    keyword: 'anemia',
    label: 'Anemia Workup',
    subjective: 'Patient reports fatigue, weakness, dyspnea on exertion. Diet: ___. Menstrual history: ___.',
    objective: 'Pallor: ___. CBC: Hb ___. MCV: ___. Peripheral smear: ___.',
    assessment: 'Anemia, ___ type (iron deficiency / B12 / chronic disease).',
    plan: 'Iron/B12/folate supplementation as indicated. Further workup: ___. Dietary counseling. Recheck CBC in ___ weeks.',
  },
  {
    keyword: 'pregnancy',
    label: 'Antenatal Visit',
    subjective: 'Pregnant patient at ___ weeks gestation. Complaints: ___. Fetal movement: ___.',
    objective: 'BP: ___. Weight: ___. Fundal height: ___. FHR: ___. Edema: ___.',
    assessment: 'Pregnancy at ___ weeks, ___ (uncomplicated / with complications: ___).',
    plan: 'Continue prenatal vitamins. Next ultrasound: ___. Labs: ___. Return in ___ weeks.',
  },
]

// Pre-built keyword index for O(1) lookup
const keywordIndex = new Map<string, SOAPTemplate[]>()
for (const template of SOAP_TEMPLATES) {
  const words = template.keyword.toLowerCase().split(/\s+/)
  for (const word of words) {
    const existing = keywordIndex.get(word) ?? []
    existing.push(template)
    keywordIndex.set(word, existing)
  }
}

/**
 * Search for matching SOAP templates by keyword.
 * Designed to complete within 300ms (synchronous, in-memory).
 */
export function searchSOAPMacros(query: string): SOAPTemplate[] {
  if (!query || query.length < 2) return []

  const normalizedQuery = query.toLowerCase().trim()
  const matches = new Set<SOAPTemplate>()

  // Direct keyword match
  const directMatches = keywordIndex.get(normalizedQuery)
  if (directMatches) {
    for (const m of directMatches) matches.add(m)
  }

  // Partial match across all templates
  for (const template of SOAP_TEMPLATES) {
    if (
      template.keyword.toLowerCase().includes(normalizedQuery) ||
      template.label.toLowerCase().includes(normalizedQuery)
    ) {
      matches.add(template)
    }
  }

  return Array.from(matches)
}
