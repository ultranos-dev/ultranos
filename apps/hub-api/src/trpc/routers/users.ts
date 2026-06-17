import { createTRPCRouter, protectedProcedure } from '../init'
import { AuditLogger } from '@ultranos/audit-logger'
import { decryptField } from '@ultranos/crypto/server'
import { getFieldEncryptionKeys } from '@/lib/field-encryption'

const PHOTO_BUCKET = 'profile-photos'
const SIGNED_URL_TTL = 3600

/**
 * Resolve a storage object path from a stored value that may be a bare path
 * or a legacy public URL (e.g. https://…/storage/v1/object/public/profile-photos/u1/avatar.jpg).
 * Never logs the path value — callers log opaque IDs only.
 */
export function extractPhotoPath(stored: string | null | undefined): string | null {
  if (!stored) return null
  // Bare path (no scheme) — strip any leading slashes
  if (!stored.includes('://')) return stored.replace(/^\/+/, '')
  // Legacy public URL — extract the path after the bucket segment
  const marker = `/object/public/${PHOTO_BUCKET}/`
  const idx = stored.indexOf(marker)
  return idx >= 0 ? stored.slice(idx + marker.length) : null
}

/**
 * Compute whole-year age from an ISO birth date string or a birth year integer.
 * Server wall-clock is acceptable here — this is display metadata, not a sync/HLC event.
 */
export function ageFromBirth(birthDate?: string | null, birthYear?: number | null): number | undefined {
  let year = birthYear ?? null
  if (!year && birthDate && birthDate.length >= 4) year = Number(birthDate.slice(0, 4))
  if (!year || Number.isNaN(year)) return undefined
  const age = new Date().getFullYear() - year
  return age >= 0 && age < 150 ? age : undefined
}

/**
 * Emit a profile audit event. Swallows errors so a logging failure never
 * blocks the caller's response. Metadata contains only opaque identifiers —
 * never PHI (CLAUDE.md Rule #1 and Rule #6).
 */
async function emitProfileAudit(
  audit: AuditLogger,
  ctx: { user: { sub: string; role: string; sessionId: string } },
  action: 'PHI_READ' | 'READ',
  resourceType: 'PATIENT' | 'PRACTITIONER',
  resourceId: string,
): Promise<void> {
  try {
    await audit.emit({
      action,
      resourceType,
      resourceId,
      actorId: ctx.user.sub,
      actorRole: ctx.user.role,
      outcome: 'SUCCESS',
      sessionId: ctx.user.sessionId,
      metadata: { operation: 'getProfile' },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action, resourceType })
  }
}

