'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import { syncAppointmentBatch, fetchPractitionerAppointments } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { hlc, serializeHlc } from '@/lib/hlc'
import { compareHlc, deserializeHlc, type HlcTimestamp } from '@ultranos/sync-engine'
import { enqueueSyncAction } from '@ultranos/sync-engine'
import { syncQueue } from '@/lib/sync-queue'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import type {
  FhirAppointmentZod,
  FhirSlotZod,
  AppointmentServiceType,
} from '@ultranos/shared-types'

/** Fresh serialized HLC for a local write — NEVER Date.now().toString(). */
function nowHlc(): string {
  return serializeHlc(hlc.now())
}

type AppointmentParticipant = FhirAppointmentZod['participant'][number]
type ParticipantStatus = AppointmentParticipant['status']

/**
 * Build the FHIR `participant` array for a locally-created/edited appointment:
 * the patient PLUS the owning practitioner.
 *
 * The practitioner entry is load-bearing, not cosmetic. The Hub derives
 * `participant_refs` from this array on every `appointment.syncBatch` push, and
 * the pull (`appointment.listByPractitioner`) filters `participant_refs contains
 * [practitionerId]`. Omit the practitioner and the row still persists to Supabase
 * but is orphaned — never pulled back once the encrypted local cache clears, so it
 * "disappears" on the next login. The ref MUST be the session's `practitionerId`
 * (= `practitioner_id ?? sub`), the SAME value the pull passes, so the containment
 * match is guaranteed.
 *
 * @param existing  On edit, the appointment's current participant list. Any
 *   practitioner entry there is PRESERVED (an edit never reassigns the owner);
 *   only a legacy patient-only row falls back to stamping `practitionerId`.
 *
 * Exported for direct unit coverage (the hook's create/walk-in/edit paths all
 * route through it).
 */
export function appointmentParticipants(
  patientRef: string,
  patientName: string,
  practitionerId: string | undefined,
  patientStatus: ParticipantStatus = 'accepted',
  existing?: AppointmentParticipant[],
): AppointmentParticipant[] {
  const participants: AppointmentParticipant[] = [
    {
      actor: { reference: `Patient/${patientRef}`, display: patientName },
      status: patientStatus,
    },
  ]
  const preservedPractitioners = (existing ?? []).filter((p) =>
    p.actor.reference.startsWith('Practitioner/'),
  )
  if (preservedPractitioners.length > 0) {
    participants.push(...preservedPractitioners)
  } else if (practitionerId) {
    participants.push({
      actor: { reference: `Practitioner/${practitionerId}` },
      status: 'accepted',
    })
  }
  return participants
}

/** Current session's practitioner ref id (= `practitioner_id ?? sub`), or undefined. */
function sessionPractitionerId(): string | undefined {
  return useAuthSessionStore.getState().session?.practitionerId
}

// Cross-instance refresh: every useAppointments() hook subscribes here, and every
// mutation broadcasts, so a booking/edit/cancel/walk-in made through ONE instance
// (e.g. the BookingModal) immediately reloads the schedule rendered by ANOTHER
// instance (DayScheduleView) — no hard refresh needed.
const appointmentChangeListeners = new Set<() => void>()
function notifyAppointmentsChanged(): void {
  for (const listener of appointmentChangeListeners) listener()
}

/**
 * Subscribe to appointment change broadcasts (create/update/cancel/check-in/
 * walk-in) from any `useAppointments` instance. Lets non-appointments views —
 * e.g. the dashboard attention counts — refresh live without a hard reload.
 * Returns an unsubscribe function.
 */
export function subscribeAppointmentChanges(listener: () => void): () => void {
  appointmentChangeListeners.add(listener)
  return () => {
    appointmentChangeListeners.delete(listener)
  }
}

/** Matches a serialized HLC "<15d>:<5d>:<nodeId>" (see serializeHlc). */
const SERIALIZED_HLC_RE = /^\d{15}:\d{5}:.+/
/** Matches a legacy millisecond-epoch string (old Date.now().toString() stamp). */
const LEGACY_MS_RE = /^\d{1,15}$/

