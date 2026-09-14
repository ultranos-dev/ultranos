import { describe, it, expect } from 'vitest'
import { SYNC_FAILURE_CATEGORIES } from '@ultranos/sync-engine'
import en from '../../messages/en.json'
import ar from '../../messages/ar.json'
import prs from '../../messages/prs.json'
import ps from '../../messages/ps.json'

/**
 * The SyncDashboard renders tf(classifySyncFailure(...)) under the
 * 'syncDashboard.failure' namespace — so every failure category MUST have a
 * label in every locale, or a failed upload would render a raw key.
 */
const locales: Record<string, { syncDashboard: { failure: Record<string, string> } }> = {
  en: en as never,
  ar: ar as never,
  prs: prs as never,
  ps: ps as never,
}

describe('lab-lite sync failure category i18n completeness', () => {
  for (const [name, messages] of Object.entries(locales)) {
    it(`${name}.json has a syncDashboard.failure label for every category`, () => {
      for (const category of SYNC_FAILURE_CATEGORIES) {
        const label = messages.syncDashboard.failure[category]
        expect(
          typeof label === 'string' && label.length > 0,
          `missing syncDashboard.failure.${category} in ${name}.json`,
        ).toBe(true)
      }
    })
  }
})
