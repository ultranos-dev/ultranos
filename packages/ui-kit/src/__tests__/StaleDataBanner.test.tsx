import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StaleDataBanner } from '../StaleDataBanner.js'

describe('StaleDataBanner', () => {
  it('does not render when data is fresh and no failures', () => {
    const { container } = render(
      <StaleDataBanner
        lastSyncedAt={new Date().toISOString()}
        failedCount={0}
        onSyncNow={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders when lastSyncedAt is more than 30 minutes ago', () => {
    const thirtyFiveMinAgo = new Date(Date.now() - 35 * 60 * 1000).toISOString()
    render(
      <StaleDataBanner
        lastSyncedAt={thirtyFiveMinAgo}
        failedCount={0}
        onSyncNow={vi.fn()}
      />
    )
    expect(screen.getByText(/data may be outdated/i)).toBeInTheDocument()
    expect(screen.getByText(/minutes ago/i)).toBeInTheDocument()
  })

  it('renders when failedCount > 0', () => {
    render(
      <StaleDataBanner
        lastSyncedAt={new Date().toISOString()}
        failedCount={3}
        onSyncNow={vi.fn()}
      />
    )
    expect(screen.getByText(/data may be outdated/i)).toBeInTheDocument()
    expect(screen.getByText(/3 failed/i)).toBeInTheDocument()
  })

  it('renders when lastSyncedAt is null (never synced)', () => {
    render(
      <StaleDataBanner
        lastSyncedAt={null}
        failedCount={0}
        onSyncNow={vi.fn()}
      />
    )
    expect(screen.getByText(/data may be outdated/i)).toBeInTheDocument()
  })

  it('shows Sync Now button', () => {
    const thirtyFiveMinAgo = new Date(Date.now() - 35 * 60 * 1000).toISOString()
    render(
      <StaleDataBanner
        lastSyncedAt={thirtyFiveMinAgo}
        failedCount={0}
        onSyncNow={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument()
  })

  it('calls onSyncNow when Sync Now button is clicked', () => {
    const onSyncNow = vi.fn()
    const thirtyFiveMinAgo = new Date(Date.now() - 35 * 60 * 1000).toISOString()
    render(
      <StaleDataBanner
        lastSyncedAt={thirtyFiveMinAgo}
        failedCount={0}
        onSyncNow={onSyncNow}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /sync now/i }))
    expect(onSyncNow).toHaveBeenCalledOnce()
  })

  it('does not render when lastSyncedAt is less than 30 minutes ago and no failures', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { container } = render(
      <StaleDataBanner
        lastSyncedAt={fiveMinAgo}
        failedCount={0}
        onSyncNow={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
