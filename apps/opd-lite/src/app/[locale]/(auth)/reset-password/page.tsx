'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Stethoscope, KeyRound } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { Label } from '@ultranos/ui-kit/components/ui/label'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import { PasswordStrengthBar, getPasswordStrength } from '@ultranos/ui-kit'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuthSessionStore } from '@/stores/auth-session-store'

type ResetState = 'loading' | 'invalid' | 'form'

export default function ResetPasswordPage() {
  const t = useTranslations('auth')
  const searchParams = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<ResetState>('loading')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [actorId, setActorId] = useState<string | undefined>()

  const supabase = getSupabaseBrowserClient()
  const exchangedRef = useRef(false)
  const strength = getPasswordStrength(newPassword)
  const strengthLabels = [
    '',
    t('passwordStrengthWeak'),
    t('passwordStrengthFair'),
    t('passwordStrengthGood'),
    t('passwordStrengthStrong'),
  ]

  useEffect(() => {
    if (exchangedRef.current) return
    exchangedRef.current = true

    const code = searchParams.get('code')
    if (!code) {
      setState('invalid')
      return
    }

    supabase.auth.exchangeCodeForSession(code).then(({ data, error: exchErr }) => {
      if (exchErr || !data.session) {
        setState('invalid')
        return
      }
      setActorId(data.session.user.id)
      setState('form')
    })
  }, [searchParams, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (strength < 2 || newPassword !== confirmPassword) return

    setError(null)
    setLoading(true)

    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) {
        setError(t('passwordUpdateFailed'))
        return
      }
      reportAuthEvent('PASSWORD_RESET_COMPLETED', { actorId })
      useAuthSessionStore.getState().clearSession()
      await supabase.auth.signOut()
      router.push('/login?reset=success')
    } catch {
      setError(t('passwordUpdateFailed'))
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
            {state === 'loading' && (
              <div className="space-y-4" aria-busy="true" aria-label="Loading">
                <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
                <div className="h-4 w-64 animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
              </div>
            )}

            {state === 'invalid' && (
              <div className="flex flex-col items-center gap-4 text-center">
                <KeyRound className="size-10 text-muted-foreground" />
                <div>
                  <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                    {t('linkExpiredTitle')}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t('linkExpiredBody')}</p>
                </div>
                <Link href="/forgot-password" className="w-full">
                  <Button className="w-full">{t('requestNewLink')}</Button>
                </Link>
              </div>
            )}

            {state === 'form' && (
              <>
                <div>
                  <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                    {t('resetPasswordTitle')}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t('resetPasswordSubtitle')}</p>
                </div>

                {error && (
                  <Alert variant="destructive" role="alert">
                    {error}
                  </Alert>
                )}

                <form role="form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">{t('newPassword')}</Label>
                    <Input
                      id="new-password"
                      aria-label={t('newPassword')}
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <PasswordStrengthBar strength={strength} label={strengthLabels[strength]} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
                    <Input
                      id="confirm-password"
                      aria-label={t('confirmPassword')}
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => setConfirmTouched(true)}
                      autoComplete="new-password"
                    />
                    {confirmTouched && confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-xs text-destructive">{t('passwordMismatch')}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={strength < 2 || newPassword !== confirmPassword || loading}
                  >
                    {loading ? t('updating') : t('updatePassword')}
                  </Button>
                </form>
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
