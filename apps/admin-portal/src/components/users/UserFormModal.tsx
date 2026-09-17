'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

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

interface CreatedUser {
  userId: string
  givenName: string
  familyName: string
  email: string
  role: string
  setupLink: string | null
  emailSent: boolean
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-muted-foreground">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-4 shadow-card ring-[0.65px] ring-border/50">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  )
}

/**
 * Create-staff-user modal — enterprise profile. Ports the former /users/create page
 * into a Dialog: subscription-gated role selection, password + invite fallback, the
 * success panel with the setup link, PLUS the full practitioner profile fields.
 */
export function UserFormModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([])
  const [unavailableRoles, setUnavailableRoles] = useState<UnavailableRole[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Account
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  // Identity + HR
  const [givenName, setGivenName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [phone, setPhone] = useState('')
  // Professional
  const [qualification, setQualification] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [licenseExpiry, setLicenseExpiry] = useState('')
  const [consultationLanguages, setConsultationLanguages] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [clinicAddress, setClinicAddress] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null)

  function resetForm() {
    setEmail(''); setPassword(''); setConfirmPassword(''); setSelectedRole('')
    setGivenName(''); setFamilyName(''); setJobTitle(''); setDepartment(''); setEmployeeId('')
    setPhone(''); setQualification(''); setRegistrationNumber('')
    setLicenseExpiry(''); setConsultationLanguages(''); setClinicName(''); setClinicAddress('')
    setSubmitError(null); setCreatedUser(null)
  }

  useEffect(() => {
    if (!open) return
    resetForm()
    let cancelled = false
    async function fetchRoles() {
      try {
        setLoading(true); setLoadError(null)
        const result = await trpc.subscription.getAvailableRoles.query()
        if (cancelled) return
        setAvailableRoles(result.availableRoles)
        setUnavailableRoles(result.unavailableRoles)
      } catch (err: unknown) {
        if (!cancelled) setLoadError((err as Error)?.message ?? 'Failed to load available roles')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchRoles()
    return () => { cancelled = true }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (password.length < 8) { setSubmitError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setSubmitError('Passwords do not match.'); return }
    if (!availableRoles.some((r) => r.role === selectedRole)) {
      setSubmitError('Selected role is not available for your subscription.'); return
    }

    try {
      setSubmitting(true)
      const validation = await trpc.subscription.validateRoleForOrg.query({ role: selectedRole })
      if (!validation.allowed) {
        setSubmitError(validation.reason ?? 'Role not permitted for your subscription.'); return
      }
      const languages = consultationLanguages.split(',').map((s) => s.trim()).filter(Boolean)
      const result = await trpc.admin.createUser.mutate({
        givenName, familyName, email, role: selectedRole, password,
        ...(phone && { phone }),
        ...(jobTitle && { jobTitle }),
        ...(department && { department }),
        ...(employeeId && { employeeId }),
        ...(qualification && { qualification }),
        ...(registrationNumber && { registrationNumber }),
        ...(licenseExpiry && { licenseExpiry }),
        ...(clinicName && { clinicName }),
        ...(clinicAddress && { clinicAddress }),
        ...(languages.length && { consultationLanguages: languages }),
      } as never)
      setCreatedUser(result)
      onCreated()
    } catch (err: unknown) {
      setSubmitError((err as Error)?.message ?? 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !submitting && !!selectedRole && !!givenName && !!email && password.length >= 8 && password === confirmPassword

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Staff User</DialogTitle>
          <DialogDescription>Assign roles based on your organization&apos;s active module subscriptions.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading available roles…</div>
        ) : loadError ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">Error: {loadError}</div>
        ) : createdUser ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
              <p className="mb-2 text-base font-semibold">User created successfully</p>
              <p><span className="font-medium">Name:</span> {createdUser.givenName} {createdUser.familyName}</p>
              <p><span className="font-medium">Email:</span> {createdUser.email}</p>
              <p><span className="font-medium">Role:</span> {createdUser.role}</p>
              {createdUser.emailSent && <p className="mt-2">An invitation email has been sent to {createdUser.email}.</p>}
              {!createdUser.emailSent && createdUser.setupLink && (
                <div className="mt-2">
                  <p>Email delivery is not configured. Share this setup link manually:</p>
                  <code className="mt-1 block break-all rounded-lg bg-success/15 px-3 py-2 font-mono text-xs text-success">{createdUser.setupLink}</code>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetForm}>Create Another User</Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Section title="Identity">
              <Field id="uf-given" label="Given Name"><Input id="uf-given" required value={givenName} onChange={(e) => setGivenName(e.target.value)} /></Field>
              <Field id="uf-family" label="Family Name"><Input id="uf-family" value={familyName} onChange={(e) => setFamilyName(e.target.value)} /></Field>
              <Field id="uf-job" label="Job Title"><Input id="uf-job" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></Field>
              <Field id="uf-dept" label="Department"><Input id="uf-dept" value={department} onChange={(e) => setDepartment(e.target.value)} /></Field>
              <Field id="uf-emp" label="Employee ID"><Input id="uf-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} /></Field>
            </Section>

            <Section title="Contact & Account">
              <Field id="uf-email" label="Email"><Input id="uf-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field id="uf-phone" label="Phone"><Input id="uf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
              <Field id="uf-pass" label="Password"><Input id="uf-pass" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" /></Field>
              <Field id="uf-pass2" label="Confirm Password">
                <Input id="uf-pass2" type="password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                {confirmPassword && password !== confirmPassword && <p className="mt-1.5 text-sm text-destructive">Passwords do not match</p>}
              </Field>
            </Section>

            <Section title="Professional & Practice">
              <Field id="uf-qual" label="Qualification"><Input id="uf-qual" value={qualification} onChange={(e) => setQualification(e.target.value)} /></Field>
              <Field id="uf-reg" label="Registration / License No."><Input id="uf-reg" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} /></Field>
              <Field id="uf-lic" label="License Expiry"><Input id="uf-lic" type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} /></Field>
              <Field id="uf-lang" label="Consultation Languages (comma-separated)"><Input id="uf-lang" value={consultationLanguages} onChange={(e) => setConsultationLanguages(e.target.value)} placeholder="English, Arabic" /></Field>
              <Field id="uf-clinic" label="Clinic Name"><Input id="uf-clinic" value={clinicName} onChange={(e) => setClinicName(e.target.value)} /></Field>
              <Field id="uf-caddr" label="Clinic Address"><Input id="uf-caddr" value={clinicAddress} onChange={(e) => setClinicAddress(e.target.value)} /></Field>
            </Section>

            <div className="rounded-xl bg-card p-4 shadow-card ring-[0.65px] ring-border/50">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</h3>
              <div className="mt-3 flex flex-col gap-2">
                {availableRoles.map((r) => (
                  <label key={r.role} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${selectedRole === r.role ? 'border-primary bg-primary/10' : 'border-border hover:bg-card'}`}>
                    <input type="radio" name="uf-role" value={r.role} checked={selectedRole === r.role} onChange={() => setSelectedRole(r.role)} className="accent-accent" />
                    <div><span className="text-sm font-medium text-foreground">{r.role}</span>{r.moduleName && <span className="ms-2 text-xs text-muted-foreground">({r.moduleName})</span>}</div>
                  </label>
                ))}
                {unavailableRoles.map((r) => (
                  <div key={r.role} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 opacity-60">
                    <input type="radio" name="uf-role" disabled className="accent-accent" />
                    <div><span className="text-sm font-medium text-muted-foreground">{r.role}</span>
                      <span className="ms-2 text-xs text-muted-foreground">&mdash; <a href="/subscriptions" className="text-primary hover:underline">Subscribe to {r.moduleName} to add {r.role} users</a></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {submitError && <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{submitError}</div>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={!canSubmit}>{submitting ? 'Creating…' : 'Create User'}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
