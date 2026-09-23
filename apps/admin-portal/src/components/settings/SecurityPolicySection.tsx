'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ShieldCheck, ChevronDown } from '@ultranos/ui-kit/icons'

/**
 * Story 56.3 — org-level MFA feature toggle (Admin Portal).
 *
 * MFA is disabled by default. Turning it ON is a deliberate, confirmed action; the
 * Hub then enforces a second factor (aal2) for staff roles server-side after the
 * grace window. Patient auth is OTP-only and unaffected. Every change is audited at
 * the Hub (ORG_MFA_POLICY_CHANGED).
 */

const CARD = 'rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50'
const CARD_TITLE = 'text-sm font-semibold text-foreground uppercase tracking-wide'
const FIELD_LABEL = 'text-xs font-medium text-muted-foreground'

const GRACE_OPTIONS = [0, 3, 7, 14, 30]

interface Policy {
  mfaRequired: boolean
  mfaGracePeriodDays: number
  mfaEnabledAt: string | null
}

export function SecurityPolicySection() {
  const t = useTranslations('settings')

  const [policy, setPolicy] = useState<Policy | null>(null)
  const [grace, setGrace] = useState(7)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const data = (await trpc.admin.getSecurityPolicy.query()) as Policy
      setPolicy(data)
      setGrace(data.mfaGracePeriodDays)
    } catch {
      setError(t('mfaPolicyLoadError'))
    } finally {
      setLoading(false)
    }
  }

  // Persist a policy change. `nextRequired` is the desired toggle state.
  async function persist(nextRequired: boolean, nextGrace: number) {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const data = (await trpc.admin.updateSecurityPolicy.mutate({
        mfaRequired: nextRequired,
        mfaGracePeriodDays: nextGrace,
      })) as Policy
      setPolicy(data)
      setGrace(data.mfaGracePeriodDays)
      setSuccess(t('mfaPolicySaved'))
      setTimeout(() => setSuccess(null), 3000)
    } catch {
      setError(t('mfaPolicySaveError'))
    } finally {
      setSaving(false)
    }
  }

  // Toggling ON is destructive-ish (adds a login requirement for all staff), so it
  // goes through a confirm dialog. Toggling OFF is immediate (relaxes security, but
  // enrolled factors are preserved).
  function handleToggle() {
    if (!policy) return
    if (!policy.mfaRequired) {
      setConfirmOpen(true)
    } else {
      void persist(false, grace)
    }
  }

  function confirmEnable() {
    setConfirmOpen(false)
    void persist(true, grace)
  }

  const enabled = policy?.mfaRequired ?? false

  return (
    <div className={CARD}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          <h2 className={CARD_TITLE}>{t('mfaPolicyTitle')}</h2>
        </div>
        <p className="text-muted-foreground text-sm">{t('mfaPolicyDescription')}</p>

        {error && (
          <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
            {success}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('mfaPolicyLoading')}</p>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{t('mfaPolicyToggleLabel')}</p>
                <p className="text-xs text-muted-foreground">
                  {enabled ? t('mfaPolicyStatusOn') : t('mfaPolicyStatusOff')}
                </p>
              </div>
              <Button
                type="button"
                variant={enabled ? 'destructive' : 'default'}
                size="sm"
                onClick={handleToggle}
                disabled={saving}
                aria-pressed={enabled}
              >
                {enabled ? t('mfaPolicyDisable') : t('mfaPolicyEnable')}
              </Button>
            </div>

            {/* Grace period — a rollout staging aid; only meaningful when enabled. */}
            <label className="block">
              <span className={FIELD_LABEL}>{t('mfaPolicyGraceLabel')}</span>
              <div className="relative mt-1">
                <select
                  value={grace}
                  disabled={saving}
                  onChange={(e) => {
                    const g = Number(e.target.value)
                    setGrace(g)
                    // If MFA is already on, persist the grace change immediately.
                    if (policy?.mfaRequired) void persist(true, g)
                  }}
                  className="h-9 w-full appearance-none rounded-full border border-border bg-background text-foreground ps-3 pe-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {GRACE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {t('mfaPolicyGraceDays', { days: g })}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
              </div>
              <span className="mt-1 block text-xs text-muted-foreground">{t('mfaPolicyGraceHint')}</span>
            </label>
          </>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('mfaPolicyConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('mfaPolicyConfirmBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)} disabled={saving}>
              {t('mfaPolicyConfirmCancel')}
            </Button>
            <Button type="button" onClick={confirmEnable} disabled={saving}>
              {t('mfaPolicyConfirmConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