/**
 * Coerce any appointment hlcTimestamp — a serialized HLC OR a legacy ms-epoch
 * string (from the pre-59.4 `Date.now().toString()` code) — into a comparable
 * HlcTimestamp. Merges then compare HOMOGENEOUS values only (AC5): never a raw
 * 13-digit ms string vs a 20-char serialized HLC lexicographically, which the
 * old merge did (a legacy "1737…" always sorted BELOW any zero-padded serialized
 * clock, so remote updates silently lost to stale local rows and vice-versa).
 */
export function toComparableHlc(ts: string | undefined | null): HlcTimestamp {
  if (!ts) return { wallMs: 0, counter: 0, nodeId: '' }
  if (SERIALIZED_HLC_RE.test(ts)) {
    try {
      return deserializeHlc(ts)
    } catch {
      return { wallMs: 0, counter: 0, nodeId: '' }
    }
  }
  if (LEGACY_MS_RE.test(ts)) {
    return { wallMs: parseInt(ts, 10), counter: 0, nodeId: 'legacy' }
  }
  return { wallMs: 0, counter: 0, nodeId: '' }
}

/** True when the stamp is NOT already a serialized HLC (i.e. a legacy ms string). */
export function isLegacyStamp(ts: string | undefined | null): boolean {
  return !ts || !SERIALIZED_HLC_RE.test(ts)
}

/**
 * Tier-3 LWW merge decision, format-agnostic: returns true iff `remoteStamp`
 * should overwrite the local record (either no local, or remote's normalized HLC
 * is strictly greater). Exported for direct unit coverage of AC5 (homogeneous
 * comparison — no legacy-ms vs serialized-HLC lexicographic mismatch).
 */
export function remoteWinsLww(
  remoteStamp: string | undefined | null,
  localStamp: string | undefined | null,
  hasLocal: boolean,
): boolean {
  if (!hasLocal) return true
  return compareHlc(toComparableHlc(remoteStamp), toComparableHlc(localStamp)) > 0
}

/**
 * Enqueue an appointment onto the durable sync queue. Routed by the sync worker
 * to `appointment.syncBatch` (Tier-3 LWW upsert). Drains on reconnect via the
 * queue's backoff — independent of whether the appointments page is mounted, so
 * an offline create/cancel is never lost. Never throws (best-effort enqueue).
 */
function enqueueAppointment(appt: FhirAppointmentZod, action: 'create' | 'update'): void {
  void enqueueSyncAction(syncQueue, {
    resourceType: 'Appointment',
    resourceId: appt.id,
    action,
    payload: appt as unknown as Record<string, unknown>,
    hlcTimestamp: appt._ultranos.hlcTimestamp,
  })
}

