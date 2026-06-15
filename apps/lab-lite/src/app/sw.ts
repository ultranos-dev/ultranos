import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// Consent audio files for offline availability (Story 45.1)
const consentAudioPrecache: (PrecacheEntry | string)[] = [
  '/audio/consent/consent-lab-collection-en.mp3',
  '/audio/consent/consent-lab-collection-ar.mp3',
  '/audio/consent/consent-lab-collection-prs.mp3',
  '/audio/consent/consent-lab-collection-ps.mp3',
]

const serwist = new Serwist({
  precacheEntries: [...(self.__SW_MANIFEST ?? []), ...consentAudioPrecache],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
})

serwist.addEventListeners()
