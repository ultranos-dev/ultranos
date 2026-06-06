'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Microscope, MailCheck } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

type ForgotState = 'request' | 'sent'

export default function ForgotPasswordPage() {
  const t = useTranslations('auth')
  const searchParams = useSearchParams()
  const [state, setState] = useState<ForgotState>('request')
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(false)

  const supabase = getSupabaseBrowserClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (resetError) {
        setError(t('resetRequestFailed'))
        return
      }

      reportAuthEvent('PASSWORD_RESET_REQUESTED')
      setState('sent')
      setResendCooldown(true)
      setTimeout(() => setResendCooldown(false), 60_000)
    } catch {
      setError(t('resetRequestFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setLoading(true)
    try {
      const { error: resendError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (!resendError) {
        reportAuthEvent('PASSWORD_RESET_REQUESTED')
        setResendCooldown(true)
        setTimeout(() => setResendCooldown(false), 60_000)
      }
    } catch {
      // best-effort
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Microscope className="size-4" />
            </div>
            <span className="font-heading text-sm font-semibold text-foreground">Lab Lite</span>
          </div>
          <LanguageSelectorClient />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            {state === 'request' ? (
              <>
                <div>
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                    {t('forgotPasswordTitle')}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t('forgotPasswordSubtitle')}</p>
                </div>

                {error && (
                  <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <form role="form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Sending\u2026' : t('sendResetLink')}
                  </Button>
                </form>

                <p className="text-center text-sm">
                  <Link href="/login" className="text-muted-foreground hover:text-foreground">
                    {t('backToSignIn')}
                  </Link>
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-4 text-center">
                  <MailCheck className="size-10 text-primary" />
                  <div>
                    <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                      {t('checkYourEmail')}
                    </h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">{t('resetLinkSent')}</p>
                  </div>
                </div>

                <p className="text-center text-sm">
                  <Link href="/login" className="text-muted-foreground hover:text-foreground">
                    {t('backToSignIn')}
                  </Link>
                </p>

                {!resendCooldown && (
                  <p className="text-center text-sm text-muted-foreground">
                    {t('didntReceiveIt')}{' '}
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={loading}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {t('resend')}
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">Ultranos Healthcare Platform</p>
      </div>

      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute -end-32 -top-32 size-[28rem] rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-40 -start-16 size-96 rounded-full bg-primary-foreground/5" />
        <div className="relative z-10 px-12 text-center text-primary-foreground">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
            <Microscope className="size-10" />
          </div>
          <h2 className="font-heading text-3xl font-bold">Lab Lite</h2>
          <p className="mt-3 text-base text-primary-foreground/75">Diagnostic test management and reporting</p>
          <ul className="mt-10 space-y-2 text-start">
            {[
              'Sample tracking & chain of custody',
              'Result entry and QC validation',
              'Analyzer integration & reporting',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-primary-foreground/70">
                <span className="size-1.5 shrink-0 rounded-full bg-primary-foreground/50" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
