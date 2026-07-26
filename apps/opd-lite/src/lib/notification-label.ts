/**
 * Shared notification type -> i18n key mapping.
 * Used by both NotificationPanel (bell dropdown) and NotificationCenter (full page).
 * Keys map to the 'notifications' namespace in each locale's messages file.
 */
export function notificationLabelKey(type: string): string {
  switch (type) {
    case 'LAB_RESULT_AVAILABLE': return 'typeLab'
    case 'LAB_RESULT_ESCALATION': return 'typeLabUrgent'
    case 'PRESCRIPTION_READY': return 'typePrescription'
    case 'CONSENT_CHANGE': return 'typeConsent'
    case 'SYNC_CONFLICT': return 'typeSyncConflict'
    case 'ALLERGY_UPDATE': return 'typeAllergyUpdate'
    default: return 'typeDefault'
  }
}
