import { describe, it, expect } from 'vitest'
import { SYNC_FAILURE_CATEGORIES } from '@ultranos/sync-engine'
import en from '../../messages/en.json'
import ar from '../../messages/ar.json'
import prs from '../../messages/prs.json'
import ps from '../../messages/ps.json'

/**
 * The SyncQueueEntry component renders t(classifySyncFailure(...)) — so every
 * failure category MUST have a label under the 'sync' namespace in every locale,
 * or a failed entry would render a raw key. This guards against a category being
 * added to the shared classifier without a matching translation.
 */
const locales: Record<string, { sync: Record<string, string> }> = {
  en: en as never,
  ar: ar as never,
  prs: prs as never,
  ps: ps as never,
}

describe('sync failure category i18n completeness', () => {
  for (const [name, messages] of Object.entries(locales)) {
    it(`${name}.json has a sync label for every failure category`, () => {
      for (const category of SYNC_FAILURE_CATEGORIES) {
        expect(
          typeof messages.sync[category] === 'string' && messages.sync[category].length > 0,
          `missing sync.${category} in ${name}.json`,
        ).toBe(true)
      }
    })
  }
})
