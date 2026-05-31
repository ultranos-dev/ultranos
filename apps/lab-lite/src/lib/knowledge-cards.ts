/**
 * Knowledge Cards — Data Model, Registry, and Trigger Rules
 *
 * Story 53.1 — AC: 1, 2, 3, 4, 6, 7, 8
 *
 * IMPORTANT: All card content is physician-authored. These are static clinical
 * references — NOT AI-generated. No AI confirmation gate applies here.
 *
 * Card text fields (title, condition, actions, clinicalContext) are i18n keys
 * that resolve under the `knowledgeCards` namespace in messages/{locale}.json.
 *
 * PHI note: no patient data is stored here. The trigger engine receives
 * only structured numeric values keyed by LOINC field codes.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface KnowledgeCardAuthor {
  name: string         // physician name (e.g. 'Dr. Ahmad Karimi')
  credentials: string  // e.g. 'MD, Hematopathologist'
  institution: string  // authoring institution
}

export interface KnowledgeCard {
  id: string                               // unique card identifier (e.g. 'KC-WBC-BLAST-001')
  title: string                            // i18n key for card title
  condition: string                        // i18n key for condition description
  actions: string[]                        // i18n keys for recommended actions
  clinicalContext: string                  // i18n key for clinical context paragraph
  author: KnowledgeCardAuthor
  version: string                          // semver (e.g. '1.0.0')
  lastReviewedAt: string                   // ISO 8601 date of last physician review
  severity: 'critical' | 'warning' | 'informational'
  tags: string[]                           // searchable tags for manual lookup
}

export interface TriggerCondition {
  fieldCode: string                        // LOINC field code from result template
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'present'
  value?: number                           // threshold value
  valueRange?: { min: number; max: number } // for 'between' operator
}

export interface TriggerRule {
  id: string                               // unique rule identifier
  cardId: string                           // references KnowledgeCard.id
  templateLoincCodes: string[]             // top-level LOINC codes this rule applies to ('*' = all)
  conditions: TriggerCondition[]           // ALL conditions must match (AND logic)
  description: string                      // human-readable (for debugging, no PHI)
}

// ---------------------------------------------------------------------------
// Knowledge Card Registry — physician-authored, versioned, named
// ---------------------------------------------------------------------------

export const KNOWLEDGE_CARD_REGISTRY: Map<string, KnowledgeCard> = new Map([

  // -----------------------------------------------------------------------
  // CBC cards
  // -----------------------------------------------------------------------
  [
    'KC-WBC-BLAST-001',
    {
      id: 'KC-WBC-BLAST-001',
      title: 'knowledgeCards.kcWbcBlast001.title',
      condition: 'knowledgeCards.kcWbcBlast001.condition',
      actions: [
        'knowledgeCards.kcWbcBlast001.action1',
        'knowledgeCards.kcWbcBlast001.action2',
        'knowledgeCards.kcWbcBlast001.action3',
      ],
      clinicalContext: 'knowledgeCards.kcWbcBlast001.clinicalContext',
      author: {
        name: 'Dr. Nasrin Rahimi',
        credentials: 'MD, Hematopathologist',
        institution: 'Kabul University Medical Centre',
      },
      version: '1.0.0',
      lastReviewedAt: '2026-04-01',
      severity: 'critical',
      tags: ['leukemia', 'WBC', 'blasts', 'CBC', 'hematology', 'referral'],
    },
  ],

  [
    'KC-HGB-SEVERE-001',
    {
      id: 'KC-HGB-SEVERE-001',
      title: 'knowledgeCards.kcHgbSevere001.title',
      condition: 'knowledgeCards.kcHgbSevere001.condition',
      actions: [
        'knowledgeCards.kcHgbSevere001.action1',
        'knowledgeCards.kcHgbSevere001.action2',
        'knowledgeCards.kcHgbSevere001.action3',
      ],
      clinicalContext: 'knowledgeCards.kcHgbSevere001.clinicalContext',
      author: {
        name: 'Dr. Nasrin Rahimi',
        credentials: 'MD, Hematopathologist',
        institution: 'Kabul University Medical Centre',
      },
      version: '1.0.0',
      lastReviewedAt: '2026-04-01',
      severity: 'critical',
      tags: ['anemia', 'hemoglobin', 'transfusion', 'CBC'],
    },
  ],

  [
    'KC-PLT-CRITICAL-001',
    {
      id: 'KC-PLT-CRITICAL-001',
      title: 'knowledgeCards.kcPltCritical001.title',
      condition: 'knowledgeCards.kcPltCritical001.condition',
      actions: [
        'knowledgeCards.kcPltCritical001.action1',
        'knowledgeCards.kcPltCritical001.action2',
        'knowledgeCards.kcPltCritical001.action3',
      ],
      clinicalContext: 'knowledgeCards.kcPltCritical001.clinicalContext',
      author: {
        name: 'Dr. Nasrin Rahimi',
        credentials: 'MD, Hematopathologist',
        institution: 'Kabul University Medical Centre',
      },
      version: '1.0.0',
      lastReviewedAt: '2026-04-01',
      severity: 'critical',
      tags: ['thrombocytopenia', 'platelets', 'bleeding', 'CBC'],
    },
  ],

  // -----------------------------------------------------------------------
  // Electrolytes cards
  // -----------------------------------------------------------------------
  [
    'KC-K-HYPERKALEMIA-001',
    {
      id: 'KC-K-HYPERKALEMIA-001',
      title: 'knowledgeCards.kcKHyperkalemia001.title',
      condition: 'knowledgeCards.kcKHyperkalemia001.condition',
      actions: [
        'knowledgeCards.kcKHyperkalemia001.action1',
        'knowledgeCards.kcKHyperkalemia001.action2',
        'knowledgeCards.kcKHyperkalemia001.action3',
      ],
      clinicalContext: 'knowledgeCards.kcKHyperkalemia001.clinicalContext',
      author: {
        name: 'Dr. Omar Yousafzai',
        credentials: 'MD, Internal Medicine',
        institution: 'Aga Khan University Hospital',
      },
      version: '1.0.0',
      lastReviewedAt: '2026-04-01',
      severity: 'critical',
      tags: ['hyperkalemia', 'potassium', 'cardiac', 'electrolytes'],
    },
  ],

  [
    'KC-NA-HYPONATREMIA-001',
    {
      id: 'KC-NA-HYPONATREMIA-001',
      title: 'knowledgeCards.kcNaHyponatremia001.title',
      condition: 'knowledgeCards.kcNaHyponatremia001.condition',
      actions: [
        'knowledgeCards.kcNaHyponatremia001.action1',
        'knowledgeCards.kcNaHyponatremia001.action2',
        'knowledgeCards.kcNaHyponatremia001.action3',
      ],
      clinicalContext: 'knowledgeCards.kcNaHyponatremia001.clinicalContext',
      author: {
        name: 'Dr. Omar Yousafzai',
        credentials: 'MD, Internal Medicine',
        institution: 'Aga Khan University Hospital',
      },
      version: '1.0.0',
      lastReviewedAt: '2026-04-01',
      severity: 'critical',
      tags: ['hyponatremia', 'sodium', 'electrolytes', 'seizure'],
    },
  ],

  // -----------------------------------------------------------------------
  // Liver panel card
  // -----------------------------------------------------------------------
  [
    'KC-ALT-HEPATIC-001',
    {
      id: 'KC-ALT-HEPATIC-001',
      title: 'knowledgeCards.kcAltHepatic001.title',
      condition: 'knowledgeCards.kcAltHepatic001.condition',
      actions: [
        'knowledgeCards.kcAltHepatic001.action1',
        'knowledgeCards.kcAltHepatic001.action2',
        'knowledgeCards.kcAltHepatic001.action3',
      ],
      clinicalContext: 'knowledgeCards.kcAltHepatic001.clinicalContext',
      author: {
        name: 'Dr. Fatima Sultani',
        credentials: 'MD, Hepatology',
        institution: 'French Medical Institute for Mothers and Children',
      },
      version: '1.0.0',
      lastReviewedAt: '2026-04-01',
      severity: 'critical',
      tags: ['hepatic', 'ALT', 'liver', 'hepatitis', 'acute liver injury'],
    },
  ],

  // -----------------------------------------------------------------------
  // Renal panel card
  // -----------------------------------------------------------------------
  [
    'KC-CREAT-RENAL-001',
    {
      id: 'KC-CREAT-RENAL-001',
      title: 'knowledgeCards.kcCreatRenal001.title',
      condition: 'knowledgeCards.kcCreatRenal001.condition',
      actions: [
        'knowledgeCards.kcCreatRenal001.action1',
        'knowledgeCards.kcCreatRenal001.action2',
        'knowledgeCards.kcCreatRenal001.action3',
      ],
      clinicalContext: 'knowledgeCards.kcCreatRenal001.clinicalContext',
      author: {
        name: 'Dr. Fatima Sultani',
        credentials: 'MD, Hepatology',
        institution: 'French Medical Institute for Mothers and Children',
      },
      version: '1.0.0',
      lastReviewedAt: '2026-04-01',
      severity: 'critical',
      tags: ['renal', 'creatinine', 'dialysis', 'AKI'],
    },
  ],

  // -----------------------------------------------------------------------
  // Malaria card
  // -----------------------------------------------------------------------
  [
    'KC-MALARIA-SEVERE-001',
    {
      id: 'KC-MALARIA-SEVERE-001',
      title: 'knowledgeCards.kcMalariaSevere001.title',
      condition: 'knowledgeCards.kcMalariaSevere001.condition',
      actions: [
        'knowledgeCards.kcMalariaSevere001.action1',
        'knowledgeCards.kcMalariaSevere001.action2',
        'knowledgeCards.kcMalariaSevere001.action3',
        'knowledgeCards.kcMalariaSevere001.action4',
      ],
      clinicalContext: 'knowledgeCards.kcMalariaSevere001.clinicalContext',
      author: {
        name: 'Dr. Zainab Hussaini',
        credentials: 'MD, Infectious Disease',
        institution: 'WHO-EMRO Regional Reference Laboratory',
      },
      version: '1.0.0',
      lastReviewedAt: '2026-04-01',
      severity: 'critical',
      tags: ['malaria', 'parasitemia', 'WHO', 'severe', 'Plasmodium'],
    },
  ],
])

// ---------------------------------------------------------------------------
// Trigger Rules — deterministic threshold-based, never ML/AI
// ---------------------------------------------------------------------------

export const TRIGGER_RULES: TriggerRule[] = [
  // -----------------------------------------------------------------------
  // CBC rules
  // -----------------------------------------------------------------------
  {
    id: 'TR-WBC-BLAST-001',
    cardId: 'KC-WBC-BLAST-001',
    templateLoincCodes: ['58410-2', '*'],  // CBC panel LOINC + wildcard fallback
    conditions: [
      {
        fieldCode: 'wbc',         // WBC count ×10³/µL
        operator: 'gt',
        value: 50,                // > 50,000/µL (stored as 50 in ×10³ units)
      },
    ],
    description: 'WBC > 50,000 — possible blast/leukemia pattern',
  },

  {
    id: 'TR-HGB-SEVERE-001',
    cardId: 'KC-HGB-SEVERE-001',
    templateLoincCodes: ['58410-2', '718-7', '*'],
    conditions: [
      {
        fieldCode: 'hgb',         // hemoglobin g/dL
        operator: 'lt',
        value: 5,                 // < 5 g/dL — severe anemia
      },
    ],
    description: 'Hemoglobin < 5 g/dL — severe anemia, immediate transfusion consideration',
  },

  {
    id: 'TR-PLT-CRITICAL-001',
    cardId: 'KC-PLT-CRITICAL-001',
    templateLoincCodes: ['58410-2', '26515-7', '*'],
    conditions: [
      {
        fieldCode: 'plt',         // platelets ×10³/µL
        operator: 'lt',
        value: 20,                // < 20,000 — critical thrombocytopenia
      },
    ],
    description: 'Platelets < 20,000 — critical thrombocytopenia',
  },

  // -----------------------------------------------------------------------
  // Electrolyte rules
  // -----------------------------------------------------------------------
  {
    id: 'TR-K-HYPERKALEMIA-001',
    cardId: 'KC-K-HYPERKALEMIA-001',
    templateLoincCodes: ['24326-1', '2823-3', '*'],  // electrolyte panel + potassium LOINC
    conditions: [
      {
        fieldCode: 'potassium',   // K+ mEq/L
        operator: 'gt',
        value: 6.5,               // > 6.5 mEq/L — dangerous hyperkalemia
      },
    ],
    description: 'Potassium > 6.5 mEq/L — cardiac risk',
  },

  {
    id: 'TR-NA-HYPONATREMIA-001',
    cardId: 'KC-NA-HYPONATREMIA-001',
    templateLoincCodes: ['24326-1', '2951-2', '*'],  // electrolyte panel + sodium LOINC
    conditions: [
      {
        fieldCode: 'sodium',      // Na+ mEq/L
        operator: 'lt',
        value: 120,               // < 120 mEq/L — severe hyponatremia
      },
    ],
    description: 'Sodium < 120 mEq/L — severe hyponatremia',
  },

  // -----------------------------------------------------------------------
  // Liver panel rule
  // -----------------------------------------------------------------------
  {
    id: 'TR-ALT-HEPATIC-001',
    cardId: 'KC-ALT-HEPATIC-001',
    templateLoincCodes: ['24325-3', '1742-6', '*'],  // liver panel + ALT LOINC
    conditions: [
      {
        fieldCode: 'alt',         // ALT U/L
        operator: 'gt',
        value: 400,               // > 10x ULN (ULN ~40 U/L)
      },
    ],
    description: 'ALT > 10x ULN — acute hepatic injury',
  },

  // -----------------------------------------------------------------------
  // Renal panel rule
  // -----------------------------------------------------------------------
  {
    id: 'TR-CREAT-RENAL-001',
    cardId: 'KC-CREAT-RENAL-001',
    templateLoincCodes: ['24362-6', '2160-0', '*'],  // renal panel + creatinine LOINC
    conditions: [
      {
        fieldCode: 'creatinine',  // creatinine mg/dL
        operator: 'gt',
        value: 10,                // > 10 mg/dL — possible dialysis
      },
    ],
    description: 'Creatinine > 10 mg/dL — possible dialysis indication',
  },

  // -----------------------------------------------------------------------
  // Malaria rule
  // -----------------------------------------------------------------------
  {
    id: 'TR-MALARIA-SEVERE-001',
    cardId: 'KC-MALARIA-SEVERE-001',
    templateLoincCodes: ['32700-7', '*'],  // malaria panel LOINC
    conditions: [
      {
        fieldCode: 'parasitemia_pct',  // parasitemia %
        operator: 'gte',
        value: 5,                      // ≥ 5% — WHO severe malaria threshold
      },
    ],
    description: 'Parasitemia ≥ 5% — severe malaria (WHO protocol)',
  },
]