interface UseAppointmentsReturn {
  appointments: FhirAppointmentZod[]
  slots: FhirSlotZod[]
  loading: boolean
  loadError: boolean
  createAppointment: (data: {
    patientRef: string
    patientName: string
    slotId: string
    serviceType: AppointmentServiceType
    start: string
    end: string
    description?: string
  }) => Promise<FhirAppointmentZod>
  updateStatus: (
    id: string,
    newStatus: FhirAppointmentZod['status'],
  ) => Promise<void>
  /** Edit an existing appointment's patient / date-time / type / notes. */
  updateAppointment: (
    id: string,
    data: {
      patientRef: string
      patientName: string
      slotId: string
      serviceType: AppointmentServiceType
      start: string
      end: string
      description?: string
    },
  ) => Promise<FhirAppointmentZod>
  cancelAppointment: (id: string) => Promise<void>
  /** Check a patient in (status → arrived) and start their wait counter. */
  checkIn: (id: string) => Promise<void>
  addWalkIn: (
    patientRef: string,
    patientName: string,
    type: AppointmentServiceType,
    complaint?: string,
  ) => Promise<FhirAppointmentZod>
  syncAppointments: () => Promise<void>
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function useAppointments(date: Date): UseAppointmentsReturn {
  const [appointments, setAppointments] = useState<FhirAppointmentZod[]>([])
  const [slots, setSlots] = useState<FhirSlotZod[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const initialLoadDone = useRef(false)

  const loadData = useCallback(async () => {
    if (!initialLoadDone.current) {
      setLoading(true)
      setLoadError(false)
    }
    try {
      const dayStart = startOfDay(date).toISOString()
      const dayEnd = endOfDay(date).toISOString()

      const [dayAppointments, daySlots] = await Promise.all([
        db.appointments
          .where('start')
          .between(dayStart, dayEnd, true, true)
          .toArray(),
        db.slots
          .where('start')
          .between(dayStart, dayEnd, true, true)
          .toArray(),
      ])

      setAppointments(dayAppointments as FhirAppointmentZod[])
      setSlots(daySlots as FhirSlotZod[])
      // Clear any prior error now that we have fresh data
      setLoadError(false)
    } catch {
      // Dexie failure — keep existing state; surface error on initial load
      // so consumers can show "unavailable" instead of a false empty queue.
      if (!initialLoadDone.current) setLoadError(true)
    } finally {
      setLoading(false)
      initialLoadDone.current = true
    }
  }, [date])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Subscribe to cross-instance change broadcasts (see notifyAppointmentsChanged).
  useEffect(() => {
    const listener = () => { void loadData() }
    appointmentChangeListeners.add(listener)
    return () => { appointmentChangeListeners.delete(listener) }
  }, [loadData])

  const createAppointment = useCallback(
    async (data: {
      patientRef: string
      patientName: string
      slotId: string
      serviceType: AppointmentServiceType
      start: string
      end: string
      description?: string
    }): Promise<FhirAppointmentZod> => {
      // Double-booking check: verify slot is free
      const slot = (await db.slots.get(data.slotId)) as
        | FhirSlotZod
        | undefined
      if (slot && slot.status !== 'free') {
        throw new Error('SLOT_BUSY')
      }

      const nowIso = new Date().toISOString()
      const hlcTimestamp = nowHlc()

      const appointment: FhirAppointmentZod = {
        id: crypto.randomUUID(),
        resourceType: 'Appointment',
        status: 'booked',
        serviceType: [
          {
            system:
              'http://terminology.hl7.org/CodeSystem/service-type',
            code: data.serviceType,
            display: data.serviceType,
          },
        ],
        start: data.start,
        end: data.end,
        participant: appointmentParticipants(
          data.patientRef,
          data.patientName,
          sessionPractitionerId(),
        ),
        description: data.description,
        _ultranos: {
          walkIn: false,
          queuePosition: null,
          isOfflineCreated: true,
          hlcTimestamp,
          createdAt: nowIso,
        },
        meta: {
          lastUpdated: nowIso,
          versionId: '1',
        },
      }

      // Update slot to busy
      if (slot) {
        await db.slots.update(data.slotId, {
          status: 'busy',
          '_ultranos.hlcTimestamp': hlcTimestamp,
          'meta.lastUpdated': nowIso,
        })
      }

      await db.appointments.put(appointment)
      // Durable, offline-first sync: queued even with no network; drains on reconnect.
      enqueueAppointment(appointment, 'create')
      auditPhiAccess(
        AuditAction.CREATE,
        AuditResourceType.APPOINTMENT,
        appointment.id,
        data.patientRef,
        { phiAccess: 'appointment_create' },
      )
      await loadData()
      notifyAppointmentsChanged()
      return appointment
    },
    [loadData],
  )

  const updateStatus = useCallback(
    async (
      id: string,
      newStatus: FhirAppointmentZod['status'],
    ): Promise<void> => {
      const existing = (await db.appointments.get(id)) as
        | FhirAppointmentZod
        | undefined
      if (!existing) throw new Error('APPOINTMENT_NOT_FOUND')

      const nowIso = new Date().toISOString()
      const hlcTimestamp = nowHlc()
      const currentVersion = parseInt(
        existing.meta.versionId ?? '0',
        10,
      )

      const updated: FhirAppointmentZod = {
        ...existing,
        status: newStatus,
        _ultranos: {
          ...existing._ultranos,
          hlcTimestamp,
        },
        meta: {
          ...existing.meta,
          lastUpdated: nowIso,
          versionId: String(currentVersion + 1),
        },
      }

      await db.appointments.put(updated)
      // Status changes flow to the Hub as a higher-HLC upsert of the same id.
      enqueueAppointment(updated, 'update')
      auditPhiAccess(
        AuditAction.UPDATE,
        AuditResourceType.APPOINTMENT,
        updated.id,
        undefined,
        { phiAccess: 'appointment_update_status', newStatus },
      )

      // If cancelled, free the associated slot
      if (newStatus === 'cancelled') {
        await freeSlotForAppointment(existing, hlcTimestamp, nowIso)
      }

      await loadData()
      notifyAppointmentsChanged()
    },
    [loadData],
  )

  const updateAppointment = useCallback(
    async (
      id: string,
      data: {
        patientRef: string
        patientName: string
        slotId: string
        serviceType: AppointmentServiceType
        start: string
        end: string
        description?: string
      },
    ): Promise<FhirAppointmentZod> => {
      const existing = (await db.appointments.get(id)) as
        | FhirAppointmentZod
        | undefined
      if (!existing) throw new Error('APPOINTMENT_NOT_FOUND')

      const nowIso = new Date().toISOString()
      const hlcTimestamp = nowHlc()
      const currentVersion = parseInt(existing.meta.versionId ?? '0', 10)
      // Walk-ins are a queue (no reserved slot), so never touch slots for them.
      const timeChanged = existing.start !== data.start && !existing._ultranos?.walkIn

      // Slot handoff when the start time changes: free the old slot, reserve the
      // new one (double-booking guarded exactly like createAppointment).
      if (timeChanged) {
        const newSlot = (await db.slots.get(data.slotId)) as FhirSlotZod | undefined
        if (newSlot && newSlot.status !== 'free') throw new Error('SLOT_BUSY')
        await freeSlotForAppointment(existing, hlcTimestamp, nowIso)
        if (newSlot) {
          await db.slots.update(data.slotId, {
            status: 'busy',
            '_ultranos.hlcTimestamp': hlcTimestamp,
            'meta.lastUpdated': nowIso,
          })
        }
      }

      const updated: FhirAppointmentZod = {
        ...existing,
        serviceType: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/service-type',
            code: data.serviceType,
            display: data.serviceType,
          },
        ],
        start: data.start,
        end: data.end,
        description: data.description,
        participant: appointmentParticipants(
          data.patientRef,
          data.patientName,
          sessionPractitionerId(),
          existing.participant?.[0]?.status ?? 'accepted',
          existing.participant,
        ),
        _ultranos: { ...existing._ultranos, hlcTimestamp },
        meta: {
          ...existing.meta,
          lastUpdated: nowIso,
          versionId: String(currentVersion + 1),
        },
      }

      await db.appointments.put(updated)
      enqueueAppointment(updated, 'update')
      auditPhiAccess(
        AuditAction.UPDATE,
        AuditResourceType.APPOINTMENT,
        updated.id,
        data.patientRef,
        { phiAccess: 'appointment_update' },
      )
      await loadData()
      notifyAppointmentsChanged()
      return updated
    },
    [loadData],
  )

