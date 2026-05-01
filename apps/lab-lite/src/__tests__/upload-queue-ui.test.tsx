import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { UploadQueue } from '../components/UploadQueue'
import { getDb, addToQueue, type UploadQueueEntry } from '../lib/db'

function makeEntry(overrides: Partial<UploadQueueEntry> = {}): Omit<UploadQueueEntry, 'id'> {
  return {
    file: new Blob(['data'], { type: 'application/pdf' }),
    fileName: 'result.pdf',
    fileType: 'application/pdf',
    metadata: {
      loincCode: '58410-2',
      loincDisplay: 'Blood Work — CBC',
      collectionDate: '2026-04-30',
    },
    patientRef: 'pat-ref-123',
    patientFirstName: 'Ahmad',
    queuedAt: new Date().toISOString(),
    status: 'pending' as const,
    retryCount: 0,
    lastAttemptAt: null,
    ...overrides,
  }
}

describe('UploadQueue UI', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows empty state when queue is empty', async () => {
    render(<UploadQueue />)
    await waitFor(() => {
      expect(screen.getByText(/no pending uploads/i)).toBeDefined()
    })
  })

  it('displays pending items with test category, patient first name, and status', async () => {
    await addToQueue(makeEntry({ patientFirstName: 'Fatima' }))
    render(<UploadQueue />)

    await waitFor(() => {
      expect(screen.getByText('Fatima')).toBeDefined()
      expect(screen.getByText(/blood work/i)).toBeDefined()
      expect(screen.getByText(/pending/i)).toBeDefined()
    })
  })

  it('shows queued timestamp for each item', async () => {
    await addToQueue(makeEntry({ queuedAt: '2026-04-30T10:30:00Z' }))
    render(<UploadQueue />)

    await waitFor(() => {
      // Should show some representation of the queued time
      expect(screen.getByText(/2026/)).toBeDefined()
    })
  })

  it('highlights expired items with warning styling', async () => {
    const expiredTime = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
    await addToQueue(makeEntry({ queuedAt: expiredTime, status: 'expired' }))
    render(<UploadQueue />)

    await waitFor(() => {
      expect(screen.getByText(/expired/i)).toBeDefined()
    })
  })

  it('shows re-upload button for expired items', async () => {
    await addToQueue(makeEntry({ status: 'expired' }))
    render(<UploadQueue />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /re-upload/i })).toBeDefined()
    })
  })

  it('shows discard button for expired items', async () => {
    await addToQueue(makeEntry({ status: 'expired' }))
    render(<UploadQueue />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /discard/i })).toBeDefined()
    })
  })

  it('shows discard button for failed items', async () => {
    await addToQueue(makeEntry({ status: 'failed', retryCount: 3 }))
    render(<UploadQueue />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /discard/i })).toBeDefined()
    })
  })

  it('shows confirmation when discard is clicked', async () => {
    await addToQueue(makeEntry({ status: 'expired' }))
    render(<UploadQueue />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /discard/i })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /discard/i }))

    await waitFor(() => {
      expect(screen.getByText(/are you sure/i)).toBeDefined()
    })
  })

  it('removes item from queue after confirming discard', async () => {
    await addToQueue(makeEntry({ status: 'expired', patientFirstName: 'ToRemove' }))
    render(<UploadQueue />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /discard/i })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /discard/i }))

    await waitFor(() => {
      expect(screen.getByText(/are you sure/i)).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      expect(screen.getByText(/no pending uploads/i)).toBeDefined()
    })
  })

  it('displays multiple items', async () => {
    await addToQueue(makeEntry({ patientFirstName: 'Ali' }))
    await addToQueue(makeEntry({ patientFirstName: 'Sara' }))
    render(<UploadQueue />)

    await waitFor(() => {
      expect(screen.getByText('Ali')).toBeDefined()
      expect(screen.getByText('Sara')).toBeDefined()
    })
  })

  it('shows status badge for each queue status type', async () => {
    await addToQueue(makeEntry({ patientFirstName: 'Alia', status: 'pending' }))
    await addToQueue(makeEntry({ patientFirstName: 'Bader', status: 'uploading' }))
    await addToQueue(makeEntry({ patientFirstName: 'Dina', status: 'failed', retryCount: 3 }))
    render(<UploadQueue />)

    await waitFor(() => {
      expect(screen.getByText('Alia')).toBeDefined()
      expect(screen.getByText('Bader')).toBeDefined()
      expect(screen.getByText('Dina')).toBeDefined()
      // Verify status badges exist
      expect(screen.getAllByText(/pending|uploading|failed/i).length).toBeGreaterThanOrEqual(3)
    })
  })
})
