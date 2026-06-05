'use client'

import { useCallback } from 'react'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Globe } from '@ultranos/ui-kit/icons'
import { getDirection } from '@ultranos/ui-kit'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type SupportedLocale = 'en' | 'ar' | 'prs' | 'ps'

const LANGUAGES: { code: SupportedLocale; nativeLabel: string }[] = [
  { code: 'en', nativeLabel: 'English' },
  { code: 'ar', nativeLabel: 'العربية' },
  { code: 'prs', nativeLabel: 'دری' },
  { code: 'ps', nativeLabel: 'پښتو' },
]

export function LanguageSelectorClient() {
  const locale = useLocale() as SupportedLocale
  const router = useRouter()

  const setLocale = useCallback(
    (newLocale: SupportedLocale) => {
      const secure = window.location.protocol === 'https:' ? ';Secure' : ''
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax${secure}`
      router.refresh()
    },
    [router],
  )
  const current = LANGUAGES.find((l) => l.code === locale)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Select language"
        >
          <Globe size={16} />
          <span className="hidden sm:inline">{current?.nativeLabel ?? locale}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" sideOffset={4}>
        <DropdownMenuLabel>Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            dir={getDirection(lang.code)}
            onSelect={() => setLocale(lang.code)}
            className={locale === lang.code ? 'font-medium text-primary' : undefined}
          >
            {lang.nativeLabel}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
