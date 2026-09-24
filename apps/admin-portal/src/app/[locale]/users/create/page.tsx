'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
// ROLE_MODULE_MAP and MODULE_DISPLAY_NAMES reserved for future role-based module config
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AvailableRole {
  role: string
  moduleCode: string | null
  moduleName: string | null
}

interface UnavailableRole {
  role: string
  moduleCode: string
  moduleName: string
  reason: 'NOT_SUBSCRIBED'
}

export default function CreateUserPage() {
  const t = useTranslations('users')
  const tc = useTranslations('common')
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([])
  const [unavailableRoles, setUnavailableRoles] = useState<UnavailableRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [givenName, setGivenName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [createdUser, setCreatedUser] = useState<{
    userId: string; givenName: string; familyName: string; email: string; role: string; setupLink: string | null; emailSent: boolean
  } | null>(null)

  useEffect(() => {
    async function fetchRoles() {
      try {
        setLoading(true)
        const result = await trpc.subscription.getAvailableRoles.query()
        setAvailableRoles(result.availableRoles)
        setUnavailableRoles(result.unavailableRoles)
      } catch (err: unknown) {
        setError((err as Error)?.message ?? t('createLoadRolesError'))
      } finally {
        setLoading(false)
      }
    }
    fetchRoles()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    setSubmitSuccess(false)

    // Story 62.2 (M-ADM-5): invite-only onboarding — no admin-set password. The
    // invitee sets their own credential via the returned setup/invite link.

    // Client-side guard: prevent submission of unavailable role
    const isAvailable = availableRoles.some((r) => r.role === selectedRole)
    if (!isAvailable) {
      setSubmitError(t('createRoleUnavailableError'))
      return
    }

    // Server-side validation before creating user
    try {
      setSubmitting(true)
      const validation = await trpc.subscription.validateRoleForOrg.query({ role: selectedRole })
      if (!validation.allowed) {
        setSubmitError(validation.reason ?? t('createRoleNotPermittedError'))
        return
      }

      const result = await trpc.admin.createUser.mutate({ givenName, familyName, email, role: selectedRole })
      setCreatedUser(result)
      setSubmitSuccess(true)
    } catch (err: unknown) {
      setSubmitError((err as Error)?.message ?? t('createValidateRoleError'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">{t('createLoadingRoles')}</div>
  }

  if (error) {
    return <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{t('createErrorPrefix', { error })}</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="w-fit px-0"><a href="/users">{t('detailBackToUsers')}</a></Button>
      <h1 className="text-2xl font-semibold text-foreground">{t('createTitle')}</h1>
      <p className="text-muted-foreground">
        {t('createDescription')}
      </p>

      <form onSubmit={handleSubmit}>
        <div className="rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50 p-5 space-y-4">
          {/* Given Name Field */}
          <div>
            <label htmlFor="givenName" className="block text-sm font-medium text-muted-foreground">
              {t('createGivenName')}
            </label>
            <Input
              id="givenName"
              type="text"
              required
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Family Name Field */}
          <div>
            <label htmlFor="familyName" className="block text-sm font-medium text-muted-foreground">
              {t('createFamilyName')}
            </label>
            <Input
              id="familyName"
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-muted-foreground">
              {tc('email')}
            </label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Story 62.2 (M-ADM-5): invite-only. No password is set here — the
              invitee receives a setup link (shown on success) to set their own
              credential. */}
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {t('createInviteNotice')}
          </div>

          {/* Role Selector */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">{tc('role')}</p>
            <div className="space-y-2">
              {/* Available roles — selectable */}
              {availableRoles.map((r) => (
                <label
                  key={r.role}
                  className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                    selectedRole === r.role
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-card'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.role}
                    checked={selectedRole === r.role}
                    onChange={() => setSelectedRole(r.role)}
                    className="accent-accent"
                  />
                  <div>
                    <span className="font-medium text-sm text-foreground">{r.role}</span>
                    {r.moduleName && (
                      <span className="ms-2 text-xs text-muted-foreground">({r.moduleName})</span>
                    )}
                  </div>
                </label>
              ))}

              {/* Unavailable roles — disabled with subscription prompt */}
              {unavailableRoles.map((r) => (
                <div
                  key={r.role}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 opacity-60"
                >
                  <input type="radio" name="role" disabled className="accent-accent" />
                  <div>
                    <span className="font-medium text-sm text-muted-foreground">{r.role}</span>
                    <span className="ms-2 text-xs text-muted-foreground">
                      &mdash;{' '}
                      <a
                        href="/subscriptions"
                        className="text-primary hover:underline"
                      >
                        {t('createSubscribePrompt', { moduleName: r.moduleName, role: r.role })}
                      </a>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Submission feedback */}
        {submitError && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        {submitSuccess && createdUser && (
          <div className="rounded-2xl bg-success/10 border border-success/20 px-4 py-3 text-sm text-success">
            <p className="font-semibold text-base mb-2">{t('createSuccessTitle')}</p>
            <p><span className="font-medium">{t('createSuccessNameLabel')}</span> {createdUser.givenName} {createdUser.familyName}</p>
            <p><span className="font-medium">{t('createSuccessEmailLabel')}</span> {createdUser.email}</p>
            <p><span className="font-medium">{t('createSuccessRoleLabel')}</span> {createdUser.role}</p>
            {createdUser.emailSent && (
              <p className="mt-2">{t('createInvitationSent', { email: createdUser.email })}</p>
            )}
            {!createdUser.emailSent && createdUser.setupLink && (
              <div className="mt-2">
                <p>{t('createEmailNotConfigured')}</p>
                <code className="mt-1 block break-all rounded-lg bg-success/15 px-3 py-2 font-mono text-xs text-success">
                  {createdUser.setupLink}
                </code>
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <Button
                type="button"
                onClick={() => {
                  setCreatedUser(null)
                  setSubmitSuccess(false)
                  setGivenName('')
                  setFamilyName('')
                  setEmail('')
                  setSelectedRole('')
                  setSubmitError(null)
                }}
              >
                {t('createAnotherUser')}
              </Button>
              <Button variant="outline" asChild>
                <a href="/users">{t('createViewAllUsers')}</a>
              </Button>
            </div>
          </div>
        )}

        {!submitSuccess && (
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={submitting || !selectedRole || !givenName || !email}
            >
              {submitting ? t('createSubmitting') : t('createUser')}
            </Button>
            <Button variant="outline" asChild>
              <a href="/users">{tc('cancel')}</a>
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
