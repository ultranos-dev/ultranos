'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Stethoscope, MailCheck } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { Label } from '@ultranos/ui-kit/components/ui/label'
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
              <Stethoscope className="size-4" />
            </div>
            <span className="font-heading text-sm font-semibold text-foreground">OPD Lite</span>
          </div>
          <LanguageSelectorClient />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            {state === 'request' ? (
              <>
                <div>
                  <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                    {t('forgotPasswordTitle')}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t('forgotPasswordSubtitle')}</p>
                </div>

                {error && (
                  <Alert variant="destructive" role="alert">
                    {error}
                  </Alert>
                )}

                <form role="form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('email')}</Label>
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
                    {loading ? t('sending') : t('sendResetLink')}
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
                    <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
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

        <p className="text-center text-xs text-muted-foreground">{t('platformName')}</p>
      </div>

      <div className="relative hidden overflow-hidden bg-muted lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute -end-32 -top-32 size-[28rem] rounded-full bg-primary/5" />
        <div className="absolute -bottom-40 -start-16 size-96 rounded-full bg-primary/5" />
        <div className="relative z-10 px-12 text-center text-foreground">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Stethoscope className="size-10 text-primary" />
          </div>
          <h2 className="font-heading text-3xl font-bold">OPD Lite</h2>
          <p className="mt-3 text-base text-muted-foreground">{t('panelTagline')}</p>
          <ul className="mt-10 space-y-2 text-start">
            {[t('panelFeature1'), t('panelFeature2'), t('panelFeature3')].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