  const cancelAppointment = useCallback(
    async (id: string): Promise<void> => {
      await updateStatus(id, 'cancelled')
    },
    [updateStatus],
  )

  // Check a patient in: status → arrived + stamp arrivedAt, which starts the wait
  // counter shown on the schedule card / queue row.
  const checkIn = useCallback(
    async (id: string): Promise<void> => {
      const existing = (await db.appointments.get(id)) as FhirAppointmentZod | undefined
      if (!existing) throw new Error('APPOINTMENT_NOT_FOUND')
      const nowIso = new Date().toISOString()
      const hlcTimestamp = nowHlc()
      const currentVersion = parseInt(existing.meta.versionId ?? '0', 10)
      const updated: FhirAppointmentZod = {
        ...existing,
        status: 'arrived',
        _ultranos: { ...existing._ultranos, hlcTimestamp, arrivedAt: nowIso },
        meta: { ...existing.meta, lastUpdated: nowIso, versionId: String(currentVersion + 1) },
      }
      await db.appointments.put(updated)
      enqueueAppointment(updated, 'update')
      auditPhiAccess(
        AuditAction.UPDATE,
        AuditResourceType.APPOINTMENT,
        updated.id,
        undefined,
        { phiAccess: 'appointment_checkin' },
      )
      await loadData()
      notifyAppointmentsChanged()
    },
    [loadData],
  )

