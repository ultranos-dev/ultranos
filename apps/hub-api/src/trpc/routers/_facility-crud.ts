// ============================================================
// ULTRANOS — SHARED FACILITY CRUD FACTORY
// Org-scoped list/getDetail/create/update/archive/restore against
// any of the three facility tables (clinical_facilities,
// pharmacy_facilities, labs).
//
// P-R2 FIX: TS→DB column conversion uses an inverted CAMEL map
// (SNAKE) — NOT the regex helper from the brief — so `is247`
// correctly maps to `is_24_7` (no uppercase letter for the regex
// to catch). Every google/compound field also round-trips correctly.
// ============================================================

import { TRPCError } from '@trpc/server'
import { AuditLogger } from '@ultranos/audit-logger'
import type { FacilityProfileBase, AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'

type Ctx = { supabase: any; user: { role: string; orgId: string | null; sub: string; sessionId?: string } }

/** Status filter for facility lists — mirrors the labs status-tab pattern. */
export type FacilityStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'

/** CSV builder — mirrors admin.ts buildCsvExport (base64 payload, formula-injection guard). */
function buildFacilityCsv(headers: string[], rows: string[][], prefix: string) {
  const esc = (s: string) => {
    let val = (s ?? '').replace(/"/g, '""')
    if (/^[=+\-@\t\r]/.test(val)) val = `'${val}`
    return `"${val}"`
  }
  const csv = [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
  return {
    data: Buffer.from(csv).toString('base64'),
    filename: `${prefix}-${new Date().toISOString().split('T')[0]}.csv`,
    mimeType: 'text/csv',
  }
}

// -------------------------------------------------------------------
// DB column (snake_case) → TS property (camelCase)
// -------------------------------------------------------------------
const CAMEL: Record<string, string> = {
  org_id: 'orgId', is_active: 'isActive', archived_at: 'archivedAt', created_at: 'createdAt',
  updated_at: 'updatedAt', logo_url: 'logoUrl', license_ref: 'licenseRef',
  registration_authority: 'registrationAuthority', established_year: 'establishedYear',
  alt_phone: 'altPhone', postal_code: 'postalCode', contact_person_name: 'contactPersonName',
  contact_person_role: 'contactPersonRole', contact_person_phone: 'contactPersonPhone',
  opening_hours: 'openingHours', is_24_7: 'is247', google_place_id: 'googlePlaceId',
  google_maps_url: 'googleMapsUrl', google_rating: 'googleRating',
  google_review_count: 'googleReviewCount', google_hours: 'googleHours',
  google_last_synced_at: 'googleLastSyncedAt', facility_type: 'facilityType',
  bed_count: 'bedCount', emergency_services: 'emergencyServices', has_delivery: 'hasDelivery',
  accepts_insurance: 'acceptsInsurance', turnaround_time_hours: 'turnaroundTimeHours',
  home_collection: 'homeCollection', sample_collection: 'sampleCollection',
  cap_accredited: 'capAccredited', accreditation_ref: 'accreditationRef',
}

// -------------------------------------------------------------------
// TS property (camelCase) → DB column (snake_case)
// Built by inverting CAMEL — guarantees is247→is_24_7, googlePlaceId→google_place_id, etc.
// P-R2: do NOT use a regex here (regex approach is buggy for is247).
// -------------------------------------------------------------------
const SNAKE: Record<string, string> = Object.fromEntries(
  Object.entries(CAMEL).map(([dbCol, tsProp]) => [tsProp, dbCol]),
)

/** Guard: throws FORBIDDEN when orgId is absent so every operation fails fast with a clear signal. */
function requireOrg(ctx: Ctx): string {
  if (!ctx.user.orgId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No org context' })
  return ctx.user.orgId
}

export function mapFacilityRow(row: Record<string, unknown>): FacilityProfileBase & Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[CAMEL[k] ?? k] = v
  return out as FacilityProfileBase & Record<string, unknown>
}

export function buildFacilityCrud(opts: {
  table: string; typeColumn: string; typeValues: string[]; resourceType: string; extraColumns: string[]
}) {
  const { table, typeColumn, typeValues, resourceType } = opts

  async function audit(ctx: Ctx, action: string, resourceId: string) {
    try {
      await new AuditLogger(ctx.supabase, ctx.user.orgId ?? undefined).emit({
        action: action as `${AuditAction}`,
        resourceType: resourceType as `${AuditResourceType}`,
        resourceId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role as `${UserRole}`,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { endpoint: `${table}.${action}` },
      })
    } catch { console.warn('[AUDIT_FAILURE]', { action, resourceType }) }
  }

  /** Convert camelCase input keys to snake_case DB column names using the inverted CAMEL map. */
  function toColumns(input: Record<string, unknown>): Record<string, unknown> {
    const cols: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) {
      if (k === 'id' || k === 'facilityType') continue
      if (v !== undefined) cols[SNAKE[k] ?? k] = v
    }
    return cols
  }

  return {
    async list(ctx: Ctx, input: { facilityTypes?: string[]; cursor: number; limit: number; q?: string; includeArchived?: boolean; status?: FacilityStatusFilter }) {
      const orgId = requireOrg(ctx)
      let query = ctx.supabase.from(table).select('*')
        .eq('org_id', orgId)
        .in(typeColumn, input.facilityTypes?.length ? input.facilityTypes : typeValues)
      // Status filter drives archived/active selection (replaces the include-archived toggle).
      if (input.status === 'ARCHIVED') {
        query = query.not('archived_at', 'is', null)
      } else if (input.status === 'ACTIVE') {
        query = query.is('archived_at', null).eq('is_active', true)
      } else if (input.status === 'INACTIVE') {
        query = query.is('archived_at', null).eq('is_active', false)
      } else if (!input.includeArchived) {
        // ALL (default): active + inactive, excluding archived
        query = query.is('archived_at', null)
      }
      if (input.q) {
        const safe = input.q.replace(/[,()"]/g, ' ').trim()
        if (safe) query = query.ilike('name', `%${safe}%`)
      }
      query = query.order('name', { ascending: true })
        .range(input.cursor, input.cursor + input.limit - 1)
      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      const facilities = (data ?? []).map(mapFacilityRow)
      return { facilities, nextCursor: facilities.length === input.limit ? input.cursor + input.limit : null }
    },

    /** Export all org facilities of this kind as CSV (mirrors admin.exportLabs). */
    async exportCsv(ctx: Ctx) {
      const orgId = requireOrg(ctx)
      const { data, error } = await ctx.supabase.from(table).select('*')
        .eq('org_id', orgId)
        .in(typeColumn, typeValues)
        .order('name', { ascending: true })
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      const headers = ['ID', 'Name', 'Type', 'City', 'Province', 'Phone', 'Email', 'Active', 'Archived', 'Created At']
      const rows = (data ?? []).map((r: Record<string, unknown>) => [
        String(r.id ?? ''), String(r.name ?? ''), String(r[typeColumn] ?? ''),
        String(r.city ?? ''), String(r.province ?? ''), String(r.phone ?? ''), String(r.email ?? ''),
        r.is_active ? 'Yes' : 'No', r.archived_at ? 'Yes' : 'No', String(r.created_at ?? ''),
      ])
      return buildFacilityCsv(headers, rows, table.replace(/_/g, '-'))
    },

    async getDetail(ctx: Ctx, input: { id: string }) {
      const orgId = requireOrg(ctx)
      const { data, error } = await ctx.supabase.from(table).select('*')
        .eq('id', input.id).eq('org_id', orgId).maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      if (!data) throw new TRPCError({ code: 'NOT_FOUND' })
      return mapFacilityRow(data)
    },

    async create(ctx: Ctx, input: Record<string, unknown> & { facilityType?: string; name: string }) {
      const orgId = requireOrg(ctx)
      const insert: Record<string, unknown> = { ...toColumns(input), org_id: orgId, is_active: true }
      if (opts.typeColumn && input.facilityType) insert[typeColumn] = input.facilityType
      const { data, error } = await ctx.supabase.from(table).insert(insert).select('*').single()
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      await audit(ctx, 'CREATE', data.id)
      return mapFacilityRow(data)
    },

    async update(ctx: Ctx, input: Record<string, unknown> & { id: string }) {
      const orgId = requireOrg(ctx)
      const { data, error } = await ctx.supabase.from(table)
        .update({ ...toColumns(input), updated_at: new Date().toISOString() }).eq('id', input.id).eq('org_id', orgId).select('*').maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      if (!data) throw new TRPCError({ code: 'NOT_FOUND' })
      await audit(ctx, 'UPDATE', data.id)
      return mapFacilityRow(data)
    },

    async archive(ctx: Ctx, input: { id: string }) {
      const orgId = requireOrg(ctx)
      const { data, error } = await ctx.supabase.from(table)
        .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', input.id).eq('org_id', orgId).select('id').maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      if (!data) throw new TRPCError({ code: 'NOT_FOUND' })
      await audit(ctx, 'ARCHIVE', data.id)
      return { id: data.id }
    },

    async restore(ctx: Ctx, input: { id: string }) {
      const orgId = requireOrg(ctx)
      const { data, error } = await ctx.supabase.from(table)
        .update({ archived_at: null, updated_at: new Date().toISOString() }).eq('id', input.id).eq('org_id', orgId).select('id').maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      if (!data) throw new TRPCError({ code: 'NOT_FOUND' })
      await audit(ctx, 'RESTORE', data.id)
      return { id: data.id }
    },
  }
}
