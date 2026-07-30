'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { trpc, reportAdminAuthEvent } from '@/lib/trpc'
import { NotificationPreferences } from '@/components/settings/NotificationPreferences'
import { ThresholdSettings } from '@/components/settings/ThresholdSettings'
import { ModuleSettingsCard } from '@/components/settings/ModuleSettingsCard'
import { SurveillanceConfigForm } from '@/components/alerts/SurveillanceConfigForm'
import { SurveillanceAlertHistory } from '@/components/alerts/SurveillanceAlertHistory'
import { KeyRound, Package } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'

/* ─── Types ─── */

type Factor = {
  id: string
  factor_type: string
  status: string
  friendly_name?: string
  created_at?: string
}

interface AdminProfile {
  name: string
  email: string
  role: string
  createdAt: string
}

interface OrgData {
  id: string
  name: string
  countryCode: string
  billingEmail: string
  timezone: string
}

/* ─── Constants ─── */

const MENA_COUNTRIES: { code: string; name: string }[] = [
  { code: 'AF', name: 'Afghanistan' }, { code: 'BH', name: 'Bahrain' },
  { code: 'EG', name: 'Egypt' }, { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' }, { code: 'JO', name: 'Jordan' },
  { code: 'KW', name: 'Kuwait' }, { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KG', name: 'Kyrgyzstan' }, { code: 'LB', name: 'Lebanon' },
  { code: 'OM', name: 'Oman' }, { code: 'PK', name: 'Pakistan' },
  { code: 'PS', name: 'Palestine' }, { code: 'QA', name: 'Qatar' },
  { code: 'SA', name: 'Saudi Arabia' }, { code: 'SY', name: 'Syria' },
  { code: 'TJ', name: 'Tajikistan' }, { code: 'TR', name: 'Turkey' },
  { code: 'TM', name: 'Turkmenistan' }, { code: 'AE', name: 'United Arab Emirates' },
  { code: 'UZ', name: 'Uzbekistan' }, { code: 'YE', name: 'Yemen' },
]

const IANA_TIMEZONES = [
  'UTC',
  'Africa/Cairo', 'Asia/Aden', 'Asia/Almaty', 'Asia/Amman', 'Asia/Ashgabat',
  'Asia/Baghdad', 'Asia/Bahrain', 'Asia/Bishkek', 'Asia/Damascus',
  'Asia/Dubai', 'Asia/Dushanbe', 'Asia/Gaza', 'Asia/Kabul', 'Asia/Karachi',
  'Asia/Kuwait', 'Asia/Muscat', 'Asia/Qatar', 'Asia/Riyadh', 'Asia/Tashkent',
  'Asia/Tehran',
]

type TabId =
  | 'my-account'
  | 'organization'
  | 'notifications'
  | 'thresholds'
  | 'modules'
  | 'alert-config'

/* Shared card idiom for settings sections */
const CARD = 'rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50'
const CARD_TITLE = 'text-sm font-semibold text-foreground uppercase tracking-wide'
const FIELD_LABEL = 'text-xs font-medium text-muted-foreground'

/* ─── Page Component ─── */

export default function SettingsPage() {
  const t = useTranslations('settings')
  const supabase = getSupabaseBrowserClient()

  const TABS: { id: TabId; label: string }[] = [
    { id: 'my-account', label: t('navMyAccount') },
    { id: 'organization', label: t('navOrganization') },
    { id: 'notifications', label: t('navNotifications') },
    { id: 'thresholds', label: t('navThresholds') },
    { id: 'modules', label: t('navModules') },
    { id: 'alert-config', label: t('navAlertConfig') },
  ]

  const [activeTab, setActiveTab] = useState<TabId>('my-account')

  /* Profile state */
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [profileName, setProfileName] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  /* Password state */
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  /* FIDO2 state */
  const [factors, setFactors] = useState<Factor[]>([])
  const [fidoLoading, setFidoLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [fidoError, setFidoError] = useState<string | null>(null)
  const [fidoSuccess, setFidoSuccess] = useState<string | null>(null)

  /* Sessions state */
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsMsg, setSessionsMsg] = useState<string | null>(null)

  /* Subscribed modules state */
  const [subscribedModules, setSubscribedModules] = useState<{ moduleCode: string; moduleName: string }[]>([])

  /* Organization state */
  const [org, setOrg] = useState<OrgData | null>(null)
  const [orgDraft, setOrgDraft] = useState<Omit<OrgData, 'id'> | null>(null)
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgSuccess, setOrgSuccess] = useState<string | null>(null)
  const [orgError, setOrgError] = useState<string | null>(null)

  /* ─── Load data on mount ─── */

  useEffect(() => {
    loadProfile()
    loadFactors()
    loadOrg()
    loadSubscribedModules()
  }, [])

  async function loadSubscribedModules() {
    try {
      const data = await trpc.subscription.getOrgSubscriptions.query()
      const subs = (data as { subscriptions?: { moduleCode: string; moduleName: string }[] })?.subscriptions ?? []
      setSubscribedModules(subs as { moduleCode: string; moduleName: string }[])
    } catch {
      // Non-blocking
    }
  }

  /* ─── Profile ─── */

  async function loadProfile() {
    try {
      const data = await trpc.admin.getProfile.query()
      setProfile(data as AdminProfile)
      setProfileName((data as AdminProfile).name ?? '')
    } catch {
      // Non-blocking
    }
  }

  async function handleSaveProfile() {
    setProfileSaving(true)
    setProfileError(null)
    setProfileSuccess(null)
    try {
      await trpc.admin.updateAdminProfile.mutate({ name: profileName })
      setProfileSuccess(t('profileSaved'))
      setTimeout(() => setProfileSuccess(null), 3000)
    } catch {
      setProfileError(t('profileError'))
    } finally {
      setProfileSaving(false)
    }
  }

  /* ─── Change Password ─── */

  async function handleChangePassword() {
    setPasswordError(null)
    setPasswordSuccess(null)

    if (newPassword.length < 12) {
      setPasswordError('New password must be at least 12 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    setPasswordSaving(true)
    try {
      // Re-authenticate with current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email ?? '',
        password: currentPassword,
      })
      if (signInError) {
        setPasswordError('Current password is incorrect.')
        setPasswordSaving(false)
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        setPasswordError(`Failed to update password: ${updateError.message}`)
        setPasswordSaving(false)
        return
      }

      reportAdminAuthEvent('ADMIN_PASSWORD_CHANGED')
      setPasswordSuccess(t('changePasswordSuccess'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordSuccess(null), 3000)
    } catch {
      setPasswordError('An unexpected error occurred.')
    } finally {
      setPasswordSaving(false)
    }
  }

  /* ─── FIDO2 Security Keys ─── */

  async function loadFactors() {
    setFidoLoading(true)
    try {
      const { data, error: factorsError } = await supabase.auth.mfa.listFactors()
      if (factorsError) {
        setFidoError('Failed to load MFA factors')
        return
      }
      setFactors(
        (data.all ?? []).filter((f: Factor) => f.factor_type === 'webauthn') as Factor[],
      )
    } catch {
      setFidoError('Failed to load MFA factors')
    } finally {
      setFidoLoading(false)
    }
  }

  async function handleEnroll() {
    setFidoError(null)
    setFidoSuccess(null)
    setEnrolling(true)

    try {
      if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
        setFidoError('WebAuthn is not supported in this browser. Use a modern browser with FIDO2 support.')
        setEnrolling(false)
        return
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'webauthn',
      })

      if (enrollError) {
        setFidoError(`Enrollment failed: ${enrollError.message}`)
        setEnrolling(false)
        return
      }

      // Challenge and verify the newly enrolled factor
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: data.id })

      if (challengeError) {
        setFidoError('Failed to initiate verification challenge')
        setEnrolling(false)
        return
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: data.id,
        challengeId: challenge.id,
        code: '',
      })

      if (verifyError) {
        setFidoError('Key verification failed. Please try again.')
        setEnrolling(false)
        return
      }

      reportAdminAuthEvent('ADMIN_MFA_ENROLLED', { factorId: data.id })
      setFidoSuccess('Security key enrolled successfully.')
      await loadFactors()
    } catch {
      setFidoError('An unexpected error occurred during enrollment')
    } finally {
      setEnrolling(false)
    }
  }

  async function handleUnenroll(factorId: string) {
    setFidoError(null)
    setFidoSuccess(null)

    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
      })

      if (unenrollError) {
        setFidoError(`Failed to remove key: ${unenrollError.message}`)
        return
      }

      reportAdminAuthEvent('ADMIN_MFA_UNENROLLED', { factorId })
      setFidoSuccess('Security key removed.')
      await loadFactors()
    } catch {
      setFidoError('An unexpected error occurred')
    }
  }

  /* ─── Active Sessions ─── */

  async function handleSignOutOtherSessions() {
    setSessionsLoading(true)
    setSessionsMsg(null)
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' })
      if (error) {
        setSessionsMsg('Failed to sign out other sessions.')
        return
      }
      reportAdminAuthEvent('ADMIN_SESSION_REVOKED')
      setSessionsMsg('All other sessions have been signed out.')
      setTimeout(() => setSessionsMsg(null), 3000)
    } catch {
      setSessionsMsg('An unexpected error occurred.')
    } finally {
      setSessionsLoading(false)
    }
  }

  /* ─── Organization ─── */

  async function loadOrg() {
    try {
      const data = await trpc.admin.getOrganization.query()
      const orgData = data as OrgData
      setOrg(orgData)
      setOrgDraft({ name: orgData.name, countryCode: orgData.countryCode, billingEmail: orgData.billingEmail, timezone: orgData.timezone })
    } catch {
      // Non-blocking
    }
  }

  const orgDirty =
    org && orgDraft
      ? org.name !== orgDraft.name ||
        org.countryCode !== orgDraft.countryCode ||
        org.billingEmail !== orgDraft.billingEmail ||
        org.timezone !== orgDraft.timezone
      : false

  async function handleSaveOrg() {
    if (!orgDraft || !org) return
    setOrgSaving(true)
    setOrgError(null)
    setOrgSuccess(null)
    try {
      const changes: Record<string, string> = {}
      if (orgDraft.name !== org.name) changes.name = orgDraft.name
      if (orgDraft.countryCode !== org.countryCode) changes.countryCode = orgDraft.countryCode
      if (orgDraft.billingEmail !== org.billingEmail) changes.billingEmail = orgDraft.billingEmail
      if (orgDraft.timezone !== org.timezone) changes.timezone = orgDraft.timezone

      await trpc.admin.updateOrganization.mutate(changes)
      setOrg({ ...org, ...orgDraft })
      setOrgSuccess(t('orgSaved'))
      setTimeout(() => setOrgSuccess(null), 3000)
    } catch {
      setOrgError(t('orgError'))
    } finally {
      setOrgSaving(false)
    }
  }

  const verifiedFactors = factors.filter((f) => f.status === 'verified')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>

      {/* Tab bar */}
      <div
        className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full border border-border bg-card p-1"
        role="tablist"
        aria-label={t('pageTitle')}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ My Account ═══ */}
      {activeTab === 'my-account' && (
        <div className="flex flex-col gap-4">
          {/* Profile */}
          <div className={CARD}>
            <div className="space-y-4">
              <h2 className={CARD_TITLE}>{t('profileTitle')}</h2>
              <div className="space-y-3">
                <label className="block">
                  <span className={FIELD_LABEL}>{t('profileFullName')}</span>
                  <Input
                    type="text"
                    value={profileName}
                    onChange={(e) => { setProfileName(e.target.value); setProfileSuccess(null) }}
                    className="mt-1"
                  />
                </label>
                <div>
                  <span className={FIELD_LABEL}>{t('profileEmail')}</span>
                  <p className="mt-1 text-sm text-foreground">{profile?.email ?? '...'}</p>
                </div>
                <div>
                  <span className={FIELD_LABEL}>{t('profileRole')}</span>
                  <p className="mt-1 text-sm text-foreground">{profile?.role ?? '...'}</p>
                </div>
                <div>
                  <span className={FIELD_LABEL}>{t('profileCreated')}</span>
                  <p className="mt-1 text-sm text-foreground">
                    {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '...'}
                  </p>
                </div>
              </div>
              {profileError && (
                <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{profileError}</div>
              )}
              {profileSuccess && (
                <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{profileSuccess}</div>
              )}
              <Button
                type="button"
                onClick={handleSaveProfile}
                disabled={profileSaving || profileName === (profile?.name ?? '')}
              >
                {profileSaving ? t('profileSaving') : t('profileSave')}
              </Button>
            </div>
          </div>

          {/* Change Password */}
          <div className={CARD}>
            <div className="space-y-4">
              <h2 className={CARD_TITLE}>{t('changePasswordTitle')}</h2>
              <div className="space-y-3">
                <label className="block">
                  <span className={FIELD_LABEL}>{t('changePasswordCurrent')}</span>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1"
                  />
                </label>
                <label className="block">
                  <span className={FIELD_LABEL}>{t('changePasswordNew')}</span>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1"
                  />
                </label>
                <label className="block">
                  <span className={FIELD_LABEL}>{t('changePasswordConfirm')}</span>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1"
                  />
                </label>
              </div>
              {passwordError && (
                <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{passwordError}</div>
              )}
              {passwordSuccess && (
                <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{passwordSuccess}</div>
              )}
              <Button
                type="button"
                onClick={handleChangePassword}
                disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
              >
                {passwordSaving ? t('profileSaving') : t('changePasswordSave')}
              </Button>
            </div>
          </div>

          {/* Security Keys (FIDO2) */}
          <div className={CARD}>
            <div className="space-y-4">
              <h2 className={CARD_TITLE}>{t('securityKeysTitle')}</h2>
              <p className="text-muted-foreground text-sm">
                Register a hardware security key (e.g., YubiKey) to add an extra layer of protection to your account.
                Once enrolled, you will be prompted for your key on every sign-in.
              </p>

              {fidoError && (
                <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {fidoError}
                </div>
              )}

              {fidoSuccess && (
                <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
                  {fidoSuccess}
                </div>
              )}

              {fidoLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <>
                  {verifiedFactors.length > 0 && (
                    <div className="space-y-3">
                      {verifiedFactors.map((factor) => (
                        <div
                          key={factor.id}
                          className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <KeyRound className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {factor.friendly_name || 'Security Key'}
                              </p>
                              {factor.created_at && (
                                <p className="text-xs text-muted-foreground">
                                  Added {new Date(factor.created_at).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnenroll(factor.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            {t('securityKeyRemove')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {verifiedFactors.length === 0 && (
                    <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                      {t('securityKeysNoKeys')}
                    </div>
                  )}

                  <Button
                    type="button"
                    onClick={handleEnroll}
                    disabled={enrolling}
                  >
                    {enrolling ? t('profileSaving') : t('securityKeysAdd')}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Active Sessions */}
          <div className={CARD}>
            <div className="space-y-4">
              <h2 className={CARD_TITLE}>{t('sessionsTitle')}</h2>
              <p className="text-muted-foreground text-sm">
                Sign out of all other browser sessions. Your current session will remain active.
              </p>
              {sessionsMsg && (
                <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
                  {sessionsMsg}
                </div>
              )}
              <Button
                type="button"
                onClick={handleSignOutOtherSessions}
                disabled={sessionsLoading}
              >
                {sessionsLoading ? t('profileSaving') : t('sessionsRevoke')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Organization ═══ */}
      {activeTab === 'organization' && (
        <div className={CARD}>
          <div className="space-y-4">
            <h2 className={CARD_TITLE}>{t('orgTitle')}</h2>
            {orgDraft ? (
              <>
                <label className="block">
                  <span className={FIELD_LABEL}>{t('orgName')}</span>
                  <Input
                    type="text"
                    value={orgDraft.name}
                    onChange={(e) => setOrgDraft({ ...orgDraft, name: e.target.value })}
                    className="mt-1"
                  />
                </label>

                <label className="block">
                  <span className={FIELD_LABEL}>{t('orgCountry')}</span>
                  <select
                    value={orgDraft.countryCode}
                    onChange={(e) => setOrgDraft({ ...orgDraft, countryCode: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select a country</option>
                    {MENA_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={FIELD_LABEL}>{t('orgBillingEmail')}</span>
                  <Input
                    type="email"
                    value={orgDraft.billingEmail}
                    onChange={(e) => setOrgDraft({ ...orgDraft, billingEmail: e.target.value })}
                    className="mt-1"
                  />
                </label>

                <label className="block">
                  <span className={FIELD_LABEL}>{t('orgTimezone')}</span>
                  <select
                    value={orgDraft.timezone}
                    onChange={(e) => setOrgDraft({ ...orgDraft, timezone: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select a timezone</option>
                    {IANA_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </label>

                <div>
                  <span className={FIELD_LABEL}>{t('orgId')}</span>
                  <p className="mt-1 text-sm font-mono text-foreground">{org?.id ?? '...'}</p>
                </div>

                {orgError && (
                  <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{orgError}</div>
                )}
                {orgSuccess && (
                  <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{orgSuccess}</div>
                )}

                <Button
                  type="button"
                  onClick={handleSaveOrg}
                  disabled={orgSaving || !orgDirty}
                >
                  {orgSaving ? t('orgSaving') : t('orgSave')}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('errorLoad')}</p>
            )}
          </div>
        </div>
      )}

      {/* ═══ Notifications ═══ */}
      {activeTab === 'notifications' && (
        <div className={CARD}>
          <div className="space-y-4">
            <h2 className={CARD_TITLE}>{t('notificationsTitle')}</h2>
            <NotificationPreferences email={profile?.email} />
          </div>
        </div>
      )}

      {/* ═══ Thresholds ═══ */}
      {activeTab === 'thresholds' && (
        <div className={CARD}>
          <div className="space-y-4">
            <h2 className={CARD_TITLE}>{t('thresholdsTitle')}</h2>
            <ThresholdSettings />
          </div>
        </div>
      )}

      {/* ═══ Modules ═══ */}
      {activeTab === 'modules' && (
        <div className={CARD}>
          <div className="space-y-4">
            <h2 className={CARD_TITLE}>{t('modulesTitle')}</h2>
            {subscribedModules.length === 0 ? (
              <div className="flex min-h-[12rem] items-center justify-center">
                <EmptyState
                  icon={Package}
                  title={t('modulesEmptyTitle')}
                  description={t('modulesEmptyDescription')}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {subscribedModules.map((mod) => (
                  <ModuleSettingsCard key={mod.moduleCode} moduleCode={mod.moduleCode} moduleName={mod.moduleName} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Alert Config ═══ */}
      {activeTab === 'alert-config' && (
        <div className={CARD}>
          <div className="space-y-4">
            <h2 className={CARD_TITLE}>{t('alertConfigTitle')}</h2>
            <SurveillanceConfigForm />
            <div className="border-t border-border pt-4">
              <SurveillanceAlertHistory />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
