'use client'

import { useState, useEffect } from 'react'
import { getDb } from '@/lib/db'

interface VerifiedPatientCache {
  patientId: string
  firstName: string
  age: number
  verifiedAt: string
}

export function useRecentPatients(limit = 5) {
  const [patients, setPatients] = useState<VerifiedPatientCache[]>([])

  useEffect(() => {
    async function load() {
      try {
        const db = getDb()
        const items = await db
          .table('verified_patients')
          .orderBy('verifiedAt')
          .reverse()
          .limit(limit)
          .toArray()
        setPatients(items as VerifiedPatientCache[])
      } catch {
        // IndexedDB unavailable
      }
    }
    load()
  }, [limit])

  return patients
}