export const usersRouter = createTRPCRouter({
  /**
   * Returns the caller's own profile, branching on ctx.user.role:
   *   PATIENT  → reads patients table, decrypts name/dob, signs photo
   *   all else → reads practitioners table, decrypts phone (encrypted at write),
   *              resolves org name from organizations table
   *
   * Never throws on a missing record — returns a minimal shell instead.
   * All PHI access is audited with opaque IDs only (CLAUDE.md Rules #1, #6).
   */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const audit = new AuditLogger(ctx.supabase)
    const { encryptionKey } = getFieldEncryptionKeys()

    /** Decrypt a field value if it is a non-empty string; otherwise return undefined. */
    const dec = (v: unknown): string | undefined =>
      typeof v === 'string' && v.length > 0 ? decryptField(v, encryptionKey) : undefined

    // ── PATIENT branch ────────────────────────────────────────────────────────
    if (ctx.user.role === 'PATIENT') {
      const { data } = await ctx.supabase
        .from('patients')
        .select(
          'id, ' +
            'name_local, name_local_enc, ' +
            'name_given, name_given_enc, ' +
            'name_family, name_family_enc, ' +
            'gender, birth_date, birth_date_enc, birth_year, ' +
            'telecom_phone, blood_group, photo_url, ' +
            'preferred_language, patient_tier, ' +
            'address_province_current, address_district_current, address_village_current',
        )
        .eq('auth_user_id', ctx.user.sub)
        .maybeSingle()

      if (!data) {
        // No patient record found — audit with the auth sub as the opaque ID and return shell
        await emitProfileAudit(audit, ctx, 'PHI_READ', 'PATIENT', ctx.user.sub)
        return { kind: 'patient', displayName: '', givenName: '', tier: 'FREE' } as const
      }

      const row = data as unknown as Record<string, unknown>

      // Prefer encrypted column; fall back to plaintext column if _enc is absent
      const nameLocal = dec(row.name_local_enc) ?? (row.name_local as string | null) ?? ''
      const givenName = dec(row.name_given_enc) ?? (row.name_given as string | null) ?? ''
      const familyName = dec(row.name_family_enc) ?? (row.name_family as string | null) ?? ''
      const birthDate = dec(row.birth_date_enc) ?? (row.birth_date as string | null) ?? null
      const displayName = nameLocal || [givenName, familyName].filter(Boolean).join(' ')

      // Sign photo path — never return an unsigned public URL for a private bucket
      let photoUrl: string | undefined
      const photoPath = extractPhotoPath(row.photo_url as string | null | undefined)
      if (photoPath) {
        const { data: signed } = await ctx.supabase.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(photoPath, SIGNED_URL_TTL)
        if (signed?.signedUrl) photoUrl = signed.signedUrl
      }

      await emitProfileAudit(audit, ctx, 'PHI_READ', 'PATIENT', row.id as string)

      return {
        kind: 'patient',
        displayName,
        givenName: givenName.split(' ')[0] ?? givenName,
        photoUrl,
        phone: (row.telecom_phone as string | null) ?? undefined,
        gender: (row.gender as string | null) ?? undefined,
        birthDate: birthDate ?? undefined,
        age: ageFromBirth(birthDate, row.birth_year as number | null | undefined),
        bloodGroup: (row.blood_group as string | null) ?? undefined,
        currentAddress: {
          province: (row.address_province_current as string | null) ?? undefined,
          district: (row.address_district_current as string | null) ?? undefined,
          village: (row.address_village_current as string | null) ?? undefined,
        },
        preferredLanguage: (row.preferred_language as string | null) ?? undefined,
        tier: (row.patient_tier as string) === 'PREMIUM' ? ('PREMIUM' as const) : ('FREE' as const),
      } as const
    }

    // ── PRACTITIONER branch ───────────────────────────────────────────────────
    // Covers DOCTOR, NURSE, PHARMACIST, CHW, LAB_TECH, ADMIN, etc.
    const { data } = await ctx.supabase
      .from('practitioners')
      .select(
        'id, given_name, family_name, telecom_email, telecom_phone, role, status, ' +
          'org_id, facility_id, qualification_display, identifier_value, license_expiry',
      )
      .eq('auth_user_id', ctx.user.sub)
      .maybeSingle()

    if (!data) {
      // No practitioner record found — return a minimal shell, never throw
      await emitProfileAudit(audit, ctx, 'READ', 'PRACTITIONER', ctx.user.sub)
      return {
        kind: 'practitioner',
        displayName: '',
        givenName: '',
        familyName: '',
        role: ctx.user.role,
        status: (ctx.user as { status?: string | null }).status ?? 'ACTIVE',
      } as const
    }

    const row = data as unknown as Record<string, unknown>
    const given = (row.given_name as string | null) ?? ''
    const family = (row.family_name as string | null) ?? ''

    // Resolve organization name (plaintext — no encryption on org name)
    let organization: string | undefined
    if (row.org_id) {
      const { data: org } = await ctx.supabase
        .from('organizations')
        .select('name')
        .eq('id', row.org_id)
        .maybeSingle()
      organization = (org as { name?: string } | null)?.name ?? undefined
    }

    // Resolve facility name — fall back to facility_id string if no facilities table
    let facility: string | undefined
    if (row.facility_id) {
      try {
        const { data: fac } = await ctx.supabase
          .from('facilities')
          .select('name')
          .eq('id', row.facility_id)
          .maybeSingle()
        facility = (fac as { name?: string } | null)?.name ?? (row.facility_id as string)
      } catch {
        // facilities table does not exist — use the id as an opaque reference
        facility = row.facility_id as string
      }
    }

    // telecom_phone is encrypted at write time (enrollChw in admin.ts uses encryptField → "v1:" prefix).
    // Guard on the version prefix so any legacy plaintext value is returned as-is instead of being
    // run through decryptField (which would yield the "[Encrypted Content]" placeholder).
    const rawPhone = row.telecom_phone
    const phone =
      typeof rawPhone === 'string' && rawPhone.length > 0
        ? rawPhone.startsWith('v1:')
          ? decryptField(rawPhone, encryptionKey)
          : rawPhone
        : undefined

    await emitProfileAudit(audit, ctx, 'READ', 'PRACTITIONER', row.id as string)

    return {
      kind: 'practitioner',
      displayName: [given, family].filter(Boolean).join(' '),
      givenName: given,
      familyName: family,
      role: (row.role as string | null) ?? ctx.user.role,
      email: (row.telecom_email as string | null) ?? undefined,
      phone,
      organization,
      facility,
      qualificationDisplay: (row.qualification_display as string | null) ?? undefined,
      licenseId: (row.identifier_value as string | null) ?? undefined,
      licenseExpiry: (row.license_expiry as string | null) ?? undefined,
      status: (row.status as string | null) ?? (ctx.user as { status?: string | null }).status ?? 'ACTIVE',
    } as const
  }),
})
