'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
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

  const loadData = useCallback(async () => {
    setLoading(true)
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

  return {
    appointments,
    slots,
    loading,
    createAppointment,
    updateStatus,
    cancelAppointment,
    addWalkIn,
  }
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
