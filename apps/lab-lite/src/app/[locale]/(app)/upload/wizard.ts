import type { WizardStep as BaseWizardStep } from '@/components/upload/StepIndicator'
import type { OcrAnalysisResult } from '@/lib/trpc'
import type { MetadataFormValues } from '@/components/MetadataForm'

/** Extended wizard step — SELECT_ORDER is the branch entry point before VERIFY_PATIENT. */
export type WizardStep = BaseWizardStep | 'SELECT_ORDER'

// ── Wizard State ────────────────────────────────────────

export interface WizardState {
  step: WizardStep
  patient: { patientRef: string; patientFirstName: string; patientAge: number } | null
  /** Set when the upload is tied to an existing lab order (notifies ordering physician). */
  orderId: string | null
  file: { file: File; fileName: string; fileType: string } | null
  ocrResult: OcrAnalysisResult | null
  ocrLoading: boolean
  metadata: MetadataFormValues | null
}

export type WizardAction =
  | { type: 'SET_PATIENT'; payload: { patientRef: string; patientFirstName: string; patientAge: number } }
  | { type: 'SET_ORDER'; payload: { patient: { patientRef: string; patientFirstName: string; patientAge: number }; orderId: string } }
  | { type: 'SET_FILE'; payload: { file: File; fileName: string; fileType: string } }
  | { type: 'SET_OCR_LOADING'; payload: boolean }
  | { type: 'SET_OCR_RESULT'; payload: OcrAnalysisResult }
  | { type: 'SET_METADATA'; payload: MetadataFormValues }
  | { type: 'GO_TO_STEP'; payload: WizardStep }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }

/** Linear step chain for NEXT/PREV navigation — SELECT_ORDER is the branch entry point, not part of this chain. */
const STEP_ORDER: BaseWizardStep[] = ['VERIFY_PATIENT', 'UPLOAD_FILE', 'TAG_METADATA', 'REVIEW_SUBMIT']

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_PATIENT':
      // Free-form path: always clears any stale orderId
      return { ...state, patient: action.payload, orderId: null, step: 'UPLOAD_FILE', file: null, ocrResult: null, ocrLoading: false, metadata: null }
    case 'SET_ORDER':
      // Order-linked path: sets patient + orderId, resets file/ocr/metadata
      return { ...state, patient: action.payload.patient, orderId: action.payload.orderId, step: 'UPLOAD_FILE', file: null, ocrResult: null, ocrLoading: false, metadata: null }
    case 'SET_FILE':
      return { ...state, file: action.payload }
    case 'SET_OCR_LOADING':
      return { ...state, ocrLoading: action.payload }
    case 'SET_OCR_RESULT':
      return { ...state, ocrResult: action.payload, ocrLoading: false }
    case 'SET_METADATA':
      return { ...state, metadata: action.payload, step: 'REVIEW_SUBMIT' }
    case 'GO_TO_STEP':
      return { ...state, step: action.payload }
    case 'NEXT_STEP': {
      const idx = STEP_ORDER.indexOf(state.step as BaseWizardStep)
      const next = STEP_ORDER[idx + 1]
      if (idx >= 0 && next) return { ...state, step: next }
      return state
    }
    case 'PREV_STEP': {
      const idx = STEP_ORDER.indexOf(state.step as BaseWizardStep)
      const prev = STEP_ORDER[idx - 1]
      if (idx > 0 && prev) return { ...state, step: prev }
      return state
    }
    default:
      return state
  }
}

export const initialState: WizardState = {
  step: 'SELECT_ORDER',
  patient: null,
  orderId: null,
  file: null,
  ocrResult: null,
  ocrLoading: false,
  metadata: null,
}
