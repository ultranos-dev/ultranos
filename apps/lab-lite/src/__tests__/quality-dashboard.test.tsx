/**
 * Story 46.7 — QualityDashboard Component Tests (Task 9)
 *
 * Tests:
 *  - Streak display
 *  - Metric cards
 *  - Badge grid
 *  - Reset message display
 *  - No comparative language in UI
 *  - RTL snapshot tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const msgs: Record<string, string> = {
      'loading': 'Loading...',
      'days': 'days',
      'longestStreak': 'Your best',
      'streaks.heading': 'Your Quality Streaks',
      'streaks.qcPassing': 'QC Passing Days',
      'streaks.zeroRejection': 'Zero Rejection Days',
      'metrics.heading': "This Month's Quality Metrics",
      'metrics.noData': 'No metrics yet',
      'metrics.hemoglobin_cv': 'Hemoglobin CV%',
      'metrics.turnaround_time': 'Turnaround Time',
      'metrics.rejection_rate': 'Rejection Rate',
      'metrics.training_completion': 'Training Completion',
      'training.heading': 'Training Progress',
      'training.quarterProgress': 'Modules completed this quarter',
      'badges.heading': 'Your Achievements',
      'badges.viewAll': 'View all',
      'badges.earned': 'Earned',
      'badges.notYetEarned': 'Not yet earned',
      'badges.noneYet': 'No badges yet',
      'badges.keepWorking': 'Keep going',
    }
    return msgs[key] ?? key
  },
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (sel: (s: { session: { userId: string } }) => unknown) =>
    sel({ session: { userId: 'tech-dashboard' } }),
}))

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn(),
  setAuditStoreAdapter: vi.fn(),
}))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallTime: Date.now(), logicalTime: 0, nodeId: 'test' }) },
  serializeHlc: () => new Date().toISOString(),
}))

vi.mock('@/lib/delegate-crypto', () => ({
  crypto: { randomUUID: () => 'test-uuid' },
}))

import { QualityDashboard } from '@/components/quality/QualityDashboard'
import { getDb } from '@/lib/db'

const TECH_ID = 'tech-dashboard'

beforeEach(async () => {
  const db = getDb()
  await db.quality_streaks.clear()
  await db.quality_metrics.clear()
  await db.earned_badges.clear()
  await db.badges.clear()
  await db.qcRuns.clear()
  await db.samples.clear()
  await db.module_completions.clear()
  await db.micro_learning_modules.clear()
})

// ---------------------------------------------------------------------------
// Rendering tests
// ---------------------------------------------------------------------------

describe('QualityDashboard', () => {
  it('renders the streaks section heading', async () => {
    render(<QualityDashboard />)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    }, { timeout: 3000 })
    expect(screen.getByText('Your Quality Streaks')).toBeDefined()
  })

  it('renders streak cards for QC and rejection', async () => {
    render(<QualityDashboard />)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    }, { timeout: 3000 })
    expect(screen.getByText('QC Passing Days')).toBeDefined()
    expect(screen.getByText('Zero Rejection Days')).toBeDefined()
  })

  it('renders badges section', async () => {
    render(<QualityDashboard />)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    }, { timeout: 3000 })
    expect(screen.getByText('Your Achievements')).toBeDefined()
  })

  it('renders training section', async () => {
    render(<QualityDashboard />)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    }, { timeout: 3000 })
    expect(screen.getByText('Training Progress')).toBeDefined()
  })

  it('displays reset message when streak was broken', async () => {
    const db = getDb()
    await db.quality_streaks.put({
      id: `qs-qc-${TECH_ID}`,
      technicianId: TECH_ID,
      streakType: 'qc_passing',
      currentStreak: 0,
      longestStreak: 5,
      lastResetAt: '2026-05-30',
      lastResetReason: 'QC result out of range on 2026-05-30 for Hemoglobin',
      updatedAt: new Date().toISOString(),
    })

    render(<QualityDashboard />)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    }, { timeout: 3000 })

    // Reset message should appear
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeDefined()
    })
  })

  it('does not contain leaderboard or comparison text', async () => {
    render(<QualityDashboard />)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    }, { timeout: 3000 })

    const body = document.body.textContent ?? ''
    expect(body.toLowerCase()).not.toContain('leaderboard')
    expect(body.toLowerCase()).not.toContain('ranking')
    expect(body.toLowerCase()).not.toContain('compared to')
    expect(body.toLowerCase()).not.toContain('versus')
  })

  it('shows metrics section heading', async () => {
    render(<QualityDashboard />)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    }, { timeout: 3000 })
    expect(screen.getByText("This Month's Quality Metrics")).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// RTL snapshot tests (AC #5)
// ---------------------------------------------------------------------------

describe('QualityDashboard RTL snapshots', () => {
  it('renders with dir=auto for RTL compatibility', async () => {
    const { container } = render(<QualityDashboard />)
    // Wait for loading to complete (loading spinner disappears)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    }, { timeout: 3000 })
    expect(container.querySelector('[dir="auto"]')).not.toBeNull()
  })

  it('LTR snapshot matches expected structure', async () => {
    const { container } = render(<QualityDashboard />)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    }, { timeout: 3000 })
    expect(container.firstChild).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// No-patient-data verification (AC #6)
// ---------------------------------------------------------------------------

describe('patient data isolation', () => {
  it('does not display any patient names or IDs in quality dashboard', async () => {
    const db = getDb()
    // Add a rejected sample with patient reference
    await db.samples.put({
      id: 'sample-test',
      resourceType: 'Specimen',
      receivedTime: new Date().toISOString(),
      _ultranos: {
        pipelineStatus: 'rejected',
        labSampleId: 'LAB-999',
        rejectionReason: 'Hemolyzed',
      },
      subject: { reference: 'Patient/sensitive-patient-id-12345' },
      meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
    } as any)

    render(<QualityDashboard />)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    }, { timeout: 3000 })

    const body = document.body.textContent ?? ''
    expect(body).not.toContain('sensitive-patient-id-12345')
    expect(body).not.toContain('Patient/')
  })
})
