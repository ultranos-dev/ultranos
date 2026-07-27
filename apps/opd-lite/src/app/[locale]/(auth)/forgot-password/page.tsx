'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { MailCheck } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { Label } from '@ultranos/ui-kit/components/ui/label'
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
    <div className="space-y-6">
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
  )
}
