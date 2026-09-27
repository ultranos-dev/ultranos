/**
 * @ultranos/patient-kit — shared patient creation/editing/detail UI + contracts.
 *
 * Phase 1 (in progress): contracts + capability model. The shared <PatientForm> and
 * create/edit modals land here as the opd-lite implementation is migrated in.
 * See docs/patient-workflow-standardization-v1.md.
 */

export type {
  PatientFormValues,
  PatientFormMode,
  PatientFormSection,
  SectionVisibility,
  PatientFormCapabilities,
  PatientDataAdapter,
  PatientPhotoApi,
  UpdatePatientArgs,
  DuplicateDecision,
  PatientWriteResult,
  AllergyEntry,
  AllergyCriticality,
  PatientAddress,
  VitalsInput,
  ConsentCaptureInput,
  BloodGroup,
  PatientGender,
} from './types.js'

export {
  type AccessTier,
  fullFormCapabilities,
  minimizedFormCapabilities,
  readOnlyFormCapabilities,
  capabilitiesForTier,
  isSectionVisible,
  isSectionEditable,
} from './capabilities.js'