  const addWalkIn = useCallback(
    async (
      patientRef: string,
      patientName: string,
      type: AppointmentServiceType,
      complaint?: string,
    ): Promise<FhirAppointmentZod> => {
      const nowIso = new Date().toISOString()
      const hlcTimestamp = nowHlc()

      // Auto-assign next queue position from today's walk-ins
      const dayStart = startOfDay(new Date()).toISOString()
      const dayEnd = endOfDay(new Date()).toISOString()
      const todayAppointments = (await db.appointments
        .where('start')
        .between(dayStart, dayEnd, true, true)
        .toArray()) as FhirAppointmentZod[]

      const maxQueue = todayAppointments.reduce(
        (max, apt) => {
          const pos = apt._ultranos.queuePosition
          return pos !== null && pos > max ? pos : max
        },
        0,
      )

      const appointment: FhirAppointmentZod = {
        id: crypto.randomUUID(),
        resourceType: 'Appointment',
        status: 'booked',
        serviceType: [
          {
            system:
              'http://terminology.hl7.org/CodeSystem/service-type',
            code: type,
            display: type,
          },
        ],
        start: nowIso,
        end: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30-min default
        description: complaint?.trim() || undefined,
        participant: appointmentParticipants(
          patientRef,
          patientName,
          sessionPractitionerId(),
        ),
        _ultranos: {
          walkIn: true,
          queuePosition: maxQueue + 1,
          isOfflineCreated: true,
          hlcTimestamp,
          createdAt: nowIso,
        },
        meta: {
          lastUpdated: nowIso,
          versionId: '1',
        },
      }

      await db.appointments.put(appointment)
      enqueueAppointment(appointment, 'create')
      auditPhiAccess(
        AuditAction.CREATE,
        AuditResourceType.APPOINTMENT,
        appointment.id,
        patientRef,
        { phiAccess: 'appointment_walkin_create' },
      )
      await loadData()
      notifyAppointmentsChanged()
      return appointment
    },
    [loadData],
  )

  const syncAppointments = useCallback(async (): Promise<void> => {
    const session = useAuthSessionStore.getState().session
    if (!session?.practitionerId) return

    try {
      await syncAppointmentsImpl(session.practitionerId)
      await loadData()
    } catch {
      // Sync is best-effort — offline operation continues unaffected
    }
  }, [loadData])

  // 60-second sync interval — use ref to avoid re-triggering on callback identity change
  const syncRef = useRef(syncAppointments)
  syncRef.current = syncAppointments

  useEffect(() => {
    // Initial sync on mount
    void syncRef.current()

    const interval = setInterval(() => {
      void syncRef.current()
    }, 60_000)

    return () => clearInterval(interval)
  }, [])

  return {
    appointments,
    slots,
    loading,
    loadError,
    createAppointment,
    updateStatus,
    updateAppointment,
    cancelAppointment,
    checkIn,
    addWalkIn,
    syncAppointments,
  }
}

/**
 * Push local appointments to Hub API and pull the practitioner's
 * weekly schedule. Remote records are merged using Tier 3 LWW
 * (newer hlcTimestamp wins).
 */
