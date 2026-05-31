'use client'

import { ConnectedLanguageSelector } from '@ultranos/ui-kit/connected-language-selector'

export function LanguageSelectorClient({ collapsed = false }: { collapsed?: boolean }) {
  return <ConnectedLanguageSelector collapsed={collapsed} />
}
