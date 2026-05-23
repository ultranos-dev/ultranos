'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import { syncAppointmentBatch, fetchPractitionerAppointments } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type {
  FhirAppointmentZod,
  FhirSlotZod,
  AppointmentServiceType,
} from '@ultranos/shared-types'

interface UseAppointmentsReturn {
  appointments: FhirAppointmentZod[]
  slots: FhirSlotZod[]
  loading: boolean
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
  cancelAppointment: (id: string) => Promise<void>
  addWalkIn: (
    patientRef: string,
    patientName: string,
    type: AppointmentServiceType,
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
  const initialLoadDone = useRef(false)

  const loadData = useCallback(async () => {
    if (!initialLoadDone.current) {
      setLoading(true)
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
    } catch {
      // Dexie failure — keep existing state
    } finally {
      setLoading(false)
      initialLoadDone.current = true
    }
  }, [date])

  useEffect(() => {
    void loadData()
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
      const hlcTimestamp = Date.now().toString()

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
        participant: [
          {
            actor: {
              reference: `Patient/${data.patientRef}`,
              display: data.patientName,
            },
            status: 'accepted',
          },
        ],
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
      await loadData()
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
      const hlcTimestamp = Date.now().toString()
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

      // If cancelled, free the associated slot
      if (newStatus === 'cancelled') {
        await freeSlotForAppointment(existing, hlcTimestamp, nowIso)
      }

      await loadData()
    },
    [loadData],
  )

  const cancelAppointment = useCallback(
    async (id: string): Promise<void> => {
      await updateStatus(id, 'cancelled')
    },
    [updateStatus],
  )

  const addWalkIn = useCallback(
    async (
      patientRef: string,
      patientName: string,
      type: AppointmentServiceType,
    ): Promise<FhirAppointmentZod> => {
      const nowIso = new Date().toISOString()
      const hlcTimestamp = Date.now().toString()

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
        participant: [
          {
            actor: {
              reference: `Patient/${patientRef}`,
              display: patientName,
            },
            status: 'accepted',
          },
        ],
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
      await loadData()
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- syncRef.current is stable

  return {
    appointments,
    slots,
    loading,
    createAppointment,
    updateStatus,
    cancelAppointment,
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

  // 2. Push local appointments to Hub
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

  // 4. Merge remote into local (Tier 3 LWW: newer hlcTimestamp wins)
  for (const remote of remoteAppointments) {
    const remoteId = remote.id as string
    const local = (await db.appointments.get(remoteId)) as
      | FhirAppointmentZod
      | undefined
    if (
      !local ||
      (remote.hlc_timestamp as string) > (local._ultranos?.hlcTimestamp ?? '')
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
