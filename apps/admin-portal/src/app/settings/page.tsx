'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { trpc, reportAdminAuthEvent } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { NotificationPreferences } from '@/components/settings/NotificationPreferences'
import { ThresholdSettings } from '@/components/settings/ThresholdSettings'
import { ModuleSettingsCard } from '@/components/settings/ModuleSettingsCard'
import { KeyRound } from '@ultranos/ui-kit/icons'

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
  country: string
  billingEmail: string
  timezone: string
}

/* ─── Constants ─── */

const MENA_COUNTRIES = [
  'Afghanistan', 'Bahrain', 'Egypt', 'Iran', 'Iraq', 'Jordan', 'Kuwait',
  'Kazakhstan', 'Kyrgyzstan', 'Lebanon', 'Oman', 'Pakistan', 'Palestine',
  'Qatar', 'Saudi Arabia', 'Syria', 'Tajikistan', 'Turkey', 'Turkmenistan',
  'UAE', 'Uzbekistan', 'Yemen',
]

const IANA_TIMEZONES = [
  'Africa/Cairo', 'Asia/Aden', 'Asia/Almaty', 'Asia/Amman', 'Asia/Ashgabat',
  'Asia/Baghdad', 'Asia/Bahrain', 'Asia/Bishkek', 'Asia/Damascus',
  'Asia/Dubai', 'Asia/Dushanbe', 'Asia/Gaza', 'Asia/Kabul', 'Asia/Karachi',
  'Asia/Kuwait', 'Asia/Muscat', 'Asia/Qatar', 'Asia/Riyadh', 'Asia/Tashkent',
  'Asia/Tehran',
]

const NAV_ITEMS = [
  { id: 'my-account', label: 'My Account' },
  { id: 'organization', label: 'Organization' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'thresholds', label: 'Thresholds' },
  { id: 'modules', label: 'Modules' },
] as const

/* ─── Page Component ─── */

