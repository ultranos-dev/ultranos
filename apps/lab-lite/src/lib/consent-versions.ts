export type ConsentLocale = 'en' | 'ar' | 'prs' | 'ps'

export interface ConsentVersionEntry {
  version: string
  effectiveDate: string // ISO 8601 date
  messageKeys: {
    title: string
    bodyText: string
    rightToRefuse: string
  }
  audioFiles: Record<ConsentLocale, string>
}

const consentVersions: ConsentVersionEntry[] = [
  {
    version: '1.0.0',
    effectiveDate: '2026-05-30',
    messageKeys: {
      title: 'consent.labCollection.title',
      bodyText: 'consent.labCollection.bodyText',
      rightToRefuse: 'consent.labCollection.rightToRefuse',
    },
    audioFiles: {
      en: '/audio/consent/consent-lab-collection-en.mp3',
      ar: '/audio/consent/consent-lab-collection-ar.mp3',
      prs: '/audio/consent/consent-lab-collection-prs.mp3',
      ps: '/audio/consent/consent-lab-collection-ps.mp3',
    },
  },
]

export const CURRENT_CONSENT_VERSION = '1.0.0'

export function getConsentVersion(version: string): ConsentVersionEntry | undefined {
  return consentVersions.find((v) => v.version === version)
}

export function getCurrentConsentVersion(): ConsentVersionEntry {
  const entry = getConsentVersion(CURRENT_CONSENT_VERSION)
  if (!entry) {
    throw new Error(`Current consent version ${CURRENT_CONSENT_VERSION} not found in registry`)
  }
  return entry
}

export function getAudioPath(locale: ConsentLocale, version?: string): string {
  const entry = version ? getConsentVersion(version) : getCurrentConsentVersion()
  if (!entry) {
    throw new Error(`Consent version ${version} not found`)
  }
  return entry.audioFiles[locale]
}
