/**
 * Default infection control checklist items — Story 47.7
 *
 * 18 items across 6 categories, aligned with:
 * - ISO 15189 (Medical Laboratories — Requirements for Quality and Competence)
 * - WHO Laboratory Quality Management System Handbook
 *
 * These are seeded into `checklist_templates` on first database initialization.
 * All items have isDefault: true and isActive: true.
 * Default items cannot be deleted — only deactivated.
 */

import type { ChecklistItemTemplate } from '@/types/infection-control-audit'

export const DEFAULT_CHECKLIST_ITEMS: ChecklistItemTemplate[] = [
  // ── Hand Hygiene (order 1-3) ──────────────────────────────────────────────
  {
    id: 'ic-hh-01',
    category: 'Hand Hygiene',
    description: 'Hand hygiene stations stocked (soap, sanitizer, paper towels)',
    order: 1,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-hh-02',
    category: 'Hand Hygiene',
    description: 'Hand hygiene signage posted and visible',
    order: 2,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-hh-03',
    category: 'Hand Hygiene',
    description: 'Hand hygiene compliance observed',
    order: 3,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },

  // ── PPE (order 4-6) ───────────────────────────────────────────────────────
  {
    id: 'ic-ppe-01',
    category: 'PPE',
    description: 'PPE inventory adequate (gloves, gowns, face shields, N95 masks)',
    order: 4,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-ppe-02',
    category: 'PPE',
    description: 'PPE in good condition (no tears, expiry checked)',
    order: 5,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-ppe-03',
    category: 'PPE',
    description: 'PPE donning/doffing posters displayed',
    order: 6,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },

  // ── Sharps & Waste (order 7-10) ───────────────────────────────────────────
  {
    id: 'ic-sw-01',
    category: 'Sharps & Waste',
    description: 'Sharps containers not overfilled (below fill line)',
    order: 7,
    isDefault: true,
    requiresPhoto: true,
    isActive: true,
  },
  {
    id: 'ic-sw-02',
    category: 'Sharps & Waste',
    description: 'Sharps containers properly labeled',
    order: 8,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-sw-03',
    category: 'Sharps & Waste',
    description: 'Biohazard waste bags not overfilled',
    order: 9,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-sw-04',
    category: 'Sharps & Waste',
    description: 'Waste segregation correct (sharps / infectious / chemical / general)',
    order: 10,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },

  // ── Surface Decontamination (order 11-13) ─────────────────────────────────
  {
    id: 'ic-sd-01',
    category: 'Surface Decontamination',
    description: 'Work surfaces decontaminated on schedule',
    order: 11,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-sd-02',
    category: 'Surface Decontamination',
    description: 'Decontamination log current',
    order: 12,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-sd-03',
    category: 'Surface Decontamination',
    description: 'Spill kit available and stocked',
    order: 13,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },

  // ── Equipment (order 14-16) ───────────────────────────────────────────────
  {
    id: 'ic-eq-01',
    category: 'Equipment',
    description: 'Autoclave validation current (last validation within 30 days)',
    order: 14,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-eq-02',
    category: 'Equipment',
    description: 'Biosafety cabinet certification current',
    order: 15,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-eq-03',
    category: 'Equipment',
    description: 'Centrifuge rotors inspected',
    order: 16,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },

  // ── General (order 17-20) ─────────────────────────────────────────────────
  {
    id: 'ic-gen-01',
    category: 'General',
    description: 'Fire extinguisher accessible and current',
    order: 17,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-gen-02',
    category: 'General',
    description: 'Emergency eye wash station functional',
    order: 18,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-gen-03',
    category: 'General',
    description: 'Emergency contact list posted and current',
    order: 19,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
  {
    id: 'ic-gen-04',
    category: 'General',
    description: 'SDS (Safety Data Sheets) accessible',
    order: 20,
    isDefault: true,
    requiresPhoto: false,
    isActive: true,
  },
]

/** All category names in display order. */
export const CHECKLIST_CATEGORIES = [
  'Hand Hygiene',
  'PPE',
  'Sharps & Waste',
  'Surface Decontamination',
  'Equipment',
  'General',
] as const