export default function SettingsPage() {
  const supabase = getSupabaseBrowserClient()

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
      const subs = (data as any)?.subscriptions ?? []
      setSubscribedModules(subs as { moduleCode: string; moduleName: string }[])
    } catch {
      // Non-blocking
    }
  }

  /* ─── Profile ─── */

  async function loadProfile() {
    try {
      const data = await trpc.admin.getAdminProfile.query()
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
      setProfileSuccess('Profile updated.')
      setTimeout(() => setProfileSuccess(null), 3000)
    } catch {
      setProfileError('Failed to update profile.')
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
      setPasswordSuccess('Password changed successfully.')
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

  /* ─── FIDO2 Security Keys (preserved from original) ─── */

  async function loadFactors() {
    setFidoLoading(true)
    try {
      const { data, error: factorsError } = await supabase.auth.mfa.listFactors()
      if (factorsError) {
        setFidoError('Failed to load MFA factors')
        return
      }
      setFactors(
        (data.all ?? []).filter((f) => f.factor_type === 'webauthn') as Factor[],
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
      setOrgDraft({ name: orgData.name, country: orgData.country, billingEmail: orgData.billingEmail, timezone: orgData.timezone })
    } catch {
      // Non-blocking
    }
  }

  const orgDirty =
    org && orgDraft
      ? org.name !== orgDraft.name ||
        org.country !== orgDraft.country ||
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
      if (orgDraft.country !== org.country) changes.country = orgDraft.country
      if (orgDraft.billingEmail !== org.billingEmail) changes.billingEmail = orgDraft.billingEmail
      if (orgDraft.timezone !== org.timezone) changes.timezone = orgDraft.timezone

      await trpc.admin.updateOrganization.mutate(changes)
      setOrg({ ...org, ...orgDraft })
      setOrgSuccess('Organization updated.')
      setTimeout(() => setOrgSuccess(null), 3000)
    } catch {
      setOrgError('Failed to update organization.')
    } finally {
      setOrgSaving(false)
    }
  }

  const verifiedFactors = factors.filter((f) => f.status === 'verified')

  return (
    <>
      <TopHeader title="Settings" description="Manage your account, organization, and notification preferences." />

      {/* Section Navigation (sticky top) */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="mx-auto max-w-7xl px-8">
          <nav className="flex gap-2 py-3" aria-label="Settings sections">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-popover hover:text-foreground transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-8 py-6 space-y-8">

        {/* ═══ Section 1: My Account ═══ */}
        <section id="my-account" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-foreground mb-4">My Account</h2>
          <div className="max-w-2xl rounded-3xl bg-white p-5 border border-border space-y-0">

            {/* a. Profile */}
            <div className="space-y-4 py-4">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Profile</h3>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Full Name</span>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => { setProfileName(e.target.value); setProfileSuccess(null) }}
                    className="mt-1 block w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Email</span>
                  <p className="mt-1 text-sm text-foreground">{profile?.email ?? '...'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Role</span>
                  <p className="mt-1 text-sm text-foreground">{profile?.role ?? '...'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Created</span>
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
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={profileSaving || profileName === (profile?.name ?? '')}
                className="rounded-full bg-brand-lime text-foreground font-semibold px-6 py-2.5 hover:scale-[1.02] transition-transform duration-200 disabled:opacity-50"
              >
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>

            <hr className="border-border" />

            {/* b. Change Password */}
            <div className="space-y-4 py-4">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Change Password</h3>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Current Password</span>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">New Password (min 12 characters)</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Confirm New Password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
              </div>
              {passwordError && (
                <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{passwordError}</div>
              )}
              {passwordSuccess && (
                <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{passwordSuccess}</div>
              )}
              <button
                type="button"
                onClick={handleChangePassword}
                disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                className="rounded-full bg-brand-lime text-foreground font-semibold px-6 py-2.5 hover:scale-[1.02] transition-transform duration-200 disabled:opacity-50"
              >
                {passwordSaving ? 'Changing...' : 'Change Password'}
              </button>
            </div>

            <hr className="border-border" />

            {/* c. Security Keys (FIDO2) — preserved from original */}
            <div className="space-y-4 py-4">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Security Keys (FIDO2)</h3>
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
                          className="flex items-center justify-between rounded-xl bg-card px-4 py-3"
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
                          <button
                            type="button"
                            onClick={() => handleUnenroll(factor.id)}
                            className="rounded-full text-sm text-destructive hover:text-destructive font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {verifiedFactors.length === 0 && (
                    <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                      No security key enrolled. We recommend adding one for stronger account protection.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleEnroll}
                    disabled={enrolling}
                    className="rounded-full bg-primary text-foreground font-semibold px-6 py-2.5 hover:scale-[1.02] transition-transform duration-200 disabled:opacity-50"
                  >
                    {enrolling ? 'Waiting for key...' : 'Register New Security Key'}
                  </button>
                </>
              )}
            </div>

            <hr className="border-border" />

            {/* d. Active Sessions */}
            <div className="space-y-4 py-4">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Active Sessions</h3>
              <p className="text-muted-foreground text-sm">
                Sign out of all other browser sessions. Your current session will remain active.
              </p>
              {sessionsMsg && (
                <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
                  {sessionsMsg}
                </div>
              )}
              <button
                type="button"
                onClick={handleSignOutOtherSessions}
                disabled={sessionsLoading}
                className="rounded-full bg-primary text-foreground font-semibold px-6 py-2.5 hover:scale-[1.02] transition-transform duration-200 disabled:opacity-50"
              >
                {sessionsLoading ? 'Signing out...' : 'Sign Out All Other Sessions'}
              </button>
            </div>
          </div>
        </section>

        {/* ═══ Section 2: Organization ═══ */}
        <section id="organization" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-foreground mb-4">Organization</h2>
          <div className="max-w-2xl rounded-3xl bg-white p-5 border border-border space-y-4">
            {orgDraft ? (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Organization Name</span>
                  <input
                    type="text"
                    value={orgDraft.name}
                    onChange={(e) => setOrgDraft({ ...orgDraft, name: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Country</span>
                  <select
                    value={orgDraft.country}
                    onChange={(e) => setOrgDraft({ ...orgDraft, country: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select a country</option>
                    {MENA_COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Billing Email</span>
                  <input
                    type="email"
                    value={orgDraft.billingEmail}
                    onChange={(e) => setOrgDraft({ ...orgDraft, billingEmail: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Timezone</span>
                  <select
                    value={orgDraft.timezone}
                    onChange={(e) => setOrgDraft({ ...orgDraft, timezone: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select a timezone</option>
                    {IANA_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </label>

                <div>
                  <span className="text-xs font-medium text-muted-foreground">Org ID</span>
                  <p className="mt-1 text-sm font-mono text-foreground">{org?.id ?? '...'}</p>
                </div>

                {orgError && (
                  <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{orgError}</div>
                )}
                {orgSuccess && (
                  <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{orgSuccess}</div>
                )}

                <button
                  type="button"
                  onClick={handleSaveOrg}
                  disabled={orgSaving || !orgDirty}
                  className="rounded-full bg-brand-lime text-foreground font-semibold px-6 py-2.5 hover:scale-[1.02] transition-transform duration-200 disabled:opacity-50"
                >
                  {orgSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading organization...</p>
            )}
          </div>
        </section>

        {/* ═══ Section 3: Notifications ═══ */}
        <section id="notifications" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-foreground mb-4">Notifications</h2>
          <div className="max-w-2xl rounded-3xl bg-white p-5 border border-border">
            <NotificationPreferences email={profile?.email} />
          </div>
        </section>

        {/* ═══ Section 4: Thresholds ═══ */}
        <section id="thresholds" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-foreground mb-4">Thresholds</h2>
          <div className="max-w-2xl rounded-3xl bg-white p-5 border border-border">
            <ThresholdSettings />
          </div>
        </section>

        {/* ═══ Section 5: Modules ═══ */}
        <section id="modules" className="scroll-mt-24 mb-12">
          <h2 className="text-lg font-semibold text-foreground mb-4">Modules</h2>
          <div className="max-w-2xl rounded-3xl bg-white p-5 border border-border">
            {subscribedModules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No modules configured. Subscribe to a module to see its settings.</p>
            ) : (
              <div className="space-y-4">
                {subscribedModules.map((mod) => (
                  <ModuleSettingsCard key={mod.moduleCode} moduleCode={mod.moduleCode} moduleName={mod.moduleName} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  )
}