async function syncAppointmentsImpl(
  practitionerId: string,
): Promise<{ conflicts: Array<{ id: string; reason: string }> }> {
  // 1. Get all local appointments that might need syncing
  const allLocal = await db.appointments.toArray()

  // 1a. Migration: any appointment still carrying a legacy ms-epoch stamp (from the
  // pre-59.4 Date.now().toString() code) gets re-stamped with a fresh serialized HLC
  // BEFORE it is pushed or merged, so the Hub and the LWW merge only ever see the
  // canonical "<15d>:<5d>:<node>" format. Re-stamping (rather than fabricating a
  // synthetic clock from the old ms value) keeps the migrated write monotonically
  // ordered after every prior local write. Persisted so it runs at most once per row.
  for (const appt of allLocal as unknown as FhirAppointmentZod[]) {
    const stamp = appt._ultranos?.hlcTimestamp
    if (isLegacyStamp(stamp)) {
      const migrated = nowHlc()
      await db.appointments.update(appt.id, {
        '_ultranos.hlcTimestamp': migrated,
      })
      if (appt._ultranos) appt._ultranos.hlcTimestamp = migrated
    }
  }

  // 2. Push local appointments to Hub. This is a redundant safety net alongside the
  // durable sync queue (which now owns the primary offline-first push per write);
  // it opportunistically flushes anything created before the queue existed and pulls
  // the practitioner's remote schedule below.
  if (allLocal.length > 0) {
    const result = await syncAppointmentBatch(
      allLocal as unknown as Array<Record<string, unknown>>,
    )
    if (result.conflicts.length > 0) {
      return { conflicts: result.conflicts }
    }
  }

  // 3. Pull practitioner's appointments for current week from Hub
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay()) // Start of week (Sunday)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)

  const remoteAppointments = await fetchPractitionerAppointments(
    practitionerId,
    weekStart.toISOString(),
    weekEnd.toISOString(),
  )

  // 4. Merge remote into local (Tier 3 LWW: newer hlcTimestamp wins).
  // Compare via toComparableHlc so BOTH sides are normalized to an HlcTimestamp
  // first (AC5) — never a raw string > string that mixes legacy ms and serialized
  // HLC formats. A remote row with no local counterpart is always adopted.
  for (const remote of remoteAppointments) {
    const remoteId = remote.id as string
    const local = (await db.appointments.get(remoteId)) as
      | FhirAppointmentZod
      | undefined
    if (
      remoteWinsLww(
        remote.hlc_timestamp as string | undefined,
        local?._ultranos?.hlcTimestamp,
        Boolean(local),
      )
    ) {
      // Remote is newer or doesn't exist locally — upsert
      await db.appointments.put({
        id: remoteId,
        resourceType: 'Appointment',
        status: remote.status as string,
        serviceType: remote.service_type as FhirAppointmentZod['serviceType'],
        start: remote.start as string,
        end: remote.end as string,
        participant:
          remote.participant as FhirAppointmentZod['participant'],
        description: remote.description as string | undefined,
        _ultranos: {
          walkIn: remote.walk_in as boolean,
          queuePosition: (remote.queue_position as number | null) ?? null,
          isOfflineCreated: remote.is_offline_created as boolean,
          hlcTimestamp: remote.hlc_timestamp as string,
          createdAt: remote.created_at as string,
          clinicId: remote.clinic_id as string | undefined,
        },
        meta: {
          lastUpdated: remote.last_updated as string,
          versionId: '1',
        },
      } as FhirAppointmentZod)
    }
  }

  return { conflicts: [] }
}

/**
 * Free a slot associated with an appointment by matching the time range.
 * Slots don't have a direct reference from appointments, so we match by start time.
 */
async function freeSlotForAppointment(
  appointment: FhirAppointmentZod,
  hlcTimestamp: string,
  nowIso: string,
): Promise<void> {
  const matchingSlots = (await db.slots
    .where('start')
    .equals(appointment.start)
    .toArray()) as FhirSlotZod[]

  for (const slot of matchingSlots) {
    if (slot.status === 'busy') {
      await db.slots.update(slot.id, {
        status: 'free',
        '_ultranos.hlcTimestamp': hlcTimestamp,
        'meta.lastUpdated': nowIso,
      })
    }
  }
}
